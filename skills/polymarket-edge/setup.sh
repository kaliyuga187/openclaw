#!/bin/bash
# ── FILL THESE IN ──────────────────────────────────────────
PRIVATE_KEY="YOUR_PRIVATE_KEY_HERE"
WALLET="YOUR_WALLET_ADDRESS_HERE"
TELEGRAM_TOKEN="8734661711:AAHU6x7rmXq7ngkhi5Cgfh7FuC7q5Gihpag"
# ───────────────────────────────────────────────────────────

set -euo pipefail

echo "=== Installing system deps ==="
apt update -qq && apt install -y python3 python3-pip git tmux

echo "=== Installing Python deps ==="
pip3 install -q py-clob-client requests

echo "=== Cloning repo ==="
git clone https://github.com/kaliyuga187/openclaw /root/openclaw
mkdir -p /root/polymarket-bot
cp -r /root/openclaw/skills/polymarket-edge/scripts/* /root/polymarket-bot/
cp /root/openclaw/skills/polymarket-edge/start-bot.sh /root/polymarket-bot/

echo "=== Writing credentials (chmod 600) ==="
cat > /root/.polymarket-env << EOF
export POLYMARKET_PRIVATE_KEY=${PRIVATE_KEY}
export POLYMARKET_WALLET=${WALLET}
export TELEGRAM_BOT_TOKEN=${TELEGRAM_TOKEN}
EOF
chmod 600 /root/.polymarket-env

echo "=== Writing OpenClaw config for Telegram ==="
mkdir -p /root/.openclaw
cat > /root/.openclaw/openclaw.json << EOF
{
  "channels": {
    "telegram": {
      "botToken": "${TELEGRAM_TOKEN}"
    }
  },
  "polymarket": {
    "wallet": "${WALLET}"
  }
}
EOF
chmod 600 /root/.openclaw/openclaw.json

echo "=== Creating systemd service ==="
cat > /etc/systemd/system/polymarket-bot.service << EOF
[Unit]
Description=Polymarket Edge Bot
After=network.target

[Service]
User=root
WorkingDirectory=/root/polymarket-bot
EnvironmentFile=/root/.polymarket-env
ExecStart=/usr/bin/python3 /root/polymarket-bot/bot.py \
  --mode alert \
  --interval 300 \
  --threshold 0.05 \
  --max-position 50 \
  --max-daily-loss 50
StandardOutput=append:/root/.openclaw/polymarket-bot.log
StandardError=append:/root/.openclaw/polymarket-bot.log
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable polymarket-bot
systemctl start polymarket-bot

echo ""
echo "=== Done! Bot is running in alert mode ==="
echo "Tail logs:  journalctl -u polymarket-bot -f"
echo "Status:     systemctl status polymarket-bot"
echo "Stop:       systemctl stop polymarket-bot"
echo "Go live:    edit service, change --mode alert to --mode auto"
