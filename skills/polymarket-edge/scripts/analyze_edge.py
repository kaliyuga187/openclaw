#!/usr/bin/env python3
"""
Master orchestrator: runs all edge detection scripts, merges results,
ranks by edge size, and formats a human-readable alert.

This is the main entry point for both manual use and cron-based monitoring.

Usage:
    python3 analyze_edge.py [--threshold 0.05] [--wallet 0xADDRESS] [--json]
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path

THRESHOLD = float(os.environ.get("EDGE_THRESHOLD", "0.05"))
SCRIPTS_DIR = Path(__file__).parent


def run_script(script: str, extra_args: list[str] | None = None) -> list[dict]:
    """
    Run a sub-script and return its parsed JSON stdout.
    On failure, logs the error and returns an empty list (fail-open).
    """
    cmd = [sys.executable, str(SCRIPTS_DIR / script)] + (extra_args or [])
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            print(f"[analyze_edge] WARNING: {script} exited {result.returncode}", file=sys.stderr)
            if result.stderr:
                print(f"[analyze_edge] stderr: {result.stderr[-500:]}", file=sys.stderr)
            # Still try to parse stdout in case partial results were written
        if result.stdout.strip():
            return json.loads(result.stdout)
        return []
    except subprocess.TimeoutExpired:
        print(f"[analyze_edge] TIMEOUT: {script} took >120s, skipping", file=sys.stderr)
        return []
    except (json.JSONDecodeError, OSError) as e:
        print(f"[analyze_edge] ERROR running {script}: {e}", file=sys.stderr)
        return []


def format_edge_alert(edges: list[dict], wallet_trades: list[dict]) -> str:
    """
    Format a human-readable alert message from ranked edges and wallet trades.
    Returns a string suitable for sending via Telegram/Discord/Slack.
    """
    lines = []
    lines.append("📈 **Polymarket Edge Report**")
    lines.append(f"🕐 {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}")
    lines.append("")

    if edges:
        lines.append(f"**{len(edges)} edge(s) found above {THRESHOLD:.0%} threshold:**")
        lines.append("")
        for i, e in enumerate(edges[:10], 1):  # Cap at 10 to keep alert readable
            edge_pct = f"{e['edge']:.0%}"
            mkt_pct = f"{e['market_prob']:.0%}"
            real_pct = f"{e['real_prob']:.0%}"
            cat = e.get("category", "?").upper()
            rec = e.get("recommended", "?")
            question = e.get("question", "")[:80]

            lines.append(f"**{i}. [{cat}] {rec} — {edge_pct} edge**")
            lines.append(f"   {question}")
            lines.append(f"   Market: {mkt_pct} YES | Real: {real_pct} | Edge: {edge_pct}")
            lines.append(f"   → {e.get('reasoning', '')[:120]}")
            if e.get("url"):
                lines.append(f"   {e['url']}")
            lines.append("")
    else:
        lines.append(f"No edges above {THRESHOLD:.0%} found right now.")
        lines.append("")

    if wallet_trades:
        lines.append(f"**👁 Wallet tracker: {len(wallet_trades)} new position(s):**")
        lines.append("")
        for trade in wallet_trades[:5]:  # Cap at 5
            side = trade.get("side", "?")
            price = trade.get("price", 0)
            value = trade.get("value_usd", 0)
            question = trade.get("question", trade.get("market_id", ""))[:70]
            ts = trade.get("timestamp", "")[:16]
            lines.append(f"  • **{side}** @ {price:.0%} | ${value:,.0f} | {ts}")
            lines.append(f"    {question}")
            if trade.get("url"):
                lines.append(f"    {trade['url']}")
        lines.append("")

    return "\n".join(lines)


def main():
    global THRESHOLD
    import argparse
    parser = argparse.ArgumentParser(description="Run all Polymarket edge detection scripts")
    parser.add_argument("--threshold", type=float, default=THRESHOLD)
    parser.add_argument("--wallet", help="Optional proxy wallet to track for new positions")
    parser.add_argument("--json", action="store_true", dest="json_output",
                        help="Output raw JSON instead of formatted alert")
    parser.add_argument("--no-weather", action="store_true", help="Skip weather edge detection")
    parser.add_argument("--no-crypto", action="store_true", help="Skip crypto edge detection")
    args = parser.parse_args()

    THRESHOLD = args.threshold
    threshold_env = str(args.threshold)

    all_edges: list[dict] = []

    # Run weather edge detection
    if not args.no_weather:
        print("[analyze_edge] Running weather edge detection...", file=sys.stderr)
        env_patch = os.environ.copy()
        env_patch["EDGE_THRESHOLD"] = threshold_env
        weather_edges = run_script("fetch_weather_edge.py")
        all_edges.extend(weather_edges)
        print(f"[analyze_edge] Weather edges: {len(weather_edges)}", file=sys.stderr)

    # Run crypto edge detection
    if not args.no_crypto:
        print("[analyze_edge] Running crypto edge detection...", file=sys.stderr)
        crypto_edges = run_script("fetch_crypto_edge.py")
        all_edges.extend(crypto_edges)
        print(f"[analyze_edge] Crypto edges: {len(crypto_edges)}", file=sys.stderr)

    # Sort all edges by size descending, deduplicate by market_id
    seen_ids: set = set()
    deduped: list[dict] = []
    for e in sorted(all_edges, key=lambda x: x.get("edge", 0), reverse=True):
        mid = e.get("market_id", "")
        if mid and mid in seen_ids:
            continue
        seen_ids.add(mid)
        deduped.append(e)

    # Filter to threshold
    filtered = [e for e in deduped if e.get("edge", 0) >= THRESHOLD]

    # Wallet tracking
    wallet_trades: list[dict] = []
    wallet = args.wallet or os.environ.get("POLYMARKET_WALLET", "")
    if wallet:
        print(f"[analyze_edge] Checking wallet {wallet}...", file=sys.stderr)
        wallet_trades = run_script("track_wallet.py", ["--wallet", wallet])
        print(f"[analyze_edge] New wallet trades: {len(wallet_trades)}", file=sys.stderr)

    if args.json_output:
        print(json.dumps({
            "edges": filtered,
            "wallet_trades": wallet_trades,
            "scanned_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "threshold": THRESHOLD,
        }, indent=2))
    else:
        print(format_edge_alert(filtered, wallet_trades))


if __name__ == "__main__":
    main()
