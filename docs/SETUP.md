# Setting Up SkillYard

This guide is for operators deploying the SkillYard MCP server.

---

## Prerequisites

- Node.js 18+ (bare metal) or Docker (containerised)
- Skills directory — the `.agents/skills/` folder from this repo or your own skill library

---

## Option A — Bare metal / VM

```bash
git clone https://github.com/loremacs/skillyard.git
cd skillyard/mcp
npm install
npm run build
npm run restart
```

The server starts at `http://localhost:3333/mcp`.

To use a custom skills directory:

```bash
SKILLYARD_DIR=/path/to/skills npm run restart
```

To use a different port:

```bash
PORT=8080 npm run restart
```

Stop the server:

```bash
npm stop
```

---

## Option B — Docker

```bash
git clone https://github.com/loremacs/skillyard.git
cd skillyard
docker compose up -d
```

The server starts at `http://localhost:3333/mcp`.

To point at an external skills directory, set `SKILLYARD_DIR` in `docker-compose.yml` or pass it as an environment variable:

```bash
SKILLYARD_DIR=/path/to/your/skills docker compose up -d
```

---

## Configuration

Copy `mcp/.env.example` to `mcp/.env` and set values for your environment:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3333` | HTTP port the server listens on |
| `BASE_URL` | `http://localhost:3333` | Public URL of this server — used in download URLs returned to agents. Set to your external URL for remote deployments. |
| `SKILLYARD_DIR` | `.agents/skills/` relative to the repo | Absolute path to the skills directory |

---

## Adding skills

Drop a skill directory into `SKILLYARD_DIR`:

```
SKILLYARD_DIR/
  my-skill/
    SKILL.md       ← required
    scripts/       ← optional
    references/    ← optional
```

The server reads skills from disk on every request — no restart needed after adding or updating a skill.

---

## Exposing to users

Point a reverse proxy (nginx, Caddy, Cloudflare Tunnel) at port 3333 and share the resulting URL with your team. Users follow the instructions in [CONNECT.md](./CONNECT.md).

Example Caddy config:

```
skillyard.yourcompany.com {
    reverse_proxy localhost:3333
}
```

---

## Verifying the server

```bash
curl -s http://localhost:3333/skills/skill-creator/download -o test.zip
```

A valid ZIP file means the server is running and serving skills correctly.
