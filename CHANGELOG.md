# Changelog

All notable changes to SkillYard are recorded here.

Format: `## [version] — YYYY-MM-DD` with sections Added, Changed, Fixed, Removed.

---

## [Unreleased]

### Added

- **`mcp/scripts/install-ide-mcp.mjs`** + **`npm run install-ide-mcp`**: merge `skillyard` into Cursor / Windsurf / Claude Code (user home) or VS Code (`.vscode/mcp.json` in cwd); documented curl + node one-liner on GitHub raw in **README** / **CONNECT**
- MCP / REST feedback: **`test_session_id`** on **`submit_feedback`** and **`POST /feedback/test`**; per-session **latest** vs **archived** rows so **`list_feedback`** can return the current capstone or full session history (**`include_archived_session_rows`**); SQLite migration v2 for `feedback.test_session_id` / `feedback.report_state`
- `mcp/` — TypeScript MCP server over **HTTP (Streamable HTTP)** exposing `list_skills`, `get_skill`, `setup_project`, skill `resources/read` for `skillyard://skills/{name}`, and ZIP downloads at `/skills/<name>/download`; connects Cursor, Windsurf, Claude Code, and other MCP clients via URL-based config
- SQLite storage (`better-sqlite3`): skills table + FTS5 search + feedback table; disk→DB sync on startup; `STORAGE_BACKEND` / `SKILLYARD_DB_PATH` in `mcp/.env.example`
- Docker Compose named volume for `/data/skillyard.db` persistence

### Changed

- MCP **`instructions`**, **`get_skill`** (install + **`zip_extract_antipattern`**), and **`setup_project`** JSON (**`zip_extract`**, clearer **`steps`**, **`agents_md`** wording): correct ZIP extract root (`.agents/skills/`), anti–double-folder guidance, **`setup_project` before hand-written AGENTS**, and “if **`list_skills`** works, MCP is already wired” so agents do not mis-order steps; **`docs/CONNECT.md`**, **`get_skillyard_test_guide`**, **`README.md`** aligned
- Documented that `setup_project` returns merge snippets only (no server-side file writes)
- `SECURITY.md` — scope updated for HTTP MCP and ZIP serving
- Hardened skill name validation and path containment for `get_skill`, Resources, and ZIP download
- CI — `npm ci` and `npm run build` for `mcp/` on push/PR
- Root `TODO.md` — maintainer checklist (GitHub About / topics)
- `list_skills` / resource listing use SQLite FTS; `get_skill` / resources read `SKILL.md` from DB when indexed
- Alpine `Dockerfile` installs build deps for `better-sqlite3`
- MCP: `list_skills` / `get_skill` response shapes (**folderName**, **contentHash**, **files**, etc.); **`submit_feedback`** tool
- REST: `GET /health`, `GET /skills`, `GET /skills/:name`, dev-only `POST /feedback/test` when `SKILLYARD_DEV_MODE=true`
- `docs/CONNECT.md`, `docs/STANDARDS.md` (SQLite backup), `mcp/.env.example` (`SKILLYARD_DEV_MODE`)
- MCP: **`get_skillyard_test_guide`** (test + feedback workflow), **`list_feedback`** (triage); **`submit_feedback`** description/context limits raised for test reports

---

## [0.1.0] — 2026-05-04

### Added

- `skill-creator` — skill for authoring, evaluating, and iteratively improving `SKILL.md` files; includes eval scripts, grader/analyzer/comparator agents, and an HTML eval viewer
- `AGENTS.md` — project-level agent instructions (be concise, single source of truth, skill file conventions, development workflow)
- Root `LICENSE` (Apache 2.0)
- `CONTRIBUTING.md`
- `SECURITY.md`
- `.github/` — issue templates (bug, feature request, skill submission), PR template, CODEOWNERS, CI workflow
