import { describe, expect, it } from "vitest";
import { loadBotConfig } from "./config.js";

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const before: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    before[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, original] of Object.entries(before)) {
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  }
}

describe("loadBotConfig", () => {
  it("defaults to dry-run when POLYMARKET_DRY_RUN is unset", () => {
    const cfg = withEnv({ POLYMARKET_DRY_RUN: undefined }, () => loadBotConfig());
    expect(cfg.dryRun).toBe(true);
  });

  it("accepts canonical truthy/falsy values", () => {
    for (const v of ["true", "1", "yes", "on", "TRUE"]) {
      const cfg = withEnv({ POLYMARKET_DRY_RUN: v }, () => loadBotConfig());
      expect(cfg.dryRun).toBe(true);
    }
    for (const v of ["false", "0", "no", "off", "FALSE"]) {
      const cfg = withEnv({ POLYMARKET_DRY_RUN: v }, () => loadBotConfig());
      expect(cfg.dryRun).toBe(false);
    }
  });

  it("throws on a malformed POLYMARKET_DRY_RUN instead of silently going live", () => {
    expect(() =>
      withEnv({ POLYMARKET_DRY_RUN: "treu" }, () => loadBotConfig()),
    ).toThrow(/POLYMARKET_DRY_RUN/);
    expect(() =>
      withEnv({ POLYMARKET_DRY_RUN: "maybe" }, () => loadBotConfig()),
    ).toThrow(/POLYMARKET_DRY_RUN/);
  });

  it("throws on a non-numeric numeric env", () => {
    expect(() =>
      withEnv({ POLYMARKET_TRADE_SIZE_USD: "abc" }, () => loadBotConfig()),
    ).toThrow(/POLYMARKET_TRADE_SIZE_USD/);
  });
});
