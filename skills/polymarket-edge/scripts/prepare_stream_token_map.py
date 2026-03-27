#!/usr/bin/env python3
"""
prepare_stream_token_map.py

Fetches active markets and outputs a token_map JSON file that stream.py
uses to subscribe to the right CLOB orderbook channels.

Format:
  {
    "<token_id>": {
      "question": "Will BTC exceed $100k by June?",
      "baseline_prob": 0.34,        # from our edge model
      "market_id": "...",
      "url": "https://polymarket.com/..."
    },
    ...
  }

Usage:
  python3 prepare_stream_token_map.py > markets.json
  python3 prepare_stream_token_map.py --min-volume 50000 --category crypto
"""

import json
import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent


def run_fetch() -> list[dict]:
    """Run fetch_markets.py and return parsed market list."""
    result = subprocess.run(
        [sys.executable, str(SCRIPTS_DIR / "fetch_markets.py")],
        capture_output=True, text=True, timeout=60,
    )
    if not result.stdout.strip():
        print(f"[prepare] fetch_markets failed: {result.stderr[-200:]}", file=sys.stderr)
        return []
    return json.loads(result.stdout)


def run_analyze() -> list[dict]:
    """Run analyze_edge.py and return edges with real_prob values."""
    result = subprocess.run(
        [sys.executable, str(SCRIPTS_DIR / "analyze_edge.py"), "--json"],
        capture_output=True, text=True, timeout=120,
    )
    if not result.stdout.strip():
        print(f"[prepare] analyze_edge failed: {result.stderr[-200:]}", file=sys.stderr)
        return []
    return json.loads(result.stdout)


def build_token_map(
    markets: list[dict],
    edges: list[dict],
    min_volume: float = 10_000,
    category: str | None = None,
) -> dict:
    """
    Build token_id -> metadata map for stream.py subscriptions.
    Uses edge model's real_prob as baseline; falls back to market yes_prob.
    Only includes YES-side tokens (index 0) — NO side moves inversely.
    """
    # Index edges by market_id for fast lookup
    edge_by_market = {e["market_id"]: e for e in edges}

    token_map = {}
    for m in markets:
        if m.get("volume", 0) < min_volume:
            continue
        if category and category.lower() not in [t.lower() for t in m.get("tags", [])]:
            continue

        token_ids = m.get("clob_token_ids", [])
        if not token_ids:
            continue

        market_id = m.get("id", "")
        edge = edge_by_market.get(market_id, {})

        # YES token is index 0 by Polymarket convention
        yes_token = token_ids[0]

        # baseline_prob: prefer edge model's real_prob, fall back to market implied
        baseline = edge.get("real_prob") or m.get("yes_prob", 0.5)

        token_map[yes_token] = {
            "question": m.get("question", ""),
            "baseline_prob": round(float(baseline), 4),
            "market_id": market_id,
            "market_prob": round(float(m.get("yes_prob", 0.5)), 4),
            "edge": round(float(edge.get("edge", 0)), 4),
            "url": m.get("url", ""),
            "tags": m.get("tags", []),
            "end_date": m.get("end_date", ""),
        }

    return token_map


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Build stream.py token map from active markets")
    parser.add_argument("--min-volume", type=float, default=10_000,
                        help="Minimum market volume to include (default: 10000)")
    parser.add_argument("--category", default=None,
                        help="Filter to category tag (e.g. crypto, weather)")
    parser.add_argument("--no-edge", action="store_true",
                        help="Skip edge analysis, use market implied probs only")
    args = parser.parse_args()

    print("[prepare] Fetching active markets...", file=sys.stderr)
    markets = run_fetch()
    if not markets:
        print("[prepare] No markets returned. Exiting.", file=sys.stderr)
        sys.exit(1)
    print(f"[prepare] Got {len(markets)} markets.", file=sys.stderr)

    edges = []
    if not args.no_edge:
        print("[prepare] Running edge analysis for baseline probs...", file=sys.stderr)
        edges = run_analyze()
        print(f"[prepare] Got {len(edges)} edge signals.", file=sys.stderr)

    token_map = build_token_map(
        markets, edges,
        min_volume=args.min_volume,
        category=args.category,
    )

    print(f"[prepare] Token map: {len(token_map)} tokens to stream.", file=sys.stderr)
    print(json.dumps(token_map, indent=2))


if __name__ == "__main__":
    main()
