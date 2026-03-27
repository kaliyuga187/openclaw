# Polymarket Bot — Vultr Auto-Deploy (PowerShell)
# Run this on your Windows machine to deploy the bot to your VPS.
#
# Prerequisites:
#   - OpenSSH installed (comes with Windows 10/11)
#   - Your Vultr VPS IP address
#   - Your new wallet private key + address
#
# Usage:
#   .\deploy.ps1

# ── FILL THESE IN ──────────────────────────────────────────
$VPS_IP        = "YOUR_VULTR_IP_HERE"
$PRIVATE_KEY   = "YOUR_PRIVATE_KEY_HERE"
$WALLET        = "YOUR_WALLET_ADDRESS_HERE"
$TELEGRAM_TOKEN = "8734661711:AAHU6x7rmXq7ngkhi5Cgfh7FuC7q5Gihpag"
# ───────────────────────────────────────────────────────────

$SSH_USER = "root"

# Validate placeholders
if ($VPS_IP -eq "YOUR_VULTR_IP_HERE" -or $PRIVATE_KEY -eq "YOUR_PRIVATE_KEY_HERE" -or $WALLET -eq "YOUR_WALLET_ADDRESS_HERE") {
    Write-Host "ERROR: Fill in VPS_IP, PRIVATE_KEY, and WALLET at the top of this script." -ForegroundColor Red
    exit 1
}

Write-Host "Connecting to $SSH_USER@$VPS_IP and deploying Polymarket bot..." -ForegroundColor Cyan

# Build the remote script as a single heredoc passed over SSH
$remoteScript = @"
set -euo pipefail

echo '=== Installing system deps ==='
apt update -qq && apt install -y python3 python3-pip git tmux

echo '=== Installing Python deps ==='
pip3 install -q py-clob-client requests

echo '=== Cloning repo ==='
rm -rf /root/openclaw
git clone https://github.com/kaliyuga187/openclaw /root/openclaw
mkdir -p /root/polymarket-bot
cp -r /root/openclaw/skills/polymarket-edge/scripts/* /root/polymarket-bot/
cp /root/openclaw/skills/polymarket-edge/start-bot.sh /root/polymarket-bot/
chmod +x /root/polymarket-bot/start-bot.sh

echo '=== Writing credentials ==='
cat > /root/.polymarket-env << 'ENVEOF'
export POLYMARKET_PRIVATE_KEY=$PRIVATE_KEY
export POLYMARKET_WALLET=$WALLET
export TELEGRAM_BOT_TOKEN=$TELEGRAM_TOKEN
ENVEOF
chmod 600 /root/.polymarket-env

echo '=== Writing OpenClaw config ==='
mkdir -p /root/.openclaw
cat > /root/.openclaw/openclaw.json << 'CFGEOF'
{
  "channels": {
    "telegram": {
      "botToken": "$TELEGRAM_TOKEN"
    }
  },
  "polymarket": {
    "wallet": "$WALLET"
  }
}
CFGEOF
chmod 600 /root/.openclaw/openclaw.json

echo '=== Creating systemd service ==='
cat > /etc/systemd/system/polymarket-bot.service << 'SVCEOF'
[Unit]
Description=Polymarket Edge Bot
After=network.target

[Service]
User=root
WorkingDirectory=/root/polymarket-bot
EnvironmentFile=/root/.polymarket-env
ExecStart=/usr/bin/python3 /root/polymarket-bot/bot.py --mode alert --interval 300 --threshold 0.05 --max-position 50 --max-daily-loss 50
StandardOutput=append:/root/.openclaw/polymarket-bot.log
StandardError=append:/root/.openclaw/polymarket-bot.log
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable polymarket-bot
systemctl start polymarket-bot

echo ''
echo '=== Bot deployed and running! ==='
echo 'Logs: journalctl -u polymarket-bot -f'
systemctl status polymarket-bot --no-pager
"@

# Substitute values into the script
$remoteScript = $remoteScript `
    -replace '\$PRIVATE_KEY',   $PRIVATE_KEY `
    -replace '\$WALLET',        $WALLET `
    -replace '\$TELEGRAM_TOKEN',$TELEGRAM_TOKEN

# Run over SSH (password prompt will appear if no SSH key configured)
$remoteScript | ssh "$SSH_USER@$VPS_IP" "bash -s"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=== Deployment complete ===" -ForegroundColor Green
    Write-Host "Tail logs:  ssh $SSH_USER@$VPS_IP 'journalctl -u polymarket-bot -f'"
    Write-Host "Stop bot:   ssh $SSH_USER@$VPS_IP 'systemctl stop polymarket-bot'"
    Write-Host "Go live:    ssh $SSH_USER@$VPS_IP 'nano /etc/systemd/system/polymarket-bot.service'"
    Write-Host "            (change --mode alert to --mode auto, then: systemctl daemon-reload && systemctl restart polymarket-bot)"
} else {
    Write-Host "Deployment failed. Check SSH connectivity and try again." -ForegroundColor Red
}
