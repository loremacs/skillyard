#!/usr/bin/env node
/**
 * Merge SkillYard into IDE MCP config (idempotent — only adds/updates mcpServers.skillyard or servers.skillyard).
 *
 * Usage:
 *   node scripts/install-ide-mcp.mjs --ide cursor|windsurf|claude-code|vscode [--url http://localhost:3333/mcp] [--dry-run]
 *
 * Remote (needs Node):
 *   curl -fsSL https://raw.githubusercontent.com/loremacs/skillyard/main/mcp/scripts/install-ide-mcp.mjs -o install-ide-mcp.mjs
 *   node install-ide-mcp.mjs --ide cursor
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
function parseArgs() {
  const out = { ide: null, url: "http://localhost:3333/mcp", dryRun: false, help: false };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--ide" && process.argv[i + 1]) out.ide = process.argv[++i];
    else if (a === "--url" && process.argv[i + 1]) out.url = process.argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
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

function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(`Usage: node install-ide-mcp.mjs --ide cursor|windsurf|claude-code|vscode [--url http://localhost:3333/mcp] [--dry-run]

  vscode  writes ./.vscode/mcp.json under the current working directory (project-scoped).
  others  write under your home directory for that IDE.

SkillYard HTTP server must already be running at the configured URL.`);
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
    console.log(`# would write: ${filePath}\n`);
    console.log(JSON.stringify(merged, null, 2));
    return;
  }

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log(`Wrote ${filePath}`);
  console.log("");
  console.log("Next: restart IDE fully (reload is not enough), then call SkillYard MCP tools (e.g. setup_project).");
  console.log("If the server is local: from repo mcp/ run npm install && npm run build && npm run restart");
}

main();
