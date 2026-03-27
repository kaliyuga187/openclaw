# Polymarket Bot — Full Vultr Deploy (PowerShell)
# Spins up a VPS, SSHs in, and deploys the bot automatically.
#
# Prerequisites:
#   - Windows 10/11 with PowerShell 5+
#   - OpenSSH: Settings > Apps > Optional Features > OpenSSH Client
#   - Vultr API key: https://my.vultr.com/settings/#settingsapi
#
# Usage:
#   .\vultr-deploy.ps1

# ── FILL THESE IN ──────────────────────────────────────────
$VULTR_API_KEY   = "YOUR_VULTR_API_KEY_HERE"
$PRIVATE_KEY     = "YOUR_WALLET_PRIVATE_KEY_HERE"
$WALLET          = "YOUR_WALLET_ADDRESS_HERE"
$TELEGRAM_TOKEN  = "8734661711:AAHU6x7rmXq7ngkhi5Cgfh7FuC7q5Gihpag"
$SSH_KEY_PATH    = "$env:USERPROFILE\.ssh\id_rsa"   # path to your SSH private key
# ───────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

# ── Validate ──────────────────────────────────────────────
if ($VULTR_API_KEY -eq "YOUR_VULTR_API_KEY_HERE" -or
    $PRIVATE_KEY   -eq "YOUR_WALLET_PRIVATE_KEY_HERE" -or
    $WALLET        -eq "YOUR_WALLET_ADDRESS_HERE") {
    Write-Host "ERROR: Fill in VULTR_API_KEY, PRIVATE_KEY, and WALLET at the top of this script." -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $VULTR_API_KEY"
    "Content-Type"  = "application/json"
}

# ── Step 1: Get SSH key ID from Vultr ─────────────────────
Write-Host ""
Write-Host "[1/5] Looking up SSH keys on Vultr..." -ForegroundColor Cyan
$sshKeysResp = Invoke-RestMethod -Uri "https://api.vultr.com/v2/ssh-keys" -Headers $headers
$sshKeyId = $sshKeysResp.ssh_keys[0].id

if (-not $sshKeyId) {
    Write-Host ""
    Write-Host "No SSH key found on Vultr. Adding your local public key..." -ForegroundColor Yellow
    $pubKeyPath = "$SSH_KEY_PATH.pub"
    if (-not (Test-Path $pubKeyPath)) {
        Write-Host "Generating SSH key pair at $SSH_KEY_PATH ..."
        ssh-keygen -t rsa -b 4096 -f $SSH_KEY_PATH -N '""' | Out-Null
    }
    $pubKey = Get-Content $pubKeyPath -Raw
    $body = @{ name = "polymarket-bot-key"; ssh_key = $pubKey.Trim() } | ConvertTo-Json
    $addKeyResp = Invoke-RestMethod -Uri "https://api.vultr.com/v2/ssh-keys" -Method Post -Headers $headers -Body $body
    $sshKeyId = $addKeyResp.ssh_key.id
    Write-Host "SSH key added: $sshKeyId" -ForegroundColor Green
} else {
    Write-Host "Using existing SSH key: $sshKeyId" -ForegroundColor Green
}

# ── Step 2: Create VPS instance ───────────────────────────
Write-Host ""
Write-Host "[2/5] Creating Vultr VPS (1 CPU / 1GB RAM / $6/mo)..." -ForegroundColor Cyan
$instanceBody = @{
    region   = "ewr"        # New Jersey — change to your nearest: ewr, lax, ord, ams, sgp, syd
    plan     = "vc2-1c-1gb"
    os_id    = 2284         # Ubuntu 24.04 LTS
    label    = "polymarket-bot"
    sshkey_id = @($sshKeyId)
} | ConvertTo-Json

$createResp = Invoke-RestMethod -Uri "https://api.vultr.com/v2/instances" -Method Post -Headers $headers -Body $instanceBody
$instanceId = $createResp.instance.id
Write-Host "Instance created: $instanceId" -ForegroundColor Green

# ── Step 3: Wait for VPS to be ready ──────────────────────
Write-Host ""
Write-Host "[3/5] Waiting for VPS to boot (this takes ~2 minutes)..." -ForegroundColor Cyan
$vpsIp = ""
$attempts = 0
do {
    Start-Sleep -Seconds 15
    $attempts++
    $statusResp = Invoke-RestMethod -Uri "https://api.vultr.com/v2/instances/$instanceId" -Headers $headers
    $status     = $statusResp.instance.status
    $powerState = $statusResp.instance.power_status
    $vpsIp      = $statusResp.instance.main_ip
    Write-Host "  Status: $status / $powerState (attempt $attempts)" -ForegroundColor DarkGray
} while ($status -ne "active" -or $powerState -ne "running" -or $vpsIp -eq "0.0.0.0")

Write-Host "VPS ready at $vpsIp" -ForegroundColor Green

# Give SSH daemon a moment to start
Write-Host "Waiting 20s for SSH to start..."
Start-Sleep -Seconds 20

# ── Step 4: Build remote setup script ─────────────────────
Write-Host ""
Write-Host "[4/5] Deploying bot to $vpsIp ..." -ForegroundColor Cyan

$remoteScript = @"
set -euo pipefail
echo '=== Installing system deps ==='
apt update -qq && apt install -y python3 python3-pip git tmux

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

echo '=== Installing systemd service ==='
cat > /etc/systemd/system/polymarket-bot.service << SVCEOF
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
echo '=== Bot deployed and running in alert mode ==='
systemctl status polymarket-bot --no-pager
"@

# Substitute real values
$remoteScript = $remoteScript `
    -replace "PLACEHOLDER_KEY",    $PRIVATE_KEY `
    -replace "PLACEHOLDER_WALLET", $WALLET `
    -replace "PLACEHOLDER_TOKEN",  $TELEGRAM_TOKEN

# ── Step 5: SSH and run ────────────────────────────────────
$sshArgs = @(
    "-o", "StrictHostKeyChecking=no",
    "-o", "ConnectTimeout=30",
    "-i", $SSH_KEY_PATH,
    "root@$vpsIp",
    "bash -s"
)

$remoteScript | ssh @sshArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║   Polymarket bot deployed successfully!      ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "VPS IP:      $vpsIp"
    Write-Host "SSH:         ssh root@$vpsIp"
    Write-Host "Logs:        ssh root@$vpsIp 'journalctl -u polymarket-bot -f'"
    Write-Host "Stop:        ssh root@$vpsIp 'systemctl stop polymarket-bot'"
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Send /start to @k187_bot in Telegram"
    Write-Host "  2. Watch for edge alerts to arrive"
    Write-Host "  3. When ready to trade: ssh root@$vpsIp"
    Write-Host "     nano /etc/systemd/system/polymarket-bot.service"
    Write-Host "     Change --mode alert  to  --mode auto"
    Write-Host "     systemctl daemon-reload && systemctl restart polymarket-bot"
} else {
    Write-Host "Deployment failed. SSH into the server manually:" -ForegroundColor Red
    Write-Host "  ssh root@$vpsIp"
    Write-Host "  bash /root/openclaw/skills/polymarket-edge/setup.sh"
}
