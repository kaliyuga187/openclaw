#!/bin/bash
# Polymarket Bot — deploy and run
# Usage: bash /root/run.sh

REPO="https://github.com/kaliyuga187/openclaw"
BRANCH="claude/identify-marketable-skills-gzCXp"

echo ""
echo "======================================"
echo "  Polymarket Bot Setup"
echo "======================================"
echo ""

# ── Get credentials ───────────────────────────────────────────

echo "Enter Telegram bot token:"
read -r TELEGRAM_TOKEN

echo "Enter wallet private key (0x...):"
read -r PRIVATE_KEY

echo "Enter wallet address (0x...):"
read -r WALLET

echo ""
echo "Got it. Starting deployment..."
echo ""

# ── Verify Telegram token ─────────────────────────────────────

echo "[1/6] Verifying Telegram token..."
TG_ME=$(curl -sf "https://api.telegram.org/bot${TELEGRAM_TOKEN}/getMe" 2>/dev/null || echo "")
if echo "$TG_ME" | grep -q '"ok":true'; then
    echo "  OK - Telegram token valid"
else
    echo "  ERROR: Invalid Telegram token. Re-run with correct token."
    exit 1
fi

# ── Get chat ID ───────────────────────────────────────────────

echo "[2/6] Looking for Telegram chat ID..."
echo "  >>> Open Telegram now and send any message to your bot <<<"
echo ""

CHAT_ID=""
COUNT=0
while [ -z "$CHAT_ID" ] && [ $COUNT -lt 24 ]; do
    COUNT=$((COUNT + 1))
    UPDATES=$(curl -sf "https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates" 2>/dev/null || echo "")
    CHAT_ID=$(echo "$UPDATES" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    r=d.get('result',[])
    if r:
        m=r[-1].get('message') or r[-1].get('channel_post') or {}
        print(m.get('chat',{}).get('id',''))
except:
    pass
" 2>/dev/null || echo "")
    if [ -z "$CHAT_ID" ]; then
        echo "  Waiting... ($COUNT/24) — send a message to your bot now"
        sleep 5
    fi
done

if [ -z "$CHAT_ID" ]; then
    echo "  ERROR: No message received. Send /start to your bot, then re-run."
    exit 1
fi
echo "  OK - Chat ID: $CHAT_ID"

# ── Install dependencies ──────────────────────────────────────

echo "[3/6] Installing dependencies..."
apt-get update -qq 2>/dev/null
apt-get install -y -qq python3 python3-pip git curl 2>/dev/null
pip3 install --break-system-packages -q py-clob-client requests websockets 2>/dev/null || \
pip3 install -q py-clob-client requests websockets 2>/dev/null || \
echo "  Warning: some Python packages may not have installed"
echo "  OK"

# ── Clone repo ────────────────────────────────────────────────

echo "[4/6] Downloading bot scripts..."
rm -rf /root/openclaw
git clone -q -b "$BRANCH" "$REPO" /root/openclaw 2>&1
mkdir -p /root/polymarket-bot
cp -r /root/openclaw/skills/polymarket-edge/scripts/* /root/polymarket-bot/
cp /root/openclaw/skills/polymarket-edge/start-bot.sh /root/polymarket-bot/
chmod +x /root/polymarket-bot/start-bot.sh
echo "  OK"

# ── Write credentials ─────────────────────────────────────────

echo "[5/6] Writing credentials..."
mkdir -p /root/.openclaw

printf 'export POLYMARKET_PRIVATE_KEY=%s\n' "$PRIVATE_KEY" > /root/.polymarket-env
printf 'export POLYMARKET_WALLET=%s\n' "$WALLET" >> /root/.polymarket-env
printf 'export TELEGRAM_BOT_TOKEN=%s\n' "$TELEGRAM_TOKEN" >> /root/.polymarket-env
printf 'export TELEGRAM_CHAT_ID=%s\n' "$CHAT_ID" >> /root/.polymarket-env
chmod 600 /root/.polymarket-env

cat > /root/.openclaw/openclaw.json << CFGEOF
{
  "channels": { "telegram": { "botToken": "${TELEGRAM_TOKEN}" } },
  "polymarket": { "wallet": "${WALLET}" }
}
CFGEOF
chmod 600 /root/.openclaw/openclaw.json

# ── Install and start services ────────────────────────────────

echo "[6/6] Installing and starting bot services..."

systemctl stop polymarket-bot    2>/dev/null || true
systemctl stop polymarket-stream 2>/dev/null || true

cat > /etc/systemd/system/polymarket-bot.service << SVCEOF
[Unit]
Description=Polymarket Edge Bot
After=network.target

[Service]
User=root
WorkingDirectory=/root/polymarket-bot
EnvironmentFile=/root/.polymarket-env
ExecStart=/usr/bin/python3 /root/polymarket-bot/bot.py --mode auto --dry-run --interval 300 --threshold 0.05 --min-edge 0.10 --max-position 50 --max-daily-loss 50
StandardOutput=append:/root/.openclaw/polymarket-bot.log
StandardError=append:/root/.openclaw/polymarket-bot.log
Restart=on-failure
RestartSec=30
[Install]
WantedBy=multi-user.target
SVCEOF

cat > /etc/systemd/system/polymarket-stream.service << STRSEOF
[Unit]
Description=Polymarket CLOB Stream
After=network.target

[Service]
User=root
WorkingDirectory=/root/polymarket-bot
EnvironmentFile=/root/.polymarket-env
ExecStartPre=/bin/bash -c 'python3 /root/polymarket-bot/prepare_stream_token_map.py --min-volume 50000 --no-edge > /root/polymarket-bot/markets.json 2>/dev/null || true'
ExecStart=/usr/bin/python3 /root/polymarket-bot/stream.py --markets /root/polymarket-bot/markets.json --imbalance-threshold 0.25
StandardOutput=append:/root/.openclaw/polymarket-stream.log
StandardError=append:/root/.openclaw/polymarket-stream.log
Restart=on-failure
RestartSec=10
[Install]
WantedBy=multi-user.target
STRSEOF

systemctl daemon-reload
systemctl enable polymarket-bot polymarket-stream 2>/dev/null
systemctl start polymarket-bot
sleep 5
systemctl start polymarket-stream 2>/dev/null || true
sleep 3

# ── Send Telegram confirmation ────────────────────────────────

curl -sf -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":\"${CHAT_ID}\",\"text\":\"Bot is live on $(hostname). Scanning markets every 5 min. Alerts will appear here when edges are found.\"}" \
    > /dev/null 2>&1 && echo "  Telegram message sent!" || echo "  Telegram send skipped"

# ── Done ──────────────────────────────────────────────────────

echo ""
echo "======================================"
echo "  DONE — Bot is running"
echo "======================================"
echo ""
BOT_ST=$(systemctl is-active polymarket-bot 2>/dev/null || echo "unknown")
STR_ST=$(systemctl is-active polymarket-stream 2>/dev/null || echo "unknown")
echo "  polymarket-bot:    $BOT_ST"
echo "  polymarket-stream: $STR_ST"
echo ""
echo "  Logs:   tail -f /root/.openclaw/polymarket-bot.log"
echo "  Trades: cat /root/.openclaw/polymarket-portfolio.jsonl"
echo ""
echo "  To go LIVE (real money):"
echo "  sed -i 's/--dry-run //' /etc/systemd/system/polymarket-bot.service"
echo "  systemctl daemon-reload && systemctl restart polymarket-bot"
echo ""
echo "======================================"
echo ""

tail -f /root/.openclaw/polymarket-bot.log
