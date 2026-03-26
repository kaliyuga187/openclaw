#!/usr/bin/env python3
"""
Track a Polymarket wallet (proxy address) for new positions.
Diffs against last run state stored in ~/.openclaw/polymarket-edge-state.json.
Outputs new trades since last check as JSON.

IMPORTANT: Must use the Proxy Wallet (Gnosis Safe) address, not the EOA.
See SKILL.md for how to find the proxy address.

Usage:
    python3 track_wallet.py --wallet 0xPROXY_ADDRESS [--limit 20]
    python3 track_wallet.py --lookup-username kingofcoinflips
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
from fetch_markets import fetch_with_retry

DATA_API = "https://data-api.polymarket.com"
GAMMA_API = "https://gamma-api.polymarket.com"
STATE_FILE = Path.home() / ".openclaw" / "polymarket-edge-state.json"


def load_state() -> dict:
    """Load persisted state (last-seen trade IDs per wallet)."""
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def save_state(state: dict) -> None:
    """Persist state to disk."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


def lookup_proxy_address(username: str) -> str | None:
    """
    Look up a Polymarket proxy wallet address by username.
    Returns the proxyWallet field from the public profile API.
    """
    url = f"{GAMMA_API}/public-profile?slug={urllib.parse.quote(username)}"
    try:
        data = fetch_with_retry(url)
        return data.get("proxyWallet") or data.get("proxy_wallet")
    except RuntimeError as e:
        print(f"[track_wallet] Could not look up username '{username}': {e}", file=sys.stderr)
        return None


def fetch_recent_trades(wallet: str, limit: int = 20) -> list[dict]:
    """Fetch the most recent trades for a proxy wallet address."""
    url = f"{DATA_API}/trades?user={wallet}&limit={limit}"
    try:
        data = fetch_with_retry(url)
        # API may return list directly or wrapped in a key
        if isinstance(data, list):
            return data
        return data.get("data") or data.get("trades") or []
    except RuntimeError as e:
        print(f"[track_wallet] Failed to fetch trades for {wallet}: {e}", file=sys.stderr)
        return []


def fetch_market_question(condition_id: str) -> str:
    """Try to resolve a conditionId to a human-readable question."""
    url = f"{GAMMA_API}/markets?conditionId={condition_id}"
    try:
        data = fetch_with_retry(url)
        if isinstance(data, list) and data:
            return data[0].get("question", condition_id)
        return condition_id
    except RuntimeError:
        return condition_id


def format_trade(trade: dict, question: str | None = None) -> dict:
    """Normalize a raw trade dict into a clean output format."""
    # Polymarket trade fields vary by API version
    side = trade.get("side") or ("YES" if float(trade.get("outcomeIndex", 0)) == 0 else "NO")
    size = trade.get("size") or trade.get("amount") or trade.get("sharesAmount", 0)
    price = trade.get("price") or trade.get("outcomePrice", 0)
    condition_id = (
        trade.get("conditionId")
        or trade.get("condition_id")
        or trade.get("market")
        or ""
    )

    try:
        size = float(size)
        price = float(price)
        value_usd = round(size * price, 2)
    except (TypeError, ValueError):
        value_usd = 0

    return {
        "id": trade.get("id") or trade.get("transactionHash", ""),
        "timestamp": trade.get("timestamp") or trade.get("createdAt") or trade.get("time", ""),
        "market_id": condition_id,
        "question": question or condition_id,
        "side": side,
        "size": size,
        "price": price,
        "value_usd": value_usd,
        "url": f"https://polymarket.com/event/{condition_id}" if condition_id else "",
    }


def get_new_trades(wallet: str, limit: int = 20) -> list[dict]:
    """
    Return trades seen since the last call for this wallet.
    Updates state on disk after each run.
    """
    state = load_state()
    wallet_key = wallet.lower()
    last_seen_ids: set[str] = set(state.get(wallet_key, {}).get("seen_ids", []))

    raw_trades = fetch_recent_trades(wallet, limit)
    if not raw_trades:
        return []

    new_trades = []
    current_ids = []

    for trade in raw_trades:
        trade_id = str(trade.get("id") or trade.get("transactionHash", ""))
        current_ids.append(trade_id)

        if trade_id and trade_id not in last_seen_ids:
            # Resolve market question (best-effort)
            condition_id = (
                trade.get("conditionId")
                or trade.get("condition_id")
                or trade.get("market", "")
            )
            question = None
            if condition_id:
                try:
                    question = fetch_market_question(condition_id)
                    time.sleep(0.2)
                except Exception:
                    pass

            new_trades.append(format_trade(trade, question))

    # Update state with latest seen IDs (keep last 100 to avoid unbounded growth)
    state[wallet_key] = {
        "seen_ids": list(set(current_ids))[:100],
        "last_check": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "wallet": wallet,
    }
    save_state(state)

    return new_trades


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Track a Polymarket wallet for new positions")
    parser.add_argument("--wallet", help="Proxy wallet address (0x...)")
    parser.add_argument("--lookup-username", dest="username", help="Look up proxy address for a username")
    parser.add_argument("--limit", type=int, default=20, help="Max recent trades to fetch")
    parser.add_argument("--all", action="store_true", help="Return all recent trades (ignore state diff)")
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    wallet = args.wallet

    if args.username:
        print(f"[track_wallet] Looking up proxy address for '{args.username}'...", file=sys.stderr)
        wallet = lookup_proxy_address(args.username)
        if not wallet:
            print(json.dumps({"error": f"Could not find proxy address for '{args.username}'"}))
            sys.exit(1)
        print(f"[track_wallet] Proxy address: {wallet}", file=sys.stderr)

    if not wallet:
        print(json.dumps({"error": "Must provide --wallet or --lookup-username"}))
        sys.exit(1)

    if args.all:
        raw = fetch_recent_trades(wallet, args.limit)
        trades = [format_trade(t) for t in raw]
    else:
        print(f"[track_wallet] Checking for new trades for {wallet}...", file=sys.stderr)
        trades = get_new_trades(wallet, args.limit)
        print(f"[track_wallet] Found {len(trades)} new trades", file=sys.stderr)

    indent = 2 if args.pretty else None
    print(json.dumps(trades, indent=indent))


if __name__ == "__main__":
    main()
