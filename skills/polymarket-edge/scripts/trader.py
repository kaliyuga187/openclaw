#!/usr/bin/env python3
"""
Polymarket CLOB trading wrapper.
Handles authentication, order placement, and position queries.

Requires: pip install py-clob-client
Needs: POLYMARKET_PRIVATE_KEY environment variable (or --private-key flag)

IMPORTANT: Never commit or share your private key.
Store it as: openclaw config set polymarket.private_key 0x...
"""

import json
import os
import sys
import time
import urllib.request
from pathlib import Path

CLOB_HOST = "https://clob.polymarket.com"
CHAIN_ID = 137  # Polygon mainnet
CREDS_FILE = Path.home() / ".openclaw" / "polymarket-creds.json"


# ---------------------------------------------------------------------------
# py-clob-client import (graceful failure with helpful message)
# ---------------------------------------------------------------------------

def _require_clob_client():
    """Import py-clob-client or print clear install instructions and exit."""
    try:
        from py_clob_client.client import ClobClient  # noqa: F401
        from py_clob_client.clob_types import (  # noqa: F401
            OrderArgs, MarketOrderArgs, OrderType, BookParams, TradeParams,
        )
        from py_clob_client.order_builder.constants import BUY, SELL  # noqa: F401
        return True
    except ImportError:
        print(
            "\n[trader] py-clob-client is not installed.\n"
            "Install it with:\n\n"
            "    pip install py-clob-client\n\n"
            "Then retry.\n",
            file=sys.stderr,
        )
        return False


# ---------------------------------------------------------------------------
# Credential management
# ---------------------------------------------------------------------------

def load_creds() -> dict | None:
    """Load cached L2 API credentials from disk."""
    if CREDS_FILE.exists():
        try:
            return json.loads(CREDS_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return None


def save_creds(creds: dict) -> None:
    """Persist L2 API credentials to disk."""
    CREDS_FILE.parent.mkdir(parents=True, exist_ok=True)
    CREDS_FILE.write_text(json.dumps(creds, indent=2))
    # Restrict file permissions: owner read/write only
    CREDS_FILE.chmod(0o600)


# ---------------------------------------------------------------------------
# Client initialization
# ---------------------------------------------------------------------------

def make_client(private_key: str):
    """
    Initialize and return an authenticated ClobClient.
    Creates L2 API credentials on first run, then caches them.
    """
    if not _require_clob_client():
        sys.exit(1)

    from py_clob_client.client import ClobClient

    client = ClobClient(CLOB_HOST, key=private_key, chain_id=CHAIN_ID)

    # Try cached creds first
    cached = load_creds()
    if cached:
        try:
            from py_clob_client.clob_types import ApiCreds
            api_creds = ApiCreds(
                api_key=cached["api_key"],
                api_secret=cached["api_secret"],
                api_passphrase=cached["api_passphrase"],
            )
            client.set_api_creds(api_creds)
            print("[trader] Using cached API credentials", file=sys.stderr)
            return client
        except (KeyError, Exception):
            print("[trader] Cached creds invalid, regenerating...", file=sys.stderr)

    # Generate new L2 credentials from private key
    print("[trader] Creating new API credentials...", file=sys.stderr)
    creds = client.create_or_derive_api_creds()
    client.set_api_creds(creds)

    # Cache for future runs
    save_creds({
        "api_key": creds.api_key,
        "api_secret": creds.api_secret,
        "api_passphrase": creds.api_passphrase,
    })
    print(f"[trader] Credentials saved to {CREDS_FILE}", file=sys.stderr)
    return client


# ---------------------------------------------------------------------------
# Order book queries (no auth required)
# ---------------------------------------------------------------------------

def get_best_price(token_id: str) -> dict | None:
    """
    Get current best bid/ask for a token from the CLOB.
    Returns {"best_bid": float, "best_ask": float, "mid": float, "min_size": float}
    """
    try:
        url = f"{CLOB_HOST}/book?token_id={token_id}"
        req = urllib.request.Request(
            url,
            headers={"Accept": "application/json", "User-Agent": "openclaw-polymarket/1.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        bids = data.get("bids", [])
        asks = data.get("asks", [])

        best_bid = float(bids[0]["price"]) if bids else 0.0
        best_ask = float(asks[0]["price"]) if asks else 1.0
        mid = (best_bid + best_ask) / 2

        return {
            "best_bid": round(best_bid, 4),
            "best_ask": round(best_ask, 4),
            "mid": round(mid, 4),
            "min_size": float(data.get("min_order_size", 1)),
            "tick_size": float(data.get("tick_size", 0.01)),
        }
    except Exception as e:
        print(f"[trader] Failed to get order book for {token_id}: {e}", file=sys.stderr)
        return None


def get_current_price(token_id: str) -> float | None:
    """Return the current midpoint price for a token (0–1)."""
    book = get_best_price(token_id)
    return book["mid"] if book else None


# ---------------------------------------------------------------------------
# Order placement
# ---------------------------------------------------------------------------

def place_limit_order(
    client,
    token_id: str,
    side: str,          # "YES" or "NO" (maps to BUY of that token)
    size_usd: float,    # dollar amount to spend
    price: float,       # limit price (0–1), e.g. 0.45
    dry_run: bool = True,
) -> dict:
    """
    Place a limit buy order for a YES or NO token.

    size_usd: how many dollars to spend
    price: the limit price per share (0–1)

    Returns a result dict with order details or error.
    """
    from py_clob_client.clob_types import OrderArgs, OrderType
    from py_clob_client.order_builder.constants import BUY

    # Number of shares = budget / price per share
    shares = round(size_usd / price, 2) if price > 0 else 0

    if dry_run:
        result = {
            "dry_run": True,
            "token_id": token_id,
            "side": side,
            "price": price,
            "shares": shares,
            "size_usd": size_usd,
            "status": "DRY_RUN",
        }
        print(f"[trader] DRY RUN — would buy {shares} {side} @ {price:.4f} (${size_usd:.2f})", file=sys.stderr)
        return result

    try:
        order_args = OrderArgs(
            price=price,
            size=shares,
            side=BUY,
            token_id=token_id,
        )
        signed = client.create_order(order_args)
        resp = client.post_order(signed, OrderType.GTC)

        result = {
            "dry_run": False,
            "order_id": resp.get("orderID") or resp.get("id", ""),
            "token_id": token_id,
            "side": side,
            "price": price,
            "shares": shares,
            "size_usd": size_usd,
            "status": resp.get("status", "PLACED"),
            "raw": resp,
        }
        print(
            f"[trader] Order placed: {side} {shares} shares @ {price:.4f} "
            f"(${size_usd:.2f}) — ID: {result['order_id']}",
            file=sys.stderr,
        )
        return result

    except Exception as e:
        err = str(e)
        print(f"[trader] Order failed: {err}", file=sys.stderr)
        return {"error": err, "token_id": token_id, "side": side, "status": "FAILED"}


def place_trade(
    client,
    market: dict,
    recommended: str,   # "YES" or "NO"
    size_usd: float,
    slippage: float = 0.02,  # allow 2% slippage above best ask
    dry_run: bool = True,
) -> dict:
    """
    High-level trade placement: resolves token ID from market dict,
    gets best ask, and places a limit order with slippage tolerance.
    """
    clob_ids = market.get("clob_token_ids", [])
    if len(clob_ids) < 2:
        return {"error": "No CLOB token IDs in market data", "status": "FAILED"}

    # YES = index 0, NO = index 1
    token_id = clob_ids[0] if recommended == "YES" else clob_ids[1]

    # Get current best ask
    book = get_best_price(token_id)
    if not book:
        return {"error": "Could not fetch order book", "status": "FAILED"}

    # Entry price = best_ask + slippage (ensures we get filled)
    entry_price = min(0.99, round(book["best_ask"] + slippage, 4))
    min_size = book["min_size"]

    # Validate we can afford minimum order
    min_usd = min_size * entry_price
    if size_usd < min_usd:
        return {
            "error": f"size_usd ${size_usd:.2f} below minimum ${min_usd:.2f}",
            "status": "FAILED",
        }

    return place_limit_order(
        client=client,
        token_id=token_id,
        side=recommended,
        size_usd=size_usd,
        price=entry_price,
        dry_run=dry_run,
    )


# ---------------------------------------------------------------------------
# Position queries
# ---------------------------------------------------------------------------

def get_open_positions(client) -> list[dict]:
    """Fetch open positions for the authenticated account."""
    try:
        positions = client.get_positions()
        if not positions:
            return []
        return [
            {
                "token_id": str(p.get("asset", p.get("token_id", ""))),
                "size": float(p.get("size", 0)),
                "avg_price": float(p.get("avgPrice", p.get("avg_price", 0))),
                "unrealized_pnl": float(p.get("unrealizedPnl", 0)),
            }
            for p in (positions if isinstance(positions, list) else [])
        ]
    except Exception as e:
        print(f"[trader] Could not fetch positions: {e}", file=sys.stderr)
        return []


def get_open_orders(client) -> list[dict]:
    """Fetch open (unfilled) orders."""
    try:
        orders = client.get_orders()
        return orders if isinstance(orders, list) else []
    except Exception as e:
        print(f"[trader] Could not fetch open orders: {e}", file=sys.stderr)
        return []


def cancel_order(client, order_id: str) -> bool:
    """Cancel an open order by ID. Returns True on success."""
    try:
        client.cancel_order(order_id=order_id)
        print(f"[trader] Cancelled order {order_id}", file=sys.stderr)
        return True
    except Exception as e:
        print(f"[trader] Failed to cancel {order_id}: {e}", file=sys.stderr)
        return False


# ---------------------------------------------------------------------------
# CLI entry point (diagnostic / setup tool)
# ---------------------------------------------------------------------------

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Polymarket CLOB trading utility")
    parser.add_argument("--private-key", dest="key",
                        default=os.environ.get("POLYMARKET_PRIVATE_KEY", ""),
                        help="Wallet private key (or set POLYMARKET_PRIVATE_KEY env var)")
    sub = parser.add_subparsers(dest="cmd")

    sub.add_parser("init", help="Initialize API credentials")
    sub.add_parser("positions", help="Show open positions")
    sub.add_parser("orders", help="Show open orders")

    p_book = sub.add_parser("book", help="Get order book for a token")
    p_book.add_argument("token_id")

    p_buy = sub.add_parser("buy", help="Place a limit buy order (dry-run by default)")
    p_buy.add_argument("token_id")
    p_buy.add_argument("--side", choices=["YES", "NO"], required=True)
    p_buy.add_argument("--size", type=float, required=True, help="USD amount")
    p_buy.add_argument("--price", type=float, required=True)
    p_buy.add_argument("--live", action="store_true", help="Actually place the order")

    args = parser.parse_args()

    if not args.key:
        print("Error: provide --private-key or set POLYMARKET_PRIVATE_KEY", file=sys.stderr)
        sys.exit(1)

    if not _require_clob_client():
        sys.exit(1)

    if args.cmd == "init" or args.cmd is None:
        client = make_client(args.key)
        print("Credentials initialized successfully.")
        return

    client = make_client(args.key)

    if args.cmd == "positions":
        positions = get_open_positions(client)
        print(json.dumps(positions, indent=2))

    elif args.cmd == "orders":
        orders = get_open_orders(client)
        print(json.dumps(orders, indent=2))

    elif args.cmd == "book":
        book = get_best_price(args.token_id)
        print(json.dumps(book, indent=2))

    elif args.cmd == "buy":
        result = place_limit_order(
            client=client,
            token_id=args.token_id,
            side=args.side,
            size_usd=args.size,
            price=args.price,
            dry_run=not args.live,
        )
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
