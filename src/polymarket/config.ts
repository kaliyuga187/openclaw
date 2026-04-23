import type { BotConfig } from "./types.js";

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") {return fallback;}
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`polymarket: env ${name} is not a finite number: ${raw}`);
  }
  return parsed;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === "") {return fallback;}
  return /^(1|true|yes|on)$/i.test(raw);
}

function readString(name: string, fallback = ""): string {
  const raw = process.env[name];
  return raw == null ? fallback : raw;
}

/**
 * Build a BotConfig from environment variables.
 *
 * Defaults are safe: dry-run=true, small trade size, no private key.
 * Real trading requires the caller to explicitly set POLYMARKET_DRY_RUN=false
 * and supply a funded POLYMARKET_PRIVATE_KEY.
 */
export function loadBotConfig(overrides: Partial<BotConfig> = {}): BotConfig {
  const cfg: BotConfig = {
    clobBaseUrl: readString("POLYMARKET_CLOB_URL", "https://clob.polymarket.com"),
    dataBaseUrl: readString("POLYMARKET_DATA_URL", "https://data-api.polymarket.com"),
    gammaBaseUrl: readString("POLYMARKET_GAMMA_URL", "https://gamma-api.polymarket.com"),
    tradeSizeUsd: readNumber("POLYMARKET_TRADE_SIZE_USD", 20),
    maxOpenPositions: readNumber("POLYMARKET_MAX_OPEN_POSITIONS", 5),
    maxTrades: readNumber("POLYMARKET_MAX_TRADES", 10),
    minWinRate: readNumber("POLYMARKET_MIN_WIN_RATE", 0.6),
    minPnlUsd: readNumber("POLYMARKET_MIN_PNL_USD", 5000),
    minTradeCount: readNumber("POLYMARKET_MIN_TRADE_COUNT", 20),
    minConfidence: readNumber("POLYMARKET_MIN_CONFIDENCE", 0.6),
    dryRun: readBool("POLYMARKET_DRY_RUN", true),
    privateKey: readString("POLYMARKET_PRIVATE_KEY"),
    apiKey: readString("POLYMARKET_API_KEY") || undefined,
    apiSecret: readString("POLYMARKET_API_SECRET") || undefined,
    apiPassphrase: readString("POLYMARKET_API_PASSPHRASE") || undefined,
    funder: readString("POLYMARKET_FUNDER") || undefined,
    ...overrides,
  };
  return cfg;
}

/**
 * Throw unless the live-trading requirements are satisfied.
 * Called only when dryRun=false.
 */
export function assertLiveTradingReady(cfg: BotConfig): void {
  if (cfg.dryRun) {return;}
  if (!cfg.privateKey || !/^0x[0-9a-fA-F]{64}$/.test(cfg.privateKey)) {
    throw new Error(
      "polymarket: live trading requires POLYMARKET_PRIVATE_KEY (0x-prefixed 32-byte hex).",
    );
  }
  if (cfg.tradeSizeUsd <= 0) {
    throw new Error("polymarket: POLYMARKET_TRADE_SIZE_USD must be > 0 for live trading.");
  }
}
