#!/usr/bin/env node
/**
 * Merge SkillYard into IDE MCP config (idempotent — only adds/updates mcpServers.skillyard or servers.skillyard).
 *
 * Usage:
 *   node scripts/install-ide-mcp.mjs --ide cursor|windsurf|claude-code|vscode [--url http://localhost:3333/mcp] [--dry-run] [--skip-probe]
 *
 * Optional: download this file and run with Node if you want automated merge instead of pasting JSON from docs/CONNECT.md.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
function parseArgs() {
  const out = { ide: null, url: "http://localhost:3333/mcp", dryRun: false, help: false, skipProbe: false };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--ide" && process.argv[i + 1]) out.ide = process.argv[++i];
    else if (a === "--url" && process.argv[i + 1]) out.url = process.argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--skip-probe") out.skipProbe = true;
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}

/** Ensure URL ends with /mcp (no trailing slash after). */
function normalizeMcpUrl(u) {
  let s = String(u).trim().replace(/\/+$/, "");
  if (!s.endsWith("/mcp")) {
    s = `${s}/mcp`;
  }
  return s;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    throw new Error(`Invalid JSON: ${filePath}`);
  }
}

function mergeCursorLike(filePath, url) {
  const root = readJson(filePath);
  if (!root.mcpServers) root.mcpServers = {};
  root.mcpServers.skillyard = { url };
  return root;
}

function mergeVsCode(filePath, url) {
  const root = readJson(filePath);
  if (!root.servers) root.servers = {};
  root.servers.skillyard = { type: "http", url };
  return root;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** GET /health on same origin as MCP URL (SkillYard exposes this). */
async function probeSkillYardHealth(mcpUrl) {
  try {
    const origin = new URL(mcpUrl).origin;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${origin}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/** IDE-specific UI hints (only for the --ide you passed). */
const AFTER_INSTALL_UI = {
  cursor: [
    "(Cursor) Custom HTTP MCP from ~/.cursor/mcp.json is not the same screen as MCP Marketplace.",
    "(Cursor) Settings → Features → Model Context Protocol; Output → MCP Logs if connection fails.",
  ],
  windsurf: [
    "(Windsurf) Edit ~/.codeium/windsurf/mcp_config.json or Command Palette: \"Windsurf: Configure MCP Servers\".",
    "(Windsurf) Fully quit Windsurf; MCP tools show in Cascade after restart. Server URL must be reachable from this machine.",
  ],
  vscode: [
    "(VS Code) Workspace file: .vscode/mcp.json — see https://code.visualstudio.com/docs/copilot/chat/mcp-servers",
  ],
  "claude-code": [
    "(Claude Code) ~/.claude/mcp.json or project .mcp.json — see Anthropic Claude Code docs for MCP.",
  ],
};

function printPostInstall(ide, mcpUrl) {
  const origin = new URL(mcpUrl).origin;
  console.log("");
  console.log("What this script did:");
  console.log("  • Merged the skillyard entry into this IDE's MCP config file only.");
  console.log("  • It did NOT start the SkillYard server or modify your project repo files.");
  console.log("");
  console.log("What you still need:");
  console.log(`  • SkillYard HTTP server reachable at ${origin} (host may be another machine — use its URL in --url).`);
  console.log(`  • Operator start (local example): clone repo, cd mcp, npm install && npm run build && npm run restart`);
  console.log("  • Fully quit and reopen this IDE so it reloads MCP config.");
  const ui = AFTER_INSTALL_UI[ide];
  if (ui?.length) {
    console.log("");
    for (const line of ui) console.log(`  ${line}`);
  }
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(`Usage: node install-ide-mcp.mjs --ide cursor|windsurf|claude-code|vscode [--url http://localhost:3333/mcp] [--dry-run] [--skip-probe]

  vscode     writes ./.vscode/mcp.json under the current working directory (project-scoped).
  others     write under your home directory for that IDE.
  --skip-probe   skip GET /health check after writing (for offline or CI).

Prefer manual JSON merge: see SkillYard docs/CONNECT.md (no download). This optional script only merges JSON; it does not start SkillYard.`);
    process.exit(0);
  }
  if (!args.ide) {
    console.error("Missing --ide (use --help)");
    process.exit(1);
  }

  const url = normalizeMcpUrl(args.url);
  const home = os.homedir();
  let filePath;
  let merged;

  switch (args.ide) {
    case "cursor":
      filePath = path.join(home, ".cursor", "mcp.json");
      merged = mergeCursorLike(filePath, url);
      break;
    case "windsurf":
      filePath = path.join(home, ".codeium", "windsurf", "mcp_config.json");
      merged = mergeCursorLike(filePath, url);
      break;
    case "claude-code":
      filePath = path.join(home, ".claude", "mcp.json");
      merged = mergeCursorLike(filePath, url);
      break;
    case "vscode":
      filePath = path.join(process.cwd(), ".vscode", "mcp.json");
      merged = mergeVsCode(filePath, url);
      break;
    default:
      console.error(`Unknown --ide: ${args.ide} (cursor | windsurf | claude-code | vscode)`);
      process.exit(1);
  }

  if (args.dryRun) {
    console.log(`# would write: ${path.resolve(filePath)}\n`);
    console.log(JSON.stringify(merged, null, 2));
    return;
  }

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.resolve(filePath)}`);
  printPostInstall(args.ide, url);

  if (!args.skipProbe) {
    const ok = await probeSkillYardHealth(url);
    console.log("");
    if (ok) {
      console.log(`Health check OK: ${new URL(url).origin}/health — server appears to be running.`);
    } else {
      console.log(`WARNING: ${new URL(url).origin}/health did not respond OK.`);
      console.log("The IDE will not load skillyard MCP until that server is reachable. Start it (see above) then restart the IDE.");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
