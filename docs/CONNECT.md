# Connecting to SkillYard

Add one JSON entry to your **MCP client** config (Windsurf, Cursor, VS Code, Claude Code, …), **fully restart** that client, then use SkillYard tools (`list_skills`, `setup_project`, …). Common pattern: **operator** runs the SkillYard **server** on one machine; **other machines** point their IDE at `http://<host>:3333/mcp` (or HTTPS) — replace the host with wherever the server listens.

---

## Protocol & client references

- **[Model Context Protocol](https://modelcontextprotocol.io/)** — overview.
- **[MCP specification](https://modelcontextprotocol.io/specification/latest)** — including HTTP-based servers.
- **[MCP clients](https://modelcontextprotocol.io/clients)** — which apps support MCP.
- **[Cursor — Model Context Protocol](https://docs.cursor.com/context/model-context-protocol)** — Cursor client configuration.
- **[VS Code — Add and manage MCP servers](https://code.visualstudio.com/docs/copilot/chat/mcp-servers)** — workspace / user `mcp.json`.

Windsurf: use the **`mcp_config.json`** paths in the [Windsurf](#windsurf) section; Command Palette **“Windsurf: Configure MCP Servers”** opens the file when available.

---

## Prerequisites

A SkillYard server must be **running and reachable from the IDE’s machine** (not only from the server host). Get the URL from whoever operates your instance.

For local development on the **same** machine, the default is `http://localhost:3333/mcp`.

---

## Recommended: paste JSON (universal — no script, no curl)

1. Replace `http://your-server:3333/mcp` in the snippets below with your real URL (e.g. LAN IP if the server runs on another PC).
2. Open the config file for **your** IDE (paths in each section).
3. **Merge** the `skillyard` entry into `mcpServers` (or `servers` for VS Code) — do **not** replace the whole file if you already have other MCP servers.

---

## Optional: Node merge script (`install-ide-mcp.mjs`)

Same merge as hand-pasting; use for automation or when you prefer not to edit JSON.

**Why people use `curl …mjs` + `node`:** plain `curl` cannot merge into existing JSON files. The script is a tiny helper; if you dislike downloading it, **paste JSON** from the sections above instead.

**After clone** (from `mcp/`):

```bash
npm run install-ide-mcp -- --ide windsurf
# or: cursor | claude-code | vscode
# optional: --url http://<skillYard-host>:3333/mcp
```

**Without clone** (needs Node on `PATH`):

```bash
curl -fsSL https://raw.githubusercontent.com/loremacs/skillyard/main/mcp/scripts/install-ide-mcp.mjs -o install-ide-mcp.mjs \
  && node install-ide-mcp.mjs --ide windsurf --url http://<skillYard-host>:3333/mcp
```

- **`vscode`** writes `./.vscode/mcp.json` in the **current working directory**. Other IDEs update the **user** config paths below.
- Does **not** start the SkillYard server. Runs **`GET /health`** on the MCP origin unless **`--skip-probe`**, and warns if unreachable.
- **[SETUP.md](./SETUP.md)** — run the server locally or via Docker.

---

## Cursor

File: `~/.cursor/mcp.json` (macOS/Linux) or `%USERPROFILE%\.cursor\mcp.json` (Windows)

```json
{
  "mcpServers": {
    "skillyard": {
      "url": "http://your-server:3333/mcp"
    }
  }
}
```

If the file already exists, merge the `"skillyard"` key into the existing `"mcpServers"` object — do not replace the file.

**Where it shows in Cursor:** servers defined in `mcp.json` are **custom HTTP MCP** — they are **not** listed under **MCP Marketplace**. After a **full quit and restart**, open **Settings → Features → Model Context Protocol** to see `skillyard`, and **Output → MCP Logs** if the connection fails. The server URL must be reachable (e.g. local SkillYard on port 3333).

---

## Windsurf

File: `~/.codeium/windsurf/mcp_config.json` (macOS/Linux) or `%USERPROFILE%\.codeium\windsurf\mcp_config.json` (Windows)

```json
{
  "mcpServers": {
    "skillyard": {
      "url": "http://your-server:3333/mcp"
    }
  }
}
```

**After restart:** tools from `skillyard` appear in **Cascade** when the URL is reachable. If the server runs on another PC, use that host in `url`, not `localhost`, unless you use remote port forwarding.

---

## Claude Code

File: `.mcp.json` in your project root (project-scoped) or `~/.claude/mcp.json` (global)

```json
{
  "mcpServers": {
    "skillyard": {
      "url": "http://your-server:3333/mcp"
    }
  }
}
```

---

## VS Code / GitHub Copilot

File: `.vscode/mcp.json` in your project root

```json
{
  "servers": {
    "skillyard": {
      "type": "http",
      "url": "http://your-server:3333/mcp"
    }
  }
}
```

---

## After connecting

1. Restart your IDE fully — a reload is not enough.
2. Verify the connection by asking your agent to call `list_skills`.
3. Ask your agent to call **`setup_project(ide)`** and merge the returned **`agents_md.section`** into the project’s `AGENTS.md` (exact text; do not paraphrase). The server does not write files.

### If `list_skills` already works

Your IDE MCP entry is already correct. **`setup_project`** is still the right source for the canonical **`AGENTS.md`** block and for **`zip_extract`** rules. Do not tell the user to “add MCP next” as a blocking step for *this* session — treat the MCP JSON in the response as optional reference (other machines, teammates, second IDE).

### Skill ZIP extract (avoid double folder)

Skill ZIPs include a top-level folder (e.g. `skill-creator/`). Extract into **`.agents/skills/`** only:

| Shell | Correct |
|--------|---------|
| PowerShell | `Expand-Archive skill.zip -DestinationPath .agents/skills` |
| bash | `unzip -o skill.zip -d .agents/skills` |

**Wrong:** `-DestinationPath .agents/skills/skill-creator` or `unzip -d .agents/skills/skill-creator` when the archive already contains `skill-creator/` — you get **`.agents/skills/skill-creator/skill-creator/SKILL.md`** (double nest).

Create the directory first if needed: PowerShell `New-Item -ItemType Directory -Force .agents/skills` · bash `mkdir -p .agents/skills`.

### Test runs and feedback (e.g. tester in Windsurf, triage in another IDE)

- Call **`get_skillyard_test_guide`** once — markdown on full E2E checklist, smoke script (REST-only), ZIP install path, **`test_session_id`** (reuse per run; **`list_feedback`** + session filters for current vs archived rows), and **title prefixes** (`[e2e-windsurf]`, `[test-run]`) for **`submit_feedback`**.
- After a run, the tester agent calls **`submit_feedback`** (same **`test_session_id`** for every update in one run); a maintainer in **another** MCP client uses **`list_feedback`** with the **same SkillYard server URL** so both hit the **same SQLite file** (nothing syncs unless both point at the **same** SkillYard host). Use **`list_feedback(test_session_id)`** with default **`include_archived_session_rows: false`** for the **current** capstone; set **`include_archived_session_rows: true`** for full session history.
- For a human handoff, paste **`feedback_id`** into chat or a GitHub Issue.

---

## Available tools

| Tool | What it does |
|---|---|
| `list_skills(query?)` | Lists skills from the index; optional `query` uses FTS5. Each row has **folderName** (stable id), **name** (display label), **description**, **status**, **downloadUrl** — pass **folderName** to `get_skill`. |
| `get_skill(name)` | Full `SKILL.md` **content**, **contentHash**, **files** (manifest), **downloadUrl**. `name` must be **folderName** from `list_skills`. |
| `setup_project(ide)` | Returns JSON snippets to merge into IDE MCP config and `AGENTS.md` (server does not write files). |
| `submit_feedback(...)` | Stores feedback (bug, improvement, documentation, feature_request); optional **`test_session_id`** chains updates (prior row archived, newest **latest**); server links **skill_content_hash** when **skill_name** matches an indexed skill. |
| `list_feedback(...)` | Recent feedback (newest first); **`title_starts_with`**, **`skill_name`**, **`test_session_id`**; with **`test_session_id`**, default is **latest capstone only** — set **`include_archived_session_rows: true`** for full session history. |
| `get_skillyard_test_guide()` | Read-only: how to test, smoke script, and how feedback is shared across IDEs on the same server. |

The server also injects a usage guide automatically into every agent session via the MCP `instructions` field — agents know how to use SkillYard as soon as they connect, no extra tool call needed.

### HTTP endpoints (operators / smoke tests)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | `{ status, skillCount, uptime }` |
| `GET` | `/skills?q=…` | JSON array of skills (optional `q` for FTS search) |
| `GET` | `/skills/:folderName` | Metadata only (no full `content` — use `get_skill` MCP tool) |
| `GET` | `/skills/:folderName/download` | ZIP of the skill directory |

`POST /feedback/test` exists only when **`SKILLYARD_DEV_MODE=true`** (for smoke tests); optional JSON **`test_session_id`** (same rules as MCP). Returns `404` otherwise. Do not enable in production.
