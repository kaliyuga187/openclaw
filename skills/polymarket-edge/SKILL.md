---
name: polymarket-edge
description: >
  Find information edges on Polymarket prediction markets using free real-world
  data sources. Use when asked to: scan Polymarket, find polymarket edge, check
  prediction market odds, look for mispriced markets, track a Polymarket wallet,
  set up polymarket alerts, monitor polymarket positions, run a polymarket
  scanner, run the polymarket bot, start trading bot, set up auto-trading, or
  start the polymarket profit bot. Compares NOAA weather, Open-Meteo forecasts,
  Binance prices, and CoinGecko sentiment against live Polymarket odds to surface
  gaps where real-world data diverges from market pricing. Includes a trading
  bot (bot.py) that can place orders automatically via the Polymarket CLOB API.
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

## Trading bot (bot.py)

The bot daemon runs continuously, calls the full edge detection pipeline, and can
place orders automatically via the Polymarket CLOB API.

### Three modes

| Mode | What it does | Risk |
|---|---|---|
| `alert` | Detect edges, print to terminal | None (default) |
| `semi` | Print exact `trader.py` commands to copy-paste | None |
| `auto` | Automatically place CLOB orders | Real money |

### Bot quick start

```bash
SKILL=~/.openclaw/skills/polymarket-edge/scripts

# Step 1: alert mode — safe, see what the bot would do
python3 $SKILL/bot.py --mode alert --interval 300

# Step 2: semi mode — shows exact commands to execute yourself
python3 $SKILL/bot.py --mode semi

# Step 3: dry-run auto — simulates trades, no real money
python3 $SKILL/bot.py --mode auto --dry-run \
  --private-key 0xYOUR_KEY

# Step 4: live trading (starts at $25/trade max)
python3 $SKILL/bot.py --mode auto \
  --private-key 0xYOUR_KEY \
  --max-position 25 \
  --max-daily-loss 100 \
  --min-edge 0.10 \
  --interval 300
```

### Setting up for auto-trading (one-time)

**Requirements:**
1. A wallet with USDC on Polygon (bridge from Ethereum via Polygon Bridge)
2. Approve USDC spending on Polymarket: visit polymarket.com → connect wallet → deposit
3. Your wallet's private key (export from MetaMask: Settings → Security → Export Private Key)
4. Install py-clob-client: `pip install py-clob-client`

**Store your private key securely:**
```bash
openclaw config set polymarket.private_key 0xYOUR_PRIVATE_KEY
```

Then run the bot reading from config:
```bash
python3 $SKILL/bot.py --mode auto \
  --private-key "$(openclaw config get polymarket.private_key)" \
  --dry-run
```

**Never share or commit your private key.**

### Bot safety defaults

| Env var / flag | Default | Purpose |
|---|---|---|
| `--max-position` | $25 | Max USD per trade |
| `--max-daily-loss` | $100 | Stop trading if you lose this much today |
| `--min-edge` | 10% | Min edge required to place a real order |
| `BOT_MIN_VOLUME_USD` | $10,000 | Only trade liquid markets |
| `BOT_MIN_DAYS_TO_EXPIRY` | 7 days | Skip near-expiry markets |
| `BOT_MAX_OPEN_POSITIONS` | 5 | Max simultaneous positions |

### Portfolio tracking

```bash
# See your P&L
python3 $SKILL/portfolio.py summary

# See open positions
python3 $SKILL/portfolio.py open

# Manually mark a market as resolved
python3 $SKILL/portfolio.py resolve --market-id X --resolved YES
```

Portfolio is stored in `~/.openclaw/polymarket-portfolio.jsonl`.

### CLOB utility commands

```bash
# Initialize API credentials (run once after setting private key)
python3 $SKILL/trader.py init --private-key 0xYOUR_KEY

# Get order book for a token
python3 $SKILL/trader.py book <token_id>

# Place a manual order (dry-run by default, add --live to execute)
python3 $SKILL/trader.py buy <token_id> --side YES --size 25 --price 0.45

# See open positions
python3 $SKILL/trader.py positions --private-key 0xYOUR_KEY
```

### Running the bot 24/7

**On a VPS or Pi (recommended):**
```bash
nohup python3 $SKILL/bot.py --mode auto \
  --private-key 0xYOUR_KEY \
  --interval 300 \
  > ~/.openclaw/polymarket-bot.log 2>&1 &

# Tail the log
tail -f ~/.openclaw/polymarket-bot.log
```

**Via OpenClaw cron (alert mode only):**
```bash
openclaw cron add polymarket:bot \
  --every 5m \
  --message "Run polymarket edge scan and report top 3 opportunities" \
  --deliver announce \
  --channel telegram
```

## Tuning

| Env var | Default | Purpose |
|---|---|---|
| `EDGE_THRESHOLD` | `0.05` | Minimum edge to include in alerts (0.05 = 5%) |
| `MARKETS_LIMIT` | `200` | Max active Polymarket markets to fetch |
| `FRED_API_KEY` | — | Optional: enables FRED economic data |
| `COINGECKO_API_KEY` | — | Optional: higher rate limits |
| `POLYMARKET_PRIVATE_KEY` | — | Wallet private key for auto-trading |
| `POLYMARKET_WALLET` | — | Proxy wallet address to track |

## Dependencies

Alert/semi modes use only Python standard library — no pip installs needed.
Auto-trading mode requires `py-clob-client`:
```bash
pip install -r ~/.openclaw/skills/polymarket-edge/requirements.txt
```

## Notes

- All scripts are self-contained and handle their own retries (3 attempts,
  exponential backoff). If a single source fails, the others continue.
- The bot itself has exponential backoff on crash — if it errors, it waits and
  retries automatically (same behavior as the tweet's 2am NOAA restart).
- State for wallet tracking is stored in `~/.openclaw/polymarket-edge-state.json`
  and is created automatically on first run.
- Polymarket odds are expressed as prices between 0 and 1 (e.g. 0.72 = 72% YES).
- See `references/strategy.md` for details on how edge is calculated per market type.
- See `references/polymarket-api.md` for full API endpoint reference.
- **Prediction markets are risky.** The edge calculations are statistical estimates,
  not guarantees. Start with small positions and verify the strategy works before
  scaling up.
