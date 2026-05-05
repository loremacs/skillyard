# Changelog

All notable changes to SkillYard are recorded here.

Format: `## [version] — YYYY-MM-DD` with sections Added, Changed, Fixed, Removed.

---

## [Unreleased]

### Added

- `mcp/` — TypeScript MCP server exposing `list_skills` and `get_skill` tools; connects Cursor, Windsurf, and any MCP-compatible agent to the skill library via stdio

### Changed

### Fixed

### Removed

---

## [0.1.0] — 2026-05-04

### Added

- `skill-creator` — skill for authoring, evaluating, and iteratively improving `SKILL.md` files; includes eval scripts, grader/analyzer/comparator agents, and an HTML eval viewer
- `AGENTS.md` — project-level agent instructions (be concise, single source of truth, skill file conventions, development workflow)
- Root `LICENSE` (Apache 2.0)
- `CONTRIBUTING.md`
- `SECURITY.md`
- `.github/` — issue templates (bug, feature request, skill submission), PR template, CODEOWNERS, CI workflow
