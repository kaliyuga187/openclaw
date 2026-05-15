import type { Command } from "commander";
import { PolymarketBot } from "../polymarket/bot.js";
import { PolymarketClient } from "../polymarket/client.js";
import { loadBotConfig } from "../polymarket/config.js";
import { loadState } from "../polymarket/state.js";
import { buildSignals } from "../polymarket/trade-filter.js";
import { filterSmartWallets, rankWallets } from "../polymarket/wallet-ranker.js";
import { defaultRuntime } from "../runtime.js";

interface RunOpts {
  live?: boolean;
  sizeUsd?: string;
  maxTrades?: string;
  minConfidence?: string;
  json?: boolean;
}

interface RankOpts {
  limit?: string;
  top?: string;
  json?: boolean;
}

interface ScanOpts {
  limit?: string;
  json?: boolean;
}

function toNumber(value: string | undefined): number | undefined {
  if (value == null) {return undefined;}
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

async function runRank(opts: RankOpts): Promise<void> {
  const cfg = loadBotConfig();
  const client = new PolymarketClient(cfg);
  const limit = toNumber(opts.limit) ?? 5000;
  const top = toNumber(opts.top) ?? 20;
  const trades = await client.fetchRecentTrades(limit);
  const ranked = rankWallets(trades);
  const smart = filterSmartWallets(ranked, {
    minWinRate: cfg.minWinRate,
    minPnlUsd: cfg.minPnlUsd,
    minTradeCount: cfg.minTradeCount,
  });
  if (opts.json) {
    defaultRuntime.log(JSON.stringify({ scanned: ranked.length, smart, top: ranked.slice(0, top) }, null, 2));
    return;
  }
  defaultRuntime.log(`Scanned ${ranked.length} wallets from ${trades.length} trades.`);
  defaultRuntime.log(`Smart wallets (winRate >= ${cfg.minWinRate}, pnl >= $${cfg.minPnlUsd}, n >= ${cfg.minTradeCount}): ${smart.length}`);
  defaultRuntime.log(`\nTop ${Math.min(top, ranked.length)} by realized PnL:`);
  for (const w of ranked.slice(0, top)) {
    defaultRuntime.log(
      `  ${w.wallet}  pnl=$${w.realizedPnlUsd.toFixed(0).padStart(8)}  wr=${(w.winRate * 100).toFixed(1).padStart(5)}%  n=${String(w.trades).padStart(4)}`,
    );
  }
}

async function runScan(opts: ScanOpts): Promise<void> {
  const cfg = loadBotConfig();
  const client = new PolymarketClient(cfg);
  const limit = toNumber(opts.limit) ?? 5000;
  const [markets, trades] = await Promise.all([
    client.fetchActiveMarkets(500),
    client.fetchRecentTrades(limit),
  ]);
  const ranked = rankWallets(trades);
  const smart = filterSmartWallets(ranked, {
    minWinRate: cfg.minWinRate,
    minPnlUsd: cfg.minPnlUsd,
    minTradeCount: cfg.minTradeCount,
  });
  const signals = buildSignals(trades, smart, markets, cfg);
  if (opts.json) {
    defaultRuntime.log(JSON.stringify({ markets: markets.length, smartWallets: smart.length, signals }, null, 2));
    return;
  }
  defaultRuntime.log(`Found ${signals.length} signals from ${smart.length} smart wallets across ${markets.length} markets.\n`);
  for (const s of signals) {
    defaultRuntime.log(
      `  conf=${s.confidence.toFixed(2)}  ${s.side.padEnd(4)}  ${s.outcome.padEnd(8)}  @${s.price.toFixed(3)}  ${s.market.question.slice(0, 60)}`,
    );
    defaultRuntime.log(`    ${s.reason}`);
  }
}

async function runBot(opts: RunOpts): Promise<void> {
  if (opts.live) {process.env.POLYMARKET_DRY_RUN = "false";}
  const cfg = loadBotConfig({
    ...(toNumber(opts.sizeUsd) != null ? { tradeSizeUsd: toNumber(opts.sizeUsd)! } : {}),
    ...(toNumber(opts.maxTrades) != null ? { maxTrades: toNumber(opts.maxTrades)! } : {}),
    ...(toNumber(opts.minConfidence) != null ? { minConfidence: toNumber(opts.minConfidence)! } : {}),
  });
  if (!cfg.dryRun) {
    defaultRuntime.log(
      "polymarket: LIVE TRADING is enabled. Real funds will be at risk. Ctrl-C within 5s to cancel.",
    );
    await new Promise((r) => setTimeout(r, 5000));
  }
  const bot = new PolymarketBot(cfg);
  const result = await bot.run({ log: (m) => defaultRuntime.log(m) });
  if (opts.json) {
    defaultRuntime.log(JSON.stringify(result, null, 2));
    return;
  }
  defaultRuntime.log(
    `\nscanned=${result.scannedWallets} smart=${result.smartWallets.length} ` +
      `signals=${result.signals.length} executed=${result.executions.length} ` +
      `skipped=${result.skippedDueToOpenPosition}`,
  );
}

async function runPositions(opts: { json?: boolean }): Promise<void> {
  const state = await loadState();
  if (opts.json) {
    defaultRuntime.log(JSON.stringify(state, null, 2));
    return;
  }
  if (state.positions.length === 0) {
    defaultRuntime.log("No open positions.");
    return;
  }
  defaultRuntime.log(`Open positions (${state.positions.length}):`);
  for (const p of state.positions) {
    const ageHr = ((Date.now() - p.openedAt) / 3_600_000).toFixed(1);
    defaultRuntime.log(
      `  ${p.side} ${p.outcome} @ ${p.entryPrice.toFixed(3)}  size=$${p.sizeUsd}  age=${ageHr}h  market=${p.market.slice(0, 10)}…`,
    );
  }
}

export function registerPolymarketCli(program: Command): void {
  const root = program
    .command("polymarket")
    .description("Polymarket copy-trading bot (dry-run by default)");

  root
    .command("rank")
    .description("Rank wallets by realized PnL and win rate")
    .option("--limit <n>", "Trades to scan", "5000")
    .option("--top <n>", "Top wallets to print", "20")
    .option("--json", "Emit JSON", false)
    .action(async (opts: RankOpts) => {
      try {
        await runRank(opts);
      } catch (err) {
        defaultRuntime.error(err instanceof Error ? err.message : String(err));
        defaultRuntime.exit(1);
      }
    });

  root
    .command("scan")
    .description("Build trade signals from smart-wallet activity (no execution)")
    .option("--limit <n>", "Trades to scan", "5000")
    .option("--json", "Emit JSON", false)
    .action(async (opts: ScanOpts) => {
      try {
        await runScan(opts);
      } catch (err) {
        defaultRuntime.error(err instanceof Error ? err.message : String(err));
        defaultRuntime.exit(1);
      }
    });

  root
    .command("run")
    .description("Run the bot once (dry-run unless --live)")
    .option("--live", "Disable dry-run; requires POLYMARKET_PRIVATE_KEY", false)
    .option("--size-usd <n>", "USDC per trade")
    .option("--max-trades <n>", "Max trades to place in this run")
    .option("--min-confidence <f>", "Signal confidence threshold")
    .option("--json", "Emit JSON", false)
    .action(async (opts: RunOpts) => {
      try {
        await runBot(opts);
      } catch (err) {
        defaultRuntime.error(err instanceof Error ? err.message : String(err));
        defaultRuntime.exit(1);
      }
    });

  root
    .command("positions")
    .description("List open positions tracked by the bot")
    .option("--json", "Emit JSON", false)
    .action(async (opts: { json?: boolean }) => {
      try {
        await runPositions(opts);
      } catch (err) {
        defaultRuntime.error(err instanceof Error ? err.message : String(err));
        defaultRuntime.exit(1);
      }
    });
}
