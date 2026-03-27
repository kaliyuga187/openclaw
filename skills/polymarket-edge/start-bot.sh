#!/usr/bin/env bash
# Polymarket edge bot — startup script
# Generated for your settings: $50 max position, $50 daily loss limit
#
# Usage:
#   Alert mode (no trading, safe to run now):
#     ./start-bot.sh
#
#   Dry-run auto mode (simulates trades, run after funding):
#     ./start-bot.sh --dry-run
#
#   Live auto mode (real money — run AFTER funding + testing dry-run):
#     ./start-bot.sh --live

set -euo pipefail

SKILL="$(cd "$(dirname "$0")" && pwd)"
PRIVATE_KEY="${POLYMARKET_PRIVATE_KEY:-$(openclaw config get polymarket.private_key 2>/dev/null || echo '')}"
WALLET="${POLYMARKET_WALLET:-}"
# Telegram: bot reads token from ~/.openclaw/openclaw.json automatically.
# Set TELEGRAM_CHAT_ID to your chat ID, or send /start to your bot first (auto-detected).
export TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
MODE="${1:-alert}"
DRY_RUN=""

case "${1:-}" in
  --dry-run)
    MODE="auto"
    DRY_RUN="--dry-run"
    ;;
  --live)
    MODE="auto"
    DRY_RUN=""
    ;;
  *)
    MODE="${1:-alert}"
    ;;
esac

if [[ "$MODE" == "auto" && -z "$PRIVATE_KEY" ]]; then
  echo "Error: Set your private key first:"
  echo "  openclaw config set polymarket.private_key 0xYOUR_KEY"
  exit 1
fi

LOG_FILE="$HOME/.openclaw/polymarket-bot.log"
mkdir -p "$HOME/.openclaw"

echo "[start-bot] Mode: $MODE${DRY_RUN:+ (dry-run)} | Max position: \$50 | Daily loss limit: \$50"
echo "[start-bot] Log: $LOG_FILE"

exec python3 "$SKILL/bot.py" \
  --mode "$MODE" \
  $DRY_RUN \
  ${PRIVATE_KEY:+--private-key "$PRIVATE_KEY"} \
  ${WALLET:+--wallet "$WALLET"} \
  --max-position 50 \
  --max-daily-loss 50 \
  --min-edge 0.10 \
  --interval 300 \
  --threshold 0.05 \
  "$@" 2>&1 | tee -a "$LOG_FILE"
