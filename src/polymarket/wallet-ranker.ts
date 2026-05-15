import type { PolymarketTrade, WalletStats } from "./types.js";

interface OpenPosition {
  size: number;
  costUsd: number; // cumulative USDC spent opening
}

/**
 * Estimate per-wallet performance from a trade stream.
 *
 * PnL approximation: treat each (wallet, market, outcomeIndex) as a position.
 * BUY adds size at cost = size * price; SELL closes against the position's
 * running average cost (cost / size), so realized PnL on a close of `n`
 * shares is `(salePrice - avgOpenPrice) * n`. This is moving-average cost
 * accounting, not strict FIFO lot matching — the distinction only matters
 * if a wallet partially closes a position at varying prices.
 *
 * Wallet keys are lower-cased so mixed-case addresses from the upstream API
 * don't get split across multiple entries.
 *
 * Limitations:
 *  - Ignores unresolved/open positions (their value is unknown until resolution).
 *  - Fees are not modeled.
 *  - Win-rate counts each SELL as a trade outcome (realized > 0 => win).
 *
 * Good enough for ranking "smart money" relative to the crowd; not an audit.
 */
export function rankWallets(trades: readonly PolymarketTrade[]): WalletStats[] {
  const statsByWallet = new Map<string, WalletStats>();
  const positions = new Map<string, OpenPosition>(); // key: wallet|market|outcomeIndex

  const sorted = [...trades].toSorted((a, b) => a.timestamp - b.timestamp);

  for (const t of sorted) {
    const wallet = t.proxyWallet.toLowerCase();
    const posKey = `${wallet}|${t.market}|${t.outcomeIndex}`;
    let s = statsByWallet.get(wallet);
    if (!s) {
      s = {
        wallet,
        trades: 0,
        volumeUsd: 0,
        realizedPnlUsd: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        avgTradeSizeUsd: 0,
        lastTradeTs: 0,
      };
      statsByWallet.set(wallet, s);
    }

    const notional = t.size * t.price;
    s.trades += 1;
    s.volumeUsd += notional;
    s.lastTradeTs = Math.max(s.lastTradeTs, t.timestamp);

    const pos = positions.get(posKey) ?? { size: 0, costUsd: 0 };
    if (t.side === "BUY") {
      pos.size += t.size;
      pos.costUsd += notional;
      positions.set(posKey, pos);
    } else {
      // SELL: realize PnL against average open price.
      if (pos.size > 0) {
        const avgOpen = pos.costUsd / pos.size;
        const closeSize = Math.min(t.size, pos.size);
        const realized = (t.price - avgOpen) * closeSize;
        s.realizedPnlUsd += realized;
        if (realized > 0) {s.winCount += 1;}
        else if (realized < 0) {s.lossCount += 1;}
        pos.size -= closeSize;
        pos.costUsd -= avgOpen * closeSize;
        if (pos.size <= 1e-9) {positions.delete(posKey);}
        else {positions.set(posKey, pos);}
      }
      // Naked sells (short entries) not modeled; they're rare on Polymarket.
    }
  }

  for (const s of statsByWallet.values()) {
    const decided = s.winCount + s.lossCount;
    s.winRate = decided > 0 ? s.winCount / decided : 0;
    s.avgTradeSizeUsd = s.trades > 0 ? s.volumeUsd / s.trades : 0;
  }

  return [...statsByWallet.values()].toSorted(
    (a, b) => b.realizedPnlUsd - a.realizedPnlUsd,
  );
}

/** Filter a ranked wallet list to the "smart money" tier. */
export function filterSmartWallets(
  wallets: readonly WalletStats[],
  opts: { minWinRate: number; minPnlUsd: number; minTradeCount: number },
): WalletStats[] {
  return wallets.filter(
    (w) =>
      w.trades >= opts.minTradeCount &&
      w.winRate >= opts.minWinRate &&
      w.realizedPnlUsd >= opts.minPnlUsd,
  );
}
