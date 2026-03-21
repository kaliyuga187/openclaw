# Command Domains — What Lives Where

> 185 files. Here's the map. Find your domain, open the file, ship.

## Quick Jump

| Domain | Files | Entry Point |
|--------|-------|-------------|
| [Agent / AI](#agent--ai) | `agent*.ts`, `agents*.ts` | `agent.ts` |
| [Authentication](#authentication) | `auth-choice*.ts`, `auth-token.ts`, `oauth*.ts` | `auth-choice.ts` |
| [Channels](#channels) | `channels*.ts`, `signal-install.ts` | `channels.ts` |
| [Configure](#configure) | `configure*.ts` | `configure.ts` |
| [Daemon / Gateway](#daemon--gateway) | `daemon*.ts`, `gateway-status*.ts` | `daemon-runtime.ts` |
| [Doctor / Diagnostics](#doctor--diagnostics) | `doctor*.ts` | `doctor.ts` |
| [Models](#models) | `models*.ts`, `model-*.ts`, `*-model-default.ts` | `models.ts` |
| [Onboarding](#onboarding) | `onboard*.ts` | `onboard.ts` |
| [Sandbox](#sandbox) | `sandbox*.ts` | `sandbox.ts` |
| [Sessions](#sessions) | `sessions*.ts` | `sessions.ts` |
| [Status / Health](#status--health) | `status*.ts`, `health*.ts`, `dashboard*.ts` | `status.ts` |
| [Setup / Maintenance](#setup--maintenance) | `setup.ts`, `reset.ts`, `uninstall.ts`, `cleanup-utils.ts` | `setup.ts` |

---

## Agent / AI

**The product.** This is what users actually talk to.

```
agent.ts                    ← main agent command — openclaw agent
agent-via-gateway.ts        ← runs agent through the gateway RPC
agents.ts                   ← multi-agent management — openclaw agents
agents.commands.add.ts      ← adding an agent config
agents.commands.delete.ts   ← removing an agent config
agents.commands.list.ts     ← listing agents
agents.commands.identity.ts ← agent identity management
agents.config.ts            ← agent config helpers
agents.bindings.ts          ← agent channel binding logic
agents.providers.ts         ← provider selection for agents
agents.command-shared.ts    ← shared CLI option helpers
```

**Tests:** `agent.test.ts`, `agents.test.ts`, `agents.add.test.ts`, `agent.delivery.test.ts`

---

## Authentication

**How users prove who they are to providers (Claude, OpenAI, Gemini, etc.).**

```
auth-choice.ts              ← main auth orchestrator
auth-choice-prompt.ts       ← UI prompt for picking auth method
auth-choice-options.ts      ← list of available auth options
auth-choice.api-key.ts      ← API key auth path
auth-choice.apply.ts        ← applies chosen auth to config
auth-choice.apply.anthropic.ts
auth-choice.apply.openai.ts
auth-choice.apply.google-gemini-cli.ts
auth-choice.apply.google-antigravity.ts
auth-choice.apply.github-copilot.ts
auth-choice.apply.oauth.ts
auth-choice.apply.minimax.ts
auth-choice.apply.qwen-portal.ts
auth-choice.apply.xai.ts
auth-choice.apply.copilot-proxy.ts
auth-choice.apply.plugin-provider.ts
auth-choice.apply.api-providers.ts ← generic API provider
auth-choice.default-model.ts       ← sets default model after auth
auth-choice.model-check.ts         ← verifies model availability
auth-choice.preferred-provider.ts  ← tracks preferred provider

auth-token.ts               ← raw token management

oauth-flow.ts               ← generic OAuth dance
oauth-env.ts                ← OAuth env var helpers
chutes-oauth.ts             ← Chutes.ai OAuth
```

---

## Channels

**The messaging integrations — WhatsApp, Telegram, Slack, Discord, etc.**

```
channels.ts                 ← openclaw channels — list + manage channels
configure.channels.ts       ← config wizard step for channels
```

Channel-specific code lives in `src/<channel>/` (not commands):
- `src/whatsapp/`, `src/telegram/`, `src/slack/`, `src/discord/`
- `src/signal/`, `src/imessage/`, `src/web/`
- Extensions: `extensions/msteams/`, `extensions/matrix/`, `extensions/zalo/`

```
signal-install.ts           ← Signal CLI install helper
```

---

## Configure

**The `openclaw configure` command tree — all config wizard screens.**

```
configure.ts                ← main configure command
configure.wizard.ts         ← interactive wizard flow
configure.shared.ts         ← shared helpers
configure.channels.ts       ← channels config screen
configure.commands.ts       ← command-level config
configure.daemon.ts         ← daemon config
configure.gateway.ts        ← gateway config screen
configure.gateway-auth.ts   ← gateway auth config
```

---

## Daemon / Gateway

**Keeps openclaw running in the background.**

```
daemon-runtime.ts           ← daemon lifecycle (start/stop/restart)
daemon-install-helpers.ts   ← install helpers (launchd/systemd)
node-daemon-runtime.ts      ← Node-specific daemon runtime
node-daemon-install-helpers.ts
gateway-status.ts           ← openclaw gateway status
```

The gateway CLI lives at `src/cli/gateway-cli.ts`.

---

## Doctor / Diagnostics

**`openclaw doctor` — runs checks and reports what's broken.**

Each file is one diagnostic check. Run them all with `doctor.ts`.

```
doctor.ts                   ← main doctor command (runs all checks)
doctor-auth.ts              ← auth health check
doctor-completion.ts        ← shell completion check
doctor-config-flow.ts       ← config validity check
doctor-format.ts            ← output formatter
doctor-gateway-daemon-flow.ts
doctor-gateway-health.ts
doctor-gateway-services.ts
doctor-install.ts           ← install integrity check
doctor-legacy-config.ts     ← migrates old config formats
doctor-platform-notes.ts    ← platform-specific warnings
doctor-prompter.ts          ← interactive fix prompts
doctor-sandbox.ts           ← sandbox environment check
doctor-security.ts          ← security audit
doctor-state-integrity.ts   ← state file integrity
doctor-state-migrations.ts  ← applies state migrations
doctor-ui.ts                ← doctor output UI
doctor-update.ts            ← checks for updates
doctor-workspace.ts         ← workspace health
doctor-workspace-status.ts
```

---

## Models

**Model selection, defaults, and allowlists.**

```
models.ts                   ← openclaw models — list, set, info
model-picker.ts             ← interactive model picker UI
model-allowlist.ts          ← allowlist/denylist management

# Provider-specific default model logic:
openai-model-default.ts
openai-codex-model-default.ts
google-gemini-model-default.ts
opencode-zen-model-default.ts
```

---

## Onboarding

**First-run wizard — `openclaw onboard`.**

```
onboard.ts                  ← main onboard command
onboard-interactive.ts      ← interactive mode
onboard-non-interactive.ts  ← --yes / scripted mode
onboard-auth.ts             ← auth step
onboard-auth.config-core.ts
onboard-auth.config-minimax.ts
onboard-auth.config-opencode.ts
onboard-auth.credentials.ts
onboard-auth.models.ts
onboard-channels.ts         ← channels setup step
onboard-helpers.ts          ← shared helpers
onboard-hooks.ts            ← hooks setup step
onboard-remote.ts           ← remote/gateway setup
onboard-skills.ts           ← skills setup step
onboard-types.ts            ← shared types
onboarding/                 ← legacy onboarding subdir
```

---

## Sandbox

**Container/sandbox management for secure agent execution.**

```
sandbox.ts                  ← openclaw sandbox — manage sandboxes
sandbox-display.ts          ← sandbox status display
sandbox-explain.ts          ← explain sandbox config
sandbox-formatters.ts       ← output formatters
```

---

## Sessions

**Session management — list, inspect, clean up agent sessions.**

```
sessions.ts                 ← openclaw sessions
```

Session files live at `~/.openclaw/agents/<agentId>/sessions/*.jsonl`.

---

## Status / Health

**Real-time status and health checks.**

```
status.ts                   ← openclaw status (main command)
status-all.ts               ← --all deep status
status.command.ts           ← command entry
status.types.ts             ← status types
status.format.ts            ← output formatting
status.summary.ts           ← summary view
status.scan.ts              ← scanning logic
status.daemon.ts            ← daemon status
status.agent-local.ts       ← local agent status
status.gateway-probe.ts     ← gateway probe
status.link-channel.ts      ← channel link status
status.update.ts            ← update status

health.ts                   ← openclaw health (JSON endpoint)
health-format.ts            ← health output formatter

dashboard.ts                ← live dashboard TUI
```

---

## Setup / Maintenance

**Install, reset, and uninstall.**

```
setup.ts                    ← initial setup (post-install)
reset.ts                    ← factory reset
uninstall.ts                ← full uninstall
cleanup-utils.ts            ← file/state cleanup helpers
systemd-linger.ts           ← systemd linger setup (Linux)
docs.ts                     ← openclaw docs — opens docs
```

---

## Shared / Utility

**Used by multiple domains — not a command itself.**

```
cleanup-utils.ts            ← state cleanup helpers (used by reset/uninstall)
daemon-install-helpers.ts   ← install helpers (used by onboard + setup)
```

---

*Adding a new file? Put it in the right domain and update this table.*
