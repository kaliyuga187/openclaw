// Shared types for the Polymarket trading bot.

export type Side = "BUY" | "SELL";

export interface PolymarketMarket {
  conditionId: string;
  questionId?: string;
  slug: string;
  question: string;
  endDateIso?: string;
  active: boolean;
  closed: boolean;
  tokens: PolymarketToken[];
}

export interface PolymarketToken {
  tokenId: string;
  outcome: string;
  price?: number;
  winner?: boolean;
}

export interface PolymarketTrade {
  transactionHash: string;
  timestamp: number;
  market: string; // conditionId
  asset: string; // tokenId
  side: Side;
  size: number; // in outcome shares
  price: number; // 0..1
  proxyWallet: string; // maker/taker wallet
  outcome: string;
  outcomeIndex: number;
}

export interface WalletStats {
  wallet: string;
  trades: number;
  volumeUsd: number;
  realizedPnlUsd: number;
  winCount: number;
  lossCount: number;
  winRate: number; // 0..1
  avgTradeSizeUsd: number;
  lastTradeTs: number;
}

export interface TradeSignal {
  market: PolymarketMarket;
  tokenId: string;
  outcome: string;
  side: Side;
  price: number;
  reason: string;
  confidence: number; // 0..1
  sourceWallets: string[]; // smart wallets triggering the signal
}

export interface ExecutionResult {
  ok: boolean;
  dryRun: boolean;
  orderId?: string;
  error?: string;
  signal: TradeSignal;
  sizeUsd: number;
}

export interface BotConfig {
  /** Base URL for Polymarket CLOB API. */
  clobBaseUrl: string;
  /** Base URL for Polymarket Data API. */
  dataBaseUrl: string;
  /** Base URL for Polymarket Gamma (markets) API. */
  gammaBaseUrl: string;
  /** Capital in USDC the bot may allocate per trade. */
  tradeSizeUsd: number;
  /** Max concurrent positions. */
  maxOpenPositions: number;
  /** Maximum number of trades the bot will place in one run. */
  maxTrades: number;
  /** Minimum win rate required for a wallet to count as "smart". */
  minWinRate: number;
  /** Minimum realized PnL (USD) required for a wallet to count as smart. */
  minPnlUsd: number;
  /** Minimum number of trades a wallet needs before ranking. */
  minTradeCount: number;
  /** Signal confidence threshold for execution. */
  minConfidence: number;
  /** Dry-run mode: do not submit orders. */
  dryRun: boolean;
  /** Polygon private key hex (0x...) for order signing. Empty in dry-run. */
  privateKey: string;
  /** Optional Polymarket API key id (if using API-key auth). */
  apiKey?: string;
  /** Optional Polymarket API secret. */
  apiSecret?: string;
  /** Optional API passphrase. */
  apiPassphrase?: string;
  /** Optional proxy/funder address override. */
  funder?: string;
}
