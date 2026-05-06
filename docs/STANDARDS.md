# Standards & Dependencies

Single source of truth for external specifications and content sources this project follows.

When a standard ships a breaking change or a sourced dependency updates, update this file first, then review the impact areas listed for each entry.

---

## Model Context Protocol (MCP)

| Field | Value |
|---|---|
| Spec version | `2025-11-25` |
| URL | https://modelcontextprotocol.io/specification/2025-11-25 |
| SDK | `@modelcontextprotocol/sdk` — pinned to `latest` in `mcp/package.json`; lock file pins the resolved version |

**What we use:** Streamable HTTP transport, Tools (with `registerTool`), Resources (with `ResourceTemplate`), server-level `instructions` in `ServerOptions`.

**Impact areas:** `mcp/src/index.ts`, `docs/CONNECT.md`, `docs/SETUP.md`

**On upgrade:** Check for new primitives (Prompts, Elicitation, Tasks), transport changes, and capability negotiation changes. Update the SDK package, rebuild, and re-audit `index.ts` against the new spec version. Update this file with the new spec version date.

---

## Agent Skills Format

| Field | Value |
|---|---|
| Standard | Agent Skills (open format, Anthropic-originated) |
| URL | https://agentskills.io/home |
| Spec | https://agentskills.io/specification |

**What we use:** `SKILL.md` frontmatter schema (`name`, `description` required), folder layout (`.agents/skills/<name>/`), and the progressive disclosure model (discovery → activation → execution).

**Impact areas:** All `.agents/skills/` content, `mcp/src/skills/repository.ts` (`parseFrontmatter`, `syncSkillsFromDisk`), `mcp/src/storage/validation.ts` (`SKILL_FOLDER_RE`), server `instructions` install steps

**On upgrade:** If new required or recommended frontmatter fields are added to the spec, update `parseFrontmatter` in `repository.ts` and the `SKILL.md` template. If the folder convention changes, update the server's `SKILLS_DIR` logic and install instructions.

---

## skill-creator (sourced from anthropics/skills)

| Field | Value |
|---|---|
| Source repo | https://github.com/anthropics/skills |
| Source path | `skills/skill-creator/` |
| Source version | No release tags on the upstream repo — sourced May 2026; maintained independently in this repo |
| Local path | `.agents/skills/skill-creator/SKILL.md` |

**What we use:** The upstream `SKILL.md` was used as the baseline. Our copy has been adapted and may diverge intentionally.

**On upgrade:** Compare the upstream `skill-creator/SKILL.md` against our local copy. Apply relevant improvements but preserve any SkillYard-specific adaptations. There is no version tag upstream — check by commit date.

---

## AGENTS.md Convention

| Field | Value |
|---|---|
| Reference | https://agentsmd.io/agents-md-best-practices |
| Canonical file | `AGENTS.md` (root) |

**What we use:** Concise dos/don'ts, single source of truth, file-scoped guidance, no duplication.

**On upgrade:** Conventions are community-driven and informal. Review periodically for new patterns; update `AGENTS.md` if a better practice applies.

---

## Storage Layer

| Field | Value |
|---|---|
| Library | `better-sqlite3` (synchronous SQLite bindings for Node.js) |
| Extension | FTS5 (full-text search, bundled with SQLite) |
| Schema file | assembled inline in `mcp/src/storage/sqlite.ts` as `SCHEMA_SQL` |
| DB path | `SKILLYARD_DB_PATH` env var, default `./skillyard.db` (relative to cwd) |

**Impact areas:** `mcp/src/storage/`, `mcp/src/skills/repository.ts`, `mcp/.env.example`

**Backup guidance:** The SQLite database is a cache — all source-of-truth data lives in `.agents/skills/` SKILL.md files. The DB is fully reconstructable by deleting it and restarting the server (which re-runs `syncSkillsFromDisk`). For the `feedback` table, back up `skillyard.db` before wiping if feedback data must be preserved.

**On upgrade:** If `better-sqlite3` ships a new major version, check for Node.js N-API compatibility and rebuilt prebuilt binary availability. Schema migrations are tracked in the `schema_migrations` table — add a new migration version rather than altering `SCHEMA_SQL` directly.

---

## GitHub language statistics

The repository is **polyglot by design**: the SkillYard **product runtime** is Node.js / TypeScript in `mcp/`. **Skills** under `.agents/skills/` are portable bundles that may include Python, shell, or other languages (whatever authors ship); those are **payloads**, not the MCP server.

**What we do:** `.gitattributes` marks `.agents/skills/**` as `linguist-vendored` so [GitHub Linguist](https://github.com/github/linguist) excludes skill bundles from the language bar. The bar then highlights the **maintained runtime** (`mcp/`), not “Python because one skill ships scripts.” That is not claiming the repo is “Node only” — it is “Node-first for the server; skills may be multi-language.”

**Impact areas:** `.gitattributes`

**On change:** If you add a large non-runtime directory that skews language stats, extend `.gitattributes` using Linguist’s documented overrides.
