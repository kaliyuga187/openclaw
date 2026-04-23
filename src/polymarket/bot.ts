import { PolymarketClient } from "./client.js";
import { TradeExecutor } from "./executor.js";
import { buildSignals } from "./trade-filter.js";
import type {
  BotConfig,
  ExecutionResult,
  PolymarketTrade,
  TradeSignal,
  WalletStats,
} from "./types.js";
import { filterSmartWallets, rankWallets } from "./wallet-ranker.js";

export interface BotRunResult {
  scannedWallets: number;
  smartWallets: WalletStats[];
  signals: TradeSignal[];
  executions: ExecutionResult[];
}

export interface BotRunOptions {
  /** Trades to use for wallet ranking. If omitted, pulled from the Data API. */
  trades?: PolymarketTrade[];
  /** Optional hook for structured logging. */
  log?: (msg: string) => void;
}

/**
 * Orchestrator: fetch recent trades → rank wallets → filter smart money →
 * build signals from smart-wallet activity → execute (dry-run by default).
 */
export class PolymarketBot {
  private readonly client: PolymarketClient;
  private readonly executor: TradeExecutor;

  constructor(private readonly cfg: BotConfig) {
    this.client = new PolymarketClient(cfg);
    this.executor = new TradeExecutor(cfg);
  }

  async run(opts: BotRunOptions = {}): Promise<BotRunResult> {
    const log = opts.log ?? (() => {});

    log("polymarket: fetching active markets");
    const markets = await this.client.fetchActiveMarkets(500);
    log(`polymarket: ${markets.length} active markets`);

    const trades =
      opts.trades ??
      (await (async () => {
        log("polymarket: fetching recent trades");
        return this.client.fetchRecentTrades(5000);
      })());
    log(`polymarket: ranking ${trades.length} trades`);

    const ranked = rankWallets(trades);
    const smartWallets = filterSmartWallets(ranked, {
      minWinRate: this.cfg.minWinRate,
      minPnlUsd: this.cfg.minPnlUsd,
      minTradeCount: this.cfg.minTradeCount,
    });
    log(`polymarket: ${smartWallets.length}/${ranked.length} wallets pass smart-money filters`);

    const signals = buildSignals(trades, smartWallets, markets, this.cfg);
    log(`polymarket: ${signals.length} signals above confidence ${this.cfg.minConfidence}`);

    const toExecute = signals.slice(0, this.cfg.maxTrades);
    const executions: ExecutionResult[] = [];
    for (const signal of toExecute) {
      const result = await this.executor.execute(signal);
      executions.push(result);
      const tag = result.dryRun ? "[DRY]" : result.ok ? "[LIVE]" : "[FAIL]";
      log(
        `polymarket: ${tag} ${signal.side} ${signal.outcome} @ ${signal.price.toFixed(3)} ` +
          `(conf ${signal.confidence.toFixed(2)}) ${result.error ? `err=${result.error}` : ""}`,
      );
    }

    return {
      scannedWallets: ranked.length,
      smartWallets,
      signals,
      executions,
    };
  }
}
