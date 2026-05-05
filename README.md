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

Add one entry to your IDE's MCP config:

```json
{
  "mcpServers": {
    "skillyard": {
      "url": "http://your-server:3333/mcp"
    }
  }
}
```

Restart your IDE, then ask your agent to call `setup_project`.

→ Full guide: [docs/CONNECT.md](./docs/CONNECT.md)

---

## MCP tools

The server injects a usage guide automatically on every connection via the MCP `instructions` field — agents know the full workflow before making any tool call.

| Tool | What it does |
|---|---|
| `list_skills(query?)` | Search available skills by keyword |
| `get_skill(name)` | Get skill content, file manifest, and download URL |
| `setup_project(ide)` | One-time: **returns** JSON snippets to merge into IDE MCP config and `AGENTS.md` — does not write files on the server |

Skills are also downloadable as ZIPs:

```
GET http://your-server:3333/skills/<name>/download
```

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
