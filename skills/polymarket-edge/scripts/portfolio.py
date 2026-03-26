#!/usr/bin/env python3
"""
Portfolio tracker: records trade entries/exits and calculates P&L.
Persists to ~/.openclaw/polymarket-portfolio.jsonl (one JSON event per line).

Usage:
    python3 portfolio.py summary
    python3 portfolio.py open
    python3 portfolio.py log-entry --market-id X --side YES --price 0.45 --size-usd 25 --edge 0.12
    python3 portfolio.py log-exit  --market-id X --exit-price 0.72
    python3 portfolio.py resolve   --market-id X --resolved YES
"""

import json
import sys
import time
from pathlib import Path

PORTFOLIO_FILE = Path.home() / ".openclaw" / "polymarket-portfolio.jsonl"
PORTFOLIO_FILE.parent.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# JSONL persistence
# ---------------------------------------------------------------------------

def _read_all() -> list[dict]:
    """Read all events from the portfolio JSONL file."""
    if not PORTFOLIO_FILE.exists():
        return []
    events = []
    for line in PORTFOLIO_FILE.read_text().splitlines():
        line = line.strip()
        if line:
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return events


def _append(event: dict) -> None:
    """Append one event to the JSONL file."""
    with PORTFOLIO_FILE.open("a") as f:
        f.write(json.dumps(event) + "\n")


# ---------------------------------------------------------------------------
# Risk guard
# ---------------------------------------------------------------------------

def check_daily_loss_limit(max_daily_loss_usd: float) -> tuple[bool, float]:
    """
    Calculate today's realized losses.
    Returns (within_limit, today_pnl).
    """
    events = _read_all()
    today = time.strftime("%Y-%m-%d")
    today_pnl = 0.0

    for e in events:
        if not e.get("timestamp", "").startswith(today):
            continue
        if e.get("event") in ("EXIT", "RESOLVE"):
            today_pnl += e.get("pnl_usd", 0.0)

    within_limit = today_pnl > -abs(max_daily_loss_usd)
    return within_limit, round(today_pnl, 2)


def count_open_positions() -> int:
    """Return number of currently open (unresolved) positions."""
    return len(get_open_positions())


def get_open_positions() -> list[dict]:
    """Return list of open positions (entered but not exited/resolved)."""
    events = _read_all()
    open_pos: dict[str, dict] = {}

    for e in events:
        mid = e.get("market_id", "")
        if not mid:
            continue
        if e["event"] == "ENTRY":
            open_pos[mid] = e
        elif e["event"] in ("EXIT", "RESOLVE"):
            open_pos.pop(mid, None)

    return list(open_pos.values())


# ---------------------------------------------------------------------------
# Event logging
# ---------------------------------------------------------------------------

def log_entry(
    market_id: str,
    question: str,
    side: str,           # "YES" or "NO"
    entry_price: float,
    size_usd: float,
    edge_at_entry: float,
    order_id: str = "",
    token_id: str = "",
    url: str = "",
    dry_run: bool = False,
) -> dict:
    """Record a new position entry."""
    shares = round(size_usd / entry_price, 4) if entry_price > 0 else 0
    event = {
        "event": "ENTRY",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "market_id": market_id,
        "question": question[:120],
        "side": side,
        "entry_price": entry_price,
        "size_usd": size_usd,
        "shares": shares,
        "edge_at_entry": edge_at_entry,
        "order_id": order_id,
        "token_id": token_id,
        "url": url,
        "dry_run": dry_run,
    }
    if not dry_run:
        _append(event)
        print(f"[portfolio] Logged ENTRY: {side} {market_id[:40]} @ {entry_price:.4f}", file=sys.stderr)
    return event


def log_exit(
    market_id: str,
    exit_price: float,
    dry_run: bool = False,
) -> dict | None:
    """Record a position exit at a given price. Calculates P&L."""
    open_pos = {p["market_id"]: p for p in get_open_positions()}
    entry = open_pos.get(market_id)
    if not entry:
        print(f"[portfolio] No open position found for {market_id}", file=sys.stderr)
        return None

    pnl_per_share = exit_price - entry["entry_price"]
    pnl_usd = round(pnl_per_share * entry["shares"], 4)
    pnl_pct = round((pnl_per_share / entry["entry_price"]) * 100, 2) if entry["entry_price"] > 0 else 0

    event = {
        "event": "EXIT",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "market_id": market_id,
        "entry_price": entry["entry_price"],
        "exit_price": exit_price,
        "shares": entry["shares"],
        "size_usd": entry["size_usd"],
        "pnl_usd": pnl_usd,
        "pnl_pct": pnl_pct,
        "side": entry["side"],
        "dry_run": dry_run,
    }
    if not dry_run:
        _append(event)
        sign = "+" if pnl_usd >= 0 else ""
        print(f"[portfolio] EXIT {market_id[:40]}: {sign}${pnl_usd:.2f} ({sign}{pnl_pct:.1f}%)", file=sys.stderr)
    return event


def log_resolve(
    market_id: str,
    resolved_outcome: str,  # "YES" or "NO"
    dry_run: bool = False,
) -> dict | None:
    """
    Record a market resolution. Calculates P&L based on payout:
    - If you held YES and it resolved YES → payout = 1.0 per share
    - If you held YES and it resolved NO → payout = 0.0
    """
    open_pos = {p["market_id"]: p for p in get_open_positions()}
    entry = open_pos.get(market_id)
    if not entry:
        print(f"[portfolio] No open position found for {market_id}", file=sys.stderr)
        return None

    won = entry["side"] == resolved_outcome
    payout_per_share = 1.0 if won else 0.0
    pnl_per_share = payout_per_share - entry["entry_price"]
    pnl_usd = round(pnl_per_share * entry["shares"], 4)
    pnl_pct = round((pnl_per_share / entry["entry_price"]) * 100, 2) if entry["entry_price"] > 0 else 0

    event = {
        "event": "RESOLVE",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "market_id": market_id,
        "resolved_outcome": resolved_outcome,
        "held_side": entry["side"],
        "won": won,
        "entry_price": entry["entry_price"],
        "payout": payout_per_share,
        "shares": entry["shares"],
        "size_usd": entry["size_usd"],
        "pnl_usd": pnl_usd,
        "pnl_pct": pnl_pct,
        "dry_run": dry_run,
    }
    if not dry_run:
        _append(event)
        outcome = "WON" if won else "LOST"
        sign = "+" if pnl_usd >= 0 else ""
        print(
            f"[portfolio] RESOLVE {market_id[:40]}: {outcome} → {sign}${pnl_usd:.2f}", file=sys.stderr
        )
    return event


# ---------------------------------------------------------------------------
# Summary / reporting
# ---------------------------------------------------------------------------

def portfolio_summary() -> dict:
    """Compute full portfolio statistics."""
    events = _read_all()

    total_invested = 0.0
    total_pnl = 0.0
    total_trades = 0
    wins = 0
    losses = 0
    today = time.strftime("%Y-%m-%d")
    today_pnl = 0.0
    dry_run_count = 0

    for e in events:
        if e.get("event") == "ENTRY":
            total_invested += e.get("size_usd", 0)
            if e.get("dry_run"):
                dry_run_count += 1
        if e.get("event") in ("EXIT", "RESOLVE"):
            pnl = e.get("pnl_usd", 0.0)
            total_pnl += pnl
            total_trades += 1
            if pnl >= 0:
                wins += 1
            else:
                losses += 1
            if e.get("timestamp", "").startswith(today):
                today_pnl += pnl

    open_positions = get_open_positions()
    open_count = len(open_positions)

    roi_pct = round((total_pnl / total_invested * 100), 2) if total_invested > 0 else 0
    win_rate = round((wins / total_trades * 100), 1) if total_trades > 0 else 0

    return {
        "total_invested_usd": round(total_invested, 2),
        "total_pnl_usd": round(total_pnl, 2),
        "today_pnl_usd": round(today_pnl, 2),
        "roi_pct": roi_pct,
        "total_closed_trades": total_trades,
        "wins": wins,
        "losses": losses,
        "win_rate_pct": win_rate,
        "open_positions": open_count,
        "dry_run_trades": dry_run_count,
    }


def format_summary(s: dict) -> str:
    """Format portfolio summary for display."""
    sign = "+" if s["total_pnl_usd"] >= 0 else ""
    today_sign = "+" if s["today_pnl_usd"] >= 0 else ""
    lines = [
        "📊 **Portfolio Summary**",
        f"  Total P&L:    {sign}${s['total_pnl_usd']:.2f} ({sign}{s['roi_pct']:.1f}% ROI)",
        f"  Today P&L:    {today_sign}${s['today_pnl_usd']:.2f}",
        f"  Open positions: {s['open_positions']}",
        f"  Closed trades:  {s['total_closed_trades']} "
        f"({s['wins']}W / {s['losses']}L, {s['win_rate_pct']:.0f}% win rate)",
        f"  Total invested: ${s['total_invested_usd']:.2f}",
    ]
    if s["dry_run_trades"]:
        lines.append(f"  ⚠ {s['dry_run_trades']} dry-run trade(s) (not real money)")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Polymarket portfolio tracker")
    sub = parser.add_subparsers(dest="cmd")

    sub.add_parser("summary", help="Show P&L summary")
    sub.add_parser("open", help="Show open positions")
    sub.add_parser("events", help="Show all events (raw JSONL)")

    p_entry = sub.add_parser("log-entry", help="Log a trade entry")
    p_entry.add_argument("--market-id", required=True)
    p_entry.add_argument("--question", default="")
    p_entry.add_argument("--side", choices=["YES", "NO"], required=True)
    p_entry.add_argument("--price", type=float, required=True)
    p_entry.add_argument("--size-usd", type=float, required=True)
    p_entry.add_argument("--edge", type=float, default=0)
    p_entry.add_argument("--order-id", default="")
    p_entry.add_argument("--token-id", default="")
    p_entry.add_argument("--url", default="")
    p_entry.add_argument("--dry-run", action="store_true")

    p_exit = sub.add_parser("log-exit", help="Log an exit at a price")
    p_exit.add_argument("--market-id", required=True)
    p_exit.add_argument("--exit-price", type=float, required=True)
    p_exit.add_argument("--dry-run", action="store_true")

    p_resolve = sub.add_parser("resolve", help="Mark a market as resolved")
    p_resolve.add_argument("--market-id", required=True)
    p_resolve.add_argument("--resolved", choices=["YES", "NO"], required=True)
    p_resolve.add_argument("--dry-run", action="store_true")

    args = parser.parse_args()

    if args.cmd == "summary" or args.cmd is None:
        s = portfolio_summary()
        print(format_summary(s))

    elif args.cmd == "open":
        positions = get_open_positions()
        if not positions:
            print("No open positions.")
        else:
            for p in positions:
                print(
                    f"  {p['side']:3s} | {p.get('question', p['market_id'])[:60]}"
                    f" | entry {p['entry_price']:.4f} | ${p['size_usd']:.2f}"
                    f" | edge {p.get('edge_at_entry', 0):.0%}"
                )

    elif args.cmd == "events":
        for e in _read_all():
            print(json.dumps(e))

    elif args.cmd == "log-entry":
        event = log_entry(
            market_id=args.market_id,
            question=args.question,
            side=args.side,
            entry_price=args.price,
            size_usd=args.size_usd,
            edge_at_entry=args.edge,
            order_id=args.order_id,
            token_id=args.token_id,
            url=args.url,
            dry_run=args.dry_run,
        )
        print(json.dumps(event, indent=2))

    elif args.cmd == "log-exit":
        event = log_exit(args.market_id, args.exit_price, dry_run=args.dry_run)
        if event:
            print(json.dumps(event, indent=2))

    elif args.cmd == "resolve":
        event = log_resolve(args.market_id, args.resolved, dry_run=args.dry_run)
        if event:
            print(json.dumps(event, indent=2))


if __name__ == "__main__":
    main()
