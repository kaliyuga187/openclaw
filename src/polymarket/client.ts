import type { BotConfig, PolymarketMarket, PolymarketTrade, PolymarketToken } from "./types.js";

interface GammaMarket {
  conditionId: string;
  questionID?: string;
  slug: string;
  question: string;
  endDate?: string;
  active: boolean;
  closed: boolean;
  // "[\"0x...tokenId1\",\"0x...tokenId2\"]" (Gamma returns JSON-string arrays)
  clobTokenIds?: string;
  outcomes?: string;
  outcomePrices?: string;
}

interface DataTrade {
  transactionHash: string;
  timestamp: number | string;
  market: string;
  asset: string;
  side: string;
  size: number | string;
  price: number | string;
  proxyWallet: string;
  outcome: string;
  outcomeIndex: number | string;
}

function toNumber(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function parseStringArray(value: string | undefined): string[] {
  if (!value) {return [];}
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function gammaToMarket(raw: GammaMarket): PolymarketMarket {
  const tokenIds = parseStringArray(raw.clobTokenIds);
  const outcomes = parseStringArray(raw.outcomes);
  const prices = parseStringArray(raw.outcomePrices).map(Number);
  const tokens: PolymarketToken[] = tokenIds.map((tokenId, i) => ({
    tokenId,
    outcome: outcomes[i] ?? `Outcome ${i}`,
    price: Number.isFinite(prices[i]) ? prices[i] : undefined,
  }));
  return {
    conditionId: raw.conditionId,
    questionId: raw.questionID,
    slug: raw.slug,
    question: raw.question,
    endDateIso: raw.endDate,
    active: Boolean(raw.active),
    closed: Boolean(raw.closed),
    tokens,
  };
}

function dataToTrade(raw: DataTrade): PolymarketTrade {
  const side = String(raw.side).toUpperCase();
  return {
    transactionHash: raw.transactionHash,
    timestamp: toNumber(raw.timestamp),
    market: raw.market,
    asset: raw.asset,
    side: side === "SELL" ? "SELL" : "BUY",
    size: toNumber(raw.size),
    price: toNumber(raw.price),
    proxyWallet: raw.proxyWallet,
    outcome: raw.outcome,
    outcomeIndex: toNumber(raw.outcomeIndex),
  };
}

/**
 * Minimal fetch-based Polymarket client. Stays read-only in this module;
 * order signing lives in executor.ts.
 */
export class PolymarketClient {
  constructor(private readonly cfg: BotConfig) {}

  private async getJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`polymarket: GET ${url} ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  /** Fetch currently active, non-closed markets (paginated). */
  async fetchActiveMarkets(limit = 200): Promise<PolymarketMarket[]> {
    const url = new URL("/markets", this.cfg.gammaBaseUrl);
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", "false");
    url.searchParams.set("limit", String(limit));
    const raw = await this.getJson<GammaMarket[]>(url.toString());
    return raw
      .map(gammaToMarket)
      .filter((m) => m.tokens.length > 0 && !m.closed && m.active);
  }

  /**
   * Fetch trades from /trades with offset-based pagination.
   * Polymarket's Data API caps each call at ~500 rows, so reaching multi-thousand
   * trade counts requires looping. We stop when:
   *   - the running total hits `target`
   *   - the server returns fewer rows than `pageSize` (end of feed)
   *   - `maxPages` is reached (safety valve)
   */
  private async fetchTradesPaginated(
    params: Record<string, string>,
    target: number,
    pageSize = 500,
    maxPages = 200,
  ): Promise<PolymarketTrade[]> {
    const out: PolymarketTrade[] = [];
    const cappedSize = Math.min(Math.max(1, pageSize), 500);
    for (let page = 0; page < maxPages; page += 1) {
      const url = new URL("/trades", this.cfg.dataBaseUrl);
      for (const [k, v] of Object.entries(params)) {url.searchParams.set(k, v);}
      url.searchParams.set("limit", String(cappedSize));
      url.searchParams.set("offset", String(page * cappedSize));
      const raw = await this.getJson<DataTrade[]>(url.toString());
      if (raw.length === 0) {break;}
      for (const t of raw) {
        out.push(dataToTrade(t));
        if (out.length >= target) {return out;}
      }
      if (raw.length < cappedSize) {break;}
    }
    return out;
  }

  /**
   * Fetch the most recent trades platform-wide.
   * Used to seed the wallet ranker when no wallet list is provided.
   */
  async fetchRecentTrades(limit = 1000): Promise<PolymarketTrade[]> {
    return this.fetchTradesPaginated({}, limit);
  }

  /** Fetch a single wallet's trade history. */
  async fetchWalletTrades(wallet: string, limit = 500): Promise<PolymarketTrade[]> {
    return this.fetchTradesPaginated({ user: wallet }, limit);
  }

  /** Current best bid/ask for a token. */
  async fetchMidPrice(tokenId: string): Promise<number | undefined> {
    const url = new URL("/midpoint", this.cfg.clobBaseUrl);
    url.searchParams.set("token_id", tokenId);
    try {
      const res = await this.getJson<{ mid: string | number }>(url.toString());
      const mid = toNumber(res.mid);
      return mid > 0 ? mid : undefined;
    } catch {
      return undefined;
    }
  }
}
