#!/usr/bin/env python3
"""
Dry-run simulation with realistic mock market data.
Shows exactly what the bot would output against real data.
Run this on your machine to verify the full pipeline output format.

Usage:
    python3 dry_run_demo.py
"""

import json
import sys
from pathlib import Path

# Add scripts dir to path so we can import the formatters directly
sys.path.insert(0, str(Path(__file__).parent / "scripts"))

# ---------------------------------------------------------------------------
# Mock market data — realistic Polymarket figures as of March 2026
# ---------------------------------------------------------------------------

MOCK_EDGES = [
    {
        "market_id": "0x8f4a2b1c3d5e6f7a8b9c0d1e2f3a4b5c",
        "question": "Will BTC exceed $95,000 before April 1, 2026?",
        "category": "crypto",
        "asset": "BTC",
        "current_price": 87_420.0,
        "price_threshold": 95_000.0,
        "market_prob": 0.31,
        "real_prob": 0.19,   # log-normal model says 19%, market says 31% → 12% edge
        "edge": 0.12,
        "recommended": "NO",
        "reasoning": (
            "BTC current price: $87,420.00. Model estimates 19% probability; "
            "market prices YES at 31%. Edge: 12% → bet NO. (24h change: -2.3%)"
        ),
        "method": "lognormal_price_BTC_above_95000",
        "sources": ["Binance", "CoinGecko"],
        "url": "https://polymarket.com/event/will-btc-exceed-95000-before-april-2026",
    },
    {
        "market_id": "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
        "question": "Will it rain in Miami more than 3 days in the next 7 days?",
        "category": "weather",
        "location": "miami",
        "market_prob": 0.42,
        "real_prob": 0.71,   # Open-Meteo says 71% chance, market at 42% → 29% edge
        "edge": 0.29,
        "recommended": "YES",
        "reasoning": (
            "Real-world data suggests 71% chance, market prices YES at 42%. "
            "Open-Meteo shows 6/7 days with >40% precip probability."
        ),
        "method": "precipitation_probability",
        "sources": ["NOAA NWS", "Open-Meteo"],
        "url": "https://polymarket.com/event/miami-rain-7-days",
    },
    {
        "market_id": "0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e",
        "question": "Will ETH be above $2,100 on April 1, 2026?",
        "category": "crypto",
        "asset": "ETH",
        "current_price": 2_043.0,
        "price_threshold": 2_100.0,
        "market_prob": 0.55,
        "real_prob": 0.44,   # Model: 44%, market: 55% → 11% edge
        "edge": 0.11,
        "recommended": "NO",
        "reasoning": (
            "ETH current price: $2,043.00. Model estimates 44% probability; "
            "market prices YES at 55%. Edge: 11% → bet NO. (24h change: -1.8%)"
        ),
        "method": "lognormal_price_ETH_above_2100",
        "sources": ["Binance", "CoinGecko"],
        "url": "https://polymarket.com/event/eth-above-2100-april-2026",
    },
    {
        "market_id": "0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f",
        "question": "Will Phoenix AZ hit 90°F before April 15, 2026?",
        "category": "weather",
        "location": "phoenix",
        "market_prob": 0.68,
        "real_prob": 0.82,   # Open-Meteo shows 5/7 forecast days at 88-91°F
        "edge": 0.14,
        "recommended": "YES",
        "reasoning": (
            "Real-world data suggests 82% chance, market prices YES at 68%. "
            "Open-Meteo shows max temps of 88-91°F across next 7 days."
        ),
        "method": "temperature_above_90F",
        "sources": ["NOAA NWS", "Open-Meteo"],
        "url": "https://polymarket.com/event/phoenix-90f-april-2026",
    },
]

MOCK_WALLET_TRADES = [
    {
        "id": "0xabc123def456",
        "timestamp": "2026-03-26T09:14:22Z",
        "market_id": "0x8f4a2b1c3d5e6f7a8b9c0d1e2f3a4b5c",
        "question": "Will BTC exceed $95,000 before April 1, 2026?",
        "side": "NO",
        "size": 850,
        "price": 0.30,
        "value_usd": 255.0,
        "url": "https://polymarket.com/event/will-btc-exceed-95000-before-april-2026",
    }
]

# ---------------------------------------------------------------------------
# Run the bot pipeline with mock data
# ---------------------------------------------------------------------------

def main():
    # Import the formatters from the real scripts
    from analyze_edge import format_edge_alert
    from portfolio import portfolio_summary, format_summary

    print("=" * 65)
    print("  POLYMARKET EDGE BOT — DRY RUN DEMO")
    print("  Settings: $50 max position | $50 daily loss limit | 10% min edge")
    print("  (Mock data — run on your machine for live figures)")
    print("=" * 65)
    print()

    # Show what analyze_edge.py would print
    alert = format_edge_alert(MOCK_EDGES, MOCK_WALLET_TRADES)
    print(alert)

    # Show what the bot would do in auto --dry-run mode
    trade_threshold = 0.10
    tradeable = [e for e in MOCK_EDGES if e["edge"] >= trade_threshold]

    print("─" * 65)
    print("AUTO MODE — DRY RUN (what the bot would trade at $50/position):")
    print()

    if not tradeable:
        print("  No markets meet the 10% edge threshold.")
    else:
        best = tradeable[0]  # Bot takes one trade per cycle
        side = best["recommended"]
        entry_price = round(best["market_prob"] + 0.02, 4)  # 2% slippage
        shares = round(50.0 / entry_price, 2)

        print(f"  → Best edge: {best['edge']:.0%} on {best['category'].upper()} market")
        print(f"  → Market:    {best['question'][:65]}")
        print(f"  → Action:    BUY {side} @ {entry_price:.2f} ({shares:.1f} shares × ${entry_price:.2f} = $50.00)")
        print(f"  → If market resolves {side}: profit ${round((1 - entry_price) * shares, 2):.2f}")
        print(f"  → If market resolves {'NO' if side == 'YES' else 'YES'}: loss $50.00")
        print()
        print(f"  [DRY RUN] Order NOT placed. Run with --live to execute.")
        print()

    # Portfolio summary (empty on first run)
    print("─" * 65)
    s = portfolio_summary()
    print(format_summary(s))
    print()

    print("─" * 65)
    print("To run with live data on your machine:")
    print()
    print("  # Alert mode (no trading, see real edges):")
    print("  ./skills/polymarket-edge/start-bot.sh alert")
    print()
    print("  # Dry-run auto (simulates real trades with live data):")
    print("  ./skills/polymarket-edge/start-bot.sh --dry-run")
    print()
    print("  # Live trading (after funding wallet):")
    print("  ./skills/polymarket-edge/start-bot.sh --live")


if __name__ == "__main__":
    main()
