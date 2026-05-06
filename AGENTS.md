# AGENTS.md

SkillYard is a TypeScript MCP server (`mcp/src/index.ts`) that serves Agent Skills (`.agents/skills/<name>/SKILL.md`) to IDE agents via three tools: `list_skills`, `get_skill`, `setup_project`.

## Be Concise
State only what cannot be inferred. Verbose guidance is a defect.

## Standards
External specs and sourced dependencies are tracked in [`docs/STANDARDS.md`](./docs/STANDARDS.md). Check it before modifying anything tied to MCP, the Agent Skills format, or the `skill-creator` baseline.

## Single Source of Truth
Maintain one canonical source for each reusable item, including code, config, schemas, rules, skills, and shared documentation.

Reference, import, or generate from the canonical source instead of duplicating content. Before adding anything new, search the repo for an existing source that can be reused or extended.

If duplication is required for tooling compatibility, clearly mark which source is canonical and ensure all other copies are generated or synced from it.

## Skill Files
Skills live in `.agents/skills/<name>/SKILL.md`. When creating or modifying any skill, use the `skill-creator` skill.

## MCP Server
The server is a single file: `mcp/src/index.ts`. From `mcp/`: `npm run restart` to rebuild and restart, `npm stop` to shut down. See `docs/SETUP.md` for deployment and `docs/CONNECT.md` for user onboarding.

After restarting the server, **both Cursor and Windsurf require a full IDE restart** to pick up the new MCP tool list — a refresh/reload is not enough.

## Development Workflow
Every feature addition, bug fix, or breaking change must:
1. Be tracked as a GitHub Issue before work begins.
2. Land via a PR — no direct commits to `main`.
3. Include a `CHANGELOG.md` entry under an `## [Unreleased]` section using the format already established in that file (Added / Changed / Fixed / Removed).
4. Bump the version in `CHANGELOG.md` when the PR is a release: move `[Unreleased]` to `## [x.y.z] — YYYY-MM-DD` following [semver](https://semver.org) (patch = fix, minor = feature, major = breaking change). After merge, create a git tag `vx.y.z` and a matching GitHub Release.

Boundaries: code/commits/PRs written normal.
