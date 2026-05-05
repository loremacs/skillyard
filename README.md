# SkillYard

A hosted MCP server that delivers reusable agent skills on demand. Any AI coding agent connects once and can discover, search, and install structured workflows without manual configuration.

---

## How it works

Skills are `SKILL.md` files stored in `.agents/skills/`. The SkillYard MCP server exposes them over HTTP. Agents in any IDE (Cursor, Windsurf, Claude Code, Copilot) query the server to find and download skills into their projects.

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
| `setup_project(ide)` | One-time: generates IDE config entry and `AGENTS.md` project marker |

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

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CHANGELOG.md](./CHANGELOG.md).
