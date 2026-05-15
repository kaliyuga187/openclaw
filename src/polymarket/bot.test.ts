import { describe, expect, it } from "vitest";
import { PolymarketBot, type BotClient, type BotExecutor } from "./bot.js";
import type { BotState } from "./state.js";
import type {
  BotConfig,
  ExecutionResult,
  PolymarketMarket,
  PolymarketTrade,
  TradeSignal,
} from "./types.js";

const cfg: BotConfig = {
  clobBaseUrl: "",
  dataBaseUrl: "",
  gammaBaseUrl: "",
  tradeSizeUsd: 20,
  maxOpenPositions: 5,
  maxTrades: 10,
  minWinRate: 0.6,
  minPnlUsd: 5000,
  minTradeCount: 5, // low for tests
  minConfidence: 0.3,
  dryRun: true,
  privateKey: "",
};

const market: PolymarketMarket = {
  conditionId: "m1",
  slug: "will-x",
  question: "Will X happen?",
  active: true,
  closed: false,
  tokens: [
    { tokenId: "tok-yes", outcome: "Yes" },
    { tokenId: "tok-no", outcome: "No" },
  ],
};

function trade(p: Partial<PolymarketTrade>): PolymarketTrade {
  return {
    transactionHash: "0xabc",
    timestamp: Math.floor(Date.now() / 1000),
    market: "m1",
    asset: "tok-yes",
    side: "BUY",
    size: 1000,
    price: 0.5,
    proxyWallet: "0xalice",
    outcome: "Yes",
    outcomeIndex: 0,
    ...p,
  };
}

function profitableTrades(wallet: string): PolymarketTrade[] {
  // Build enough wins to clear minTradeCount=5 and minPnlUsd=5000.
  // Each (BUY 1000 @ 0.4 → SELL 1000 @ 0.95) cycle = +550 realized PnL.
  // Use 12 cycles across distinct markets so positions don't interact.
  const out: PolymarketTrade[] = [];
  for (let i = 0; i < 12; i += 1) {
    out.push(
      trade({
        proxyWallet: wallet,
        market: `m-old-${i}`,
        outcomeIndex: 0,
        side: "BUY",
        price: 0.4,
        size: 1000,
        timestamp: 1,
      }),
      trade({
        proxyWallet: wallet,
        market: `m-old-${i}`,
        outcomeIndex: 0,
        side: "SELL",
        price: 0.95,
        size: 1000,
        timestamp: 2,
      }),
    );
  }
  return out;
}

function inMemoryStateIO(initial: BotState = { version: 1, positions: [] }) {
  let cur = initial;
  return {
    load: async () => cur,
    save: async (s: BotState) => {
      cur = s;
    },
    snapshot: () => cur,
  };
}

describe("PolymarketBot.run", () => {
  it("ranks wallets, builds signals, and writes positions on dry-run success", async () => {
    const aliceHistory = profitableTrades("0xalice");
    const bobHistory = profitableTrades("0xbob");
    const recent = [
      trade({ proxyWallet: "0xalice", side: "BUY", price: 0.55 }),
      trade({ proxyWallet: "0xbob", side: "BUY", price: 0.55 }),
    ];
    const trades = [...aliceHistory, ...bobHistory, ...recent];

    const client: BotClient = {
      fetchActiveMarkets: async () => [market],
      fetchRecentTrades: async () => trades,
    };
    const stateIO = inMemoryStateIO();
    const bot = new PolymarketBot(cfg, { client, state: stateIO });

    const result = await bot.run();
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.executions).toHaveLength(1);
    expect(result.executions[0]).toMatchObject({ ok: true, dryRun: true });
    expect(stateIO.snapshot().positions).toHaveLength(1);
    expect(stateIO.snapshot().positions[0]).toMatchObject({
      market: "m1",
      side: "BUY",
      outcome: "Yes",
    });
  });

  it("skips signals when a matching position is already open", async () => {
    const trades = [
      ...profitableTrades("0xalice"),
      ...profitableTrades("0xbob"),
      trade({ proxyWallet: "0xalice", side: "BUY" }),
      trade({ proxyWallet: "0xbob", side: "BUY" }),
    ];
    const client: BotClient = {
      fetchActiveMarkets: async () => [market],
      fetchRecentTrades: async () => trades,
    };
    const stateIO = inMemoryStateIO({
      version: 1,
      positions: [
        {
          market: "m1",
          outcomeIndex: 0,
          outcome: "Yes",
          side: "BUY",
          tokenId: "tok-yes",
          sizeUsd: 20,
          entryPrice: 0.5,
          openedAt: Date.now(),
        },
      ],
    });
    const bot = new PolymarketBot(cfg, { client, state: stateIO });

    const result = await bot.run();
    expect(result.skippedDueToOpenPosition).toBeGreaterThan(0);
    expect(result.executions).toHaveLength(0);
    expect(stateIO.snapshot().positions).toHaveLength(1);
  });

  it("never records a position when execution fails", async () => {
    const trades = [
      ...profitableTrades("0xalice"),
      ...profitableTrades("0xbob"),
      trade({ proxyWallet: "0xalice", side: "BUY" }),
      trade({ proxyWallet: "0xbob", side: "BUY" }),
    ];
    const client: BotClient = {
      fetchActiveMarkets: async () => [market],
      fetchRecentTrades: async () => trades,
    };
    const failExecutor: BotExecutor = {
      execute: async (signal: TradeSignal): Promise<ExecutionResult> => ({
        ok: false,
        dryRun: false,
        signal,
        sizeUsd: 20,
        error: "simulated failure",
      }),
    };
    const stateIO = inMemoryStateIO();
    const bot = new PolymarketBot(cfg, { client, executor: failExecutor, state: stateIO });

    const result = await bot.run();
    expect(result.executions[0].ok).toBe(false);
    expect(stateIO.snapshot().positions).toHaveLength(0);
  });
});
