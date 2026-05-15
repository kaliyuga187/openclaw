import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addPosition, hasOpenPosition, loadState, saveState } from "./state.js";

let tmpDir: string;
let env: NodeJS.ProcessEnv;
let originalState: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "polymarket-state-"));
  originalState = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = tmpDir;
  env = process.env;
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  if (originalState === undefined) {delete process.env.OPENCLAW_STATE_DIR;}
  else {process.env.OPENCLAW_STATE_DIR = originalState;}
});

describe("polymarket state", () => {
  it("returns an empty state when the file is missing", async () => {
    const s = await loadState(env);
    expect(s.version).toBe(1);
    expect(s.positions).toEqual([]);
  });

  it("round-trips positions via saveState/loadState", async () => {
    const initial = await loadState(env);
    const next = addPosition(initial, {
      market: "m1",
      outcomeIndex: 0,
      outcome: "Yes",
      side: "BUY",
      tokenId: "tok-yes",
      sizeUsd: 20,
      entryPrice: 0.6,
      openedAt: 1700000000000,
    });
    await saveState(next, env);
    const reloaded = await loadState(env);
    expect(reloaded.positions).toHaveLength(1);
    expect(reloaded.positions[0]).toMatchObject({ market: "m1", side: "BUY" });
    expect(hasOpenPosition(reloaded, "m1", 0, "BUY")).toBe(true);
    expect(hasOpenPosition(reloaded, "m1", 0, "SELL")).toBe(false);
    expect(hasOpenPosition(reloaded, "m1", 1, "BUY")).toBe(false);
  });

  it("falls back to empty when the file is corrupt", async () => {
    const filePath = path.join(tmpDir, "polymarket", "state.json");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "not json", "utf8");
    await expect(loadState(env)).rejects.toThrow();
    await fs.writeFile(filePath, JSON.stringify({ version: 99 }), "utf8");
    const s = await loadState(env);
    expect(s.positions).toEqual([]);
  });
});
