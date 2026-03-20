#!/usr/bin/env bash
# fetch-cl4r1t4s.sh — Download all system prompt files from elder-plinius/CL4R1T4S
# into reference/cl4r1t4s/ for local use and reference.
#
# Source: https://github.com/elder-plinius/CL4R1T4S (AGPL-3.0)
# Usage: bash scripts/fetch-cl4r1t4s.sh [--update]
#
# Options:
#   --update   Re-download even if files already exist (overwrite mode)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/reference/cl4r1t4s"
RAW="https://raw.githubusercontent.com/elder-plinius/CL4R1T4S/main"
OVERWRITE=0

for arg in "$@"; do
  [[ "$arg" == "--update" ]] && OVERWRITE=1
done

log()  { printf '\033[1;34m[cl4r1t4s]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[cl4r1t4s]\033[0m %s\n' "$*"; }
skip() { printf '\033[0;90m[cl4r1t4s] skip:\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[cl4r1t4s] WARN:\033[0m %s\n' "$*" >&2; }

fetch() {
  local dir="$1" file="$2"
  local dest="$OUT_DIR/$dir/$file"
  if [[ -f "$dest" && "$OVERWRITE" == "0" ]]; then
    skip "$dir/$file"
    return
  fi
  mkdir -p "$OUT_DIR/$dir"
  local url="$RAW/$dir/$file"
  # URL-encode spaces in filenames
  url="${url// /%20}"
  if curl -fsSL --retry 3 --retry-delay 1 -o "$dest" "$url" 2>/dev/null; then
    ok "  $dir/$file"
  else
    warn "Failed to download: $dir/$file"
    rm -f "$dest"
  fi
}

log "Downloading CL4R1T4S prompt library → $OUT_DIR"

# ── ANTHROPIC ────────────────────────────────────────────────────────────────
log "ANTHROPIC"
fetch "ANTHROPIC" "Claude-4.1.txt"
fetch "ANTHROPIC" "Claude-4.5-Opus.txt"
fetch "ANTHROPIC" "Claude_4.txt"
fetch "ANTHROPIC" "Claude_Code_03-04-24.md"
fetch "ANTHROPIC" "Claude_Opus_4.6.txt"
fetch "ANTHROPIC" "Claude_Sonnet-4.5_Sep-29-2025.txt"
fetch "ANTHROPIC" "Claude_Sonnet_3.5.md"
fetch "ANTHROPIC" "Claude_Sonnet_3.7_New.txt"
fetch "ANTHROPIC" "UserStyle_Modes.md"

# ── OPENAI ───────────────────────────────────────────────────────────────────
log "OPENAI"
fetch "OPENAI" "Atlas_10-21-25.txt"
fetch "OPENAI" "ChatGPT-4o_Sep-27-25.txt"
fetch "OPENAI" "ChatGPT5-08-07-2025.mkd"
fetch "OPENAI" "ChatGPT_4.1_05-15-2025.txt"
fetch "OPENAI" "ChatGPT_4o_04-25-2025.txt"
fetch "OPENAI" "ChatGPT_Personality_v2_Change.md"
fetch "OPENAI" "ChatGPT_o3_o4-mini_04-16-2025"
fetch "OPENAI" "ChatKit_Docs__Oct-6-25.txt"
fetch "OPENAI" "Codex.md"
fetch "OPENAI" "Codex_Sep-15-2025.md"
fetch "OPENAI" "GPT-4.5_02-27-25.md"
fetch "OPENAI" "GPT-4o_Image_Gen_Postfill.txt"

# ── GOOGLE ───────────────────────────────────────────────────────────────────
log "GOOGLE"
fetch "GOOGLE" "Gemini-2.5-Pro-04-18-2025.md"
fetch "GOOGLE" "Gemini_Diffusion.md"
fetch "GOOGLE" "Gemini_Gmail_Assistant.txt"

# ── XAI ──────────────────────────────────────────────────────────────────────
log "XAI"
fetch "XAI" "GROK-4-NEW_Jul-13-2025"
fetch "XAI" "GROK-4.1_Nov-17-2025.txt"
fetch "XAI" "GROK-4.20.mkd"
fetch "XAI" "Grok-Code-Fast-1_Aug-26-2025.txt"
fetch "XAI" "Grok3.md"
fetch "XAI" "Grok3_updated_07-08-2025.md"
fetch "XAI" "Grok4-July-10-2025.md"

# ── META ─────────────────────────────────────────────────────────────────────
log "META"
fetch "META" "Llama4_WhatsApp.txt"

# ── MISTRAL ──────────────────────────────────────────────────────────────────
log "MISTRAL"
fetch "MISTRAL" "LeChat.md"

# ── CURSOR ───────────────────────────────────────────────────────────────────
log "CURSOR"
fetch "CURSOR" "Cursor_2.0_Sys_Prompt.txt"
fetch "CURSOR" "Cursor_Prompt.md"
fetch "CURSOR" "Cursor_Tools.md"

# ── WINDSURF ─────────────────────────────────────────────────────────────────
log "WINDSURF"
fetch "WINDSURF" "Windsurf_Prompt.md"
fetch "WINDSURF" "Windsurf_Tools.md"

# ── CLINE ────────────────────────────────────────────────────────────────────
log "CLINE"
fetch "CLINE" "Cline.md"

# ── REPLIT ───────────────────────────────────────────────────────────────────
log "REPLIT"
fetch "REPLIT" "Replit_Agent.md"
fetch "REPLIT" "Replit_Functions.md"
fetch "REPLIT" "Replit_Initial_Code_Generation_Prompt.md"

# ── DEVIN ────────────────────────────────────────────────────────────────────
log "DEVIN"
fetch "DEVIN" "Devin2_09-08-2025.md"
fetch "DEVIN" "Devin_2.0.md"
fetch "DEVIN" "Devin_2.0_Commands.md"

# ── BOLT ─────────────────────────────────────────────────────────────────────
log "BOLT"
fetch "BOLT" "Bolt.txt"

# ── BRAVE ────────────────────────────────────────────────────────────────────
log "BRAVE"
fetch "BRAVE" "LEO_Aug-31-2025"

# ── CLUELY ───────────────────────────────────────────────────────────────────
log "CLUELY"
fetch "CLUELY" "Cluely.mkd"

# ── FACTORY ──────────────────────────────────────────────────────────────────
log "FACTORY"
fetch "FACTORY" "DROID.txt"

# ── HUME ─────────────────────────────────────────────────────────────────────
log "HUME"
fetch "HUME" "Hume_Voice_AI.md"

# ── LOVABLE ──────────────────────────────────────────────────────────────────
log "LOVABLE"
fetch "LOVABLE" "Lovable_2.0.txt"

# ── MANUS ────────────────────────────────────────────────────────────────────
log "MANUS"
fetch "MANUS" "Manus_Functions.txt"
fetch "MANUS" "Manus_Prompt.txt"

# ── MINIMAX ──────────────────────────────────────────────────────────────────
log "MINIMAX"
fetch "MINIMAX" "MiniMax.txt"

# ── MOONSHOT ─────────────────────────────────────────────────────────────────
log "MOONSHOT"
fetch "MOONSHOT" "Kimi_2_July-11-2025.txt"
fetch "MOONSHOT" "Kimi_K2_Thinking.txt"

# ── MULTION ──────────────────────────────────────────────────────────────────
log "MULTION"
fetch "MULTION" "MultiOn.md"

# ── PERPLEXITY ───────────────────────────────────────────────────────────────
log "PERPLEXITY"
fetch "PERPLEXITY" "Perplexity_Deep_Research.txt"

# ── SAMEDEV ──────────────────────────────────────────────────────────────────
log "SAMEDEV"
fetch "SAMEDEV" "Same_Dev.txt"

# ── VERCEL V0 ────────────────────────────────────────────────────────────────
log "VERCEL V0"
fetch "VERCEL V0" "Vercel_v0.txt"

# ── DIA ──────────────────────────────────────────────────────────────────────
log "DIA"
fetch "DIA" "Dia_CodingSkill.txt"
fetch "DIA" "Dia_DraftSkill.txt"

# ── Write index ─────────────────────────────────────────────────────────────

INDEX="$OUT_DIR/INDEX.md"
cat > "$INDEX" <<EOF
# CL4R1T4S — AI System Prompt Library

Source: <https://github.com/elder-plinius/CL4R1T4S>
License: AGPL-3.0
Last synced: $(date -u +"%Y-%m-%d")

A collection of extracted/reverse-engineered system prompts from major AI systems,
maintained by [@elder-plinius](https://github.com/elder-plinius).
Run \`bash scripts/fetch-cl4r1t4s.sh --update\` to refresh.

## Providers

$(for d in "$OUT_DIR"/*/; do
  name="$(basename "$d")"
  count="$(find "$d" -type f ! -name "*.md" -o -name "*.md" 2>/dev/null | wc -l | tr -d ' ')"
  echo "- **$name** ($count files)"
done)

## Files

$(find "$OUT_DIR" -type f ! -name "INDEX.md" | sort | while read -r f; do
  rel="${f#$OUT_DIR/}"
  echo "- \`$rel\`"
done)
EOF

echo ""
log "Done. Files in $OUT_DIR"
log "Index written: $INDEX"
TOTAL="$(find "$OUT_DIR" -type f | wc -l | tr -d ' ')"
log "Total files: ${TOTAL}"
