#!/usr/bin/env python3
"""
Polymarket edge-finding trading bot daemon.

Three modes:
  alert   — detect edges and print/send notifications only (default, safe)
  semi    — show exact trade commands to copy-paste and execute yourself
  auto    — automatically place orders when edge is detected (needs funded wallet)

Usage:
  # Alert mode (no trading, just notifications):
  python3 bot.py --mode alert --interval 300

  # Semi-auto mode (shows commands to run):
  python3 bot.py --mode semi --interval 300

  # Fully automatic trading (REAL MONEY — start with small limits):
  python3 bot.py --mode auto \
    --private-key 0xYOUR_PRIVATE_KEY \
    --max-position 25 \
    --max-daily-loss 100 \
    --min-edge 0.10 \
    --interval 300

  # Dry-run auto mode (simulates trades, no real money):
  python3 bot.py --mode auto --dry-run --interval 300

Environment variables (alternative to flags):
  POLYMARKET_PRIVATE_KEY    Wallet private key
  POLYMARKET_WALLET         Proxy wallet address to track (optional)
  EDGE_THRESHOLD            Min edge for alerts (default 0.05)
  BOT_MAX_POSITION_USD      Max USD per trade (default 25)
  BOT_MAX_DAILY_LOSS_USD    Stop trading after this loss today (default 100)
  BOT_MIN_EDGE_TRADE        Min edge required to actually trade (default 0.10)
  BOT_MIN_VOLUME_USD        Min market volume required (default 10000)
  BOT_MIN_DAYS_TO_EXPIRY    Min days until market closes (default 7)
  BOT_MAX_OPEN_POSITIONS    Max simultaneous open positions (default 5)
"""

import json
import os
import subprocess
import sys
import time
import traceback
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPTS_DIR = Path(__file__).parent

# Defaults (all overridable via env vars or CLI flags)
DEFAULTS = {
    "interval": 300,             # seconds between scans
    "alert_threshold": 0.05,     # min edge to surface in alerts
    "trade_threshold": 0.10,     # min edge required to place an order
    "max_position_usd": 25.0,    # max USD per trade
    "max_daily_loss_usd": 100.0, # stop trading if we lose this much today
    "min_volume_usd": 10_000,    # only trade markets with this much volume
    "min_days_to_expiry": 7,     # skip markets closing too soon
    "max_open_positions": 5,     # max simultaneous open positions
}


def load_config(args) -> dict:
    cfg = dict(DEFAULTS)
    cfg["mode"] = args.mode
    cfg["dry_run"] = args.dry_run or args.mode != "auto"
    cfg["private_key"] = args.private_key or os.environ.get("POLYMARKET_PRIVATE_KEY", "")
    cfg["wallet"] = args.wallet or os.environ.get("POLYMARKET_WALLET", "")
    cfg["interval"] = args.interval
    cfg["alert_threshold"] = float(os.environ.get("EDGE_THRESHOLD", cfg["alert_threshold"]))
    cfg["max_position_usd"] = args.max_position or float(
        os.environ.get("BOT_MAX_POSITION_USD", cfg["max_position_usd"])
    )
    cfg["max_daily_loss_usd"] = args.max_daily_loss or float(
        os.environ.get("BOT_MAX_DAILY_LOSS_USD", cfg["max_daily_loss_usd"])
    )
    cfg["trade_threshold"] = args.min_edge or float(
        os.environ.get("BOT_MIN_EDGE_TRADE", cfg["trade_threshold"])
    )
    cfg["min_volume_usd"] = float(os.environ.get("BOT_MIN_VOLUME_USD", cfg["min_volume_usd"]))
    cfg["min_days_to_expiry"] = int(os.environ.get("BOT_MIN_DAYS_TO_EXPIRY", cfg["min_days_to_expiry"]))
    cfg["max_open_positions"] = int(os.environ.get("BOT_MAX_OPEN_POSITIONS", cfg["max_open_positions"]))
    # Telegram: token from env, then OpenClaw config file
    cfg["telegram_token"] = os.environ.get("TELEGRAM_BOT_TOKEN", "") or _read_openclaw_telegram_token()
    cfg["telegram_chat_id"] = os.environ.get("TELEGRAM_CHAT_ID", "")
    return cfg


def _read_openclaw_telegram_token() -> str:
    """Read Telegram bot token from ~/.openclaw/openclaw.json if present."""
    config_path = Path.home() / ".openclaw" / "openclaw.json"
    try:
        with open(config_path) as f:
            data = json.load(f)
        return data.get("channels", {}).get("telegram", {}).get("botToken", "")
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        return ""


def telegram_send(token: str, chat_id: str, text: str) -> bool:
    """Send a message via Telegram Bot API. Returns True on success."""
    if not token or not chat_id:
        return False
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "HTML"}).encode()
    try:
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except Exception as e:
        print(f"[bot] Telegram send failed: {e}", file=sys.stderr)
        return False


def get_telegram_chat_id(token: str) -> str:
    """Fetch the most recent chat ID from getUpdates (run once to pair)."""
    url = f"https://api.telegram.org/bot{token}/getUpdates"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read())
        updates = data.get("result", [])
        if updates:
            msg = updates[-1].get("message") or updates[-1].get("channel_post", {})
            return str(msg.get("chat", {}).get("id", ""))
    except Exception as e:
        print(f"[bot] getUpdates failed: {e}", file=sys.stderr)
    return ""


# ---------------------------------------------------------------------------
# Subprocess helpers
# ---------------------------------------------------------------------------

def run_script(script: str, extra_args: list[str] | None = None, timeout: int = 120) -> list[dict] | dict | None:
    """Run a sub-script and return parsed JSON. Returns None on failure."""
    cmd = [sys.executable, str(SCRIPTS_DIR / script)] + (extra_args or [])
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if result.stdout.strip():
            return json.loads(result.stdout)
        if result.returncode != 0 and result.stderr:
            print(f"[bot] {script} stderr: {result.stderr[-300:]}", file=sys.stderr)
        return None
    except subprocess.TimeoutExpired:
        print(f"[bot] TIMEOUT: {script}", file=sys.stderr)
        return None
    except (json.JSONDecodeError, OSError) as e:
        print(f"[bot] ERROR from {script}: {e}", file=sys.stderr)
        return None


def run_analyze(cfg: dict) -> tuple[list[dict], list[dict]]:
    """Run the full edge analysis pipeline. Returns (edges, wallet_trades)."""
    extra = ["--threshold", str(cfg["alert_threshold"]), "--json"]
    if cfg.get("wallet"):
        extra += ["--wallet", cfg["wallet"]]

    result = run_script("analyze_edge.py", extra)
    if not result or not isinstance(result, dict):
        return [], []

    edges = result.get("edges", [])
    trades = result.get("wallet_trades", [])
    return edges, trades


# ---------------------------------------------------------------------------
# Market eligibility filter
# ---------------------------------------------------------------------------

def is_tradeable(edge: dict, cfg: dict) -> tuple[bool, str]:
    """
    Check if a market edge meets all criteria for actual trading.
    Returns (eligible, reason_if_not).
    """
    # Edge must exceed the trading threshold
    if edge.get("edge", 0) < cfg["trade_threshold"]:
        return False, f"edge {edge['edge']:.0%} < trade threshold {cfg['trade_threshold']:.0%}"

    # Volume check
    volume = float(edge.get("volume", 0) or 0)
    if volume < cfg["min_volume_usd"]:
        return False, f"volume ${volume:,.0f} < min ${cfg['min_volume_usd']:,.0f}"

    # Days to expiry check
    end_date = edge.get("end_date", "")
    if end_date:
        try:
            from datetime import datetime, timezone
            end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            days_left = (end - datetime.now(timezone.utc)).days
            if days_left < cfg["min_days_to_expiry"]:
                return False, f"only {days_left} days until expiry"
        except (ValueError, TypeError):
            pass  # Can't parse date, proceed

    # Must have CLOB token IDs
    if not edge.get("clob_token_ids"):
        return False, "no CLOB token IDs in market data"

    return True, ""


# ---------------------------------------------------------------------------
# Mode: alert
# ---------------------------------------------------------------------------

def handle_alert(edges: list[dict], wallet_trades: list[dict], cfg: dict) -> None:
    """Print/log alert-mode output and send Telegram notification when edges found."""
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"\n{'='*60}")
    print(f"📈 Polymarket Edge Scan — {ts}")
    print(f"{'='*60}")

    tg_lines = []  # lines to send to Telegram (only when edges found)

    if edges:
        print(f"\n{len(edges)} edge(s) above {cfg['alert_threshold']:.0%}:\n")
        tg_lines.append(f"<b>📈 Polymarket Edge — {ts}</b>")
        tg_lines.append(f"{len(edges)} edge(s) above {cfg['alert_threshold']:.0%}:\n")
        for i, e in enumerate(edges[:10], 1):
            rec = e.get("recommended", "?")
            edge_pct = f"{e.get('edge', 0):.0%}"
            market_pct = f"{e.get('market_prob', 0):.0%}"
            real_pct = f"{e.get('real_prob', 0):.0%}"
            cat = e.get("category", "?").upper()
            print(f"  {i}. [{cat}] BET {rec} — {edge_pct} edge")
            print(f"     {e.get('question', '')[:70]}")
            print(f"     Market: {market_pct} YES  |  Real data: {real_pct}  |  Edge: {edge_pct}")
            if e.get("url"):
                print(f"     {e['url']}")
            print()
            tg_lines.append(
                f"{i}. <b>[{cat}] BET {rec} — {edge_pct}</b>\n"
                f"   {e.get('question', '')[:70]}\n"
                f"   Market: {market_pct} | Real: {real_pct} | Edge: {edge_pct}"
            )
            if e.get("url"):
                tg_lines.append(f"   {e['url']}")
    else:
        print(f"\nNo edges above {cfg['alert_threshold']:.0%} found.\n")

    if wallet_trades:
        print(f"👁 Wallet tracker: {len(wallet_trades)} new position(s):\n")
        for t in wallet_trades[:5]:
            print(
                f"  • {t.get('side', '?'):3s} @ {t.get('price', 0):.0%} | "
                f"${t.get('value_usd', 0):,.0f} | {t.get('question', '')[:50]}"
            )
        print()

    # Send to Telegram if edges were found and credentials are available
    if tg_lines and cfg.get("telegram_token"):
        chat_id = cfg.get("telegram_chat_id", "")
        if not chat_id:
            # Auto-discover chat ID from most recent /start message
            chat_id = get_telegram_chat_id(cfg["telegram_token"])
            if chat_id:
                cfg["telegram_chat_id"] = chat_id  # cache for this session
        if chat_id:
            ok = telegram_send(cfg["telegram_token"], chat_id, "\n".join(tg_lines))
            if ok:
                print("[bot] Telegram alert sent.", file=sys.stderr)
            else:
                print("[bot] Telegram send failed (check token + chat_id).", file=sys.stderr)
        else:
            print("[bot] Telegram: no chat_id found. Send /start to your bot first.", file=sys.stderr)


# ---------------------------------------------------------------------------
# Mode: semi (show commands to run)
# ---------------------------------------------------------------------------

def handle_semi(edges: list[dict], wallet_trades: list[dict], cfg: dict) -> None:
    """Print exact commands the user can copy-paste to trade."""
    handle_alert(edges, wallet_trades, cfg)

    tradeable = [(e, reason) for e in edges for ok, reason in [is_tradeable(e, cfg)] if ok]
    if not tradeable:
        print("No markets meet the trading criteria right now.")
        return

    print("💡 Commands to execute these trades:\n")
    for e, _ in tradeable[:5]:
        clob_ids = e.get("clob_token_ids", ["<YES_TOKEN>", "<NO_TOKEN>"])
        side = e.get("recommended", "YES")
        token = clob_ids[0] if side == "YES" else clob_ids[1]
        price = e.get("market_prob", 0.5)
        entry_price = round(price + 0.02, 4)  # 2% slippage
        size = cfg["max_position_usd"]

        print(f"  # {e.get('question', '')[:60]}")
        print(f"  # Edge: {e.get('edge', 0):.0%} — Bet {side}")
        print(
            f"  python3 {SCRIPTS_DIR}/trader.py buy {token} "
            f"--side {side} --price {entry_price} --size {size} --live"
        )
        print()


# ---------------------------------------------------------------------------
# Mode: auto (place orders)
# ---------------------------------------------------------------------------

def handle_auto(
    edges: list[dict],
    wallet_trades: list[dict],
    cfg: dict,
    clob_client,
) -> None:
    """Evaluate edges and place trades automatically."""
    from portfolio import (
        check_daily_loss_limit, count_open_positions,
        log_entry, portfolio_summary, format_summary,
    )
    from trader import place_trade

    # Risk checks
    within_limit, today_pnl = check_daily_loss_limit(cfg["max_daily_loss_usd"])
    if not within_limit:
        print(
            f"[bot] ⛔ Daily loss limit hit (${today_pnl:.2f} today). "
            f"Pausing trading until tomorrow.",
            file=sys.stderr,
        )
        return

    open_count = count_open_positions()
    if open_count >= cfg["max_open_positions"]:
        print(f"[bot] Max open positions ({cfg['max_open_positions']}) reached. Skipping.", file=sys.stderr)
        return

    # Find the best eligible trade
    for edge in edges:
        eligible, reason = is_tradeable(edge, cfg)
        if not eligible:
            print(f"[bot] Skipping market ({reason}): {edge.get('question', '')[:50]}", file=sys.stderr)
            continue

        side = edge.get("recommended", "YES")
        size_usd = cfg["max_position_usd"]
        dry_run = cfg["dry_run"]

        print(
            f"[bot] {'[DRY RUN] ' if dry_run else ''}Placing {side} trade on:\n"
            f"       {edge.get('question', '')[:70]}\n"
            f"       Edge: {edge.get('edge', 0):.0%} | Size: ${size_usd:.2f}",
            file=sys.stderr,
        )

        result = place_trade(
            client=clob_client,
            market=edge,
            recommended=side,
            size_usd=size_usd,
            dry_run=dry_run,
        )

        if result.get("status") in ("DRY_RUN", "PLACED", "OPEN"):
            log_entry(
                market_id=edge.get("market_id", ""),
                question=edge.get("question", ""),
                side=side,
                entry_price=result.get("price", 0),
                size_usd=size_usd,
                edge_at_entry=edge.get("edge", 0),
                order_id=result.get("order_id", ""),
                token_id=result.get("token_id", ""),
                url=edge.get("url", ""),
                dry_run=dry_run,
            )
            # Notify Telegram when a trade is placed (or simulated)
            if cfg.get("telegram_token"):
                label = "DRY RUN" if dry_run else "LIVE TRADE"
                msg = (
                    f"<b>🤖 [{label}] Trade Placed</b>\n"
                    f"<b>{side}</b> @ ${size_usd:.2f}\n"
                    f"Edge: {edge.get('edge', 0):.0%}\n"
                    f"{edge.get('question', '')[:80]}\n"
                    f"{edge.get('url', '')}"
                )
                chat_id = cfg.get("telegram_chat_id", "")
                if not chat_id:
                    chat_id = get_telegram_chat_id(cfg["telegram_token"])
                    if chat_id:
                        cfg["telegram_chat_id"] = chat_id
                if chat_id:
                    telegram_send(cfg["telegram_token"], chat_id, msg)
        else:
            print(f"[bot] Trade failed: {result.get('error', 'unknown')}", file=sys.stderr)

        # Only trade one market per scan cycle (conservative)
        break

    # Print portfolio summary after each cycle
    s = portfolio_summary()
    print(format_summary(s), file=sys.stderr)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def run_loop(cfg: dict, clob_client=None) -> None:
    """Main bot loop: scan → handle → sleep → repeat."""
    mode = cfg["mode"]
    interval = cfg["interval"]

    print(f"[bot] Starting in {mode.upper()} mode", file=sys.stderr)
    print(f"[bot] Scan interval: {interval}s | Alert threshold: {cfg['alert_threshold']:.0%}", file=sys.stderr)
    if mode == "auto":
        dry_label = " (DRY RUN)" if cfg["dry_run"] else " ⚠ LIVE TRADING"
        print(
            f"[bot] Trade threshold: {cfg['trade_threshold']:.0%} | "
            f"Max position: ${cfg['max_position_usd']:.2f} | "
            f"Max daily loss: ${cfg['max_daily_loss_usd']:.2f}{dry_label}",
            file=sys.stderr,
        )

    consecutive_errors = 0

    while True:
        try:
            print(f"\n[bot] {datetime.now(timezone.utc).strftime('%H:%M:%S')} — running scan...", file=sys.stderr)
            edges, wallet_trades = run_analyze(cfg)
            print(f"[bot] Found {len(edges)} edge(s), {len(wallet_trades)} new wallet trade(s)", file=sys.stderr)

            if mode == "alert":
                handle_alert(edges, wallet_trades, cfg)
            elif mode == "semi":
                handle_semi(edges, wallet_trades, cfg)
            elif mode == "auto":
                if clob_client is None and not cfg["dry_run"]:
                    # Live mode with no client — this is a startup error, stop immediately
                    print("[bot] FATAL: auto mode with no CLOB client and dry_run=False", file=sys.stderr)
                    break
                # dry_run=True can run handle_auto without a live client (no orders placed)
                handle_auto(edges, wallet_trades, cfg, clob_client)

            consecutive_errors = 0  # reset on success

        except KeyboardInterrupt:
            print("\n[bot] Stopped by user.", file=sys.stderr)
            break

        except Exception:
            consecutive_errors += 1
            wait = min(300, 30 * consecutive_errors)  # exponential backoff, cap 5min
            print(
                f"[bot] ⚠ Error (#{consecutive_errors}). Retrying in {wait}s:\n"
                f"{traceback.format_exc()}",
                file=sys.stderr,
            )
            time.sleep(wait)
            continue

        print(f"[bot] Sleeping {interval}s until next scan...", file=sys.stderr)
        time.sleep(interval)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Polymarket edge-finding trading bot",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--mode", choices=["alert", "semi", "auto"], default="alert",
        help="alert=notify only, semi=show commands, auto=place orders (default: alert)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Simulate trades without placing real orders (implied unless --mode auto)"
    )
    parser.add_argument(
        "--live", action="store_true",
        help="Shorthand for --mode auto without --dry-run. YOU WILL SPEND REAL MONEY."
    )
    parser.add_argument(
        "--private-key", dest="private_key",
        default=os.environ.get("POLYMARKET_PRIVATE_KEY", ""),
        help="Wallet private key for auto mode (or set POLYMARKET_PRIVATE_KEY)"
    )
    parser.add_argument("--wallet", default="", help="Proxy wallet address to track")
    parser.add_argument("--interval", type=int, default=300, help="Seconds between scans (default: 300)")
    parser.add_argument("--max-position", type=float, help="Max USD per trade (default: 25)")
    parser.add_argument("--max-daily-loss", type=float, help="Daily loss limit in USD (default: 100)")
    parser.add_argument("--min-edge", type=float, help="Min edge to trade on (default: 0.10)")
    parser.add_argument("--threshold", type=float, help="Min edge to alert on (default: 0.05)")

    args = parser.parse_args()

    # --live flag = auto mode without dry-run
    if args.live:
        args.mode = "auto"
        args.dry_run = False

    # Warn about real money
    if args.mode == "auto" and not args.dry_run:
        if not args.private_key:
            print(
                "Error: --mode auto requires --private-key (or POLYMARKET_PRIVATE_KEY env var).\n"
                "Use --dry-run to simulate without real money.",
                file=sys.stderr,
            )
            sys.exit(1)

        print(
            "\n⚠️  WARNING: LIVE TRADING MODE\n"
            "   Real USDC will be spent. Prediction markets are risky.\n"
            "   This tool provides no financial guarantees.\n"
            "   You can lose your entire position.\n"
            "   Continue? [y/N] ",
            end="",
            file=sys.stderr,
        )
        confirm = input().strip().lower()
        if confirm != "y":
            print("Aborted.", file=sys.stderr)
            sys.exit(0)

    if args.threshold:
        os.environ["EDGE_THRESHOLD"] = str(args.threshold)

    cfg = load_config(args)

    # Initialize CLOB client for auto mode
    clob_client = None
    if cfg["mode"] == "auto" and cfg["private_key"]:
        sys.path.insert(0, str(SCRIPTS_DIR))
        try:
            from trader import make_client
            clob_client = make_client(cfg["private_key"])
            print("[bot] CLOB client initialized", file=sys.stderr)
        except SystemExit:
            # make_client exits if py-clob-client is not installed
            raise
        except Exception as e:
            print(f"[bot] Failed to initialize CLOB client: {e}", file=sys.stderr)
            if not cfg["dry_run"]:
                sys.exit(1)

    run_loop(cfg, clob_client)


if __name__ == "__main__":
    main()
