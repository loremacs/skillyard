import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { toFtsQuery } from "./fts.js";
import type { StorageAdapter, Skill, SkillSearchResult, FeedbackEntry, FeedbackListFilter } from "./adapter.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO schema_migrations (version) VALUES (1);

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

CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
  folder_name, name, description, content,
  content='skills', content_rowid='rowid'
);

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
  test_session_id     TEXT,
  report_state        TEXT NOT NULL DEFAULT 'latest'
                      CHECK(report_state IN ('latest', 'archived')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_skill_name  ON feedback(skill_name);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at  ON feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_category    ON feedback(category);
CREATE INDEX IF NOT EXISTS idx_feedback_severity    ON feedback(severity);
CREATE INDEX IF NOT EXISTS idx_feedback_llm_model   ON feedback(llm_model);
CREATE INDEX IF NOT EXISTS idx_feedback_ide_name    ON feedback(ide_name);
CREATE INDEX IF NOT EXISTS idx_feedback_session     ON feedback(test_session_id, report_state);
`;

export class SQLiteAdapter implements StorageAdapter {
  private db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    this.db = new Database(dbPath);
  }

  async initialize(): Promise<void> {
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_SQL);
    this.migrateFeedbackSessionColumns();
  }

  /** Adds test_session_id + report_state on DBs created before v2. */
  private migrateFeedbackSessionColumns(): void {
    const row = this.db.prepare("SELECT MAX(version) AS m FROM schema_migrations").get() as { m: number | null };
    const maxV = row?.m ?? 0;
    if (maxV >= 2) return;

    const cols = this.db.prepare("PRAGMA table_info(feedback)").all() as { name: string }[];
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("test_session_id")) {
      this.db.exec("ALTER TABLE feedback ADD COLUMN test_session_id TEXT;");
    }
    if (!names.has("report_state")) {
      this.db.exec("ALTER TABLE feedback ADD COLUMN report_state TEXT DEFAULT 'latest';");
    }
    this.db.exec(`
      UPDATE feedback SET report_state = 'latest'
      WHERE report_state IS NULL OR report_state = '';
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_feedback_session ON feedback(test_session_id, report_state);
    `);
    this.db.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (2)").run();
  }

  async close(): Promise<void> {
    this.db.close();
  }

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
      "SELECT * FROM skills WHERE folder_name = ?"
    ).get(folderName) as Record<string, unknown> | undefined;
    return row ? this.toSkill(row) : null;
  }

  async listSkills(): Promise<SkillSearchResult[]> {
    return (this.db.prepare(
      "SELECT folder_name, name, description, status, download_url FROM skills ORDER BY folder_name"
    ).all() as Record<string, unknown>[]).map((r) => this.toResult(r));
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
    `).all(ftsQ) as Record<string, unknown>[]).map((r) => ({ ...this.toResult(r), score: r.score as number }));
  }

  async deleteSkill(folderName: string): Promise<void> {
    this.db.prepare("DELETE FROM skills WHERE folder_name = ?").run(folderName);
  }

  async deleteSkillsNotIn(folderNames: string[]): Promise<number> {
    if (folderNames.length === 0) {
      return this.db.prepare("DELETE FROM skills").run().changes;
    }
    const ph = folderNames.map(() => "?").join(",");
    return this.db.prepare(
      `DELETE FROM skills WHERE folder_name NOT IN (${ph})`
    ).run(...folderNames).changes;
  }

  async getSkillCount(): Promise<number> {
    const row = this.db.prepare("SELECT COUNT(*) as n FROM skills").get() as { n: number };
    return row.n;
  }

  async insertFeedback(entry: FeedbackEntry): Promise<number> {
    const trx = this.db.transaction(() => {
      const sid = entry.testSessionId?.trim() || null;
      if (sid) {
        this.db
          .prepare(
            "UPDATE feedback SET report_state = 'archived' WHERE test_session_id = ? AND report_state = 'latest'"
          )
          .run(sid);
      }
      return this.db
        .prepare(
          `
      INSERT INTO feedback
        (skill_name, skill_content_hash, category, severity, title, description,
         llm_model, ide_name, os, environment, error_logs, test_session_id, report_state)
      VALUES
        (@skillName, @skillContentHash, @category, @severity, @title, @description,
         @llmModel, @ideName, @os, @environment, @errorLogs, @testSessionId, 'latest')
    `
        )
        .run({
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
          testSessionId:    sid,
        }).lastInsertRowid as number;
    });
    return trx();
  }

  async listFeedback(filter?: FeedbackListFilter): Promise<FeedbackEntry[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter?.skillName) {
      conditions.push("skill_name = ?");
      params.push(filter.skillName);
    }
    if (filter?.testSessionId) {
      conditions.push("test_session_id = ?");
      params.push(filter.testSessionId);
    }
    if (filter?.reportState) {
      conditions.push("report_state = ?");
      params.push(filter.reportState);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT * FROM feedback ${where} ORDER BY created_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.rowToFeedback(r));
  }

  private rowToFeedback(r: Record<string, unknown>): FeedbackEntry {
    const rs = r.report_state as string | null | undefined;
    const reportState: FeedbackEntry["reportState"] =
      rs === "archived" ? "archived" : rs === "latest" ? "latest" : "latest";
    return {
      id:               r.id as number,
      skillName:        r.skill_name as string | null,
      skillContentHash: r.skill_content_hash as string | null,
      category:         r.category as FeedbackEntry["category"],
      severity:         r.severity as FeedbackEntry["severity"],
      title:            r.title as string,
      description:      r.description as string,
      llmModel:         r.llm_model as string | null,
      ideName:          r.ide_name as string | null,
      os:               r.os as string | null,
      environment:      r.environment as string | null,
      errorLogs:        r.error_logs as string | null,
      createdAt:        r.created_at as string,
      testSessionId:    (r.test_session_id as string | null) ?? null,
      reportState:      reportState,
    };
  }

  private toSkill(r: Record<string, unknown>): Skill {
    return {
      folderName:  r.folder_name as string,
      name:        r.name as string,
      description: r.description as string,
      content:     r.content as string,
      status:      r.status as Skill["status"],
      version:     r.version as number,
      contentHash: r.content_hash as string,
      downloadUrl: r.download_url as string,
      updatedAt:   r.updated_at as string,
    };
  }

  private toResult(r: Record<string, unknown>): SkillSearchResult {
    return {
      folderName:  r.folder_name as string,
      name:        r.name as string,
      description: r.description as string,
      status:      r.status as string,
      downloadUrl: r.download_url as string,
    };
  }
}
