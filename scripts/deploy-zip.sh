#!/usr/bin/env bash
# deploy-zip.sh — Package all built OpenClaw outputs into a versioned deployment zip.
#
# Prerequisites: run 'pnpm build' (and optionally 'pnpm mac:package') before this script.
#
# Output:
#   dist/openclaw-deploy-<version>.zip  — cross-platform gateway bundle (Node.js)
#   dist/openclaw-mac-<version>.zip     — macOS app bundle (if dist/OpenClaw.app exists)
#   dist/openclaw-android-<version>.zip — Android APK bundle  (if APK exists)
#
# Usage:
#   bash scripts/deploy-zip.sh [--skip-mac] [--skip-android] [--out-dir <dir>]
#
# Environment variables:
#   SKIP_MAC      Set to 1 to skip macOS bundle packaging
#   SKIP_ANDROID  Set to 1 to skip Android APK packaging
#   OUT_DIR       Override output directory (default: dist/)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ── Argument parsing ─────────────────────────────────────────────────────────

SKIP_MAC="${SKIP_MAC:-0}"
SKIP_ANDROID="${SKIP_ANDROID:-0}"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/dist}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-mac)      SKIP_MAC=1 ;;
    --skip-android)  SKIP_ANDROID=1 ;;
    --out-dir)       shift; OUT_DIR="$1" ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

# ── Helpers ──────────────────────────────────────────────────────────────────

log()  { printf '\033[1;34m[deploy-zip]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[deploy-zip] WARN:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[deploy-zip] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# ── Verify the build exists ──────────────────────────────────────────────────

if [[ ! -f "$ROOT_DIR/dist/entry.js" ]]; then
  die "dist/entry.js not found. Run 'pnpm build' first."
fi

# ── Read version from package.json ──────────────────────────────────────────

VERSION="$(node -e "process.stdout.write(require('$ROOT_DIR/package.json').version)")"
log "Packaging version: ${VERSION}"

mkdir -p "$OUT_DIR"

# ═══════════════════════════════════════════════════════════════════════════
# 1. Cross-platform gateway bundle (Node.js / Linux / macOS CLI)
# ═══════════════════════════════════════════════════════════════════════════

GATEWAY_ZIP="$OUT_DIR/openclaw-deploy-${VERSION}.zip"
STAGING="$(mktemp -d)"
STAGE="$STAGING/openclaw-${VERSION}"
mkdir -p "$STAGE"

log "Staging gateway bundle → $GATEWAY_ZIP"

# Core package files (mirrors package.json "files" field)
cp -R "$ROOT_DIR/dist"        "$STAGE/dist"
cp    "$ROOT_DIR/openclaw.mjs" "$STAGE/openclaw.mjs"
cp    "$ROOT_DIR/package.json" "$STAGE/package.json"

# Docs, assets, skills, extensions (if present)
for extra in assets skills extensions docs CHANGELOG.md README.md LICENSE; do
  src="$ROOT_DIR/$extra"
  if [[ -e "$src" ]]; then
    cp -R "$src" "$STAGE/$extra"
  fi
done

# Embed the auto-run bootstrap script as run.sh at the zip root
cp "$ROOT_DIR/scripts/deploy-run.sh" "$STAGE/run.sh"
chmod +x "$STAGE/run.sh"

# Embed a minimal Windows bootstrap (PowerShell)
cat > "$STAGE/run.ps1" <<'PWSH'
# run.ps1 — Start the OpenClaw gateway on Windows
param(
  [int]$Port = 18789,
  [string]$Bind = "loopback",
  [switch]$Foreground
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Verify Node.js
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw "Node.js not found. Install from https://nodejs.org" }
$ver = (node -e "process.stdout.write(process.version)")
Write-Host "[openclaw] Node.js $ver detected"

# Install production deps if needed
if (-not (Test-Path "$Root\node_modules")) {
  Write-Host "[openclaw] Installing production dependencies..."
  & npm install --omit=dev --prefix $Root --no-fund --no-audit
}

$entry = if (Test-Path "$Root\openclaw.mjs") { "$Root\openclaw.mjs" } else { "$Root\dist\entry.js" }
$args = @("gateway", "run", "--bind", $Bind, "--port", $Port, "--force")

if ($Foreground) {
  & node $entry @args
} else {
  $logFile = "$Root\openclaw-gateway.log"
  Write-Host "[openclaw] Starting gateway on port $Port (log: $logFile)"
  $proc = Start-Process -FilePath "node" -ArgumentList (@($entry) + $args) `
    -RedirectStandardOutput $logFile -RedirectStandardError $logFile `
    -NoNewWindow -PassThru
  $proc.Id | Out-File "$Root\openclaw-gateway.pid"
  Write-Host "[openclaw] Gateway running (PID $($proc.Id))"
}
PWSH

# Embed a minimal README for the zip
cat > "$STAGE/DEPLOY.md" <<MD
# OpenClaw ${VERSION} — Deployment Bundle

## Requirements
- Node.js 22+

## Quick Start

**Linux / macOS:**
\`\`\`bash
bash run.sh
\`\`\`

**Windows (PowerShell):**
\`\`\`powershell
.\run.ps1
\`\`\`

**Foreground / custom port:**
\`\`\`bash
OPENCLAW_FOREGROUND=1 OPENCLAW_PORT=8080 bash run.sh
\`\`\`

## Environment Variables

| Variable              | Default              | Description                       |
|-----------------------|----------------------|-----------------------------------|
| OPENCLAW_PORT         | 18789                | Gateway listen port               |
| OPENCLAW_BIND         | loopback             | Bind address (loopback or 0.0.0.0)|
| OPENCLAW_LOG          | openclaw-gateway.log | Log file path                     |
| OPENCLAW_FOREGROUND   | 0                    | Set to 1 to run in foreground     |

## Stop the Gateway

\`\`\`bash
kill \$(cat openclaw-gateway.pid)
\`\`\`
MD

# Create the zip
rm -f "$GATEWAY_ZIP"
(cd "$STAGING" && zip -r "$GATEWAY_ZIP" "openclaw-${VERSION}" -x "*.DS_Store" -x "__MACOSX/*")
rm -rf "$STAGING"

ZIP_SIZE="$(du -sh "$GATEWAY_ZIP" | cut -f1)"
log "Gateway bundle: $GATEWAY_ZIP (${ZIP_SIZE})"

# ═══════════════════════════════════════════════════════════════════════════
# 2. macOS app bundle (only if built and not skipped)
# ═══════════════════════════════════════════════════════════════════════════

MAC_APP="$ROOT_DIR/dist/OpenClaw.app"
MAC_ZIP="$OUT_DIR/openclaw-mac-${VERSION}.zip"

if [[ "$SKIP_MAC" != "1" && -d "$MAC_APP" ]]; then
  log "Packaging macOS app → $MAC_ZIP"
  rm -f "$MAC_ZIP"
  if command -v ditto &>/dev/null; then
    ditto -c -k --sequesterRsrc --keepParent "$MAC_APP" "$MAC_ZIP"
  else
    (cd "$ROOT_DIR/dist" && zip -r "$MAC_ZIP" "OpenClaw.app" -x "*.DS_Store")
  fi
  MAC_SIZE="$(du -sh "$MAC_ZIP" | cut -f1)"
  log "macOS bundle:   $MAC_ZIP (${MAC_SIZE})"
elif [[ "$SKIP_MAC" == "1" ]]; then
  log "Skipping macOS bundle (--skip-mac)"
else
  warn "dist/OpenClaw.app not found — run 'pnpm mac:package' to build it. Skipping."
fi

# ═══════════════════════════════════════════════════════════════════════════
# 3. Android APK bundle (if Gradle output exists and not skipped)
# ═══════════════════════════════════════════════════════════════════════════

ANDROID_APK_DIR="$ROOT_DIR/apps/android/app/build/outputs/apk"
ANDROID_ZIP="$OUT_DIR/openclaw-android-${VERSION}.zip"

if [[ "$SKIP_ANDROID" != "1" && -d "$ANDROID_APK_DIR" ]]; then
  APK_FILES=("$ANDROID_APK_DIR"/**/*.apk)
  if [[ ${#APK_FILES[@]} -gt 0 && -f "${APK_FILES[0]}" ]]; then
    log "Packaging Android APKs → $ANDROID_ZIP"
    rm -f "$ANDROID_ZIP"
    APK_STAGING="$(mktemp -d)"
    APK_STAGE="$APK_STAGING/openclaw-android-${VERSION}"
    mkdir -p "$APK_STAGE"
    for apk in "${APK_FILES[@]}"; do
      cp "$apk" "$APK_STAGE/"
    done
    (cd "$APK_STAGING" && zip -r "$ANDROID_ZIP" "openclaw-android-${VERSION}")
    rm -rf "$APK_STAGING"
    APK_SIZE="$(du -sh "$ANDROID_ZIP" | cut -f1)"
    log "Android bundle: $ANDROID_ZIP (${APK_SIZE})"
  else
    warn "No APK files found in $ANDROID_APK_DIR — run 'pnpm android:assemble' first. Skipping."
  fi
elif [[ "$SKIP_ANDROID" == "1" ]]; then
  log "Skipping Android bundle (--skip-android)"
else
  log "apps/android/app/build/outputs/apk not found — skipping Android bundle."
fi

# ═══════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════

echo ""
log "All done. Deployment artifacts in: ${OUT_DIR}"
ls -lh "$OUT_DIR"/openclaw-*.zip 2>/dev/null || true
