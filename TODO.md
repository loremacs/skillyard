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
- [ ] `submit_feedback` MCP tool — agents encountering errors during skill creation can report them in-band; append to `feedback.jsonl` on the server. Suggested schema: `category` (bug | improvement | documentation | feature_request), `severity` (low | medium | high | critical), `title`, `description`, `environment`, `error_logs`.
- [ ] Update `skill-creator` SKILL.md with cross-platform notes — Windows agents hit PowerShell `&&` chaining errors and `Compress-Archive` rejecting non-`.zip` extensions; add PowerShell-specific examples and note that Python scripts are preferred for any non-trivial packaging/testing operations.
- [ ] Document `.skill` = `.zip` naming convention explicitly in `skill-creator` SKILL.md.
