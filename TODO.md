# Maintainer TODO

Tracked work that is partly manual or easy to defer. Check items off as you complete them.

## GitHub repository presentation (#2)

On [github.com](https://github.com), open the repo → **About** (gear) or **Settings → General**:

- [ ] **Description** — one line (e.g. *Hosted MCP server that delivers reusable Agent Skills to any IDE.*)
- [ ] **Website** — optional public URL (docs site, org page, or leave blank)
- [ ] **Topics** — e.g. `mcp`, `model-context-protocol`, `agent-skills`, `skills`, `cursor`, `claude`, `typescript`, `ai-agents`

This only affects discovery and the repo header; it does not live in git.

---

## Optional / later

- [ ] Integration smoke test: start MCP server in CI (or locally scripted), assert `tools/list` or HTTP health includes expected tools — [review-2.md](./review-2.md) suggested proving the loop end-to-end beyond `npm run build`.
