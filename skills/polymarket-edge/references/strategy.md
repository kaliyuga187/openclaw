# Edge Detection Strategy

## What is "edge"?

Edge = the gap between what real-world data implies and what the market currently prices.

```
edge = abs(real_world_probability - polymarket_implied_probability)
```

If the market prices YES at 30% but real-world data suggests 60%, that's a 30% edge.
Default threshold to surface an opportunity: **5% (0.05)**.

## Weather markets

### How we estimate real probability

**Rain / precipitation / storm markets:**
1. Fetch NOAA NWS forecast for the city's coordinates
2. Count periods with rain keywords ("rain", "shower", "storm", "drizzle")
3. Fetch Open-Meteo `precipitation_probability_max` for each day in the window
4. Average the two estimates

For "will it rain at all?" markets (binary YES/NO):
- Use the **max** precipitation probability across the forecast window
- Rationale: if any day has high rain chance, the market resolves YES

**Temperature threshold markets ("Will NYC reach 90°F this week?"):**
1. Extract the temperature value and direction (above/below) from question text via regex
2. Fetch Open-Meteo `temperature_2m_max` or `temperature_2m_min` for each day
3. Count what fraction of forecast days hit the threshold
4. That fraction is the probability estimate

### Limitations
- We only cover ~50 hardcoded US cities. Non-US or small-city markets will be skipped.
- Forecast windows differ: Polymarket markets span weeks/months; NOAA forecasts are 7 days.
  Short-window probability from NOAA for a month-long market will underestimate.
- Always check the market end date before acting. A market closing in 24 hours needs
  much higher confidence than one closing in 30 days.

## Crypto markets

### Price threshold markets ("Will BTC reach $100k?")

Uses a simplified **log-normal probability model**:

```
P(price > target | current_price, volatility, days) = 1 - Φ(log(target/current) / (vol × √days))
```

Where:
- `Φ` is the standard normal CDF
- `vol` = estimated daily volatility (from Binance 24h high/low range ÷ 2)
- `days` = assumed 30-day window (conservative; shorter for near-expiry markets)

This is deliberately **conservative** (zero drift assumption). It will underestimate
probability for strongly trending markets, so combine with 24h momentum signal.

### Momentum markets ("Will BTC be up this week?")

Uses 24h price change as a momentum proxy:
```
real_prob = 0.5 + clamp(change_24h_pct / 100, -0.30, +0.30)
```

E.g., BTC up 8% in 24h → real_prob = 0.5 + 0.08 = 0.58

### ATH / record markets

Base probability 30%, adjusted upward by positive momentum. Rough heuristic only.

### Limitations
- The log-normal model assumes constant volatility and no drift — both false.
- We use 30 days as a fixed window; real market expiry dates vary widely.
- CoinGecko free tier has aggressive rate limits; Binance is more reliable.
- Crypto markets on Polymarket often have very specific conditions (exact price at
  exact date) — read the fine print before acting.

## Wallet tracking

### Why this matters

A wallet that consistently profits on Polymarket has already done the research.
Copying their entries (especially large ones) is a simple, defensible strategy.

### How it works

1. Fetch the last N trades from `data-api.polymarket.com/trades?user={proxy}`
2. Diff against `~/.openclaw/polymarket-edge-state.json` (seen trade IDs)
3. Return only trades not seen in the previous run
4. Persist current trade IDs to state file for next run

### Signal quality

Strong signals:
- Large position size ($1,000+) — whales don't risk big on low-confidence bets
- First entry (not averaging down on a losing position)
- Market with >30 days until expiry — enough time for the edge to play out

Weak signals:
- Small size (<$100) — could be testing the market
- Near-expiry market — limited upside even if correct
- Market already highly liquid with tight spread — less room for mispricing

## General principles

1. **Edge is not guaranteed profit.** These are probabilities, not certainties.
2. **Liquidity matters.** A 20% edge in a $500-volume market may be unenterable
   without moving the price against you.
3. **Read the resolution criteria.** Polymarket markets often have specific resolution
   rules. A market asking "Will it rain in NYC in July?" might resolve based on a
   specific weather station measurement, not the general forecast.
4. **Start small.** Use the scanner to learn which markets + data sources produce
   reliable signals before sizing up.
5. **Track your results.** Log every entry and exit. The only way to know if your
   edge is real is to measure it over time.
