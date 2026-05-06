import { readFileSync, existsSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const PID_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "mcp.pid");
const PORT = process.env.PORT ?? "3333";

if (!existsSync(PID_FILE)) {
  // Best-effort fallback: clear anything listening on port (rogue instance)
  try {
    execSync(
      `$pids = (Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue).OwningProcess; if ($pids) { $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }; Write-Host "Cleared port ${PORT}." } else { Write-Host "SkillYard MCP server not running (no mcp.pid, no listener on ${PORT})." }`,
      { shell: "powershell.exe", stdio: "inherit" }
    );
  } catch {
    console.log("SkillYard MCP server is not running (no mcp.pid found).");
  }
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

// Ensure port is actually free (handles PID reuse / mismatched pid file)
try {
  execSync(
    `$pids = (Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue).OwningProcess; if ($pids) { $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }; Write-Host "Cleared port ${PORT}." }`,
    { shell: "powershell.exe", stdio: "inherit" }
  );
} catch {
  // ignore
}
