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

## SQLite index & feedback (`mcp/`)

The MCP server keeps **`SKILLYARD_DB_PATH`** (default `./skillyard.db` under `mcp/`): **skills** rows are a disposable cache synced from disk; **feedback** rows are intended to be durable.

### Backing up feedback

Before replacing or deleting the DB file, back it up (includes feedback):

```bash
sqlite3 skillyard.db ".backup skillyard.backup.db"
```

The **skills** table can be rebuilt from `SKILLYARD_DIR` on the next startup; **feedback** should not be dropped casually.

**Impact areas:** `mcp/src/storage/sqlite.ts`, `docs/SETUP.md`, `mcp/.env.example`

---

## Agent Skills Format

| Field | Value |
|---|---|
| Standard | Agent Skills (open format, Anthropic-originated) |
| URL | https://agentskills.io/home |
| Spec | https://agentskills.io/specification |

**What we use:** `SKILL.md` frontmatter schema (`name`, `description` required), folder layout (`.agents/skills/<name>/`), and the progressive disclosure model (discovery → activation → execution).

**Impact areas:** All `.agents/skills/` content, `mcp/src/skills/repository.ts` (YAML frontmatter for sync), server `instructions` install steps

**On upgrade:** If new required or recommended frontmatter fields are added to the spec, update sync parsing in `repository.ts` and the `SKILL.md` template. If the folder convention changes, update `SKILLS_DIR` / validation in `mcp/src/storage/validation.ts` and install instructions.

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

## GitHub language statistics

The repository is **polyglot by design**: the SkillYard **product runtime** is Node.js / TypeScript in `mcp/`. **Skills** under `.agents/skills/` are portable bundles that may include Python, shell, or other languages (whatever authors ship); those are **payloads**, not the MCP server.

**What we do:** `.gitattributes` marks `.agents/skills/**` as `linguist-vendored` so [GitHub Linguist](https://github.com/github/linguist) excludes skill bundles from the language bar. The bar then highlights the **maintained runtime** (`mcp/`), not “Python because one skill ships scripts.” That is not claiming the repo is “Node only” — it is “Node-first for the server; skills may be multi-language.”

**Impact areas:** `.gitattributes`

**On change:** If you add a large non-runtime directory that skews language stats, extend `.gitattributes` using Linguist’s documented overrides.
