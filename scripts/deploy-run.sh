#!/usr/bin/env bash
# deploy-run.sh — Bootstrap and start the OpenClaw gateway from a deployment zip.
#
# Usage (from inside the extracted zip directory):
#   bash run.sh [gateway-args...]
#
# Environment variables:
#   OPENCLAW_PORT      Gateway port (default: 18789)
#   OPENCLAW_BIND      Bind address (default: loopback)
#   OPENCLAW_LOG       Log file path (default: openclaw-gateway.log in this dir)
#   OPENCLAW_FOREGROUND  Set to 1 to run in the foreground (default: background)
#   NODE_PATH          Override Node.js binary path
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIN_NODE_MAJOR=22

# ── Helpers ─────────────────────────────────────────────────────────────────

log()  { printf '\033[1;34m[openclaw]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[openclaw] WARN:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[openclaw] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# ── Resolve Node.js ──────────────────────────────────────────────────────────

NODE_BIN="${NODE_PATH:-}"
if [[ -z "$NODE_BIN" ]]; then
  if command -v node &>/dev/null; then
    NODE_BIN="$(command -v node)"
  else
    die "Node.js not found. Install Node ${MIN_NODE_MAJOR}+ from https://nodejs.org"
  fi
fi

NODE_VERSION="$("$NODE_BIN" -e 'process.stdout.write(process.version)' 2>/dev/null || echo "v0")"
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"

if (( NODE_MAJOR < MIN_NODE_MAJOR )); then
  die "Node.js ${NODE_VERSION} is too old. Requires v${MIN_NODE_MAJOR}+. Update from https://nodejs.org"
fi

log "Node.js ${NODE_VERSION} detected (${NODE_BIN})"

# ── Verify dist/ exists ──────────────────────────────────────────────────────

if [[ ! -f "$ROOT_DIR/dist/entry.js" ]]; then
  die "dist/entry.js not found in $ROOT_DIR. Run 'pnpm build' first or re-extract the zip."
fi

# ── Install production dependencies if needed ────────────────────────────────

MODULES_DIR="$ROOT_DIR/node_modules"
if [[ ! -d "$MODULES_DIR" ]]; then
  log "Installing production dependencies…"
  if command -v npm &>/dev/null; then
    npm install --omit=dev --prefix "$ROOT_DIR" --no-fund --no-audit 2>&1 | tail -5
  else
    die "npm not found. Cannot install dependencies."
  fi
else
  log "node_modules present — skipping install."
fi

# ── Launch ───────────────────────────────────────────────────────────────────

PORT="${OPENCLAW_PORT:-18789}"
BIND="${OPENCLAW_BIND:-loopback}"
LOG_FILE="${OPENCLAW_LOG:-$ROOT_DIR/openclaw-gateway.log}"
FOREGROUND="${OPENCLAW_FOREGROUND:-0}"

ENTRY="$ROOT_DIR/openclaw.mjs"
if [[ ! -f "$ENTRY" ]]; then
  ENTRY="$ROOT_DIR/dist/entry.js"
fi

ARGS=(gateway run --bind "$BIND" --port "$PORT" --force "$@")

if [[ "$FOREGROUND" == "1" ]]; then
  log "Starting gateway (foreground) on port ${PORT}…"
  exec "$NODE_BIN" "$ENTRY" "${ARGS[@]}"
else
  # Kill any leftover process on the same port before starting
  if command -v pkill &>/dev/null; then
    pkill -9 -f "openclaw.*gateway" 2>/dev/null || true
  fi

  log "Starting gateway (background) on port ${PORT}…"
  log "Log: ${LOG_FILE}"
  nohup "$NODE_BIN" "$ENTRY" "${ARGS[@]}" > "$LOG_FILE" 2>&1 &
  GW_PID=$!
  echo "$GW_PID" > "$ROOT_DIR/openclaw-gateway.pid"

  # Brief wait to catch immediate crashes
  sleep 1
  if ! kill -0 "$GW_PID" 2>/dev/null; then
    die "Gateway failed to start. Check $LOG_FILE for details."
  fi

  log "Gateway running (PID ${GW_PID}). Tail logs: tail -f ${LOG_FILE}"
fi
