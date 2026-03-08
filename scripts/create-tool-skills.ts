#!/usr/bin/env bun
/**
 * Generate tool-dispatch skill stubs from OpenClaw's built-in agent tools.
 *
 * Each generated skill uses `command-dispatch: tool` so the slash command
 * bypasses the model and dispatches directly to the named tool.
 *
 * Usage:
 *   bun scripts/create-tool-skills.ts --out <dir>          # write all tool skills
 *   bun scripts/create-tool-skills.ts --out <dir> --tools message,tts
 *   bun scripts/create-tool-skills.ts --list                # print tool names
 *   bun scripts/create-tool-skills.ts --dry-run             # preview without writing
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Tool registry — canonical list of built-in OpenClaw agent tools.
// Keep in sync with src/agents/openclaw-tools.ts + bash-tools.*.ts + pi-tools.
// ---------------------------------------------------------------------------

type ToolMeta = {
  name: string;
  label: string;
  emoji: string;
  description: string;
  /** Brief usage hint shown in the skill body. */
  usage: string;
};

const TOOL_REGISTRY: ToolMeta[] = [
  {
    name: "message",
    label: "Message",
    emoji: "💬",
    description:
      "Send messages to channels and users. Use when you need to send a message to a specific channel, user, or group.",
    usage:
      "Provide the message text as arguments. Example: `/message Hello from the skill!`",
  },
  {
    name: "tts",
    label: "TTS",
    emoji: "🔊",
    description:
      "Convert text to speech and return an audio file path. Use when the user requests audio output or text-to-speech.",
    usage: "Provide the text to convert. Example: `/tts Good morning!`",
  },
  {
    name: "web_search",
    label: "Web Search",
    emoji: "🔍",
    description:
      "Search the web and return results. Use when you need to look up current information, news, or documentation online.",
    usage:
      "Provide the search query as arguments. Example: `/web_search latest Node.js release`",
  },
  {
    name: "web_fetch",
    label: "Web Fetch",
    emoji: "🌐",
    description:
      "Fetch content from a URL and return it as text. Use when you need to retrieve a specific web page, API response, or online resource.",
    usage:
      "Provide the URL to fetch. Example: `/web_fetch https://example.com/api/status`",
  },
  {
    name: "image",
    label: "Image",
    emoji: "🖼️",
    description:
      "Generate or process images. Use when the user asks to create, edit, or analyze images.",
    usage:
      "Provide the image prompt or instructions. Example: `/image a sunset over mountains`",
  },
  {
    name: "browser",
    label: "Browser",
    emoji: "🌏",
    description:
      "Control the browser via OpenClaw's browser control server (status, start, stop, tabs, open, snapshot, screenshot, actions). Use for web automation and browser interaction tasks.",
    usage:
      "Provide the browser action and parameters. Example: `/browser open https://example.com`",
  },
  {
    name: "canvas",
    label: "Canvas",
    emoji: "🎨",
    description:
      "Control node canvases (present, hide, navigate, eval, snapshot, A2UI). Use for canvas-based UI interactions and rendering.",
    usage:
      "Provide the canvas action. Example: `/canvas snapshot`",
  },
  {
    name: "cron",
    label: "Cron",
    emoji: "⏰",
    description:
      "Manage Gateway cron jobs (status, list, add, update, remove, run, runs) and send wake events. Use for scheduling recurring tasks.",
    usage:
      "Provide the cron action and parameters. Example: `/cron list`",
  },
  {
    name: "nodes",
    label: "Nodes",
    emoji: "📱",
    description:
      "Discover and control paired nodes (status, describe, pairing, notify, camera, screen, location, run, invoke). Use for interacting with paired devices.",
    usage:
      "Provide the node action. Example: `/nodes status`",
  },
  {
    name: "gateway",
    label: "Gateway",
    emoji: "🚪",
    description:
      "Restart, apply config, or update the gateway in-place. Use for gateway management and configuration tasks.",
    usage:
      "Provide the gateway action. Example: `/gateway restart`",
  },
  {
    name: "sessions_list",
    label: "Sessions List",
    emoji: "📋",
    description:
      "List sessions with optional filters and last messages. Use to browse active and recent sessions.",
    usage: "Provide optional filters. Example: `/sessions_list`",
  },
  {
    name: "sessions_history",
    label: "Session History",
    emoji: "📜",
    description:
      "Fetch message history for a session. Use to review conversation history in a specific session.",
    usage:
      "Provide the session key. Example: `/sessions_history key=abc123`",
  },
  {
    name: "sessions_send",
    label: "Session Send",
    emoji: "📤",
    description:
      "Send a message into another session. Use to communicate across sessions by session key or label.",
    usage:
      "Provide target and message. Example: `/sessions_send key=abc123 Hello!`",
  },
  {
    name: "sessions_spawn",
    label: "Sessions Spawn",
    emoji: "🔀",
    description:
      "Spawn a background sub-agent run in an isolated session and announce the result. Use for parallel task execution.",
    usage:
      "Provide the task description. Example: `/sessions_spawn summarize today's news`",
  },
  {
    name: "session_status",
    label: "Session Status",
    emoji: "📊",
    description:
      "Show session status (usage, time, cost). Use for model-use questions and session introspection.",
    usage: "Example: `/session_status`",
  },
  {
    name: "agents_list",
    label: "Agents List",
    emoji: "🤖",
    description:
      "List agent IDs available for targeting with sessions_spawn. Use to discover available agents.",
    usage: "Example: `/agents_list`",
  },
  {
    name: "memory_search",
    label: "Memory Search",
    emoji: "🧠",
    description:
      "Semantically search MEMORY.md and memory files for prior decisions, preferences, and context. Use before answering questions about past work.",
    usage:
      "Provide the search query. Example: `/memory_search what color theme did we pick?`",
  },
  {
    name: "memory_get",
    label: "Memory Get",
    emoji: "📝",
    description:
      "Read a snippet from MEMORY.md or memory files. Use after memory_search to pull specific lines and keep context small.",
    usage:
      "Provide file and line range. Example: `/memory_get MEMORY.md from=10 lines=5`",
  },
  {
    name: "exec",
    label: "Exec",
    emoji: "⚡",
    description:
      "Execute a shell command and return stdout/stderr. Use when you need to run a system command directly.",
    usage:
      "Provide the command to execute. Example: `/exec ls -la`",
  },
];

// ---------------------------------------------------------------------------
// Skill generation
// ---------------------------------------------------------------------------

function skillNameFromToolName(toolName: string): string {
  return `tool-${toolName.replace(/_/g, "-")}`;
}

function generateSkillMd(tool: ToolMeta): string {
  const skillName = skillNameFromToolName(tool.name);
  const lines = [
    "---",
    `name: ${skillName}`,
    `description: "${tool.description}"`,
    `command-dispatch: tool`,
    `command-tool: ${tool.name}`,
    `command-arg-mode: raw`,
    `user-invocable: true`,
    `disable-model-invocation: true`,
    `metadata: { "openclaw": { "emoji": "${tool.emoji}", "always": true } }`,
    "---",
    "",
    `# ${tool.label}`,
    "",
    `Dispatches directly to the \`${tool.name}\` tool (no model inference).`,
    "",
    "## Usage",
    "",
    tool.usage,
    "",
    `Arguments are forwarded as-is to the \`${tool.name}\` tool via raw arg mode.`,
    "",
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printUsage() {
  console.log(`Usage:
  bun scripts/create-tool-skills.ts --out <dir>            Write all tool skills
  bun scripts/create-tool-skills.ts --out <dir> --tools a,b  Write specific tools
  bun scripts/create-tool-skills.ts --list                  List available tools
  bun scripts/create-tool-skills.ts --dry-run               Preview without writing`);
}

function parseArgs(argv: string[]): {
  mode: "write" | "list" | "dry-run" | "help";
  outDir?: string;
  tools?: string[];
} {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    return { mode: "help" };
  }
  if (args.includes("--list")) {
    return { mode: "list" };
  }
  if (args.includes("--dry-run")) {
    const toolsIdx = args.indexOf("--tools");
    const tools =
      toolsIdx >= 0 && args[toolsIdx + 1]
        ? args[toolsIdx + 1]!.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
    return { mode: "dry-run", tools };
  }

  const outIdx = args.indexOf("--out");
  if (outIdx < 0 || !args[outIdx + 1]) {
    return { mode: "help" };
  }
  const outDir = args[outIdx + 1]!;

  const toolsIdx = args.indexOf("--tools");
  const tools =
    toolsIdx >= 0 && args[toolsIdx + 1]
      ? args[toolsIdx + 1]!.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

  return { mode: "write", outDir, tools };
}

function filterTools(tools?: string[]): ToolMeta[] {
  if (!tools || tools.length === 0) {
    return TOOL_REGISTRY;
  }
  const set = new Set(tools.map((t) => t.toLowerCase()));
  const matched = TOOL_REGISTRY.filter((t) => set.has(t.name));
  const found = new Set(matched.map((t) => t.name));
  for (const name of set) {
    if (!found.has(name)) {
      console.warn(`[WARN] Unknown tool: ${name}`);
    }
  }
  return matched;
}

function main() {
  const parsed = parseArgs(process.argv);

  if (parsed.mode === "help") {
    printUsage();
    process.exit(0);
  }

  if (parsed.mode === "list") {
    console.log("Available tools:\n");
    for (const tool of TOOL_REGISTRY) {
      console.log(`  ${tool.emoji}  ${tool.name.padEnd(20)} ${tool.label}`);
    }
    console.log(`\nTotal: ${TOOL_REGISTRY.length} tools`);
    process.exit(0);
  }

  const selected = filterTools(parsed.tools);
  if (selected.length === 0) {
    console.error("[ERROR] No matching tools found.");
    process.exit(1);
  }

  if (parsed.mode === "dry-run") {
    for (const tool of selected) {
      const skillName = skillNameFromToolName(tool.name);
      console.log(`\n${"─".repeat(60)}`);
      console.log(`Skill: ${skillName}/SKILL.md`);
      console.log(`${"─".repeat(60)}`);
      console.log(generateSkillMd(tool));
    }
    console.log(`\n${selected.length} skill(s) would be created.`);
    process.exit(0);
  }

  // mode === "write"
  const outDir = path.resolve(parsed.outDir!);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`[OK] Created output directory: ${outDir}`);
  }

  let created = 0;
  let skipped = 0;
  for (const tool of selected) {
    const skillName = skillNameFromToolName(tool.name);
    const skillDir = path.join(outDir, skillName);
    const skillMdPath = path.join(skillDir, "SKILL.md");

    if (fs.existsSync(skillMdPath)) {
      console.log(`[SKIP] ${skillName}/SKILL.md already exists`);
      skipped++;
      continue;
    }

    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(skillMdPath, generateSkillMd(tool), "utf-8");
    console.log(`[OK] ${skillName}/SKILL.md`);
    created++;
  }

  console.log(
    `\nDone: ${created} created, ${skipped} skipped (${selected.length} total).`,
  );
}

main();
