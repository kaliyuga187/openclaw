---
name: polymarket-edge
description: >
  Find information edges on Polymarket prediction markets using free real-world
  data sources. Use when asked to: scan Polymarket, find polymarket edge, check
  prediction market odds, look for mispriced markets, track a Polymarket wallet,
  set up polymarket alerts, monitor polymarket positions, or run a polymarket
  scanner. Compares NOAA weather, Open-Meteo forecasts, Binance prices, and
  CoinGecko sentiment against live Polymarket odds to surface gaps where
  real-world data diverges from market pricing.
metadata:
  {
    "openclaw":
      {
        "emoji": "📈",
        "requires": { "bins": ["python3"] },
      },
  }
---

# polymarket-edge

Find and alert on mispriced Polymarket prediction markets by comparing live
real-world data against current market odds.

## Quick start

```bash
# One-shot scan — ranks all current edges
python3 ~/.openclaw/skills/polymarket-edge/scripts/analyze_edge.py

# Fetch active markets only (no comparison)
python3 ~/.openclaw/skills/polymarket-edge/scripts/fetch_markets.py

# Weather market edges (NOAA + Open-Meteo vs Polymarket)
python3 ~/.openclaw/skills/polymarket-edge/scripts/fetch_weather_edge.py

# Crypto market edges (Binance + CoinGecko vs Polymarket)
python3 ~/.openclaw/skills/polymarket-edge/scripts/fetch_crypto_edge.py

# Track a whale wallet for new positions
python3 ~/.openclaw/skills/polymarket-edge/scripts/track_wallet.py \
  --wallet 0xPROXY_ADDRESS
```

## Workflow

When the user asks to scan, always run `analyze_edge.py` first — it calls the
sub-scripts internally and returns a ranked JSON + human-readable summary.

### Full pipeline
1. `fetch_markets.py` → active weather + crypto Polymarket markets with odds
2. `fetch_weather_edge.py` → compare NOAA/Open-Meteo to weather markets
3. `fetch_crypto_edge.py` → compare Binance/CoinGecko to crypto markets
4. `analyze_edge.py` → merge, rank by edge, filter below threshold, format alert
5. (Optional) `track_wallet.py` → show new positions from a tracked wallet

### Setting up continuous alerts (cron)

Ask the agent to create a recurring scan:

```
"Alert me on Telegram every 10 minutes with polymarket edges"
```

The agent will run:
```bash
openclaw cron add polymarket:edge-scan \
  --every 10m \
  --message "Run the polymarket-edge scan and report any edges above 5%" \
  --deliver announce \
  --channel telegram
```

Or with wallet tracking:
```
"Also ping me on Telegram whenever the kingofcoinflips wallet enters a position"
```

```bash
openclaw cron add polymarket:wallet-watch \
  --every 3m \
  --message "Check polymarket wallet 0xPROXY for new trades and report any" \
  --deliver announce \
  --channel telegram
```

## Data sources

| Source | What it provides | Auth |
|---|---|---|
| Polymarket Gamma API | Active markets, current odds | None |
| Polymarket Data API | Wallet trade history | None |
| NOAA NWS | Live weather observations + forecasts | None |
| Open-Meteo | Hourly/daily weather forecasts | None |
| Binance | BTC/ETH spot price, 24h change | None |
| CoinGecko | Crypto prices + sentiment | None (free tier) |
| FRED | Economic indicators (inflation, rates) | Free key → `FRED_API_KEY` env var |

## Finding a wallet's proxy address

Polymarket users trade through a Gnosis Safe proxy wallet, not their EOA.
To find the proxy address:
1. Go to `polymarket.com/@username`
2. Open browser DevTools → Network tab
3. Look for requests to `gamma-api.polymarket.com/public-profile`
4. The `proxyWallet` field is the address to use with `track_wallet.py`

Or use:
```bash
python3 ~/.openclaw/skills/polymarket-edge/scripts/track_wallet.py \
  --lookup-username kingofcoinflips
```

## Tuning

| Env var | Default | Purpose |
|---|---|---|
| `EDGE_THRESHOLD` | `0.05` | Minimum edge to include in alerts (0.05 = 5%) |
| `MARKETS_LIMIT` | `200` | Max active Polymarket markets to fetch |
| `FRED_API_KEY` | — | Optional: enables FRED economic data |
| `COINGECKO_API_KEY` | — | Optional: higher rate limits |

## Dependencies

Scripts use only Python standard library + `urllib` for HTTP — no pip installs
needed. If `httpx` or `requests` is available it will be preferred for speed,
but not required.

## Notes

- All scripts are self-contained and handle their own retries (3 attempts,
  exponential backoff). If a single source fails, the others continue.
- State for wallet tracking is stored in `~/.openclaw/polymarket-edge-state.json`
  and is created automatically on first run.
- Polymarket odds are expressed as prices between 0 and 1 (e.g. 0.72 = 72% YES).
- See `references/strategy.md` for details on how edge is calculated per market type.
- See `references/polymarket-api.md` for full API endpoint reference.
