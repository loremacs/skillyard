# Changelog

All notable changes to SkillYard are recorded here.

Format: `## [version] — YYYY-MM-DD` with sections Added, Changed, Fixed, Removed.

---

## [Unreleased]

### Added

- `mcp/` — TypeScript MCP server over **HTTP (Streamable HTTP)** exposing `list_skills`, `get_skill`, `setup_project`, skill `resources/read` for `skillyard://skills/{name}`, and ZIP downloads at `/skills/<name>/download`; connects Cursor, Windsurf, Claude Code, and other MCP clients via URL-based config

### Changed

- Documented that `setup_project` returns merge snippets only (no server-side file writes)
- `SECURITY.md` — scope updated for HTTP MCP and ZIP serving
- Hardened skill name validation and path containment for `get_skill`, Resources, and ZIP download
- CI — `npm ci` and `npm run build` for `mcp/` on push/PR
- Root `TODO.md` — maintainer checklist (GitHub About / topics)

---

### Added

- `skill-creator` — skill for authoring, evaluating, and iteratively improving `SKILL.md` files; includes eval scripts, grader/analyzer/comparator agents, and an HTML eval viewer
- `AGENTS.md` — project-level agent instructions (be concise, single source of truth, skill file conventions, development workflow)
- Root `LICENSE` (Apache 2.0)
- `CONTRIBUTING.md`
- `SECURITY.md`
- `.github/` — issue templates (bug, feature request, skill submission), PR template, CODEOWNERS, CI workflow
