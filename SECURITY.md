# Security Policy

## Scope

SkillYard includes:

1. **MCP HTTP server** (`mcp/`) — Streamable HTTP transport, exposes Tools and Resources, serves ZIP downloads of skill directories from `SKILLS_DIR` (default: repo `.agents/skills/` or `SKILLYARD_DIR` in production). Security considerations: network exposure, path traversal on skill names, ZIP contents, and dependency supply chain (`npm`).
2. **Skill bundles** (`.agents/skills/*/`) — Markdown plus optional scripts; agents or users may execute those scripts per their own policies.

There is no built-in authentication on the MCP endpoint by default; operators deploying a public instance must use a reverse proxy, firewall, or MCP authorization as appropriate.

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Email the maintainers directly or use [GitHub private vulnerability reporting](https://github.com/loremacs/skillyard/security/advisories/new).

Include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

You will receive a response within 72 hours. We will coordinate a fix and disclosure timeline with you.

## What counts as a vulnerability

- Path traversal or arbitrary file read via skill name, resource URI, or download path
- Unauthenticated remote code execution on the **host running the MCP server** (not merely “agent ran a skill script”)
- ZIP download or MCP responses exposing files outside configured `SKILLS_DIR`
- A skill or script that causes an agent to execute harmful commands on a user's machine (report may be skill content vs server bug — describe clearly)
- Dependency or supply-chain issues affecting `mcp/` with a practical exploit

## What does not count

- An agent producing incorrect or suboptimal output (use a bug report instead)
- Theoretical risks with no practical exploit path
- Users choosing to run scripts bundled inside a skill after installing it

## Supported versions

Only the latest commit on `main` is supported. There are no versioned releases with independent security patches at this time.
