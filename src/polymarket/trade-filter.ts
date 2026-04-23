import type {
  BotConfig,
  PolymarketMarket,
  PolymarketTrade,
  TradeSignal,
  WalletStats,
} from "./types.js";

interface CandidateKey {
  market: string;
  outcomeIndex: number;
  side: "BUY" | "SELL";
}

interface Candidate {
  key: CandidateKey;
  wallets: Set<string>;
  totalSizeUsd: number;
  latestTs: number;
  priceSum: number;
  priceCount: number;
}

function keyOf(k: CandidateKey): string {
  return `${k.market}|${k.outcomeIndex}|${k.side}`;
}

/**
 * Build trade signals by aggregating recent smart-wallet trades.
 *
 * Strategy: a (market, outcome, side) becomes a signal when >=2 smart wallets
 * took the same side in the lookback window. Confidence scales with:
 *   - number of smart wallets agreeing
 *   - aggregate notional
 *   - freshness (exponential decay over 24h)
 */
export function buildSignals(
  trades: readonly PolymarketTrade[],
  smartWallets: readonly WalletStats[],
  markets: readonly PolymarketMarket[],
  cfg: BotConfig,
  nowMs: number = Date.now(),
): TradeSignal[] {
  const smartSet = new Set(smartWallets.map((w) => w.wallet.toLowerCase()));
  const byId = new Map(markets.map((m) => [m.conditionId, m]));
  const candidates = new Map<string, Candidate>();

  const lookbackMs = 24 * 60 * 60 * 1000;
  const cutoff = nowMs - lookbackMs;

  for (const t of trades) {
    if (!smartSet.has(t.proxyWallet.toLowerCase())) {continue;}
    const tsMs = t.timestamp * 1000;
    if (tsMs < cutoff) {continue;}
    const market = byId.get(t.market);
    if (!market || market.closed || !market.active) {continue;}

    const k: CandidateKey = {
      market: t.market,
      outcomeIndex: t.outcomeIndex,
      side: t.side,
    };
    const id = keyOf(k);
    let c = candidates.get(id);
    if (!c) {
      c = {
        key: k,
        wallets: new Set(),
        totalSizeUsd: 0,
        latestTs: 0,
        priceSum: 0,
        priceCount: 0,
      };
      candidates.set(id, c);
    }
    c.wallets.add(t.proxyWallet.toLowerCase());
    c.totalSizeUsd += t.size * t.price;
    c.latestTs = Math.max(c.latestTs, tsMs);
    c.priceSum += t.price;
    c.priceCount += 1;
  }

  const signals: TradeSignal[] = [];
  for (const c of candidates.values()) {
    if (c.wallets.size < 2) {continue;}
    const market = byId.get(c.key.market);
    if (!market) {continue;}
    const token = market.tokens[c.key.outcomeIndex];
    if (!token) {continue;}

    const ageMs = Math.max(0, nowMs - c.latestTs);
    const freshness = Math.exp(-ageMs / (8 * 60 * 60 * 1000)); // half-life ~5.5h
    const walletScore = Math.min(1, c.wallets.size / 5);
    const sizeScore = Math.min(1, c.totalSizeUsd / 50_000);
    const confidence = 0.4 * walletScore + 0.3 * sizeScore + 0.3 * freshness;

    if (confidence < cfg.minConfidence) {continue;}

    const avgPrice = c.priceSum / Math.max(1, c.priceCount);
    signals.push({
      market,
      tokenId: token.tokenId,
      outcome: token.outcome,
      side: c.key.side,
      price: avgPrice,
      reason: `${c.wallets.size} smart wallets ${c.key.side.toLowerCase()}ing ${token.outcome} (~$${c.totalSizeUsd.toFixed(0)} in 24h)`,
      confidence,
      sourceWallets: [...c.wallets],
    });
  }

  return signals.toSorted((a, b) => b.confidence - a.confidence);
}
