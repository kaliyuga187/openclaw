#!/usr/bin/env python3
"""
stream.py — Raw WebSocket orderbook stream from clob.polymarket.com

Connects directly to the CLOB WebSocket, subscribes to orderbook channels
for active markets, computes imbalance in real-time, and fires edge signals
without going through any third-party REST layer.

Imbalance = (bid_vol - ask_vol) / (bid_vol + ask_vol)
Signal fires when imbalance crosses threshold and price diverges from baseline.

Usage:
  python3 stream.py --markets markets.json --imbalance-threshold 0.25
"""

import asyncio
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

try:
    import websockets
except ImportError:
    print("ERROR: pip3 install websockets", file=sys.stderr)
    sys.exit(1)

# ── Constants ────────────────────────────────────────────────────────────────

CLOB_WS_URL = "wss://clob.polymarket.com/ws"
RECONNECT_DELAY = 2      # seconds before reconnect on drop
MAX_RECONNECT_DELAY = 60 # cap backoff at 60s
PING_INTERVAL = 20       # keepalive ping every 20s

# ── Orderbook state ──────────────────────────────────────────────────────────

class OrderBook:
    """Maintains a live bid/ask ladder for one token."""

    def __init__(self, token_id: str, question: str = ""):
        self.token_id = token_id
        self.question = question
        self.bids: dict[float, float] = {}  # price -> size
        self.asks: dict[float, float] = {}
        self.last_update = 0.0
        self.last_imbalance = 0.0

    def apply(self, side: str, price: float, size: float) -> None:
        book = self.bids if side == "BUY" else self.asks
        if size == 0:
            book.pop(price, None)
        else:
            book[price] = size
        self.last_update = time.time()

    def best_bid(self) -> float:
        return max(self.bids.keys(), default=0.0)

    def best_ask(self) -> float:
        return min(self.asks.keys(), default=1.0)

    def mid(self) -> float:
        return (self.best_bid() + self.best_ask()) / 2

    def imbalance(self, depth: int = 5) -> float:
        """
        Order book imbalance at top N levels.
        +1.0 = all bids (strong buy pressure)
        -1.0 = all asks (strong sell pressure)
        """
        bid_vol = sum(
            v for p, v in sorted(self.bids.items(), reverse=True)[:depth]
        )
        ask_vol = sum(
            v for p, v in sorted(self.asks.items())[:depth]
        )
        total = bid_vol + ask_vol
        if total == 0:
            return 0.0
        return (bid_vol - ask_vol) / total

    def spread(self) -> float:
        return self.best_ask() - self.best_bid()

    def summary(self) -> dict:
        return {
            "token_id": self.token_id,
            "question": self.question[:60],
            "best_bid": round(self.best_bid(), 4),
            "best_ask": round(self.best_ask(), 4),
            "mid": round(self.mid(), 4),
            "spread": round(self.spread(), 4),
            "imbalance": round(self.imbalance(), 4),
            "ts": datetime.now(timezone.utc).isoformat(),
        }


# ── Signal detection ─────────────────────────────────────────────────────────

def detect_signal(
    book: OrderBook,
    baseline_prob: float,
    imbalance_threshold: float,
    min_spread: float = 0.01,
) -> dict | None:
    """
    Fire a signal when:
    - Orderbook imbalance exceeds threshold (strong directional pressure)
    - Mid price diverges meaningfully from our baseline probability
    - Spread is healthy (not crossed/illiquid)
    """
    if book.spread() < min_spread:
        return None  # illiquid or crossed book

    imb = book.imbalance()
    mid = book.mid()

    # Imbalance direction must align with price divergence from baseline
    price_divergence = mid - baseline_prob
    imbalance_aligned = (imb > imbalance_threshold and price_divergence < -0.03) or \
                        (imb < -imbalance_threshold and price_divergence > 0.03)

    if not imbalance_aligned:
        return None

    # Recommend buying the side that's underpriced relative to order pressure
    if imb > imbalance_threshold:
        # Strong buy pressure but price is low → buy YES
        recommended = "YES"
        edge = abs(price_divergence)
    else:
        # Strong sell pressure but price is high → buy NO
        recommended = "NO"
        edge = abs(price_divergence)

    return {
        "token_id": book.token_id,
        "question": book.question,
        "signal": "IMBALANCE",
        "recommended": recommended,
        "imbalance": round(imb, 4),
        "mid": round(mid, 4),
        "baseline_prob": round(baseline_prob, 4),
        "edge": round(edge, 4),
        "best_bid": round(book.best_bid(), 4),
        "best_ask": round(book.best_ask(), 4),
        "ts": datetime.now(timezone.utc).isoformat(),
    }


# ── WebSocket client ─────────────────────────────────────────────────────────

async def stream_orderbooks(
    token_map: dict[str, dict],       # token_id -> {question, baseline_prob}
    signal_callback,                   # async fn(signal: dict)
    imbalance_threshold: float = 0.25,
    verbose: bool = False,
) -> None:
    """
    Maintain a persistent WebSocket connection to the CLOB.
    Reconnects automatically with exponential backoff on any drop.
    """
    books: dict[str, OrderBook] = {
        tid: OrderBook(tid, meta.get("question", ""))
        for tid, meta in token_map.items()
    }

    token_ids = list(token_map.keys())
    reconnect_delay = RECONNECT_DELAY

    while True:
        try:
            print(f"[stream] Connecting to {CLOB_WS_URL} ({len(token_ids)} tokens)...",
                  file=sys.stderr)

            async with websockets.connect(
                CLOB_WS_URL,
                ping_interval=PING_INTERVAL,
                ping_timeout=30,
                close_timeout=10,
            ) as ws:
                reconnect_delay = RECONNECT_DELAY  # reset on successful connect

                # Subscribe to orderbook channels for all tracked tokens
                sub_msg = json.dumps({
                    "type": "subscribe",
                    "channel": "order_book",
                    "asset_ids": token_ids,
                })
                await ws.send(sub_msg)
                print(f"[stream] Subscribed. Listening for orderbook events...",
                      file=sys.stderr)

                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    msg_type = msg.get("event_type") or msg.get("type", "")

                    # Snapshot: full book state
                    if msg_type in ("book", "order_book"):
                        token_id = msg.get("asset_id", "")
                        book = books.get(token_id)
                        if not book:
                            continue
                        book.bids.clear()
                        book.asks.clear()
                        for entry in msg.get("bids", []):
                            book.apply("BUY", float(entry["price"]), float(entry["size"]))
                        for entry in msg.get("asks", []):
                            book.apply("SELL", float(entry["price"]), float(entry["size"]))

                    # Delta: incremental update
                    elif msg_type in ("price_change", "tick"):
                        token_id = msg.get("asset_id", "")
                        book = books.get(token_id)
                        if not book:
                            continue
                        for change in msg.get("changes", []):
                            side = change.get("side", "")
                            price = float(change.get("price", 0))
                            size = float(change.get("size", 0))
                            book.apply(side, price, size)

                    else:
                        continue

                    # Check for signal after every update
                    book = books.get(msg.get("asset_id", ""))
                    if not book:
                        continue

                    meta = token_map.get(book.token_id, {})
                    baseline = meta.get("baseline_prob", 0.5)
                    signal = detect_signal(book, baseline, imbalance_threshold)

                    if signal:
                        # Debounce: only fire if imbalance changed significantly
                        prev = book.last_imbalance
                        curr = signal["imbalance"]
                        if abs(curr - prev) > 0.05:
                            book.last_imbalance = curr
                            await signal_callback(signal)

                    if verbose:
                        s = book.summary()
                        print(
                            f"[{s['token_id'][:8]}] mid={s['mid']:.3f} "
                            f"imb={s['imbalance']:+.3f} spread={s['spread']:.4f}",
                            file=sys.stderr,
                        )

        except websockets.exceptions.ConnectionClosed as e:
            print(f"[stream] Connection closed: {e}. Reconnecting in {reconnect_delay}s...",
                  file=sys.stderr)
        except OSError as e:
            print(f"[stream] Network error: {e}. Reconnecting in {reconnect_delay}s...",
                  file=sys.stderr)
        except Exception as e:
            print(f"[stream] Unexpected error: {e}. Reconnecting in {reconnect_delay}s...",
                  file=sys.stderr)

        await asyncio.sleep(reconnect_delay)
        reconnect_delay = min(reconnect_delay * 2, MAX_RECONNECT_DELAY)


# ── Entry point ───────────────────────────────────────────────────────────────

async def _main(args) -> None:
    # Load market token map from file or stdin
    if args.markets == "-":
        token_map = json.load(sys.stdin)
    else:
        with open(args.markets) as f:
            token_map = json.load(f)

    async def on_signal(signal: dict) -> None:
        ts = signal["ts"]
        rec = signal["recommended"]
        edge = signal["edge"]
        imb = signal["imbalance"]
        q = signal["question"][:55]
        print(f"\n🔔 [{ts}] SIGNAL: BET {rec} | edge={edge:.0%} imb={imb:+.2f}")
        print(f"   {q}")
        print(f"   bid={signal['best_bid']:.3f} ask={signal['best_ask']:.3f} "
              f"mid={signal['mid']:.3f} baseline={signal['baseline_prob']:.3f}")
        # Flush so output pipes and log files stay current
        sys.stdout.flush()

        # If output JSON requested, also write to stdout as JSON line
        if args.json:
            print(json.dumps(signal), flush=True)

    await stream_orderbooks(
        token_map=token_map,
        signal_callback=on_signal,
        imbalance_threshold=args.imbalance_threshold,
        verbose=args.verbose,
    )


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="CLOB WebSocket orderbook stream")
    parser.add_argument(
        "--markets", default="markets.json",
        help="JSON file mapping token_id -> {question, baseline_prob}. Use - for stdin.",
    )
    parser.add_argument(
        "--imbalance-threshold", type=float, default=0.25,
        help="Imbalance magnitude to trigger signal (default: 0.25)",
    )
    parser.add_argument("--json", action="store_true", help="Output signals as JSON lines")
    parser.add_argument("--verbose", action="store_true", help="Print every tick")
    args = parser.parse_args()

    try:
        asyncio.run(_main(args))
    except KeyboardInterrupt:
        print("\n[stream] Stopped.", file=sys.stderr)


if __name__ == "__main__":
    main()
