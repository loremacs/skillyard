# Changelog

All notable changes to SkillYard are recorded here.

Format: `## [version] — YYYY-MM-DD` with sections Added, Changed, Fixed, Removed.

---

## [Unreleased]

### Added

- `mcp/` — TypeScript MCP server over **HTTP (Streamable HTTP)** exposing `list_skills`, `get_skill`, `setup_project`, skill `resources/read` for `skillyard://skills/{name}`, and ZIP downloads at `/skills/<name>/download`; connects Cursor, Windsurf, Claude Code, and other MCP clients via URL-based config
- **Storage layer** — SQLite + FTS5 backend (`mcp/src/storage/`) with `StorageAdapter` interface, `SQLiteAdapter`, `factory.ts`, and `fts.ts`; skills are hash-checked on startup and synced incrementally from disk
- `submit_feedback` MCP tool — structured bug/improvement/documentation/feature-request reporting with auto-linked `contentHash`
- REST endpoints: `GET /health`, `GET /skills`, `GET /skills/:name`; `POST /feedback/test` (dev mode only, guarded by `SKILLYARD_DEV_MODE=true`)
- `mcp/scripts/smoke-test.sh` — end-to-end smoke test against the live REST layer
- `STORAGE_BACKEND`, `SKILLYARD_DB_PATH`, `SKILLYARD_DEV_MODE` environment variables (documented in `mcp/.env.example`)

### Changed

- Documented that `setup_project` returns merge snippets only (no server-side file writes)
- `SECURITY.md` — scope updated for HTTP MCP and ZIP serving
- Hardened skill name validation: `SKILL_FOLDER_RE` moved to `mcp/src/storage/validation.ts`, max 80 chars, dots and case-insensitivity preserved
- `get_skill` response now includes `contentHash`, `folderName`, and `name` fields
- `list_skills` results now include `folderName`, `status`, and `downloadUrl`
- Server version bumped to `0.3.0`
- CI — `npm ci` and `npm run build` for `mcp/` on push/PR
- Root `TODO.md` — maintainer checklist (GitHub About / topics)
- `docs/STANDARDS.md` — added storage layer section and backup guidance
- `docs/CONNECT.md` — tools table updated with `submit_feedback`

---

## [0.1.0] — 2026-05

### Added

- `skill-creator` — skill for authoring, evaluating, and iteratively improving `SKILL.md` files; includes eval scripts, grader/analyzer/comparator agents, and an HTML eval viewer
- `AGENTS.md` — project-level agent instructions (be concise, single source of truth, skill file conventions, development workflow)
- Root `LICENSE` (Apache 2.0)
- `CONTRIBUTING.md`
- `SECURITY.md`
- `.github/` — issue templates (bug, feature request, skill submission), PR template, CODEOWNERS, CI workflow
