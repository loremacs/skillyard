/**
 * Shown by MCP tool get_skillyard_test_guide. Keep in sync with docs/CONNECT.md smoke section.
 */
export function buildSkillyardTestGuide(params: { baseUrl: string; mcpUrl: string }): string {
  const { baseUrl, mcpUrl } = params;
  return `# SkillYard — how to test and send feedback

## How feedback reaches another agent (e.g. Cursor)

- **Same MCP server URL = same SQLite DB.** If Windsurf and Cursor both use \`${mcpUrl}\`, \`submit_feedback\` rows are visible to **list_feedback** from either IDE.
- **Nothing auto-syncs across machines.** To “pipe” results to someone else: (1) they use the **same** SkillYard host, or (2) you copy the tool result / open a GitHub Issue by hand.

## Full E2E checklist (external agent — more than smoke)

Do these in order; **submit_feedback** after anything fails (or once at end with full log).

1. **setup_project(ide)** — Merge returned JSON: use **exact** \`agents_md.section\` (do not shorten). If **list_skills** does not work yet, merge \`mcp_configs\` first, then **restart IDE fully** (reload not enough). If **list_skills** already works, MCP is wired — do **not** tell the user “add MCP next” as a blocker; \`mcp_configs\` is still useful for teammates / other IDEs.
2. **list_skills** — Pick a **folderName** (e.g. \`skill-creator\` if indexed).
3. **get_skill** — Read \`downloadUrl\`, \`install_skills_zip_root\`, \`zip_extract_antipattern\`.
4. **Skills folder** — PowerShell: \`New-Item -ItemType Directory -Force .agents/skills\` · bash: \`mkdir -p .agents/skills\`
5. **ZIP install** — Destination must be the **skills root** \`.agents/skills\` only (ZIP already contains \`<folderName>/\` at top level):
   - **Right:** \`Expand-Archive skill.zip -DestinationPath .agents/skills\` (PowerShell) · \`unzip -o skill.zip -d .agents/skills\` (bash)
   - **Wrong:** \`Expand-Archive ... -DestinationPath .agents/skills/skill-creator\` (or any \`.agents/skills/<folderName>\`) when the archive root is already \`<folderName>/\` → double path \`.agents/skills/<folder>/<folder>/SKILL.md\`.
6. **Use the skill** — Open \`.agents/skills/<folderName>/SKILL.md\` and follow it (or one representative step).
7. **Report** — \`submit_feedback\` with steps, pass/fail, errors (\`error_logs\`, \`context\`).

Optional: run the **smoke script** below — it only hits **REST**, not MCP JSON-RPC.

## test_session_id — current capstone vs history

- At **start of one E2E run**, pick a stable id (e.g. \`e2e-2026-05-05-windsurf-abc12\` — letters, digits, \`.\`, \`_\`, \`:\`, \`-\` only, max 120 chars).
- Pass **the same \`test_session_id\`** on **every \`submit_feedback\`** in that run (progress updates, final summary).
- Server marks the **previous** row for that id as **archived** and the new row as **latest** — at most one **latest** per session.
- Maintainer: **list_feedback** with \`test_session_id\` set (default **include_archived_session_rows: false**) → only the **current** result. Set **include_archived_session_rows: true** to see full chain for debugging.

## Before you test (quick verify)

1. Call **list_skills** — note **folderName** (not only display \`name\`).
2. Call **get_skill** with that **folderName** — confirm **downloadUrl**, **contentHash**, **zip_extract_antipattern**.
3. ZIP: **\`-DestinationPath .agents/skills\`** / **\`-d .agents/skills\`** only — never \`.agents/skills/<folderName>\` when the ZIP root is already that folder.

## Automated smoke (from SkillYard repo \`mcp/\`)

\`\`\`bash
cd mcp && npm run build && node scripts/smoke-test.mjs
\`\`\`

Uses \`SMOKE_PORT\` (default **3340**) so it does not fight a dev server on 3333. Optional: \`SMOKE_PORT=3350 node scripts/smoke-test.mjs\`.

**What it does (REST only — not MCP):** spawns \`node dist/index.js\` with a **temp SQLite DB**, then:

- \`GET /health\` — \`status\`, \`skillCount\`
- \`GET /skills\` — list array
- \`GET /skills/:folderName\` — metadata for first skill
- \`GET /skills/:folderName/download\` — abort after headers; checks \`application/zip\`
- \`GET /skills?q=...\` — FTS query smoke
- \`POST /feedback/test\` — dev-only insert (needs \`SKILLYARD_DEV_MODE=true\`); **does not** call MCP tools
- \`GET /skills/..%2Fetc\` — expects **400** (path hardening)
- Invalid \`POST /feedback/test\` — expects **400**

It does **not** install skills, open an IDE, or exercise \`submit_feedback\` / \`list_feedback\` MCP tools.

## After a manual or E2E run — **submit_feedback**

Use a **title prefix** so maintainers can filter:

- \`[e2e-windsurf] ...\` or \`[test-run] ...\` (IDE / run type in the prefix).

Suggested fields:

| Field | What to put |
|-------|-------------|
| \`test_session_id\` | Same id for whole run — triage **latest** capstone via **list_feedback** |
| \`category\` | \`bug\` | \`improvement\` | \`documentation\` | \`feature_request\` |
| \`severity\` | \`low\` … \`critical\` |
| \`title\` | Short line with prefix, e.g. \`[e2e-windsurf] skill-creator install ok\` |
| \`description\` | Summary: steps, pass/fail, what broke |
| \`context\` | Workspace path, OS, server URL, skill versions |
| \`ide_name\` | e.g. \`Windsurf\` |
| \`skill_name\` | Optional: **folderName** if feedback is about one skill |

Reply includes **feedback_id** — mention it if you open a GitHub Issue.

## Maintainer triage — **list_feedback**

- \`title_starts_with: "[e2e-"\` or \`"[test-run]"\` with \`limit\`.
- \`test_session_id\` + default \`include_archived_session_rows: false\` → **current** report for that run.
- \`test_session_id\` + \`include_archived_session_rows: true\` → full session history (newest first).

Same MCP URL as the tester’s server required.

---
Server base: **${baseUrl}** · MCP: **${mcpUrl}**
`;
}
