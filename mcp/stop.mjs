import { readFileSync, existsSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const PID_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "mcp.pid");

if (!existsSync(PID_FILE)) {
  console.log("SkillYard MCP server is not running (no mcp.pid found).");
  process.exit(0);
}

const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);

try {
  process.kill(pid, "SIGTERM");
  unlinkSync(PID_FILE);
  console.log(`SkillYard MCP server stopped (PID ${pid}).`);
} catch {
  console.log(`Process ${pid} not found — removing stale mcp.pid.`);
  unlinkSync(PID_FILE);
}
