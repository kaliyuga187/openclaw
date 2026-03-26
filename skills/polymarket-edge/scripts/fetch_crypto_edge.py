#!/usr/bin/env python3
"""
Compare Binance tick prices + CoinGecko sentiment against Polymarket crypto market odds.
Estimates edge using current price, 24h momentum, and simple volatility-based probability.

Usage:
    python3 fetch_crypto_edge.py [--threshold 0.05]
"""

import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from fetch_markets import fetch_markets, fetch_with_retry

BINANCE_API = "https://api.binance.com/api/v3"
COINGECKO_API = "https://api.coingecko.com/api/v3"
THRESHOLD = float(os.environ.get("EDGE_THRESHOLD", "0.05"))
COINGECKO_API_KEY = os.environ.get("COINGECKO_API_KEY", "")


# Map common question keywords → CoinGecko ID + Binance symbol
CRYPTO_MAP: dict[str, dict] = {
    "bitcoin":  {"cg_id": "bitcoin",  "binance": "BTCUSDT",  "symbol": "BTC"},
    "btc":      {"cg_id": "bitcoin",  "binance": "BTCUSDT",  "symbol": "BTC"},
    "ethereum": {"cg_id": "ethereum", "binance": "ETHUSDT",  "symbol": "ETH"},
    "eth":      {"cg_id": "ethereum", "binance": "ETHUSDT",  "symbol": "ETH"},
    "solana":   {"cg_id": "solana",   "binance": "SOLUSDT",  "symbol": "SOL"},
    "sol":      {"cg_id": "solana",   "binance": "SOLUSDT",  "symbol": "SOL"},
    "bnb":      {"cg_id": "binancecoin", "binance": "BNBUSDT", "symbol": "BNB"},
    "xrp":      {"cg_id": "ripple",   "binance": "XRPUSDT",  "symbol": "XRP"},
    "doge":     {"cg_id": "dogecoin", "binance": "DOGEUSDT", "symbol": "DOGE"},
    "dogecoin": {"cg_id": "dogecoin", "binance": "DOGEUSDT", "symbol": "DOGE"},
    "ada":      {"cg_id": "cardano",  "binance": "ADAUSDT",  "symbol": "ADA"},
    "cardano":  {"cg_id": "cardano",  "binance": "ADAUSDT",  "symbol": "ADA"},
}


def fetch_binance_ticker(symbol: str) -> dict | None:
    """Fetch 24h ticker stats from Binance (price, change %)."""
    url = f"{BINANCE_API}/ticker/24hr?symbol={symbol}"
    try:
        data = fetch_with_retry(url)
        return {
            "price": float(data["lastPrice"]),
            "price_change_pct_24h": float(data["priceChangePercent"]),
            "high_24h": float(data["highPrice"]),
            "low_24h": float(data["lowPrice"]),
            "volume_24h": float(data["quoteVolume"]),
        }
    except (RuntimeError, KeyError, ValueError):
        return None


def fetch_coingecko_data(cg_id: str) -> dict | None:
    """Fetch price + sentiment from CoinGecko."""
    params: dict = {
        "ids": cg_id,
        "vs_currencies": "usd",
        "include_24hr_change": "true",
        "include_market_cap": "true",
        "include_24hr_vol": "true",
    }
    if COINGECKO_API_KEY:
        params["x_cg_demo_api_key"] = COINGECKO_API_KEY

    url = f"{COINGECKO_API}/simple/price?{urllib.parse.urlencode(params)}"
    try:
        data = fetch_with_retry(url)
        coin = data.get(cg_id, {})
        return {
            "price": coin.get("usd"),
            "change_24h_pct": coin.get("usd_24h_change"),
            "market_cap": coin.get("usd_market_cap"),
            "volume_24h": coin.get("usd_24h_vol"),
        }
    except (RuntimeError, KeyError):
        return None


def extract_price_threshold(question: str) -> float | None:
    """
    Extract a USD price target from a question.
    e.g. "Will BTC reach $100,000?" → 100000.0
    """
    # Match patterns like $100,000 / $100k / 100000 / 100K
    patterns = [
        r"\$\s*([\d,]+(?:\.\d+)?)\s*[kK]",   # $100k
        r"\$\s*([\d,]+(?:\.\d+)?)",             # $100,000
        r"([\d,]+(?:\.\d+)?)\s*[kK]\s*(?:usd|dollars?)?",  # 100k USD
        r"([\d,]+(?:\.\d+)?)\s*(?:usd|dollars?)",           # 100000 USD
    ]
    for pat in patterns:
        m = re.search(pat, question, re.IGNORECASE)
        if m:
            raw = m.group(1).replace(",", "")
            val = float(raw)
            if "k" in m.group(0).lower() and "$" not in m.group(0):
                val *= 1000
            elif re.search(r"\$.*[kK]", m.group(0)):
                val *= 1000
            return val
    return None


def price_to_probability(
    current_price: float,
    target_price: float,
    above: bool,
    volatility_30d_pct: float = 5.0,  # daily vol estimate, percent
    days_to_expiry: int = 30,
) -> float:
    """
    Estimate P(price reaches target within days_to_expiry) using a simplified
    log-normal model. This is a rough approximation — not financial advice.

    volatility_30d_pct: estimated daily price volatility in percent (default 5% for BTC)
    """
    if current_price <= 0 or target_price <= 0:
        return 0.5

    daily_vol = volatility_30d_pct / 100.0
    # Annualized vol → scale to time window
    period_vol = daily_vol * math.sqrt(days_to_expiry)

    log_return_needed = math.log(target_price / current_price)
    # Assume zero drift (conservative) — just vol-based probability
    # z-score: how many std-devs away is the target?
    z = log_return_needed / period_vol if period_vol > 0 else float("inf")

    # Normal CDF approximation (Abramowitz & Stegun)
    def norm_cdf(x: float) -> float:
        t = 1.0 / (1.0 + 0.2316419 * abs(x))
        poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
        prob = 1.0 - (1.0 / math.sqrt(2 * math.pi)) * math.exp(-x * x / 2) * poly
        return prob if x >= 0 else 1.0 - prob

    if above:
        # P(price goes above target) = P(log_return > log_return_needed)
        return round(1.0 - norm_cdf(z), 4)
    else:
        return round(norm_cdf(z), 4)


def estimate_daily_volatility(binance: dict | None) -> float:
    """Estimate daily vol % from 24h high/low range."""
    if not binance:
        return 5.0  # BTC default
    high = binance.get("high_24h", 0)
    low = binance.get("low_24h", 0)
    price = binance.get("price", 1)
    if price and high and low:
        range_pct = (high - low) / price * 100
        # Rough daily vol = range / 2
        return max(1.0, range_pct / 2)
    return 5.0


def identify_crypto(question: str) -> dict | None:
    """Return crypto metadata dict for the asset mentioned in a question."""
    q = question.lower()
    for keyword, meta in CRYPTO_MAP.items():
        if keyword in q:
            return meta
    return None


def analyze_crypto_market(market: dict) -> dict | None:
    """Analyze a single crypto Polymarket market and return edge dict or None."""
    question = market["question"]
    crypto = identify_crypto(question)
    if not crypto:
        return None

    # Fetch live data
    binance = fetch_binance_ticker(crypto["binance"])
    cg = fetch_coingecko_data(crypto["cg_id"])
    time.sleep(0.2)  # gentle rate limiting

    current_price = None
    if binance:
        current_price = binance["price"]
    elif cg and cg.get("price"):
        current_price = cg["price"]

    if not current_price:
        return None

    # Determine what the market is asking
    q_lower = question.lower()
    threshold = extract_price_threshold(question)
    above = any(kw in q_lower for kw in ["above", "over", "exceed", "reach", "hit", "break", "surpass", "top"])

    method = "unknown"
    real_prob: float | None = None

    if threshold:
        daily_vol = estimate_daily_volatility(binance)
        real_prob = price_to_probability(
            current_price=current_price,
            target_price=threshold,
            above=above,
            volatility_30d_pct=daily_vol,
            days_to_expiry=30,
        )
        method = f"lognormal_price_{crypto['symbol']}_{'above' if above else 'below'}_{threshold}"

    elif any(kw in q_lower for kw in ["ath", "all-time high", "all time high", "record"]):
        # Special case: "Will BTC hit a new ATH?"
        # If price is within 20% of ATH and trending up → higher prob
        change_24h = binance["price_change_pct_24h"] if binance else 0
        momentum_boost = max(0, change_24h / 100 * 2)  # scale momentum into probability
        base = 0.3 + momentum_boost
        real_prob = min(0.95, round(base, 4))
        method = f"ath_momentum_{crypto['symbol']}"

    elif any(kw in q_lower for kw in ["up", "positive", "gain", "rise", "increase", "bull"]):
        # "Will BTC be up this week/month?"
        change_24h = binance["price_change_pct_24h"] if binance else 0
        # Simple: positive momentum → lean YES, negative → lean NO
        real_prob = 0.5 + min(0.3, max(-0.3, change_24h / 100))
        method = f"momentum_{crypto['symbol']}"

    if real_prob is None:
        return None

    market_prob = market["yes_prob"]
    edge = abs(real_prob - market_prob)

    if edge < THRESHOLD:
        return None

    recommended = "YES" if real_prob > market_prob else "NO"
    reasoning = (
        f"{crypto['symbol']} current price: ${current_price:,.2f}. "
        f"Model estimates {real_prob:.0%} probability; market prices YES at {market_prob:.0%}. "
        f"Edge: {edge:.0%} → bet {recommended}."
    )
    if binance:
        reasoning += f" (24h change: {binance['price_change_pct_24h']:+.1f}%)"

    return {
        "market_id": market["id"],
        "question": question,
        "category": "crypto",
        "asset": crypto["symbol"],
        "current_price": current_price,
        "price_threshold": threshold,
        "market_prob": market_prob,
        "real_prob": real_prob,
        "edge": round(edge, 4),
        "recommended": recommended,
        "reasoning": reasoning,
        "method": method,
        "sources": ["Binance" if binance else None, "CoinGecko" if cg else None],
        "url": market["url"],
    }


def main():
    global THRESHOLD
    import argparse
    parser = argparse.ArgumentParser(description="Find crypto market edges on Polymarket")
    parser.add_argument("--threshold", type=float, default=THRESHOLD)
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    THRESHOLD = args.threshold

    print("[fetch_crypto_edge] Fetching active crypto markets...", file=sys.stderr)
    markets = fetch_markets(tag_filter="crypto")
    print(f"[fetch_crypto_edge] Found {len(markets)} crypto markets", file=sys.stderr)

    edges = []
    for i, market in enumerate(markets):
        print(f"[fetch_crypto_edge] Analyzing {i+1}/{len(markets)}: {market['question'][:60]}...", file=sys.stderr)
        result = analyze_crypto_market(market)
        if result:
            edges.append(result)

    edges.sort(key=lambda x: x["edge"], reverse=True)
    indent = 2 if args.pretty else None
    print(json.dumps(edges, indent=indent))


if __name__ == "__main__":
    main()
