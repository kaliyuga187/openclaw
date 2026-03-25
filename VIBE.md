# VIBE.md — The Codebase Map for ADHD Builders

> You're not stupid. The codebase is just not organized for human brains.
> This file is the map. Read it once. Keep it open. Ship something.

---

## THE ONLY THING YOU NEED TO KNOW FIRST

```
openclaw/
├── src/cli/          ← WHERE COMMANDS ARE WIRED (the front door)
├── src/commands/     ← WHERE COMMANDS DO THEIR WORK (the engine room)
├── src/infra/        ← LOW-LEVEL PLUMBING (don't touch unless you know why)
├── src/routing/      ← HOW MESSAGES GET DELIVERED
├── extensions/       ← CHANNEL PLUGINS (Teams, Matrix, Zalo, etc.)
├── apps/             ← iOS, Android, macOS apps
└── docs/             ← DOCS (Mintlify hosted)
```

---

## WHAT DOES WHAT — 60 SECOND TOUR

| Area                             | What it does                              | Touch it when...                               |
| -------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| `src/cli/program.ts`             | Wires ALL CLI commands together           | Adding a new `openclaw foo` command            |
| `src/commands/agent.ts`          | The AI agent — talks to Claude/OpenAI     | Changing how the AI responds                   |
| `src/commands/onboard.ts`        | First-run wizard                          | Touching setup/install flow                    |
| `src/commands/channels.ts`       | WhatsApp, Telegram, etc. management       | Adding/fixing a channel                        |
| `src/commands/gateway-status.ts` | Gateway health checking                   | Debugging connection issues                    |
| `src/commands/doctor.ts`         | Diagnostics — the "what's broken" command | Debugging user problems                        |
| `src/commands/models.ts`         | Model selection (Claude, GPT, etc.)       | Changing model behavior                        |
| `src/commands/status.ts`         | Status dashboard                          | Changing what `openclaw status` shows          |
| `src/commands/configure.ts`      | Config wizard                             | Touching user config                           |
| `src/routing/`                   | Message routing logic                     | Changing how messages get to the right channel |
| `src/providers/`                 | AI provider adapters                      | Adding a new AI provider                       |
| `src/infra/`                     | Config, env, storage, deps                | Core infrastructure changes                    |
| `extensions/`                    | Channel plugins (Teams, Matrix, etc.)     | Adding/fixing channel integrations             |

---

## HOW TO ADD A NEW COMMAND (copy-paste this pattern)

### Step 1 — Create the command file

```
src/commands/my-feature.ts
```

```typescript
// src/commands/my-feature.ts
import type { Command } from "commander";

export function registerMyFeature(program: Command) {
  program
    .command("my-feature")
    .description("Does the thing")
    .option("--verbose", "More output")
    .action(async (opts) => {
      console.log("doing the thing");
    });
}
```

### Step 2 — Create a register file

```
src/cli/program/register.my-feature.ts
```

```typescript
// src/cli/program/register.my-feature.ts
import type { Command } from "commander";
import { myFeatureCommand } from "../../commands/my-feature.js";

export function registerMyFeatureCommand(program: Command) {
  program
    .command("my-feature")
    .description("Does the thing")
    .option("--verbose", "More output")
    .action(async (opts) => {
      await myFeatureCommand(opts);
    });
}
```

### Step 3 — Add it to the command registry

Open `src/cli/program/command-registry.ts` and add:

```typescript
import { registerMyFeatureCommand } from "./register.my-feature.js"

// add to commandRegistry array:
{
  id: "my-feature",
  register: ({ program }) => registerMyFeatureCommand(program),
},
```

### Step 4 — Test it

```bash
pnpm openclaw my-feature
```

### Step 5 — Done. Ship it.

```bash
scripts/committer "feat: add my-feature command" src/commands/my-feature.ts src/cli/program.ts
git push
```

---

## COMMAND DOMAINS — WHERE TO LOOK

The `src/commands/` folder has 185 files. They break down into these domains:

### Agent / AI Core

```
agent.ts              — main agent command (this is the product)
agent-via-gateway.ts  — agent running through the gateway
agents.ts             — multi-agent management
```

### Authentication

```
auth-choice*.ts       — auth flow for different providers (Claude, OpenAI, etc.)
auth-token.ts         — token management
oauth-flow.ts         — OAuth dance
```

### Channels (WhatsApp, Telegram, Slack...)

```
channels.ts           — channel listing and management
configure.channels.ts — channel configuration
signal-install.ts     — Signal setup
```

### Onboarding (First Run)

```
onboard.ts            — main wizard
onboard-auth.ts       — auth step
onboard-channels.ts   — channel setup step
onboard-hooks.ts      — hooks setup step
onboard-skills.ts     — skills setup step
```

### Doctor / Diagnostics

```
doctor.ts             — main doctor command
doctor-auth.ts        — auth health
doctor-gateway-*.ts   — gateway health
doctor-workspace.ts   — workspace health
```

### Models

```
models.ts             — model management
model-picker.ts       — UI for picking models
model-allowlist.ts    — model allow/deny lists
*-model-default.ts    — per-provider defaults (OpenAI, Gemini, etc.)
```

### Status / Health

```
status.ts             — status command
status-all.ts         — deep status
health.ts             — health check endpoint
gateway-status.ts     — gateway connection status
```

### Gateway / Daemon

```
daemon-runtime.ts     — daemon lifecycle
daemon-install-helpers.ts — install helpers
configure.gateway.ts  — gateway config
```

### Config / Setup

```
configure.ts          — main config command
configure.wizard.ts   — config wizard
setup.ts              — initial setup
reset.ts              — factory reset
uninstall.ts          — uninstall
```

---

## THE MESSAGING STACK (how a message flows)

```
User sends WhatsApp message
        ↓
Baileys (WhatsApp web client) picks it up
        ↓
src/routing/ decides who handles it
        ↓
src/commands/agent.ts calls the AI
        ↓
AI responds
        ↓
Response routed back to channel
        ↓
User gets reply
```

---

## CHANNELS LIST (all the places messages come from)

**Built-in (core):**

- WhatsApp (`src/whatsapp/`, `src/web/`)
- Telegram (`src/telegram/`)
- Slack (`src/slack/`)
- Discord (`src/discord/`)
- Signal (`src/signal/`)
- iMessage (`src/imessage/`)
- Web chat (`src/channel-web.ts`)

**Extensions (plugins in `extensions/`):**

- Microsoft Teams (`extensions/msteams/`)
- Matrix (`extensions/matrix/`)
- Zalo (`extensions/zalo/`)
- Voice Call (`extensions/voice-call/`)

---

## DEV COMMANDS — THE ONES YOU'LL ACTUALLY USE

```bash
# Run the CLI in dev (hot-ish reload)
pnpm openclaw <command>

# Build (TypeScript → dist/)
pnpm build

# Type check only (faster than build)
pnpm tsgo

# Lint + format
pnpm check

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Commit correctly (scoped staging)
scripts/committer "feat: your message" path/to/changed/file.ts
```

---

## THE GOLDEN RULES FOR FINISHING STUFF

1. **One feature at a time.** Open one file. Change one thing. Push.
2. **If you're confused, run `pnpm openclaw doctor`** — it tells you what's broken.
3. **Tests live next to the code** — `foo.ts` has `foo.test.ts` right beside it.
4. **Don't add to root `package.json`** unless core needs it. Extensions have their own.
5. **Use `scripts/committer`** not `git add .` — it keeps staging scoped.
6. **Files over ~500 lines** — split it. Seriously.

---

## STUCK? START HERE

```bash
# See what's broken
pnpm openclaw doctor

# See what's running
pnpm openclaw status

# See all channels
pnpm openclaw channels status

# Reset your dev environment
pnpm openclaw reset --confirm
```

---

## ADDING A NEW CHANNEL — THE CHECKLIST

When you add a new messaging channel, hit ALL of these:

- [ ] Core implementation in `src/<channel>/` or `extensions/<channel>/`
- [ ] Route handler in `src/routing/`
- [ ] Channel status in `src/commands/channels.ts`
- [ ] Config form in `src/commands/configure.channels.ts`
- [ ] Onboarding step in `src/commands/onboard-channels.ts`
- [ ] Docs in `docs/channels/`
- [ ] Label coverage in `.github/labeler.yml`

---

## FILES TO BOOKMARK RIGHT NOW

```
src/cli/program/command-registry.ts    ← All commands wired here (THE MAP)
src/cli/program/register.*.ts          ← Each command's CLI wiring
src/commands/agent.ts                  ← The core AI command (the product)
src/routing/resolve-route.ts           ← How messages get routed
src/infra/                             ← Config, storage, networking
extensions/                            ← Channel plugins
CHANGELOG.md                           ← Project history
```

---

_This file exists because codebases should have maps.
If you added something and it's not here, add it here. Future you will thank you._
