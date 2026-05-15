import { PolymarketClient } from "./client.js";
import { TradeExecutor } from "./executor.js";
import {
  addPosition,
  type BotState,
  hasOpenPosition,
  loadState,
  saveState,
} from "./state.js";
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
  skippedDueToOpenPosition: number;
}

export interface BotRunOptions {
  /** Trades to use for wallet ranking. If omitted, pulled from the Data API. */
  trades?: PolymarketTrade[];
  /** Optional hook for structured logging. */
  log?: (msg: string) => void;
}

/**
 * The narrow surface of PolymarketClient that the bot actually uses; lets tests
 * inject a fake without subclassing.
 */
export type BotClient = Pick<
  PolymarketClient,
  "fetchActiveMarkets" | "fetchRecentTrades"
>;

/**
 * Same idea for the executor.
 */
export type BotExecutor = Pick<TradeExecutor, "execute">;

export interface BotDeps {
  client?: BotClient;
  executor?: BotExecutor;
  /** Inject a state container to bypass disk I/O (used by tests). */
  state?: { load: () => Promise<BotState>; save: (s: BotState) => Promise<void> };
}

/**
 * Orchestrator: fetch recent trades → rank wallets → filter smart money →
 * build signals from smart-wallet activity → execute (dry-run by default).
 */
export class PolymarketBot {
  private readonly client: BotClient;
  private readonly executor: BotExecutor;
  private readonly stateIO: {
    load: () => Promise<BotState>;
    save: (s: BotState) => Promise<void>;
  };

  constructor(private readonly cfg: BotConfig, deps: BotDeps = {}) {
    this.client = deps.client ?? new PolymarketClient(cfg);
    this.executor = deps.executor ?? new TradeExecutor(cfg);
    this.stateIO = deps.state ?? { load: () => loadState(), save: (s) => saveState(s) };
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

    let signals = buildSignals(trades, smartWallets, markets, this.cfg);
    log(`polymarket: ${signals.length} signals above confidence ${this.cfg.minConfidence}`);

    let state = await this.stateIO.load();

    // Cap open positions and skip signals we're already holding.
    let skipped = 0;
    const fresh: TradeSignal[] = [];
    for (const s of signals) {
      const idx = s.market.tokens.findIndex((t) => t.tokenId === s.tokenId);
      if (idx >= 0 && hasOpenPosition(state, s.market.conditionId, idx, s.side)) {
        skipped += 1;
        continue;
      }
      fresh.push(s);
    }
    signals = fresh;

    const room = Math.max(0, this.cfg.maxOpenPositions - state.positions.length);
    const toExecute = signals.slice(0, Math.min(this.cfg.maxTrades, room));
    if (room === 0) {log("polymarket: at maxOpenPositions; no new trades will be placed");}

    const executions: ExecutionResult[] = [];
    for (const signal of toExecute) {
      const result = await this.executor.execute(signal);
      executions.push(result);
      const tag = result.dryRun ? "[DRY]" : result.ok ? "[LIVE]" : "[FAIL]";
      log(
        `polymarket: ${tag} ${signal.side} ${signal.outcome} @ ${signal.price.toFixed(3)} ` +
          `(conf ${signal.confidence.toFixed(2)}) ${result.error ? `err=${result.error}` : ""}`,
      );
      if (result.ok) {
        const idx = signal.market.tokens.findIndex((t) => t.tokenId === signal.tokenId);
        state = addPosition(state, {
          market: signal.market.conditionId,
          outcomeIndex: idx >= 0 ? idx : 0,
          outcome: signal.outcome,
          side: signal.side,
          tokenId: signal.tokenId,
          sizeUsd: result.sizeUsd,
          entryPrice: signal.price,
          openedAt: Date.now(),
          orderId: result.orderId,
        });
      }
    }

    await this.stateIO.save(state);

    return {
      scannedWallets: ranked.length,
      smartWallets,
      signals,
      executions,
      skippedDueToOpenPosition: skipped,
    };
  }
}
