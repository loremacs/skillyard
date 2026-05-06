import { readFileSync, existsSync, unlinkSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync, spawn } from "child_process";

const __dir = dirname(fileURLToPath(import.meta.url));
const PID_FILE = resolve(__dir, "mcp.pid");
const PORT = process.env.PORT ?? "3333";

// 1. Stop — kill by PID file first, then fall back to killing by port

if (existsSync(PID_FILE)) {
  const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
  try {
    process.kill(pid, "SIGTERM");
    console.log(`Stopped server (PID ${pid}).`);
  } catch {
    console.log(`PID ${pid} already gone.`);
  }
  unlinkSync(PID_FILE);
}

// Kill anything still holding the port (handles stale/mismatched PIDs)
try {
  execSync(
    `$pids = (Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue).OwningProcess; if ($pids) { $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }; Write-Host "Cleared port ${PORT}." }`,
    { shell: "powershell.exe", stdio: "inherit" }
  );
} catch {
  // Nothing on the port — that's fine
}

// 2. Build
console.log("\nBuilding...");
try {
  execSync("npm run build", { cwd: __dir, stdio: "inherit" });
} catch {
  console.error("Build failed — server not started.");
  process.exit(1);
}

// 3. Start (detached so this script can exit)
console.log("\nStarting server...");
const child = spawn("node", ["--env-file=.env", "dist/index.js"], {
  cwd: __dir,
  detached: true,
  stdio: "ignore",
});
child.unref();
try {
  // record PID for stop.mjs (best-effort; port clearing remains fallback)
  writeFileSync(PID_FILE, `${child.pid}\n`, "utf-8");
} catch {
  // ignore
}
console.log(`SkillYard MCP running at http://localhost:${PORT}/mcp`);
console.log(`Download: http://localhost:${PORT}/skills/<name>/download`);
