# ============================================================
# autorun.ps1 — Polymarket Bot: Zero to Running in One Script
# ============================================================
# Prompts for your credentials, connects to your existing Vultr
# server via SSH password, deploys the bot, verifies Telegram,
# then streams live logs to your terminal.
#
# Mode: dry-run auto (simulates trades + logs them, no real money)
#
# Usage:
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#   .\autorun.ps1

$ErrorActionPreference = "Stop"
$TELEGRAM_TOKEN = "8734661711:AAHU6x7rmXq7ngkhi5Cgfh7FuC7q5Gihpag"

# ── Helpers ──────────────────────────────────────────────────

function Write-Header($text) {
    Write-Host ""
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "  $("─" * $text.Length)" -ForegroundColor DarkGray
}

function Write-Ok($text)   { Write-Host "  ✓ $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "  ⚠ $text" -ForegroundColor Yellow }
function Write-Fail($text) { Write-Host "  ✗ $text" -ForegroundColor Red }
function Write-Step($text) { Write-Host "  → $text" -ForegroundColor White }

function SecureToPlain($secure) {
    [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    )
}

# ── Banner ───────────────────────────────────────────────────

Clear-Host
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════╗" -ForegroundColor DarkCyan
Write-Host "  ║   Polymarket Edge Bot — Full Auto Deploy         ║" -ForegroundColor DarkCyan
Write-Host "  ║   Mode: dry-run auto  |  Alerts: Telegram        ║" -ForegroundColor DarkCyan
Write-Host "  ╚══════════════════════════════════════════════════╝" -ForegroundColor DarkCyan
Write-Host ""

# ════════════════════════════════════════════════════════════
# SECTION 1 — Collect inputs
# ════════════════════════════════════════════════════════════

Write-Header "Step 1/7  Credentials"
Write-Host ""

$VULTR_API_KEY = Read-Host "  Vultr API key (my.vultr.com/settings/#settingsapi)"
if (-not $VULTR_API_KEY.Trim()) { Write-Fail "Vultr API key is required."; exit 1 }

$PRIVATE_KEY_SECURE = Read-Host "  Wallet private key (0x...)" -AsSecureString
$PRIVATE_KEY = SecureToPlain $PRIVATE_KEY_SECURE
if (-not $PRIVATE_KEY.Trim()) { Write-Fail "Private key is required."; exit 1 }

$WALLET = Read-Host "  Wallet address (0x...)"
if (-not $WALLET.Trim()) { Write-Fail "Wallet address is required."; exit 1 }

$ROOT_PASS_SECURE = Read-Host "  VPS root password" -AsSecureString
$ROOT_PASS = SecureToPlain $ROOT_PASS_SECURE
if (-not $ROOT_PASS.Trim()) { Write-Fail "Root password is required."; exit 1 }

Write-Ok "Credentials collected."

# ════════════════════════════════════════════════════════════
# SECTION 2 — Pick Vultr server
# ════════════════════════════════════════════════════════════

Write-Header "Step 2/7  Select Vultr Server"

$vHeaders = @{ "Authorization" = "Bearer $VULTR_API_KEY"; "Content-Type" = "application/json" }

try {
    $resp = Invoke-RestMethod -Uri "https://api.vultr.com/v2/instances?per_page=50" -Headers $vHeaders
} catch {
    Write-Fail "Failed to reach Vultr API: $_"
    Write-Warn "Check your API key at my.vultr.com/settings/#settingsapi"
    exit 1
}

$servers = $resp.instances
if (-not $servers -or $servers.Count -eq 0) {
    Write-Fail "No servers found on your Vultr account."
    Write-Warn "Create one at: https://my.vultr.com/deploy/"
    exit 1
}

Write-Host ""
Write-Host "  Your servers:" -ForegroundColor Yellow
Write-Host ""
for ($i = 0; $i -lt $servers.Count; $i++) {
    $s = $servers[$i]
    $status = if ($s.power_status -eq "running") { "running" } else { $s.power_status }
    $statusColor = if ($s.power_status -eq "running") { "Green" } else { "Red" }
    Write-Host ("    [{0}] {1,-20} {2,-18}" -f ($i + 1), $s.label, $s.main_ip) -NoNewline
    Write-Host $status -ForegroundColor $statusColor
}
Write-Host ""

$choice = Read-Host "  Enter server number"
$idx = [int]$choice - 1
if ($idx -lt 0 -or $idx -ge $servers.Count) {
    Write-Fail "Invalid selection."
    exit 1
}

$VPS_SERVER = $servers[$idx]
$VPS_IP     = $VPS_SERVER.main_ip
$VPS_LABEL  = $VPS_SERVER.label

if ($VPS_SERVER.power_status -ne "running") {
    Write-Warn "Server is not running (status: $($VPS_SERVER.power_status)). Deployment may fail."
}

Write-Ok "Target: $VPS_LABEL ($VPS_IP)"

# ════════════════════════════════════════════════════════════
# SECTION 3 — Telegram pre-flight
# ════════════════════════════════════════════════════════════

Write-Header "Step 3/7  Verify Telegram"

# Verify token
try {
    $meResp = Invoke-RestMethod -Uri "https://api.telegram.org/bot$TELEGRAM_TOKEN/getMe"
    Write-Ok "Bot verified: @$($meResp.result.username)"
} catch {
    Write-Fail "Telegram token invalid. Get a new one from @BotFather."
    exit 1
}

# Get chat ID — retry up to 12x (60s) waiting for user to send /start
Write-Step "Looking for your chat ID..."
Write-Warn "If not found: open Telegram, find @k187_bot, and send /start"
Write-Host ""

$CHAT_ID = ""
$attempts = 0
while (-not $CHAT_ID -and $attempts -lt 12) {
    try {
        $updResp = Invoke-RestMethod -Uri "https://api.telegram.org/bot$TELEGRAM_TOKEN/getUpdates"
        $updates = $updResp.result
        if ($updates -and $updates.Count -gt 0) {
            $last = $updates[-1]
            $msg  = if ($last.message) { $last.message } else { $last.channel_post }
            if ($msg -and $msg.chat -and $msg.chat.id) {
                $CHAT_ID = [string]$msg.chat.id
            }
        }
    } catch {}

    if (-not $CHAT_ID) {
        $attempts++
        Write-Host "  Waiting for /start message... ($attempts/12)" -ForegroundColor DarkGray
        Start-Sleep -Seconds 5
    }
}

if (-not $CHAT_ID) {
    Write-Fail "No Telegram message found after 60s."
    Write-Warn "Send /start to @k187_bot in Telegram, then re-run this script."
    exit 1
}

Write-Ok "Chat ID found: $CHAT_ID"

# ════════════════════════════════════════════════════════════
# SECTION 4 — SSH tool check (plink preferred, ssh fallback)
# ════════════════════════════════════════════════════════════

Write-Header "Step 4/7  SSH Setup"

$plinkPath = ""
$useSsh    = $false

# Check for plink.exe (PuTTY)
$candidates = @(
    "$env:LOCALAPPDATA\Programs\PuTTY\plink.exe",
    "C:\Program Files\PuTTY\plink.exe",
    "C:\Program Files (x86)\PuTTY\plink.exe",
    (Get-Command plink -ErrorAction SilentlyContinue)?.Source
)
foreach ($p in $candidates) {
    if ($p -and (Test-Path $p)) { $plinkPath = $p; break }
}

if ($plinkPath) {
    Write-Ok "plink.exe found: $plinkPath"
} else {
    # Try native ssh (requires SSH key or will prompt password interactively)
    if (Get-Command ssh -ErrorAction SilentlyContinue) {
        Write-Warn "plink.exe not found — falling back to native ssh."
        Write-Warn "You will be prompted for the SSH password when the connection opens."
        $useSsh = $true
    } else {
        Write-Fail "Neither plink.exe nor ssh found."
        Write-Host ""
        Write-Host "  Install PuTTY (includes plink.exe):" -ForegroundColor Yellow
        Write-Host "    winget install PuTTY.PuTTY" -ForegroundColor White
        Write-Host "  Or enable OpenSSH:" -ForegroundColor Yellow
        Write-Host "    Settings > Apps > Optional Features > OpenSSH Client" -ForegroundColor White
        exit 1
    }
}

# ════════════════════════════════════════════════════════════
# SECTION 5 — Build remote deployment script
# ════════════════════════════════════════════════════════════

Write-Header "Step 5/7  Deploy Bot to $VPS_LABEL"

# Escape values for bash heredoc safety
$SAFE_KEY    = $PRIVATE_KEY -replace "'", "'\''"
$SAFE_WALLET = $WALLET      -replace "'", "'\''"
$SAFE_TOKEN  = $TELEGRAM_TOKEN -replace "'", "'\''"
$SAFE_CHATID = $CHAT_ID

$remoteScript = @"
#!/bin/bash
set -euo pipefail

log() { echo "[deploy] \$1"; }

log "Installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq python3 python3-pip git curl 2>&1 | tail -3

log "Installing Python packages..."
pip3 install -q py-clob-client requests websockets 2>&1 | tail -3

log "Cloning repo..."
rm -rf /root/openclaw
git clone -q https://github.com/kaliyuga187/openclaw /root/openclaw

log "Copying bot scripts..."
mkdir -p /root/polymarket-bot
cp -r /root/openclaw/skills/polymarket-edge/scripts/* /root/polymarket-bot/
cp /root/openclaw/skills/polymarket-edge/start-bot.sh /root/polymarket-bot/
chmod +x /root/polymarket-bot/start-bot.sh

log "Writing credentials..."
mkdir -p /root/.openclaw
cat > /root/.polymarket-env << 'ENVEOF'
export POLYMARKET_PRIVATE_KEY=$SAFE_KEY
export POLYMARKET_WALLET=$SAFE_WALLET
export TELEGRAM_BOT_TOKEN=$SAFE_TOKEN
export TELEGRAM_CHAT_ID=$SAFE_CHATID
ENVEOF
chmod 600 /root/.polymarket-env

cat > /root/.openclaw/openclaw.json << 'CFGEOF'
{
  "channels": { "telegram": { "botToken": "$SAFE_TOKEN" } },
  "polymarket": { "wallet": "$SAFE_WALLET" }
}
CFGEOF
chmod 600 /root/.openclaw/openclaw.json
chmod 700 /root/.openclaw

log "Stopping any existing bot services..."
systemctl stop polymarket-bot    2>/dev/null || true
systemctl stop polymarket-stream 2>/dev/null || true
sleep 1

log "Installing polymarket-bot service (dry-run auto mode)..."
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

log "Installing polymarket-stream service (WebSocket feed)..."
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

log "Setting up hourly token map refresh..."
printf '0 * * * * root /usr/bin/python3 /root/polymarket-bot/prepare_stream_token_map.py --min-volume 50000 --no-edge > /root/polymarket-bot/markets.json 2>/dev/null\n' \
  > /etc/cron.d/polymarket-refresh
chmod 644 /etc/cron.d/polymarket-refresh

log "Starting services..."
systemctl daemon-reload
systemctl enable polymarket-bot polymarket-stream
systemctl start polymarket-bot
sleep 5
systemctl start polymarket-stream

sleep 3
log "Done. Checking status..."
systemctl is-active polymarket-bot && echo "polymarket-bot: RUNNING" || echo "polymarket-bot: FAILED"
systemctl is-active polymarket-stream && echo "polymarket-stream: RUNNING" || echo "polymarket-stream: FAILED"
"@

# ── Execute remote script ─────────────────────────────────

function Invoke-Remote($script) {
    if ($plinkPath) {
        # plink: pass password on command line (-pw)
        $bytes  = [System.Text.Encoding]::UTF8.GetBytes($script)
        $b64    = [Convert]::ToBase64String($bytes)
        $cmd    = "echo $b64 | base64 -d | bash"
        & $plinkPath -batch -pw $ROOT_PASS -ssh "root@$VPS_IP" $cmd
        return $LASTEXITCODE
    } else {
        # Native ssh: password must be entered interactively when prompted
        Write-Host ""
        Write-Host "  SSH will now connect — enter your root password when prompted." -ForegroundColor Yellow
        Write-Host ""
        $script | ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 "root@$VPS_IP" "bash -s"
        return $LASTEXITCODE
    }
}

$exitCode = Invoke-Remote $remoteScript

if ($exitCode -ne 0) {
    Write-Fail "Deployment failed (exit code $exitCode)."
    Write-Warn "Try SSHing in manually: ssh root@$VPS_IP"
    exit 1
}

Write-Ok "Deployment complete."

# ════════════════════════════════════════════════════════════
# SECTION 6 — Send Telegram test message
# ════════════════════════════════════════════════════════════

Write-Header "Step 6/7  Telegram Verification"

$tgBody = @{
    chat_id    = $CHAT_ID
    text       = "✅ Polymarket bot deployed on $VPS_LABEL ($VPS_IP)`nMode: dry-run auto | Max position: `$50 | Daily loss limit: `$50`nTrades are being simulated and logged. Send /start to interact."
    parse_mode = "HTML"
} | ConvertTo-Json

try {
    $tgResp = Invoke-RestMethod `
        -Uri "https://api.telegram.org/bot$TELEGRAM_TOKEN/sendMessage" `
        -Method Post `
        -ContentType "application/json" `
        -Body $tgBody
    Write-Ok "Test message sent to Telegram (message_id: $($tgResp.result.message_id))"
} catch {
    Write-Warn "Telegram send failed: $_"
    Write-Warn "Bot is still running — check token/chat_id manually."
}

# ════════════════════════════════════════════════════════════
# SECTION 7 — Live log tail
# ════════════════════════════════════════════════════════════

Write-Header "Step 7/7  Live Log Stream"
Write-Host ""
Write-Host "  Streaming live bot output from $VPS_LABEL..." -ForegroundColor White
Write-Host "  Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

try {
    if ($plinkPath) {
        & $plinkPath -batch -pw $ROOT_PASS -ssh "root@$VPS_IP" `
            "journalctl -u polymarket-bot -f --no-pager --output=cat 2>&1"
    } else {
        ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 "root@$VPS_IP" `
            "journalctl -u polymarket-bot -f --no-pager --output=cat 2>&1"
    }
} catch {
    # Ctrl+C lands here — normal exit
}

# ════════════════════════════════════════════════════════════
# STATUS DASHBOARD
# ════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║   Polymarket Bot — Active                                ║" -ForegroundColor Green
Write-Host "  ╠══════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host ("  ║   Server:    {0,-44}║" -f "$VPS_LABEL ($VPS_IP)") -ForegroundColor Green
Write-Host ("  ║   Mode:      {0,-44}║" -f "dry-run auto (no real money)") -ForegroundColor Green
Write-Host ("  ║   Wallet:    {0,-44}║" -f ($WALLET.Substring(0, [Math]::Min(42, $WALLET.Length)))) -ForegroundColor Green
Write-Host ("  ║   Telegram:  {0,-44}║" -f "@k187_bot → chat $CHAT_ID") -ForegroundColor Green
Write-Host ("  ║   Trade log: {0,-44}║" -f "/root/.openclaw/polymarket-portfolio.jsonl") -ForegroundColor Green
Write-Host ("  ║   Bot log:   {0,-44}║" -f "/root/.openclaw/polymarket-bot.log") -ForegroundColor Green
Write-Host "  ╠══════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "  ║   Useful commands:                                       ║" -ForegroundColor DarkGreen
Write-Host "  ║                                                          ║" -ForegroundColor DarkGreen
Write-Host "  ║   SSH in:    ssh root@$VPS_IP" -ForegroundColor DarkGreen
Write-Host "  ║   Bot logs:  journalctl -u polymarket-bot -f             ║" -ForegroundColor DarkGreen
Write-Host "  ║   Trades:    cat ~/.openclaw/polymarket-portfolio.jsonl   ║" -ForegroundColor DarkGreen
Write-Host "  ║   Stop:      systemctl stop polymarket-bot               ║" -ForegroundColor DarkGreen
Write-Host "  ╠══════════════════════════════════════════════════════════╣" -ForegroundColor DarkGreen
Write-Host "  ║   To go LIVE (real money):                               ║" -ForegroundColor Yellow
Write-Host "  ║     ssh root@$VPS_IP" -ForegroundColor Yellow
Write-Host "  ║     nano /etc/systemd/system/polymarket-bot.service      ║" -ForegroundColor Yellow
Write-Host "  ║     Remove the --dry-run flag from ExecStart             ║" -ForegroundColor Yellow
Write-Host "  ║     systemctl daemon-reload                              ║" -ForegroundColor Yellow
Write-Host "  ║     systemctl restart polymarket-bot                     ║" -ForegroundColor Yellow
Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""
