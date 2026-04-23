export { PolymarketBot } from "./bot.js";
export type { BotRunOptions, BotRunResult } from "./bot.js";
export { PolymarketClient } from "./client.js";
export { TradeExecutor } from "./executor.js";
export { buildSignals } from "./trade-filter.js";
export { rankWallets, filterSmartWallets } from "./wallet-ranker.js";
export { loadBotConfig, assertLiveTradingReady } from "./config.js";
export type {
  BotConfig,
  ExecutionResult,
  PolymarketMarket,
  PolymarketToken,
  PolymarketTrade,
  Side,
  TradeSignal,
  WalletStats,
} from "./types.js";
