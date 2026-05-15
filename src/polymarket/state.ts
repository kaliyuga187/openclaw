import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { resolveStateDir } from "../config/paths.js";
import type { Side } from "./types.js";

export interface OpenPosition {
  market: string; // conditionId
  outcomeIndex: number;
  outcome: string;
  side: Side;
  tokenId: string;
  sizeUsd: number;
  entryPrice: number;
  openedAt: number; // ms epoch
  orderId?: string;
}

export interface BotState {
  version: 1;
  positions: OpenPosition[];
}

const EMPTY: BotState = { version: 1, positions: [] };

function stateFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env, os.homedir), "polymarket", "state.json");
}

export async function loadState(env: NodeJS.ProcessEnv = process.env): Promise<BotState> {
  const filePath = stateFilePath(env);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed != null &&
      (parsed as { version?: number }).version === 1 &&
      Array.isArray((parsed as { positions?: unknown }).positions)
    ) {
      return parsed as BotState;
    }
    return EMPTY;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {return EMPTY;}
    throw err;
  }
}

export async function saveState(
  state: BotState,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const filePath = stateFilePath(env);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  // Atomic write: tmp + rename.
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

export function hasOpenPosition(
  state: BotState,
  market: string,
  outcomeIndex: number,
  side: Side,
): boolean {
  return state.positions.some(
    (p) => p.market === market && p.outcomeIndex === outcomeIndex && p.side === side,
  );
}

export function addPosition(state: BotState, position: OpenPosition): BotState {
  return { ...state, positions: [...state.positions, position] };
}
