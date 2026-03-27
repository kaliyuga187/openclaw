#!/bin/bash
# ============================================================
# mobile-autorun.sh — Run this directly on your Vultr server
# from any SSH app on your phone (Termius, JuiceSSH, etc.)
#
# Usage:
#   ssh root@YOUR_SERVER_IP
#   bash <(curl -fsSL https://raw.githubusercontent.com/kaliyuga187/openclaw/claude/identify-marketable-skills-gzCXp/skills/polymarket-edge/mobile-autorun.sh)
# ============================================================

set -euo pipefail

TELEGRAM_TOKEN="8734661711:AAHU6x7rmXq7ngkhi5Cgfh7FuC7q5Gihpag"
REPO="https://github.com/kaliyuga187/openclaw"

# ── Colours ──────────────────────────────────────────────────
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
step() { echo -e "${CYAN}  → $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
fail() { echo -e "${RED}  ✗ $1${NC}"; exit 1; }

# ── Banner ────────────────────────────────────────────────────
clear
echo ""
echo -e "${BOLD}  ╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}  ║   Polymarket Bot — Mobile Auto Deploy        ║${NC}"
echo -e "${BOLD}  ║   Mode: dry-run auto  |  Alerts: Telegram    ║${NC}"
echo -e "${BOLD}  ╚══════════════════════════════════════════════╝${NC}"
echo ""

# ════════════════════════════════════════════════════════════
# STEP 1 — Collect credentials
# ════════════════════════════════════════════════════════════

echo -e "${CYAN}  Step 1/6  Credentials${NC}"
echo -e "  ──────────────────────"
echo ""

read -rp "  Wallet private key (0x...): " PRIVATE_KEY
[[ -z "$PRIVATE_KEY" ]] && fail "Private key required."

read -rp "  Wallet address (0x...): " WALLET
[[ -z "$WALLET" ]] && fail "Wallet address required."

echo ""
ok "Credentials collected."

# ════════════════════════════════════════════════════════════
# STEP 2 — Telegram pre-flight
# ════════════════════════════════════════════════════════════

echo ""
echo -e "${CYAN}  Step 2/6  Verify Telegram${NC}"
echo -e "  ──────────────────────────"
echo ""

step "Verifying bot token..."
ME=$(curl -sf "https://api.telegram.org/bot${TELEGRAM_TOKEN}/getMe" || true)
if echo "$ME" | grep -q '"ok":true'; then
    BOT_NAME=$(echo "$ME" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['result']['username'])" 2>/dev/null || echo "k187_bot")
    ok "Bot verified: @${BOT_NAME}"
else
    fail "Telegram token invalid. Get a new one from @BotFather."
fi

step "Looking for your chat ID..."
warn "Open Telegram → find @k187_bot → send /start now"
echo ""

CHAT_ID=""
ATTEMPTS=0
while [[ -z "$CHAT_ID" && $ATTEMPTS -lt 12 ]]; do
    UPDATES=$(curl -sf "https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates" || true)
    if echo "$UPDATES" | grep -q '"chat"'; then
        CHAT_ID=$(echo "$UPDATES" | python3 -c "
import json, sys
d = json.load(sys.stdin)
results = d.get('result', [])
if results:
    last = results[-1]
    msg = last.get('message') or last.get('channel_post', {})
    print(msg.get('chat', {}).get('id', ''))
" 2>/dev/null || true)
    fi
    if [[ -z "$CHAT_ID" ]]; then
        ATTEMPTS=$((ATTEMPTS + 1))
        echo -e "  Waiting for /start... ($ATTEMPTS/12)"
        sleep 5
    fi
done

[[ -z "$CHAT_ID" ]] && fail "No Telegram message found after 60s. Send /start to @k187_bot and re-run."
ok "Chat ID: $CHAT_ID"

# ════════════════════════════════════════════════════════════
# STEP 3 — Install dependencies
# ════════════════════════════════════════════════════════════

echo ""
echo -e "${CYAN}  Step 3/6  Install Dependencies${NC}"
echo -e "  ──────────────────────────────"
echo ""

step "Updating packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq python3 python3-pip git curl 2>&1 | tail -3

step "Installing Python packages..."
pip3 install -q py-clob-client requests websockets 2>&1 | tail -2

ok "Dependencies installed."

# ════════════════════════════════════════════════════════════
# STEP 4 — Deploy bot scripts
# ════════════════════════════════════════════════════════════

echo ""
echo -e "${CYAN}  Step 4/6  Deploy Bot${NC}"
echo -e "  ────────────────────"
echo ""

step "Cloning repo..."
rm -rf /root/openclaw
git clone -q "$REPO" /root/openclaw

step "Copying scripts..."
mkdir -p /root/polymarket-bot
cp -r /root/openclaw/skills/polymarket-edge/scripts/* /root/polymarket-bot/
cp /root/openclaw/skills/polymarket-edge/start-bot.sh /root/polymarket-bot/
chmod +x /root/polymarket-bot/start-bot.sh

step "Writing credentials..."
mkdir -p /root/.openclaw
cat > /root/.polymarket-env << ENVEOF
export POLYMARKET_PRIVATE_KEY=${PRIVATE_KEY}
export POLYMARKET_WALLET=${WALLET}
export TELEGRAM_BOT_TOKEN=${TELEGRAM_TOKEN}
export TELEGRAM_CHAT_ID=${CHAT_ID}
ENVEOF
chmod 600 /root/.polymarket-env

cat > /root/.openclaw/openclaw.json << CFGEOF
{
  "channels": { "telegram": { "botToken": "${TELEGRAM_TOKEN}" } },
  "polymarket": { "wallet": "${WALLET}" }
}
CFGEOF
chmod 600 /root/.openclaw/openclaw.json
chmod 700 /root/.openclaw

step "Stopping any existing services..."
systemctl stop polymarket-bot    2>/dev/null || true
systemctl stop polymarket-stream 2>/dev/null || true
sleep 1

step "Installing polymarket-bot service (dry-run auto)..."
cat > /etc/systemd/system/polymarket-bot.service << 'SVCEOF'
[Unit]
Description=Polymarket Edge Bot (dry-run auto)
After=network.target

[Service]
User=root
WorkingDirectory=/root/polymarket-bot
EnvironmentFile=/root/.polymarket-env
ExecStart=/usr/bin/python3 /root/polymarket-bot/bot.py \
  --mode auto \
  --dry-run \
  --interval 300 \
  --threshold 0.05 \
  --min-edge 0.10 \
  --max-position 50 \
  --max-daily-loss 50
StandardOutput=append:/root/.openclaw/polymarket-bot.log
StandardError=append:/root/.openclaw/polymarket-bot.log
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
SVCEOF

step "Installing polymarket-stream service (WebSocket feed)..."
cat > /etc/systemd/system/polymarket-stream.service << 'STRSEOF'
[Unit]
Description=Polymarket CLOB WebSocket Stream
After=network.target

[Service]
User=root
WorkingDirectory=/root/polymarket-bot
EnvironmentFile=/root/.polymarket-env
ExecStartPre=/bin/bash -c 'python3 /root/polymarket-bot/prepare_stream_token_map.py --min-volume 50000 --no-edge > /root/polymarket-bot/markets.json 2>/dev/null || true'
ExecStart=/usr/bin/python3 /root/polymarket-bot/stream.py \
  --markets /root/polymarket-bot/markets.json \
  --imbalance-threshold 0.25
StandardOutput=append:/root/.openclaw/polymarket-stream.log
StandardError=append:/root/.openclaw/polymarket-stream.log
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
STRSEOF

step "Setting up hourly token map refresh..."
printf '0 * * * * root /usr/bin/python3 /root/polymarket-bot/prepare_stream_token_map.py --min-volume 50000 --no-edge > /root/polymarket-bot/markets.json 2>/dev/null\n' \
    > /etc/cron.d/polymarket-refresh
chmod 644 /etc/cron.d/polymarket-refresh

step "Starting services..."
systemctl daemon-reload
systemctl enable polymarket-bot polymarket-stream
systemctl start polymarket-bot
sleep 5
systemctl start polymarket-stream
sleep 3

BOT_STATUS=$(systemctl is-active polymarket-bot    2>/dev/null || echo "failed")
STR_STATUS=$(systemctl is-active polymarket-stream 2>/dev/null || echo "failed")

[[ "$BOT_STATUS" == "active" ]] && ok "polymarket-bot: running" || warn "polymarket-bot: $BOT_STATUS"
[[ "$STR_STATUS" == "active" ]] && ok "polymarket-stream: running" || warn "polymarket-stream: $STR_STATUS"

# ════════════════════════════════════════════════════════════
# STEP 5 — Telegram confirmation message
# ════════════════════════════════════════════════════════════

echo ""
echo -e "${CYAN}  Step 5/6  Telegram Confirmation${NC}"
echo -e "  ───────────────────────────────"
echo ""

HOSTNAME_LABEL=$(hostname)
MSG="✅ Polymarket bot deployed on ${HOSTNAME_LABEL}
Mode: dry-run auto (no real money)
Max position: \$50 | Daily loss: \$50
Wallet: ${WALLET:0:12}...
Trades are being simulated and logged.
You will receive edge alerts here as markets are found."

TG_RESULT=$(curl -sf -X POST \
    "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":\"${CHAT_ID}\",\"text\":\"${MSG}\"}" || true)

if echo "$TG_RESULT" | grep -q '"ok":true'; then
    ok "Telegram confirmation sent — check @k187_bot now."
else
    warn "Telegram send failed — bot is still running."
fi

# ════════════════════════════════════════════════════════════
# STEP 6 — Live log tail
# ════════════════════════════════════════════════════════════

echo ""
echo -e "${CYAN}  Step 6/6  Live Logs${NC}"
echo -e "  ───────────────────"
echo ""
echo -e "  ${BOLD}Bot is running. Streaming logs below.${NC}"
echo -e "  Press ${BOLD}Ctrl+C${NC} to stop watching (bot keeps running)."
echo ""

# Print status dashboard before tailing
echo -e "${GREEN}  ╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}  ║   Polymarket Bot — Active                                ║${NC}"
echo -e "${GREEN}  ╠══════════════════════════════════════════════════════════╣${NC}"
printf "${GREEN}  ║   Mode:     %-44s║${NC}\n" "dry-run auto (simulated trades)"
printf "${GREEN}  ║   Wallet:   %-44s║${NC}\n" "${WALLET:0:42}"
printf "${GREEN}  ║   Telegram: %-44s║${NC}\n" "@k187_bot → chat ${CHAT_ID}"
printf "${GREEN}  ║   Trade log:%-44s║${NC}\n" "/root/.openclaw/polymarket-portfolio.jsonl"
echo -e "${GREEN}  ╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${YELLOW}  ║   To go LIVE later:                                      ║${NC}"
echo -e "${YELLOW}  ║   nano /etc/systemd/system/polymarket-bot.service        ║${NC}"
echo -e "${YELLOW}  ║   Remove --dry-run from ExecStart                        ║${NC}"
echo -e "${YELLOW}  ║   systemctl daemon-reload && restart polymarket-bot      ║${NC}"
echo -e "${GREEN}  ╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

journalctl -u polymarket-bot -f --no-pager --output=cat
