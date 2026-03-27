# Polymarket Bot — Deploy to Existing Vultr Server
# Lists your running servers, lets you pick one, deploys the bot.
#
# Usage:
#   .\vultr-config.ps1

# ── FILL THESE IN ──────────────────────────────────────────
$VULTR_API_KEY  = "YOUR_VULTR_API_KEY_HERE"
$PRIVATE_KEY    = "YOUR_WALLET_PRIVATE_KEY_HERE"
$WALLET         = "YOUR_WALLET_ADDRESS_HERE"
$TELEGRAM_TOKEN = "8734661711:AAHU6x7rmXq7ngkhi5Cgfh7FuC7q5Gihpag"
$SSH_KEY_PATH   = "$env:USERPROFILE\.ssh\id_rsa"
# ───────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

# Validate
if ($VULTR_API_KEY -eq "YOUR_VULTR_API_KEY_HERE" -or
    $PRIVATE_KEY   -eq "YOUR_WALLET_PRIVATE_KEY_HERE" -or
    $WALLET        -eq "YOUR_WALLET_ADDRESS_HERE") {
    Write-Host "ERROR: Fill in VULTR_API_KEY, PRIVATE_KEY, and WALLET at the top." -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $VULTR_API_KEY"
    "Content-Type"  = "application/json"
}

# ── Step 1: List existing servers ─────────────────────────
Write-Host ""
Write-Host "Fetching your Vultr servers..." -ForegroundColor Cyan
$resp = Invoke-RestMethod -Uri "https://api.vultr.com/v2/instances?per_page=50" -Headers $headers

if (-not $resp.instances -or $resp.instances.Count -eq 0) {
    Write-Host "No servers found on your Vultr account." -ForegroundColor Red
    exit 1
}

# Show server list
Write-Host ""
Write-Host "Your servers:" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────"
$servers = $resp.instances
for ($i = 0; $i -lt $servers.Count; $i++) {
    $s = $servers[$i]
    $status = if ($s.power_status -eq "running") { "✓ running" } else { $s.power_status }
    Write-Host ("  [{0}] {1,-18} {2,-15} {3}" -f ($i+1), $s.label, $s.main_ip, $status)
}
Write-Host "─────────────────────────────────────────────────────"
Write-Host ""

# ── Step 2: Pick a server ─────────────────────────────────
$choice = Read-Host "Enter server number to deploy to"
$idx = [int]$choice - 1
if ($idx -lt 0 -or $idx -ge $servers.Count) {
    Write-Host "Invalid selection." -ForegroundColor Red
    exit 1
}

$target   = $servers[$idx]
$VPS_IP   = $target.main_ip
$VPS_LABEL = $target.label

Write-Host ""
Write-Host "Deploying to: $VPS_LABEL ($VPS_IP)" -ForegroundColor Green

# ── Step 3: Check SSH key ─────────────────────────────────
if (-not (Test-Path $SSH_KEY_PATH)) {
    Write-Host "No SSH key found at $SSH_KEY_PATH. Generating one..." -ForegroundColor Yellow
    ssh-keygen -t rsa -b 4096 -f $SSH_KEY_PATH -N '""'

    # Upload public key to Vultr
    $pubKey = Get-Content "$SSH_KEY_PATH.pub" -Raw
    $body = @{ name = "polymarket-key"; ssh_key = $pubKey.Trim() } | ConvertTo-Json
    Invoke-RestMethod -Uri "https://api.vultr.com/v2/ssh-keys" -Method Post -Headers $headers -Body $body | Out-Null
    Write-Host "SSH key uploaded to Vultr." -ForegroundColor Green
    Write-Host "NOTE: Add this key to your server manually if it was created before now:"
    Write-Host "  ssh-copy-id -i $SSH_KEY_PATH.pub root@$VPS_IP"
    Write-Host ""
    $null = Read-Host "Press Enter once you've added the key to the server (or skip if using password)"
}

# ── Step 4: Build and send remote script ──────────────────
Write-Host ""
Write-Host "Connecting and deploying..." -ForegroundColor Cyan

$remoteScript = @"
set -euo pipefail

echo '=== Installing system deps ==='
apt update -qq && apt install -y python3 python3-pip git tmux 2>&1 | tail -5

echo '=== Installing Python deps ==='
pip3 install -q py-clob-client requests websockets

echo '=== Cloning repo ==='
rm -rf /root/openclaw
git clone https://github.com/kaliyuga187/openclaw /root/openclaw
mkdir -p /root/polymarket-bot
cp -r /root/openclaw/skills/polymarket-edge/scripts/* /root/polymarket-bot/
cp /root/openclaw/skills/polymarket-edge/start-bot.sh /root/polymarket-bot/
chmod +x /root/polymarket-bot/start-bot.sh

echo '=== Writing credentials ==='
cat > /root/.polymarket-env << ENVEOF
export POLYMARKET_PRIVATE_KEY=PLACEHOLDER_KEY
export POLYMARKET_WALLET=PLACEHOLDER_WALLET
export TELEGRAM_BOT_TOKEN=PLACEHOLDER_TOKEN
ENVEOF
chmod 600 /root/.polymarket-env

echo '=== Writing OpenClaw config ==='
mkdir -p /root/.openclaw
cat > /root/.openclaw/openclaw.json << CFGEOF
{
  "channels": { "telegram": { "botToken": "PLACEHOLDER_TOKEN" } },
  "polymarket": { "wallet": "PLACEHOLDER_WALLET" }
}
CFGEOF
chmod 600 /root/.openclaw/openclaw.json

echo '=== Stopping old bot if running ==='
systemctl stop polymarket-bot 2>/dev/null || true
systemctl stop polymarket-stream 2>/dev/null || true

echo '=== Installing polymarket-bot service (alert mode) ==='
cat > /etc/systemd/system/polymarket-bot.service << SVCEOF
[Unit]
Description=Polymarket Edge Bot (alert mode)
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

echo '=== Installing polymarket-stream service (WebSocket feed) ==='
cat > /etc/systemd/system/polymarket-stream.service << STRSEOF
[Unit]
Description=Polymarket CLOB WebSocket Stream
After=network.target

[Service]
User=root
WorkingDirectory=/root/polymarket-bot
EnvironmentFile=/root/.polymarket-env
ExecStartPre=/usr/bin/python3 /root/polymarket-bot/prepare_stream_token_map.py --min-volume 50000 --no-edge
ExecStartPre=/bin/bash -c 'python3 /root/polymarket-bot/prepare_stream_token_map.py --min-volume 50000 --no-edge > /root/polymarket-bot/markets.json'
ExecStart=/usr/bin/python3 /root/polymarket-bot/stream.py --markets /root/polymarket-bot/markets.json --imbalance-threshold 0.25
StandardOutput=append:/root/.openclaw/polymarket-stream.log
StandardError=append:/root/.openclaw/polymarket-stream.log
Restart=on-failure
RestartSec=10
[Install]
WantedBy=multi-user.target
STRSEOF

echo '=== Adding hourly token map refresh (cron) ==='
echo '0 * * * * root python3 /root/polymarket-bot/prepare_stream_token_map.py --min-volume 50000 --no-edge > /root/polymarket-bot/markets.json' > /etc/cron.d/polymarket-refresh
chmod 644 /etc/cron.d/polymarket-refresh

systemctl daemon-reload
systemctl enable polymarket-bot polymarket-stream
systemctl start polymarket-bot polymarket-stream

sleep 3
echo ''
echo '=== Deployment complete ==='
systemctl status polymarket-bot --no-pager -l
echo ''
systemctl status polymarket-stream --no-pager -l
"@

$remoteScript = $remoteScript `
    -replace "PLACEHOLDER_KEY",    $PRIVATE_KEY `
    -replace "PLACEHOLDER_WALLET", $WALLET `
    -replace "PLACEHOLDER_TOKEN",  $TELEGRAM_TOKEN

$sshArgs = @(
    "-o", "StrictHostKeyChecking=no",
    "-o", "ConnectTimeout=30",
    "-i", $SSH_KEY_PATH,
    "root@$VPS_IP",
    "bash -s"
)

$remoteScript | ssh @sshArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║   Bot deployed to $VPS_LABEL ($VPS_IP)   " -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "Useful commands:" -ForegroundColor Yellow
    Write-Host "  SSH in:           ssh root@$VPS_IP"
    Write-Host "  Bot logs:         ssh root@$VPS_IP 'journalctl -u polymarket-bot -f'"
    Write-Host "  Stream logs:      ssh root@$VPS_IP 'journalctl -u polymarket-stream -f'"
    Write-Host "  Stop everything:  ssh root@$VPS_IP 'systemctl stop polymarket-bot polymarket-stream'"
    Write-Host "  Go live:          ssh root@$VPS_IP 'nano /etc/systemd/system/polymarket-bot.service'"
    Write-Host "                    Change --mode alert  →  --mode auto"
    Write-Host "                    systemctl daemon-reload && systemctl restart polymarket-bot"
} else {
    Write-Host ""
    Write-Host "SSH failed. Try connecting manually first:" -ForegroundColor Red
    Write-Host "  ssh root@$VPS_IP"
}
