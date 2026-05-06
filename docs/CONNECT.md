# Connecting to SkillYard

Add one JSON entry to your IDE's MCP config, restart, and you're connected.

---

## Prerequisites

A SkillYard server must be running and reachable. Get the URL from whoever operates your SkillYard instance.

For local development the default is `http://localhost:3333/mcp`.

---

## Cursor

File: `~/.cursor/mcp.json` (macOS/Linux) or `%USERPROFILE%\.cursor\mcp.json` (Windows)

```json
{
  "mcpServers": {
    "skillyard": {
      "url": "http://your-server:3333/mcp"
    }
  }
}
```

If the file already exists, merge the `"skillyard"` key into the existing `"mcpServers"` object — do not replace the file.

---

## Windsurf

File: `~/.codeium/windsurf/mcp_config.json` (macOS/Linux) or `%USERPROFILE%\.codeium\windsurf\mcp_config.json` (Windows)

```json
{
  "mcpServers": {
    "skillyard": {
      "url": "http://your-server:3333/mcp"
    }
  }
}
```

---

## Claude Code

File: `.mcp.json` in your project root (project-scoped) or `~/.claude/mcp.json` (global)

```json
{
  "mcpServers": {
    "skillyard": {
      "url": "http://your-server:3333/mcp"
    }
  }
}
```

---

## VS Code / GitHub Copilot

File: `.vscode/mcp.json` in your project root

```json
{
  "servers": {
    "skillyard": {
      "type": "http",
      "url": "http://your-server:3333/mcp"
    }
  }
}
```

---

## After connecting

1. Restart your IDE fully — a reload is not enough.
2. Verify the connection by asking your agent to call `list_skills`.
3. To wire SkillYard into your project's `AGENTS.md`, ask your agent to call `setup_project`.

---

## Available tools

| Tool | What it does |
|---|---|
| `list_skills(query?)` | Lists available skills; filter by keyword |
| `get_skill(name)` | Returns skill content, `contentHash`, file manifest, and download URL |
| `setup_project(ide)` | One-time: generates IDE config entry and project marker for `AGENTS.md` |
| `submit_feedback(...)` | Reports a bug, improvement, documentation gap, or feature request |

The server also injects a usage guide automatically into every agent session via the MCP `instructions` field — agents know how to use SkillYard as soon as they connect, no extra tool call needed.

Skills are downloaded as ZIPs:

```
GET http://your-server:3333/skills/<name>/download
```
