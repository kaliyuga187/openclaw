#!/usr/bin/env python3
"""
Fetch active Polymarket markets filtered to weather and crypto categories.
Outputs JSON list of markets with implied probabilities.

Usage:
    python3 fetch_markets.py [--limit 200] [--tag weather|crypto|all]
"""

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

GAMMA_API = "https://gamma-api.polymarket.com"
MARKETS_LIMIT = int(__import__("os").environ.get("MARKETS_LIMIT", "200"))

WEATHER_KEYWORDS = [
    "temperature", "rain", "snow", "hurricane", "tornado", "storm",
    "precipitation", "forecast", "weather", "celsius", "fahrenheit",
    "degrees", "flood", "drought", "wildfire", "blizzard", "heat wave",
    "cold snap", "wind speed", "humidity", "noaa",
]

CRYPTO_KEYWORDS = [
    "bitcoin", "btc", "ethereum", "eth", "crypto", "sol", "solana",
    "price", "$", "ath", "all-time high", "market cap", "coinbase",
    "binance", "altcoin", "defi", "nft", "token", "blockchain",
    "halving", "etf", "spot etf",
]


def fetch_with_retry(url: str, retries: int = 3, backoff: float = 1.5) -> Any:
    """GET a URL as JSON, retrying on transient errors."""
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "openclaw-polymarket-edge/1.0", "Accept": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode())
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(backoff ** attempt)
    raise RuntimeError(f"Failed to fetch {url}: {last_err}")


def parse_outcome_prices(market: dict) -> dict[str, float]:
    """
    Parse outcomePrices from a market dict.
    Polymarket stores prices as a JSON-encoded list of strings like '["0.72","0.28"]'.
    Returns {"YES": 0.72, "NO": 0.28} or outcome-name → price for multi-outcome.
    """
    raw = market.get("outcomePrices") or market.get("clobTokenIds")
    outcomes = market.get("outcomes", ["YES", "NO"])

    # outcomePrices is typically a JSON string like '["0.72","0.28"]'
    if isinstance(raw, str):
        try:
            prices = json.loads(raw)
        except json.JSONDecodeError:
            return {}
    elif isinstance(raw, list):
        prices = raw
    else:
        return {}

    try:
        prices = [float(p) for p in prices]
    except (TypeError, ValueError):
        return {}

    if isinstance(outcomes, str):
        try:
            outcomes = json.loads(outcomes)
        except json.JSONDecodeError:
            outcomes = ["YES", "NO"]

    return dict(zip(outcomes, prices))


def classify_market(question: str) -> list[str]:
    """Return list of category tags for a market question."""
    q = question.lower()
    tags = []
    if any(kw in q for kw in WEATHER_KEYWORDS):
        tags.append("weather")
    if any(kw in q for kw in CRYPTO_KEYWORDS):
        tags.append("crypto")
    return tags


def fetch_markets(limit: int = MARKETS_LIMIT, tag_filter: str = "all") -> list[dict]:
    """
    Fetch active Polymarket markets and return filtered list with parsed odds.
    tag_filter: "weather", "crypto", or "all"
    """
    url = f"{GAMMA_API}/markets?active=true&closed=false&limit={limit}"
    try:
        data = fetch_with_retry(url)
    except RuntimeError as e:
        print(f"[fetch_markets] ERROR: {e}", file=sys.stderr)
        return []

    markets = []
    for m in data:
        question = m.get("question", "")
        tags = classify_market(question)

        if tag_filter != "all" and tag_filter not in tags:
            continue
        if not tags:
            continue

        prices = parse_outcome_prices(m)
        if not prices:
            continue

        # YES price is the implied probability (0–1)
        yes_prob = prices.get("YES", prices.get(list(prices.keys())[0], None))
        if yes_prob is None:
            continue

        markets.append({
            "id": m.get("id") or m.get("conditionId", ""),
            "slug": m.get("slug", ""),
            "question": question,
            "tags": tags,
            "yes_prob": round(yes_prob, 4),
            "no_prob": round(1 - yes_prob, 4),
            "prices": prices,
            "end_date": m.get("endDate") or m.get("endDateIso", ""),
            "volume": m.get("volume", 0),
            "url": f"https://polymarket.com/event/{m.get('slug', m.get('id', ''))}",
        })

    # Sort by volume descending so most liquid markets come first
    markets.sort(key=lambda x: float(x.get("volume") or 0), reverse=True)
    return markets


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Fetch active Polymarket markets")
    parser.add_argument("--limit", type=int, default=MARKETS_LIMIT)
    parser.add_argument("--tag", default="all", choices=["weather", "crypto", "all"])
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON")
    args = parser.parse_args()

    markets = fetch_markets(limit=args.limit, tag_filter=args.tag)
    indent = 2 if args.pretty else None
    print(json.dumps(markets, indent=indent))


if __name__ == "__main__":
    main()
