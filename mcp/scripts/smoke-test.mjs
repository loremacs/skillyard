#!/usr/bin/env node
/**
 * REST smoke test (Windows-friendly). Run from repo root: node mcp/scripts/smoke-test.mjs
 * Or: cd mcp && node scripts/smoke-test.mjs
 */
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = path.resolve(__dirname, "..");
const REPO_SKILLS = path.resolve(MCP_ROOT, "../.agents/skills");
const PORT = process.env.SMOKE_PORT ?? "3340";
const BASE = `http://127.0.0.1:${PORT}`;
const DB = path.join(os.tmpdir(), `skillyard-smoke-${Date.now()}.db`);

function httpReq(method, pathname, bodyObj) {
  return new Promise((resolve, reject) => {
    const u = new URL(pathname, BASE);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: Number(PORT),
        path: u.pathname + u.search,
        method,
        headers: bodyObj ? { "Content-Type": "application/json" } : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            /* ignore */
          }
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      }
    );
    req.on("error", reject);
    if (bodyObj) req.write(JSON.stringify(bodyObj));
    req.end();
  });
}

/** GET download; abort after headers so we do not buffer the whole ZIP. */
function getDownloadHeaders(pathname) {
  return new Promise((resolve, reject) => {
    const u = new URL(pathname, BASE);
    const req = http.get(
      { hostname: "127.0.0.1", port: Number(PORT), path: u.pathname + u.search },
      (res) => {
        const headers = { ...res.headers };
        res.destroy();
        resolve({ status: res.statusCode, headers });
      }
    );
    req.on("error", reject);
  });
}

async function waitForHealth(maxMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const r = await httpReq("GET", "/health");
      if (r.status === 200 && r.json?.status === "ok") return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("server did not become healthy in time");
}

let child = null;
let pass = 0;
let fail = 0;

function check(name, ok) {
  if (ok) {
    console.log(`PASS: ${name}`);
    pass++;
  } else {
    console.log(`FAIL: ${name}`);
    fail++;
  }
}

async function main() {
  for (const f of [`${DB}`, `${DB}-shm`, `${DB}-wal`]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }

  if (!fs.existsSync(REPO_SKILLS)) {
    console.error("Missing skills dir:", REPO_SKILLS);
    process.exit(1);
  }

  child = spawn("node", ["dist/index.js"], {
    cwd: MCP_ROOT,
    env: {
      ...process.env,
      PORT,
      BASE_URL: BASE,
      SKILLYARD_DIR: REPO_SKILLS,
      SKILLYARD_DB_PATH: DB,
      SKILLYARD_DEV_MODE: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (d) => process.stdout.write(d));
  child.stderr?.on("data", (d) => process.stderr.write(d));

  await waitForHealth();

  const h = await httpReq("GET", "/health");
  check("GET /health status ok", h.json?.status === "ok");
  check("GET /health skillCount >= 0", typeof h.json?.skillCount === "number" && h.json.skillCount >= 0);

  const list = await httpReq("GET", "/skills");
  check("GET /skills returns array", Array.isArray(list.json));
  const skillCount = Array.isArray(list.json) ? list.json.length : 0;

  if (skillCount > 0) {
    const first = list.json[0].folderName;
    const one = await httpReq("GET", `/skills/${encodeURIComponent(first)}`);
    check("GET /skills/:name folderName", one.json?.folderName === first);
    check("GET /skills/:name contentHash", one.json?.contentHash != null && one.json.contentHash !== "null");

    const dl = await getDownloadHeaders(`/skills/${encodeURIComponent(first)}/download`);
    const ct = dl.headers["content-type"] ?? "";
    check("GET /skills/:name/download content-type zip", dl.status === 200 && String(ct).includes("application/zip"));
  } else {
    console.log("SKIP: no skills in index");
  }

  const fts1 = await httpReq("GET", "/skills?q=gpt-4o");
  check("GET /skills?q=gpt-4o", fts1.status === 200);
  const fts2 = await httpReq("GET", "/skills?q=node.js");
  check("GET /skills?q=node.js", fts2.status === 200);

  const fb = await httpReq("POST", "/feedback/test", {
    category: "bug",
    severity: "low",
    title: "smoke test",
    description: "automated smoke test entry",
  });
  check("POST /feedback/test feedback_id", fb.json?.feedback_id > 0);

  const badPath = await httpReq("GET", "/skills/..%2Fetc");
  check("GET /skills/../etc returns 400", badPath.status === 400);

  const badFb = await httpReq("POST", "/feedback/test", {});
  check("POST /feedback/test empty body 400", badFb.status === 400);

  console.log("");
  console.log(`Results: ${pass} passed, ${fail} failed`);
  return fail;
}

main()
  .then((fail) => {
    if (child?.pid) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    for (const f of [`${DB}`, `${DB}-shm`, `${DB}-wal`]) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    process.exit(fail > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    if (child?.pid) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    process.exit(1);
  });
