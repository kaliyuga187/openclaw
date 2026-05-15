# Polymarket trading bot

Copy-trading bot that ranks Polymarket wallets by realized PnL and win rate,
then mirrors fresh trades from the smart-money cohort.

Module layout:

- `client.ts` – fetch wrapper around Polymarket Gamma (markets), Data API
  (trades), and CLOB (midpoint). Pages the Data API in batches of 500 so
  wallet ranking can see many thousands of trades per run.
- `wallet-ranker.ts` – pure function that computes per-wallet PnL/win-rate
  from a trade stream using FIFO matching against BUY legs.
- `trade-filter.ts` – aggregates recent smart-wallet trades into
  `(market, outcome, side)` signals with a confidence score.
- `executor.ts` – dry-run by default; live trading dynamically imports
  `@polymarket/clob-client` and `ethers` to sign and post orders.
- `state.ts` – persists open positions to
  `${OPENCLAW_STATE_DIR:-~/.openclaw}/polymarket/state.json` so re-runs
  don't double-up and `polymarket positions` can list what's open.
- `bot.ts` – orchestrator: fetch → rank → filter → skip-if-held → execute → persist.
- `config.ts` – env-driven `BotConfig` loader with guardrails.

## Quick start (dry-run)

Once the CLI is built (`pnpm build`), three subcommands are available:

```bash
openclaw polymarket rank --top 20        # leaderboard of smart wallets
openclaw polymarket scan                  # signals the bot would take
openclaw polymarket run                   # full pipeline (dry-run)
openclaw polymarket positions             # show stored open positions
```

In dev (no build needed):

```bash
pnpm polymarket:rank
pnpm polymarket:scan
pnpm polymarket -- run --json
```

Or the standalone runner (no CLI registration required):

```bash
pnpm dlx tsx scripts/polymarket-bot.ts --show-wallets
```

No keys, no trades placed — every command above is read-only by default.

## Live trading

**Real funds at risk. Audit the code first and start tiny.**

1. Fund a Polygon wallet with USDC and grant CLOB approvals by logging into
   Polymarket once through the official UI with the same key.
2. Add the signing deps to this package (they are intentionally optional):

   ```bash
   pnpm add @polymarket/clob-client ethers
   ```

3. Export credentials and run with `--live`:

   ```bash
   export POLYMARKET_PRIVATE_KEY=0x...             # 32-byte hex
   export POLYMARKET_FUNDER=0x...                  # optional proxy address
   export POLYMARKET_TRADE_SIZE_USD=20
   export POLYMARKET_MAX_TRADES=10
   pnpm dlx tsx scripts/polymarket-bot.ts --live
   ```

   The runner sleeps for 5 seconds after printing a LIVE TRADING warning so
   you can abort with Ctrl-C.

## Knobs (env)

| Env | Default | Meaning |
| --- | --- | --- |
| `POLYMARKET_DRY_RUN` | `true` | Set `false` for live trading |
| `POLYMARKET_TRADE_SIZE_USD` | `20` | USDC per trade |
| `POLYMARKET_MAX_TRADES` | `10` | Hard cap per run |
| `POLYMARKET_MIN_WIN_RATE` | `0.6` | Smart-wallet win-rate floor |
| `POLYMARKET_MIN_PNL_USD` | `5000` | Smart-wallet realized-PnL floor |
| `POLYMARKET_MIN_TRADE_COUNT` | `20` | Minimum trades for a wallet to count |
| `POLYMARKET_MIN_CONFIDENCE` | `0.6` | Signal confidence threshold |

## Caveats

- PnL estimation ignores unresolved positions and trading fees; it is a
  relative ranking, not an audit.
- The "86M trades" number in the source tweet is marketing. The public
  Data API paginates trades; a thorough run uses historical snapshots.
- Polymarket is unavailable to US persons under current CFTC settlements.
  Trading may be restricted in your jurisdiction — check before going live.
- Past PnL does not predict future PnL. Copy-trading tends to arrive late
  because someone has to be early; size accordingly.
