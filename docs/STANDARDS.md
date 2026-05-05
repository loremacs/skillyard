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

**Impact areas:** All `.agents/skills/` content, `mcp/src/index.ts` (`parseFrontmatter`, `listSkillDirs`), server `instructions` install steps

**On upgrade:** If new required or recommended frontmatter fields are added to the spec, update `parseFrontmatter` in `index.ts` and the `SKILL.md` template. If the folder convention changes, update the server's `SKILLS_DIR` logic and install instructions.

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
