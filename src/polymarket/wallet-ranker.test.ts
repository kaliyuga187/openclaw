import { describe, expect, it } from "vitest";
import type { PolymarketTrade } from "./types.js";
import { filterSmartWallets, rankWallets } from "./wallet-ranker.js";

function trade(overrides: Partial<PolymarketTrade>): PolymarketTrade {
  return {
    transactionHash: "0xabc",
    timestamp: 0,
    market: "m1",
    asset: "t1",
    side: "BUY",
    size: 100,
    price: 0.5,
    proxyWallet: "0xalice",
    outcome: "Yes",
    outcomeIndex: 0,
    ...overrides,
  };
}

describe("rankWallets", () => {
  it("computes realized PnL on a closed round-trip", () => {
    const trades: PolymarketTrade[] = [
      trade({ proxyWallet: "0xalice", side: "BUY", size: 100, price: 0.4, timestamp: 1 }),
      trade({ proxyWallet: "0xalice", side: "SELL", size: 100, price: 0.7, timestamp: 2 }),
    ];
    const ranked = rankWallets(trades);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].wallet).toBe("0xalice");
    expect(ranked[0].realizedPnlUsd).toBeCloseTo(30, 5);
    expect(ranked[0].winCount).toBe(1);
    expect(ranked[0].winRate).toBe(1);
  });

  it("sorts by realized PnL descending", () => {
    const trades: PolymarketTrade[] = [
      trade({ proxyWallet: "0xbob", side: "BUY", size: 100, price: 0.5, timestamp: 1 }),
      trade({ proxyWallet: "0xbob", side: "SELL", size: 100, price: 0.4, timestamp: 2 }),
      trade({ proxyWallet: "0xalice", side: "BUY", size: 100, price: 0.3, timestamp: 1 }),
      trade({ proxyWallet: "0xalice", side: "SELL", size: 100, price: 0.9, timestamp: 2 }),
    ];
    const ranked = rankWallets(trades);
    expect(ranked[0].wallet).toBe("0xalice");
    expect(ranked[1].wallet).toBe("0xbob");
  });

  it("treats market/outcome as independent positions", () => {
    const trades: PolymarketTrade[] = [
      trade({ proxyWallet: "0xalice", market: "m1", outcomeIndex: 0, side: "BUY", size: 100, price: 0.4, timestamp: 1 }),
      trade({ proxyWallet: "0xalice", market: "m2", outcomeIndex: 0, side: "SELL", size: 100, price: 0.6, timestamp: 2 }),
    ];
    const ranked = rankWallets(trades);
    // SELL on m2 has no open position there, so realized PnL=0.
    expect(ranked[0].realizedPnlUsd).toBeCloseTo(0, 5);
  });

  it("normalizes wallet addresses to lowercase so mixed-case rows don't split", () => {
    const trades: PolymarketTrade[] = [
      trade({ proxyWallet: "0xAliCe", side: "BUY", size: 100, price: 0.4, timestamp: 1 }),
      trade({ proxyWallet: "0xALICE", side: "SELL", size: 100, price: 0.7, timestamp: 2 }),
    ];
    const ranked = rankWallets(trades);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].wallet).toBe("0xalice");
    expect(ranked[0].realizedPnlUsd).toBeCloseTo(30, 5);
  });
});

describe("filterSmartWallets", () => {
  it("enforces all three thresholds", () => {
    const ranked = [
      { wallet: "0xgood", trades: 25, volumeUsd: 10_000, realizedPnlUsd: 6000, winCount: 20, lossCount: 5, winRate: 0.8, avgTradeSizeUsd: 400, lastTradeTs: 0 },
      { wallet: "0xlowpnl", trades: 25, volumeUsd: 10_000, realizedPnlUsd: 100, winCount: 20, lossCount: 5, winRate: 0.8, avgTradeSizeUsd: 400, lastTradeTs: 0 },
      { wallet: "0xlowwr", trades: 25, volumeUsd: 10_000, realizedPnlUsd: 6000, winCount: 10, lossCount: 15, winRate: 0.4, avgTradeSizeUsd: 400, lastTradeTs: 0 },
      { wallet: "0xfew", trades: 5, volumeUsd: 10_000, realizedPnlUsd: 6000, winCount: 4, lossCount: 1, winRate: 0.8, avgTradeSizeUsd: 2000, lastTradeTs: 0 },
    ];
    const smart = filterSmartWallets(ranked, { minWinRate: 0.6, minPnlUsd: 5000, minTradeCount: 20 });
    expect(smart.map((w) => w.wallet)).toEqual(["0xgood"]);
  });
});
