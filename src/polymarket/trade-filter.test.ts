import { describe, expect, it } from "vitest";
import { buildSignals } from "./trade-filter.js";
import type { BotConfig, PolymarketMarket, PolymarketTrade, WalletStats } from "./types.js";

const cfg: BotConfig = {
  clobBaseUrl: "",
  dataBaseUrl: "",
  gammaBaseUrl: "",
  tradeSizeUsd: 20,
  maxOpenPositions: 5,
  maxTrades: 10,
  minWinRate: 0.6,
  minPnlUsd: 5000,
  minTradeCount: 20,
  minConfidence: 0.3,
  dryRun: true,
  privateKey: "",
};

const market: PolymarketMarket = {
  conditionId: "m1",
  slug: "will-x-happen",
  question: "Will X happen?",
  active: true,
  closed: false,
  tokens: [
    { tokenId: "tok-yes", outcome: "Yes" },
    { tokenId: "tok-no", outcome: "No" },
  ],
};

function trade(overrides: Partial<PolymarketTrade>): PolymarketTrade {
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
    ...overrides,
  };
}

function smart(wallet: string): WalletStats {
  return {
    wallet,
    trades: 50,
    volumeUsd: 100_000,
    realizedPnlUsd: 20_000,
    winCount: 40,
    lossCount: 10,
    winRate: 0.8,
    avgTradeSizeUsd: 2000,
    lastTradeTs: 0,
  };
}

describe("buildSignals", () => {
  it("emits a signal when >=2 smart wallets take the same side", () => {
    const trades = [
      trade({ proxyWallet: "0xalice", side: "BUY", outcomeIndex: 0 }),
      trade({ proxyWallet: "0xbob", side: "BUY", outcomeIndex: 0 }),
    ];
    const signals = buildSignals(trades, [smart("0xalice"), smart("0xbob")], [market], cfg);
    expect(signals).toHaveLength(1);
    expect(signals[0].side).toBe("BUY");
    expect(signals[0].outcome).toBe("Yes");
    expect(signals[0].sourceWallets.toSorted()).toEqual(["0xalice", "0xbob"]);
  });

  it("ignores non-smart wallets", () => {
    const trades = [
      trade({ proxyWallet: "0xalice", side: "BUY", outcomeIndex: 0 }),
      trade({ proxyWallet: "0xrando", side: "BUY", outcomeIndex: 0 }),
    ];
    const signals = buildSignals(trades, [smart("0xalice")], [market], cfg);
    expect(signals).toHaveLength(0);
  });

  it("ignores closed markets", () => {
    const closed = { ...market, closed: true };
    const trades = [
      trade({ proxyWallet: "0xalice" }),
      trade({ proxyWallet: "0xbob" }),
    ];
    const signals = buildSignals(trades, [smart("0xalice"), smart("0xbob")], [closed], cfg);
    expect(signals).toHaveLength(0);
  });

  it("ignores trades older than 24h", () => {
    const old = Math.floor((Date.now() - 36 * 60 * 60 * 1000) / 1000);
    const trades = [
      trade({ proxyWallet: "0xalice", timestamp: old }),
      trade({ proxyWallet: "0xbob", timestamp: old }),
    ];
    const signals = buildSignals(trades, [smart("0xalice"), smart("0xbob")], [market], cfg);
    expect(signals).toHaveLength(0);
  });
});
