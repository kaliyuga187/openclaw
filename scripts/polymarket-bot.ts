#!/usr/bin/env node
/*
 * Polymarket trading bot runner.
 *
 * Usage:
 *   pnpm dlx tsx scripts/polymarket-bot.ts                # dry-run (default)
 *   POLYMARKET_DRY_RUN=false \
 *     POLYMARKET_PRIVATE_KEY=0x... \
 *     pnpm dlx tsx scripts/polymarket-bot.ts --live       # live trading
 *
 * Flags:
 *   --live                 alias for POLYMARKET_DRY_RUN=false
 *   --size-usd <n>         override POLYMARKET_TRADE_SIZE_USD
 *   --max-trades <n>       override POLYMARKET_MAX_TRADES
 *   --min-confidence <f>   override POLYMARKET_MIN_CONFIDENCE
 *   --show-wallets         print the top 20 smart wallets
 *   --json                 emit a single JSON summary instead of text
 */
import { PolymarketBot, loadBotConfig } from "../src/polymarket/index.js";

interface CliArgs {
  live: boolean;
  sizeUsd?: number;
  maxTrades?: number;
  minConfidence?: number;
  showWallets: boolean;
  json: boolean;
}

function readNumberFlag(flag: string, value: string | undefined): number {
  if (value == null) {
    throw new Error(`polymarket: ${flag} requires a value`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`polymarket: ${flag} expected a number, got ${JSON.stringify(value)}`);
  }
  return n;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const out: CliArgs = { live: false, showWallets: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    switch (a) {
      case "--live":
        out.live = true;
        break;
      case "--show-wallets":
        out.showWallets = true;
        break;
      case "--json":
        out.json = true;
        break;
      case "--size-usd":
        out.sizeUsd = readNumberFlag(a, argv[++i]);
        break;
      case "--max-trades":
        out.maxTrades = readNumberFlag(a, argv[++i]);
        break;
      case "--min-confidence":
        out.minConfidence = readNumberFlag(a, argv[++i]);
        break;
      case "--help":
      case "-h":
        console.log(
          "polymarket-bot: see header comment in scripts/polymarket-bot.ts for usage",
        );
        process.exit(0);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.live) {process.env.POLYMARKET_DRY_RUN = "false";}

  const cfg = loadBotConfig({
    ...(args.sizeUsd != null ? { tradeSizeUsd: args.sizeUsd } : {}),
    ...(args.maxTrades != null ? { maxTrades: args.maxTrades } : {}),
    ...(args.minConfidence != null ? { minConfidence: args.minConfidence } : {}),
  });

  if (!cfg.dryRun) {
    console.warn(
      "polymarket: LIVE TRADING is enabled. Real funds will be at risk. Ctrl-C within 5s to cancel.",
    );
    await new Promise((r) => setTimeout(r, 5000));
  }

  const bot = new PolymarketBot(cfg);
  // Progress logs go to stderr when --json is set so stdout stays a single
  // parseable JSON document for downstream automation.
  const logFn = args.json
    ? (msg: string) => process.stderr.write(`${msg}\n`)
    : (msg: string) => console.log(msg);
  const result = await bot.run({ log: logFn });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.showWallets) {
    console.log("\nTop 20 smart wallets:");
    for (const w of result.smartWallets.slice(0, 20)) {
      console.log(
        `  ${w.wallet}  pnl=$${w.realizedPnlUsd.toFixed(0)}  wr=${(w.winRate * 100).toFixed(1)}%  n=${w.trades}`,
      );
    }
  }

  console.log(
    `\nDone. scanned=${result.scannedWallets} smart=${result.smartWallets.length} signals=${result.signals.length} executions=${result.executions.length}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
