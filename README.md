# SkillYard

A hosted MCP server that delivers reusable agent skills on demand. Any AI coding agent connects once and can discover, search, and install structured workflows without manual configuration.

---

## How it works

Skills are `SKILL.md` files stored in `.agents/skills/`. Bundles may include scripts or assets in any language (for example Python under `skill-creator/`). The SkillYard **server** is TypeScript in `mcp/` and exposes skills over HTTP (Streamable HTTP MCP). Agents in any IDE (Cursor, Windsurf, Claude Code, Copilot) query the server to find and download skills into their projects.

---

## Quick start

**Operators** — deploy the server:

```bash
git clone https://github.com/loremacs/skillyard.git
cd skillyard/mcp
npm install && npm run build && npm run restart
```

Or with Docker:

```bash
docker compose up -d
```

→ Full guide: [docs/SETUP.md](./docs/SETUP.md)

---

**Users** — connect your IDE:

**Option A — merge helper (Node required):** from a clone, `cd mcp && npm run install-ide-mcp -- --ide cursor` (or `windsurf`, `claude-code`, `vscode`). Optional `--url https://your-host:3333/mcp`. **vscode** writes `./.vscode/mcp.json` in the current directory; others update the IDE config under your home directory.

**Option B — same script without cloning** (still need Node):

```bash
curl -fsSL https://raw.githubusercontent.com/loremacs/skillyard/main/mcp/scripts/install-ide-mcp.mjs -o install-ide-mcp.mjs \
  && node install-ide-mcp.mjs --ide cursor
```

Then **restart the IDE fully**, verify `list_skills`, and have your agent call **`setup_project(ide)`** (and use **`zip_extract`** when installing skills — destination **`.agents/skills/`** only).

**Option C — manual JSON:** add `skillyard` to your IDE’s MCP file as in [docs/CONNECT.md](./docs/CONNECT.md).

→ Full guide: [docs/CONNECT.md](./docs/CONNECT.md)

---

## MCP tools

The server injects a usage guide automatically on every connection via the MCP `instructions` field — agents know the full workflow before making any tool call.

| Tool | What it does |
|---|---|
| `list_skills(query?)` | Indexed list + optional FTS `query`; returns **folderName**, display **name**, **description**, **status**, **downloadUrl** |
| `get_skill(name)` | **folderName** from `list_skills`; returns **content**, **contentHash**, **files**, **downloadUrl** |
| `setup_project(ide)` | **Returns** JSON snippets for IDE MCP config and `AGENTS.md` — server does not write files |
| `submit_feedback(...)` | Bug / improvement / docs / feature request; optional **`test_session_id`** per E2E run (reused across submits; older row archived); links **skill_content_hash** when **skill_name** matches |
| `list_feedback(...)` | Triage feedback; **`test_session_id`** + **`include_archived_session_rows`** for current capstone vs full session — same MCP URL = same DB as tester |
| `get_skillyard_test_guide()` | How to run smoke / E2E tests and file **submit_feedback** so another IDE can **list_feedback** |

HTTP: `GET /health`, `GET /skills`, `GET /skills/:name`, `GET /skills/:name/download` — see [docs/CONNECT.md](./docs/CONNECT.md).

---

## Skills

| Skill | What it does |
|---|---|
| `skill-creator` | Authors, evaluates, and iteratively improves `SKILL.md` files |

→ For the full project vision and design: [docs/VISION.md](./docs/VISION.md)

---

## Standards

| Standard | Version / Source | Used for |
|---|---|---|
| [Model Context Protocol](https://modelcontextprotocol.io/specification/2025-11-25) | `2025-11-25` | MCP server transport, Tools, Resources, `instructions` |
| [Agent Skills format](https://agentskills.io/specification) | Open standard (agentskills.io) | `SKILL.md` schema, folder layout, progressive disclosure |
| [anthropics/skills](https://github.com/anthropics/skills) | No release tags — sourced May 2026 | Baseline for `skill-creator` skill |
| [AGENTS.md best practices](https://agentsmd.io/agents-md-best-practices) | Community standard (agentsmd.io) | `AGENTS.md` conventions |

→ Full upgrade guidance: [docs/STANDARDS.md](./docs/STANDARDS.md)

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CHANGELOG.md](./CHANGELOG.md). Maintainer checklist: [TODO.md](./TODO.md).
