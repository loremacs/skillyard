# SkillYard — Storage Layer Implementation Plan (Final, Locked)
> Reviewed by Claude, GPT (x2), and Claude again. Four passes. This is the plan.
> Do not modify this document during implementation. Open a GitHub Issue first.

---

## Verified Against

Every technical decision in this plan is grounded in official documentation or a widely-used reference project. Do not deviate from these patterns without checking the source.

| Decision | Source | Section |
|---|---|---|
| FTS5 external content table + triggers | [SQLite FTS5 official docs](https://www.sqlite.org/fts5.html) | §4.4.3 External Content Tables |
| FTS5 trigger exact syntax (INSERT/UPDATE/DELETE) | Same | §4.4.3 — the trigger example is copied verbatim and adapted |
| FTS5 pitfalls if triggers are skipped | Same | §4.4.4 External Content Table Pitfalls |
| `ON CONFLICT DO UPDATE` fires UPDATE trigger (not INSERT+DELETE) | [SQLite upsert docs](https://www.sqlite.org/lang_upsert.html) | Confirmed: upsert in-place update → `skills_au` fires ✅ |
| `ON CONFLICT DO REPLACE` must NOT be used with FTS5 content tables | SQLite FTS5 §4.4.3 | "external content tables do not support REPLACE conflict handling" |
| `.run({@named})` and `.run(...spread)` binding | [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) | Binding Parameters section |
| `.exec()` multi-statement caveat ("must rollback manually") | Same | `.exec()` section |
| `.transaction()` for atomic multi-statement operations | Same | `.transaction()` section |
| Env-driven storage factory pattern | [Memento MCP server](https://github.com/cprussin/memento) | `src/storage/` — pluggable backends, env-selected |
| Adapter interface pattern (one interface, multiple backends) | [OpenClaw provider system](https://github.com/openclawai/openclaw) | Provider plugin refactor, early 2026 |
| `REGEXP` is NOT a built-in SQLite function | [SQLite expression docs](https://www.sqlite.org/lang_expr.html) | "The REGEXP operator is a special syntax for the regexp() user function. No regexp() user function is defined by default." |
| `set -e` + `((N++))` kills script when N=0 (post-increment = 0 = exit 1) | [GNU Bash Manual](https://www.gnu.org/software/bash/manual/bash.html) | §3.7.1 Simple Command Expansion + arithmetic evaluation |

---

## What This Builds

1. `mcp/src/storage/adapter.ts` — StorageAdapter interface, the only contract other files import
2. `mcp/src/storage/sqlite.ts` — SQLite implementation behind that interface
3. `mcp/src/storage/factory.ts` — env-driven storage factory, Postgres-ready by design
4. `mcp/src/storage/fts.ts` — FTS query sanitizer (`toFtsQuery`)
5. `mcp/src/storage/validation.ts` — shared folder name validation regex
6. `mcp/src/skills/repository.ts` — hash-checked incremental skill sync with deleted-skill cleanup
7. `submit_feedback` MCP tool with full diagnostic metadata
8. `schema_migrations` table — cheap now, avoids pain later
9. Health + REST endpoints for smoke testing and monitoring
10. Smoke test script proving the full loop end-to-end

---

## Core Design Principle

```
SKILL.md files on disk  ──── canonical source of truth for skill content
        │
        │  SHA-256 hash check on startup
        │  upsert changed, skip unchanged, delete removed
        ▼
    SQLite  (skillyard.db — one file, two roles)
  ┌──────────────────┬──────────────────────┐
  │  skills          │  feedback            │
  │  CACHE           │  SOURCE OF TRUTH     │
  │  disposable —    │  permanent —         │
  │  truncate table  │  never rebuilt,      │
  │  to reindex.     │  never deleted.      │
  │  NEVER delete DB │                      │
  └──────────────────┴──────────────────────┘

  HTTP endpoints (monitoring/smoke test):
    GET  /health              ← server status + skill count
    GET  /skills              ← list all skills as JSON
    GET  /skills/:name        ← single skill metadata as JSON
    GET  /skills/:name/download ← ZIP, reads disk directly
    POST /feedback/test       ← smoke test only, dev mode
```

**Full skill reindex = call `syncSkillsFromDisk(adapter, skillsDir, baseUrl, { force: true })` — clears and resyncs atomically.**
**Never delete `skillyard.db` in production. Feedback is permanent.**

---

## Folder Name Validation

One shared regex. Use it everywhere: `get_skill`, `submit_feedback.skill_name`,
disk sync, and the ZIP HTTP endpoint. Prevents path traversal and invalid input.

```typescript
// mcp/src/storage/validation.ts
export const SKILL_FOLDER_RE = /^[a-z0-9][a-z0-9._-]{0,80}$/i;

export function isValidFolderName(name: string): boolean {
  return SKILL_FOLDER_RE.test(name);
}
```

Also use `path.resolve` containment check in the ZIP endpoint:

```typescript
const skillsDir = path.resolve(SKILLS_DIR);
const skillPath = path.resolve(path.join(skillsDir, folderName));
if (!skillPath.startsWith(skillsDir + path.sep)) {
  return res.status(400).json({ error: 'Invalid skill name' });
}
```

---

## YAML Frontmatter Parsing

Do not hand-parse frontmatter. Use the `yaml` package.
Multiline descriptions in Agent Skills format use YAML block scalars (`>`):

```yaml
description: >
  Use this skill when the user asks to create or improve
  a SKILL.md file.
```

The naive regex approach truncates these silently. Use `yaml.parse()` instead.

```typescript
import { parse as parseYaml } from 'yaml';

function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  try {
    const parsed = parseYaml(match[1]) ?? {};
    return {
      name:        typeof parsed.name        === 'string' ? parsed.name.trim()        : undefined,
      description: typeof parsed.description === 'string' ? parsed.description.trim() : undefined,
    };
  } catch {
    return {};
  }
}
```

Add `yaml` to `mcp/package.json` dependencies.

> The `parseFrontmatter` function shown here is defined inside `mcp/src/skills/repository.ts` — see the Skill Sync section. Do not create a separate file for it.

---

## Startup Guards

Before syncing, verify the skills directory exists and is readable.
If it does not exist, fail startup with a clear error — do not proceed
with an empty folder list, which would delete all skills from the DB.

```typescript
if (!fs.existsSync(skillsDir)) {
  throw new Error(
    `SKILLYARD_DIR does not exist: ${skillsDir}\n` +
    `Check your SKILLYARD_DIR environment variable.`
  );
}
if (!fs.statSync(skillsDir).isDirectory()) {
  throw new Error(`SKILLYARD_DIR is not a directory: ${skillsDir}`);
}
```

---

## Schema

### `schema_migrations`

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO schema_migrations (version) VALUES (1);
```

### `skills` — cache, disposable

`folder_name` is the primary key and URL identity throughout.
`name` from frontmatter is display metadata only.

```sql
CREATE TABLE IF NOT EXISTS skills (
  folder_name   TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  content       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'mainline'
                CHECK(status IN ('beta', 'mainline', 'private')),
  version       INTEGER NOT NULL DEFAULT 1,
  content_hash  TEXT NOT NULL,
  download_url  TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
```

### `skills_fts` — FTS5, full content indexed

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
  folder_name, name, description, content,
  content='skills', content_rowid='rowid'
);

-- Triggers: INSERT, UPDATE, DELETE (keep in sync)
CREATE TRIGGER IF NOT EXISTS skills_ai AFTER INSERT ON skills BEGIN
  INSERT INTO skills_fts(rowid, folder_name, name, description, content)
  VALUES (new.rowid, new.folder_name, new.name, new.description, new.content);
END;

CREATE TRIGGER IF NOT EXISTS skills_ad AFTER DELETE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, folder_name, name, description, content)
  VALUES ('delete', old.rowid, old.folder_name, old.name, old.description, old.content);
END;

CREATE TRIGGER IF NOT EXISTS skills_au AFTER UPDATE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, folder_name, name, description, content)
  VALUES ('delete', old.rowid, old.folder_name, old.name, old.description, old.content);
  INSERT INTO skills_fts(rowid, folder_name, name, description, content)
  VALUES (new.rowid, new.folder_name, new.name, new.description, new.content);
END;
```

### `feedback` — source of truth, permanent

```sql
CREATE TABLE IF NOT EXISTS feedback (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_name          TEXT,
  skill_content_hash  TEXT,
  category            TEXT NOT NULL
                      CHECK(category IN ('bug', 'improvement', 'documentation', 'feature_request')),
  severity            TEXT NOT NULL
                      CHECK(severity IN ('low', 'medium', 'high', 'critical')),
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  llm_model           TEXT,
  ide_name            TEXT,
  os                  TEXT,
  environment         TEXT,
  error_logs          TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_skill_name  ON feedback(skill_name);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at  ON feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_category    ON feedback(category);
CREATE INDEX IF NOT EXISTS idx_feedback_severity    ON feedback(severity);
CREATE INDEX IF NOT EXISTS idx_feedback_llm_model   ON feedback(llm_model);
CREATE INDEX IF NOT EXISTS idx_feedback_ide_name    ON feedback(ide_name);
```

---

## FTS Query Sanitizer

`mcp/src/storage/fts.ts`

Tokenize only `[a-z0-9_]+`, join with `OR`. Handles `gpt-4o`, `node.js`,
`claude-sonnet-4-6`, paths, and all punctuation-heavy input without throwing.
Fine for v0.1. Note: OR broadness means `node.js testing` matches any skill
containing any of those tokens. Acceptable for now.

```typescript
export function toFtsQuery(input: string): string {
  const tokens = input.toLowerCase().match(/[a-z0-9_]+/g);
  if (!tokens?.length) return '';
  return tokens.map(t => `"${t}"`).join(' OR ');
}
```

---

## Storage Interface

`mcp/src/storage/adapter.ts`

```typescript
export interface Skill {
  folderName: string;
  name: string;
  description: string;
  content: string;
  status: 'beta' | 'mainline' | 'private';
  version: number;
  contentHash: string;
  downloadUrl: string;
  updatedAt: string;
}

export interface SkillSearchResult {
  folderName: string;
  name: string;
  description: string;
  status: string;
  downloadUrl: string;
  score?: number;
}

export interface FeedbackEntry {
  id?: number;
  skillName?: string | null;
  skillContentHash?: string | null;
  category: 'bug' | 'improvement' | 'documentation' | 'feature_request';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  llmModel?: string | null;
  ideName?: string | null;
  os?: string | null;
  environment?: string | null;
  errorLogs?: string | null;
  createdAt?: string;
}

export interface StorageAdapter {
  initialize(): Promise<void>;
  close(): Promise<void>;

  upsertSkill(skill: Skill): Promise<void>;
  getSkill(folderName: string): Promise<Skill | null>;
  searchSkills(query?: string): Promise<SkillSearchResult[]>;
  listSkills(): Promise<SkillSearchResult[]>;
  deleteSkill(folderName: string): Promise<void>;
  deleteSkillsNotIn(folderNames: string[]): Promise<number>;
  getSkillCount(): Promise<number>;

  insertFeedback(entry: FeedbackEntry): Promise<number>;
  listFeedback(skillName?: string): Promise<FeedbackEntry[]>;
}
```

---

## SQLite Implementation

`mcp/src/storage/sqlite.ts`

```typescript
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { toFtsQuery } from './fts.js';
import type { StorageAdapter, Skill, SkillSearchResult, FeedbackEntry } from './adapter.js';

// Define SCHEMA_SQL by assembling all SQL blocks from the Schema section in order:
// schema_migrations → skills → skills_fts → triggers (ai, ad, au) → feedback → feedback indexes
const SCHEMA_SQL = `
  -- paste assembled SQL here during implementation
`;

export class SQLiteAdapter implements StorageAdapter {
  private db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    this.db = new Database(dbPath);
  }

  async initialize(): Promise<void> {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA_SQL); // full schema SQL from above
  }

  async close(): Promise<void> { this.db.close(); }

  async upsertSkill(skill: Skill): Promise<void> {
    this.db.prepare(`
      INSERT INTO skills
        (folder_name, name, description, content, status, version,
         content_hash, download_url, updated_at)
      VALUES
        (@folderName, @name, @description, @content, @status, @version,
         @contentHash, @downloadUrl, @updatedAt)
      ON CONFLICT(folder_name) DO UPDATE SET
        name         = excluded.name,
        description  = excluded.description,
        content      = excluded.content,
        status       = excluded.status,
        version      = skills.version + 1,
        content_hash = excluded.content_hash,
        download_url = excluded.download_url,
        updated_at   = excluded.updated_at
    `).run(skill);
  }

  async getSkill(folderName: string): Promise<Skill | null> {
    const row = this.db.prepare(
      'SELECT * FROM skills WHERE folder_name = ?'
    ).get(folderName) as any;
    return row ? this.toSkill(row) : null;
  }

  async listSkills(): Promise<SkillSearchResult[]> {
    return (this.db.prepare(
      'SELECT folder_name, name, description, status, download_url FROM skills ORDER BY folder_name'
    ).all() as any[]).map(r => this.toResult(r));
  }

  async searchSkills(query?: string): Promise<SkillSearchResult[]> {
    if (!query?.trim()) return this.listSkills();
    const ftsQ = toFtsQuery(query);
    if (!ftsQ) return this.listSkills();
    return (this.db.prepare(`
      SELECT s.folder_name, s.name, s.description, s.status, s.download_url, rank AS score
      FROM skills s JOIN skills_fts fts ON s.rowid = fts.rowid
      WHERE skills_fts MATCH ?
      ORDER BY rank LIMIT 20
    `).all(ftsQ) as any[]).map(r => ({ ...this.toResult(r), score: r.score }));
  }

  async deleteSkill(folderName: string): Promise<void> {
    this.db.prepare('DELETE FROM skills WHERE folder_name = ?').run(folderName);
  }

  async deleteSkillsNotIn(folderNames: string[]): Promise<number> {
    if (folderNames.length === 0) {
      return this.db.prepare('DELETE FROM skills').run().changes;
    }
    const ph = folderNames.map(() => '?').join(',');
    return this.db.prepare(
      `DELETE FROM skills WHERE folder_name NOT IN (${ph})`
    ).run(...folderNames).changes;
  }

  async getSkillCount(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) as n FROM skills').get() as any;
    return row.n;
  }

  async insertFeedback(entry: FeedbackEntry): Promise<number> {
    return this.db.prepare(`
      INSERT INTO feedback
        (skill_name, skill_content_hash, category, severity, title, description,
         llm_model, ide_name, os, environment, error_logs)
      VALUES
        (@skillName, @skillContentHash, @category, @severity, @title, @description,
         @llmModel, @ideName, @os, @environment, @errorLogs)
    `).run({
      skillName:        entry.skillName        ?? null,
      skillContentHash: entry.skillContentHash ?? null,
      category:         entry.category,
      severity:         entry.severity,
      title:            entry.title,
      description:      entry.description,
      llmModel:         entry.llmModel         ?? null,
      ideName:          entry.ideName          ?? null,
      os:               entry.os               ?? null,
      environment:      entry.environment      ?? null,
      errorLogs:        entry.errorLogs        ?? null,
    }).lastInsertRowid as number;
  }

  async listFeedback(skillName?: string): Promise<FeedbackEntry[]> {
    const rows = (skillName
      ? this.db.prepare('SELECT * FROM feedback WHERE skill_name = ? ORDER BY created_at DESC').all(skillName)
      : this.db.prepare('SELECT * FROM feedback ORDER BY created_at DESC').all()
    ) as any[];
    return rows.map(r => ({
      id: r.id, skillName: r.skill_name, skillContentHash: r.skill_content_hash,
      category: r.category, severity: r.severity, title: r.title,
      description: r.description, llmModel: r.llm_model, ideName: r.ide_name,
      os: r.os, environment: r.environment, errorLogs: r.error_logs,
      createdAt: r.created_at,
    }));
  }

  private toSkill(r: any): Skill {
    return {
      folderName: r.folder_name, name: r.name, description: r.description,
      content: r.content, status: r.status, version: r.version,
      contentHash: r.content_hash, downloadUrl: r.download_url, updatedAt: r.updated_at,
    };
  }

  private toResult(r: any): SkillSearchResult {
    return {
      folderName: r.folder_name, name: r.name, description: r.description,
      status: r.status, downloadUrl: r.download_url,
    };
  }
}
```

---

## Storage Factory

`mcp/src/storage/factory.ts`

```typescript
import { SQLiteAdapter } from './sqlite.js';
import type { StorageAdapter } from './adapter.js';

export function createStorageAdapter(): StorageAdapter {
  const backend = process.env.STORAGE_BACKEND ?? 'sqlite';
  if (backend === 'sqlite') {
    const dbPath = process.env.SKILLYARD_DB_PATH ?? './skillyard.db';
    return new SQLiteAdapter(dbPath);
  }
  throw new Error(`Unsupported STORAGE_BACKEND: ${backend}. Supported: sqlite`);
}
```

---

## Skill Sync

`mcp/src/skills/repository.ts`

```typescript
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parse as parseYaml } from 'yaml';
import { isValidFolderName } from '../storage/validation.js';
import type { StorageAdapter } from '../storage/adapter.js';

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  try {
    const parsed = parseYaml(match[1]) ?? {};
    return {
      name:        typeof parsed.name        === 'string' ? parsed.name.trim()        : undefined,
      description: typeof parsed.description === 'string' ? parsed.description.trim() : undefined,
    };
  } catch {
    return {};
  }
}

export async function syncSkillsFromDisk(
  adapter: StorageAdapter,
  skillsDir: string,
  baseUrl: string,
  options?: { force?: boolean }
): Promise<{ synced: number; skipped: number; deleted: number; warnings: string[] }> {
  // Guard: fail clearly if directory is missing or misconfigured
  if (!fs.existsSync(skillsDir)) {
    throw new Error(`SKILLYARD_DIR does not exist: ${skillsDir}`);
  }
  if (!fs.statSync(skillsDir).isDirectory()) {
    throw new Error(`SKILLYARD_DIR is not a directory: ${skillsDir}`);
  }

  if (options?.force) {
    await adapter.deleteSkillsNotIn([]);
  }

  let synced = 0, skipped = 0;
  const warnings: string[] = [];
  const diskFolderNames: string[] = [];
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!isValidFolderName(entry.name)) {
      warnings.push(`Skipped invalid folder name: ${entry.name}`);
      continue;
    }
    const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const { name, description } = parseFrontmatter(content);

    if (!description) {
      warnings.push(`Skipped ${entry.name}: missing or empty description in frontmatter`);
      continue;
    }

    diskFolderNames.push(entry.name);
    const hash = sha256(content);
    const existing = await adapter.getSkill(entry.name);

    if (existing?.contentHash === hash) { skipped++; continue; }

    await adapter.upsertSkill({
      folderName:  entry.name,
      name:        name ?? entry.name,
      description,
      content,
      status:      existing?.status ?? 'mainline',
      version:     existing?.version ?? 1,
      contentHash: hash,
      downloadUrl: `${baseUrl}/skills/${entry.name}/download`,
      updatedAt:   new Date().toISOString(),
    });
    synced++;
  }

  if (diskFolderNames.length === 0) {
    console.warn('WARNING: No valid skills found on disk — skipping deletion to avoid wiping all cached skills. Check SKILLYARD_DIR and SKILL.md files.');
    return { synced, skipped, deleted: 0, warnings };
  }

  const deleted = await adapter.deleteSkillsNotIn(diskFolderNames);
  return { synced, skipped, deleted, warnings };
}
```

---

## Health & REST Endpoints

Add to `mcp/src/index.ts` alongside MCP server setup.
These are used by the smoke test and are useful for monitoring.

```typescript
// GET /health
app.get('/health', async (_req, res) => {
  const skillCount = await adapter.getSkillCount();
  res.json({ status: 'ok', skillCount, uptime: process.uptime() });
});

// GET /skills
app.get('/skills', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q : undefined;
  const results = await adapter.searchSkills(query);
  res.json(results);
});

// GET /skills/:name
app.get('/skills/:name', async (req, res) => {
  const { name } = req.params;
  if (!isValidFolderName(name)) return res.status(400).json({ error: 'Invalid skill name' });
  const skill = await adapter.getSkill(name);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  // Return metadata (not full content — use get_skill MCP tool for content)
  res.json({
    folderName:  skill.folderName,
    name:        skill.name,
    description: skill.description,
    status:      skill.status,
    version:     skill.version,
    contentHash: skill.contentHash,
    downloadUrl: skill.downloadUrl,
    updatedAt:   skill.updatedAt,
  });
});


// POST /feedback/test  (smoke test / dev use only -- bypasses MCP session negotiation)
// Enabled only when SKILLYARD_DEV_MODE=true. Returns 404 in all other environments.
app.post('/feedback/test', async (req, res) => {
  if (process.env.SKILLYARD_DEV_MODE !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }
  const { category, severity, title, description } = req.body;
  if (!category || !severity || !title || !description) {
    return res.status(400).json({ error: 'category, severity, title, description required' });
  }
  const id = await adapter.insertFeedback({
    skillName:        req.body.skill_name         ?? null,
    skillContentHash: req.body.skill_content_hash ?? null,
    category, severity, title, description,
    llmModel:    req.body.llm_model    ?? null,
    ideName:     req.body.ide_name     ?? null,
    os:          req.body.os           ?? null,
    environment: req.body.context      ?? null,
    errorLogs:   req.body.error_logs   ?? null,
  });
  res.json({ feedback_id: id });
});
```

---

## `get_skill` Tool -- Updated Response

Include `folderName` and `contentHash` in the tool response. The server uses `contentHash` internally to auto-link feedback; agents do not need to pass it.

```typescript
// In the get_skill tool handler response object:
{
  name:        skill.name,
  folderName:  skill.folderName,
  description: skill.description,
  contentHash: skill.contentHash,   // <- version fingerprint; server auto-links to feedback on submit
  downloadUrl: skill.downloadUrl,
  content:     skill.content,
  files:       manifest,
}
```

---

## `list_skills` Tool -- Updated Response Shape

After migration, `list_skills` returns `folderName` -- the stable folder-name key used by `get_skill`. The frontmatter `name` is a display label only and may differ from the folder name.

```typescript
// list_skills() response shape after storage migration:
[
  {
    folderName:  'skill-creator',   // <- pass this to get_skill(name: 'skill-creator')
    name:        'Skill Creator',   // display label from frontmatter
    description: '...',
    status:      'mainline',
    downloadUrl: 'https://...',
  }
]
```

Update the `list_skills` handler to return `folderName` from the adapter result. Do not return raw frontmatter `name` as the primary identifier -- it is not guaranteed to match the folder name.

---

## `submit_feedback` Tool -- Zod Schema

```typescript
inputSchema: z.object({
  skill_name: z.string().max(80).optional().describe(
    'Folder name of the skill this feedback is about. Omit for general SkillYard feedback. ' +
    'The server auto-links the current content version -- no hash required.'
  ),
  category: z.enum(['bug', 'improvement', 'documentation', 'feature_request']).describe(
    'bug = skill fails or produces wrong output. ' +
    'improvement = works but could be better. ' +
    'documentation = guidance unclear or missing. ' +
    'feature_request = new skill or capability needed.'
  ),
  severity: z.enum(['low', 'medium', 'high', 'critical']).describe(
    'low = minor. medium = partially blocks workflow. ' +
    'high = fully blocks task. critical = data loss or corruption.'
  ),
  title: z.string().min(5).max(120).describe('One-line summary.'),
  description: z.string().min(10).max(2000).describe(
    'What you tried, what happened, and what you expected.'
  ),
  llm_model: z.string().max(100).optional().describe(
    'Model name and version, e.g. "claude-sonnet-4-5" or "gpt-4o-2025-01".'
  ),
  ide_name: z.string().max(100).optional().describe(
    'IDE or CLI name and version, e.g. "Windsurf 1.4", "Cursor 0.48", "Claude Code 1.0".'
  ),
  os: z.string().max(100).optional().describe(
    'Operating system, e.g. "Windows 11", "macOS 15.3", "Ubuntu 24.04".'
  ),
  context: z.string().max(1000).optional().describe(
    'Any additional context not covered by the structured fields above.'
  ),
  error_logs: z.string().max(2000).optional().describe(
    'Relevant error messages or stack traces.'
  ),
}),
```

**Handler note:** `skill_content_hash` is not a tool parameter -- the server resolves it automatically.
Validate `skill_name` with `isValidFolderName()`; fall back to `null` if invalid or not found.
Map `context` -> `environment` column.

```typescript
// In submit_feedback handler (abbreviated):
const skillHash = skill_name && isValidFolderName(skill_name)
  ? (await adapter.getSkill(skill_name))?.contentHash ?? null
  : null;

await feedbackRepo.insert({
  skillName:        skill_name ?? null,
  skillContentHash: skillHash,
  category, severity, title, description,
  llmModel:    llm_model  ?? null,
  ideName:     ide_name   ?? null,
  os:          os         ?? null,
  environment: context    ?? null,
  errorLogs:   error_logs ?? null,
});
```

---

## Smoke Test

`mcp/scripts/smoke-test.sh`

Uses the REST endpoints -- no MCP session negotiation required.

```bash
#!/usr/bin/env bash
# set -e intentionally omitted: check() must survive individual test failures

DB=$(mktemp /tmp/skillyard-smoke-XXXXXX.db)
export SKILLYARD_DB_PATH="$DB"
export SKILLYARD_DEV_MODE=true
PASS=0; FAIL=0

# Cleanup on any exit (pass, fail, or ctrl-c)
trap 'npm stop 2>/dev/null; rm -f "$DB" "${DB}-shm" "${DB}-wal"' EXIT

check() {
  if eval "$2"; then
    echo "PASS: $1"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $1"
    FAIL=$((FAIL + 1))
  fi
}

echo "--- Starting server ---"
npm run restart || { echo "ERROR: server failed to start"; exit 1; }
sleep 2

check "health endpoint" \
  "curl -sf http://localhost:3333/health | jq -e '.status == \"ok\"' > /dev/null"

check "list skills via REST" \
  "curl -sf http://localhost:3333/skills | jq -e 'length > 0' > /dev/null"

check "get skill via REST" \
  "curl -sf http://localhost:3333/skills/skill-creator | jq -e '.contentHash != null' > /dev/null"

check "submit feedback via REST" \
  "curl -sf -X POST http://localhost:3333/feedback/test \
    -H 'Content-Type: application/json' \
    -d '{\"category\":\"bug\",\"severity\":\"low\",\"title\":\"Smoke test\",\"description\":\"Automated smoke test entry.\",\"llm_model\":\"claude-sonnet-4-5\",\"ide_name\":\"bash\",\"os\":\"linux\"}' \
    | jq -e '.feedback_id != null' > /dev/null"

echo "--- Restart and verify incremental sync ---"
npm run restart
sleep 2
check "incremental sync on restart" \
  "curl -sf http://localhost:3333/health | jq -e '.skillCount > 0' > /dev/null"

echo "--- Verify feedback survived restart ---"
check "feedback persisted after restart" \
  "sqlite3 '$DB' 'SELECT COUNT(*) FROM feedback;' | grep -q '^1$'"

npm stop
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
# trap handles cleanup automatically
```

---

## Environment Variables -- `mcp/.env.example`

```env
# Path to SQLite database. Auto-created on first run.
# Parent directory is created automatically if missing.
SKILLYARD_DB_PATH=./skillyard.db

# Storage backend. Only 'sqlite' supported currently. Future: postgres
STORAGE_BACKEND=sqlite

# Enable dev-only endpoints (e.g. POST /feedback/test). NEVER set in production.
# SKILLYARD_DEV_MODE=true
```

---

## `.gitignore` -- add to `mcp/.gitignore` (create the file if absent)

```
skillyard.db
skillyard.db-shm
skillyard.db-wal
```

---

## Package Dependencies

```json
"dependencies": {
  "better-sqlite3": "^9.0.0",
  "yaml": "^2.0.0"
},
"devDependencies": {
  "@types/better-sqlite3": "^7.6.0"
}
```

---

## Backup Guidance -- add to `docs/STANDARDS.md`

```markdown
### Backing up feedback

The feedback table is permanent. Before any destructive operation on
the DB file, create a backup:

    sqlite3 skillyard.db ".backup skillyard.backup.db"

The skills table is disposable cache and does not need to be backed up.
```

---

## Documentation Updates

### `docs/CONNECT.md` -- tools table

| Tool | What it does |
|---|---|
| `list_skills(query?)` | Lists skills; filters by keyword via FTS5 |
| `get_skill(name)` | Returns full skill content, contentHash, manifest, and download URL |
| `setup_project(ide)` | One-time project wiring -- IDE config + AGENTS.md section |
| `submit_feedback(...)` | Report bug, improvement, documentation gap, or feature request |

### `CHANGELOG.md` -- add under `## [Unreleased]`

```markdown
### Added
- Storage adapter interface -- swappable backend pattern, SQLite default
- SQLite with WAL, FTS5 on full content, CHECK constraints on all enums,
  schema_migrations, feedback indexes, folder_name as primary key
- YAML frontmatter parser (replaces naive regex -- handles multiline descriptions)
- Hash-checked incremental sync: upserts changed, skips unchanged,
  removes deleted, logs counts and warnings
- Startup guards: fails clearly if SKILLYARD_DIR missing or not a directory
- Folder name validation regex shared across all entry points
- Path traversal prevention in ZIP endpoint
- submit_feedback MCP tool -- 10-field schema (skill_name, category, severity,
  title, description, llm_model, ide_name, os, context, error_logs);
  server auto-resolves skill_content_hash by skill_name
- list_skills now returns folderName as the stable identifier alongside display name
- get_skill now returns contentHash (version fingerprint for server-side feedback linking)
- Health and REST endpoints: GET /health, GET /skills, GET /skills/:name
- Smoke test script using REST endpoints (mcp/scripts/smoke-test.sh)
- DB parent directory auto-creation
- Feedback backup guidance in STANDARDS.md
```

---

## Done When

- [ ] Server starts with no DB -- creates it automatically, parent dirs included
- [ ] Server starts with existing DB -- skips unchanged skills, logs correctly
- [ ] Server fails clearly if SKILLYARD_DIR does not exist
- [ ] `list_skills()` returns results from SQLite
- [ ] `list_skills(query: "creator")` returns filtered results via FTS5
- [ ] `list_skills(query: "gpt-4o")` does not throw
- [ ] `list_skills(query: "node.js")` does not throw
- [ ] `list_skills(query: "text in skill body")` returns results
- [ ] `get_skill("skill-creator")` returns `contentHash` in response
- [ ] `submit_feedback(...)` inserts a row and returns a feedback id
- [ ] `submit_feedback` with `skill_name` auto-links current `contentHash` from DB
- [ ] `submit_feedback` without optional fields stores nulls cleanly
- [ ] `submit_feedback` with description under 10 chars is rejected by Zod
- [ ] Renaming or deleting a skill folder removes it from SQLite on next startup
- [ ] Skill with missing frontmatter description is skipped with a warning
- [ ] Full reindex via `syncSkillsFromDisk(..., { force: true })` clears skills and resyncs without touching the feedback table
- [ ] `skillyard.db` is gitignored and not committed
- [ ] `status` defaults to `'mainline'` on all synced skills
- [ ] `version` increments when a SKILL.md changes and server restarts
- [ ] ZIP endpoint validates folder name, uses path containment check
- [ ] `GET /health` returns `{ status: "ok", skillCount: N }`
- [ ] `GET /skills` returns all skills as JSON array
- [ ] `GET /skills/skill-creator` returns metadata including `contentHash`
- [ ] Smoke test script passes all checks end-to-end
- [ ] `docs/CONNECT.md` tools table updated
- [ ] `docs/STANDARDS.md` storage section and backup guidance added
- [ ] `CHANGELOG.md` updated
- [ ] GitHub Issue opened before work begins per AGENTS.md workflow