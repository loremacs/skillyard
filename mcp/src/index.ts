import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type { Request, Response } from "express";
import archiver from "archiver";
import crypto from "crypto";
import { createStorageAdapter } from "./storage/factory.js";
import { syncSkillsFromDisk } from "./skills/repository.js";
import { isValidFolderName, isValidTestSessionId } from "./storage/validation.js";
import type { FeedbackListFilter, StorageAdapter } from "./storage/adapter.js";
import { buildSkillyardTestGuide } from "./guides/skillyard-test-guide.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = process.env.SKILLYARD_DIR ?? path.resolve(__dirname, "../../.agents/skills");
const PORT = Number(process.env.PORT ?? 3333);
const BASE_URL = (process.env.BASE_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "");

interface FileEntry {
  path: string;
  size_bytes: number;
}

/** Optional MCP field: trim; empty → undefined; invalid shape rejected by Zod before handler. */
const optionalTestSessionIdField = z.preprocess(
  (val) => {
    if (val === undefined || val === null) return undefined;
    if (typeof val !== "string") return val;
    const t = val.trim();
    return t === "" ? undefined : t;
  },
  z
    .string()
    .max(120)
    .refine((s) => isValidTestSessionId(s), { message: "invalid test_session_id" })
    .optional()
);

function invalidSkillDirectoryReason(name: string): string | null {
  if (!name || !isValidFolderName(name)) {
    return "Invalid skill name: use a single directory segment (letters, digits, ., _, -), max 81 chars, matching the folder name under the skills root.";
  }
  const skillRoot = path.join(SKILLS_DIR, name);
  const baseResolved = path.resolve(SKILLS_DIR);
  const skillResolved = path.resolve(skillRoot);
  const rel = path.relative(baseResolved, skillResolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return "Invalid skill path: outside skills directory.";
  }
  return null;
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function walkDir(dir: string, base: string): FileEntry[] {
  const entries: FileEntry[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const relative = path.join(base, entry).replace(/\\/g, "/");
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      entries.push(...walkDir(full, relative));
    } else {
      entries.push({ path: relative, size_bytes: stat.size });
    }
  }
  return entries;
}

function createServer(storage: StorageAdapter): McpServer {
  const server = new McpServer(
    { name: "skillyard", version: "0.2.0" },
    {
      instructions: `SkillYard serves reusable agent skills on demand.

PREREQ — If you can call any SkillYard tool (e.g. list_skills / get_skill / setup_project) in this chat, then MCP is already configured for this client. In that case: do NOT tell the user to add MCP JSON or restart the IDE — continue with project wiring and skill install. Only talk about MCP config/restart when tools are missing or failing.

WORKFLOW — follow this order:
0. WIRE PROJECT — Call setup_project(ide) for canonical merge snippets + AGENTS.md sentinel block (use exact text). If MCP is NOT configured yet (tools unavailable), use docs/CONNECT or setup_project.mcp_configs, then fully restart this client.
1. DISCOVER — list_skills() or list_skills(query:"..."). Use folderName for get_skill.
2. FETCH — get_skill(name) with that folderName. Read downloadUrl, install_skills_zip_root, zip_extract_antipattern.
3. INSTALL — Ensure directory exists: PowerShell: New-Item -ItemType Directory -Force .agents/skills   bash: mkdir -p .agents/skills
   Download ZIP from downloadUrl, extract with destination = skills root ONLY (.agents/skills/):
   PowerShell: Invoke-WebRequest <downloadUrl> -OutFile skill.zip; Expand-Archive skill.zip -DestinationPath .agents/skills
   bash/zsh:   curl -L <downloadUrl> -o skill.zip && unzip -o skill.zip -d .agents/skills
   WRONG (double folder): Expand-Archive ... -DestinationPath .agents/skills/<folderName>  or  unzip ... -d .agents/skills/<folderName>  when the ZIP already contains that folder — yields .agents/skills/<folder>/<folder>/SKILL.md
4. FEEDBACK — submit_feedback with title prefix [e2e-...] or [test-run]; reuse test_session_id per run; list_feedback(test_session_id) for current capstone. get_skillyard_test_guide for full checklist.

RULES:
- Pass folderName to get_skill, not only the display name from frontmatter
- Final paths are .agents/skills/<folderName>/... — preserve all subdirectories inside the bundle
- Never modify SKILL.md frontmatter name or description fields`,
    }
  );

  // ── list_skills ───────────────────────────────────────────────────────────
  server.registerTool(
    "list_skills",
    {
      title: "Browse SkillYard Skills",
      description:
        "List skills from the index. Optional query filters via FTS5 (name, description, body). Each row includes folderName (pass this to get_skill), name (display label), description, status, downloadUrl.",
      inputSchema: {
        query: z.string().optional().describe("Search string; tokenized for FTS (e.g. playwright, gpt-4o, node.js)"),
      },
    },
    async ({ query }) => {
      const rows = await storage.searchSkills(query?.trim() || undefined);
      const skills = rows.map((r) => ({
        folderName: r.folderName,
        name: r.name,
        description: r.description,
        status: r.status,
        downloadUrl: r.downloadUrl,
      }));

      if (skills.length === 0) {
        return {
          content: [{ type: "text", text: query ? `No skills found matching '${query}'.` : "No skills available." }],
        };
      }

      return { content: [{ type: "text", text: JSON.stringify(skills, null, 2) }] };
    }
  );

  // ── get_skill ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_skill",
    {
      title: "Fetch Skill Details",
      description:
        "Get full SKILL.md content and bundle file manifest. name must be the folderName from list_skills. Response includes downloadUrl, install_skills_zip_root, install_note, zip_extract_antipattern (read before extracting ZIP).",
      inputSchema: { name: z.string().describe("folderName from list_skills, e.g. 'skill-creator'") },
    },
    async ({ name }) => {
      const bad = invalidSkillDirectoryReason(name);
      if (bad) {
        return { content: [{ type: "text", text: bad }], isError: true };
      }

      const skillDir = path.join(SKILLS_DIR, name);
      const skillPath = path.join(skillDir, "SKILL.md");

      const row = await storage.getSkill(name);
      if (!row && !fs.existsSync(skillPath)) {
        return {
          content: [{ type: "text", text: `Skill '${name}' not found. Use list_skills to see available skills.` }],
          isError: true,
        };
      }

      const allFiles = fs.existsSync(skillDir) ? walkDir(skillDir, "") : [];
      const supportingFiles = allFiles.filter((f) => f.path !== "SKILL.md");

      const content = row?.content ?? fs.readFileSync(skillPath, "utf-8");
      const downloadUrl = row?.downloadUrl ?? `${BASE_URL}/skills/${name}/download`;
      const contentHash = row?.contentHash ?? sha256(content);
      const folderName = row?.folderName ?? name;
      const displayName = row?.name ?? name;
      const description = row?.description ?? "";

      const skillsZipRoot = ".agents/skills/";
      const response = {
        folderName,
        name: displayName,
        description,
        contentHash,
        downloadUrl,
        content,
        files: supportingFiles,
        install_path: `${skillsZipRoot}${folderName}/`,
        install_skills_zip_root: skillsZipRoot,
        install_note: `ZIP contains a top-level "${folderName}/" folder. Extract with destination = skills root only (${skillsZipRoot}) so SKILL.md ends up at ${skillsZipRoot}${folderName}/SKILL.md.`,
        zip_extract_antipattern: `Do NOT use Expand-Archive -DestinationPath ${skillsZipRoot}${folderName} or unzip -d ${skillsZipRoot}${folderName} when the archive already has a "${folderName}/" root — that nests to ${skillsZipRoot}${folderName}/${folderName}/SKILL.md.`,
      };

      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );

  // ── submit_feedback ───────────────────────────────────────────────────────
  server.registerTool(
    "submit_feedback",
    {
      title: "Submit SkillYard Feedback",
      description:
        "Record bug, improvement, documentation, or feature_request. Server sets skill_content_hash from current indexed skill when skill_name is valid.",
      inputSchema: {
        skill_name: z.string().max(80).optional().describe(
          "Folder name of the skill (same as list_skills folderName). Omit for general SkillYard feedback."
        ),
        category: z.enum(["bug", "improvement", "documentation", "feature_request"]).describe(
          "bug = fails or wrong output; improvement = works but could be better; documentation = unclear guidance; feature_request = new capability"
        ),
        severity: z.enum(["low", "medium", "high", "critical"]).describe(
          "low = minor; medium = partially blocks; high = blocks task; critical = data loss or corruption"
        ),
        title: z.string().min(5).max(120).describe("One-line summary."),
        description: z.string().min(10).max(8000).describe("What you tried, what happened, what you expected (longer test reports ok)."),
        llm_model: z.string().max(100).optional().describe('Model id, e.g. "claude-sonnet-4-5"'),
        ide_name: z.string().max(100).optional().describe('IDE or CLI, e.g. "Cursor 0.48"'),
        os: z.string().max(100).optional().describe('OS, e.g. "Windows 11"'),
        context: z.string().max(4000).optional().describe("Extra context: workspace path, host OS, URLs, timings (stored as environment)"),
        error_logs: z.string().max(2000).optional().describe("Errors or stack traces"),
        test_session_id: optionalTestSessionIdField.describe(
          "One id per E2E run; reuse on every submit_feedback in that run. Prior row for same id becomes archived; newest stays report_state latest."
        ),
      },
    },
    async (args) => {
      let skillName: string | null = args.skill_name?.trim() || null;
      if (skillName && !isValidFolderName(skillName)) {
        skillName = null;
      }
      const skillContentHash =
        skillName != null ? (await storage.getSkill(skillName))?.contentHash ?? null : null;
      const testSessionId = args.test_session_id ?? null;

      const id = await storage.insertFeedback({
        skillName,
        skillContentHash,
        category: args.category,
        severity: args.severity,
        title: args.title,
        description: args.description,
        llmModel: args.llm_model ?? null,
        ideName: args.ide_name ?? null,
        os: args.os ?? null,
        environment: args.context ?? null,
        errorLogs: args.error_logs ?? null,
        testSessionId,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { feedback_id: id, skill_name: skillName, skill_content_hash: skillContentHash, test_session_id: testSessionId },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── list_feedback (maintainers / triage) ───────────────────────────────────
  server.registerTool(
    "list_feedback",
    {
      title: "List Submitted Feedback",
      description:
        "Returns recent feedback rows from this server’s SQLite (newest first). Filter with title_starts_with e.g. [e2e-windsurf] or [test-run]. With test_session_id, default is only the current capstone (report_state latest); set include_archived_session_rows true for full session history. Same MCP URL as testers = same data.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().default(30).describe("Max rows after filter"),
        title_starts_with: z.string().max(120).optional().describe("Only titles starting with this string (e.g. [test-run])"),
        skill_name: z.string().max(80).optional().describe("Only feedback for this skill folderName"),
        test_session_id: optionalTestSessionIdField.describe("Filter to one E2E run"),
        include_archived_session_rows: z
          .boolean()
          .optional()
          .default(false)
          .describe("With test_session_id: false = only latest capstone for that session; true = all rows (archived + latest), newest first"),
      },
    },
    async ({ limit, title_starts_with, skill_name, test_session_id, include_archived_session_rows }) => {
      const lim = limit ?? 30;
      const filter: FeedbackListFilter = {};
      const sk = skill_name?.trim();
      if (sk) filter.skillName = sk;
      if (test_session_id) {
        filter.testSessionId = test_session_id;
        if (!include_archived_session_rows) filter.reportState = "latest";
      }
      const rows = await storage.listFeedback(Object.keys(filter).length ? filter : undefined);
      let out = rows;
      if (title_starts_with?.trim()) {
        const p = title_starts_with.trim();
        out = out.filter((r) => (r.title ?? "").startsWith(p));
      }
      out = out.slice(0, lim);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }
  );

  // ── get_skillyard_test_guide ───────────────────────────────────────────────
  server.registerTool(
    "get_skillyard_test_guide",
    {
      title: "SkillYard Test & Feedback Guide",
      description:
        "Read-only: how to run smoke checks, E2E skill install, submit_feedback title conventions, and how list_feedback shares data across IDEs on the same server.",
      inputSchema: {},
    },
    async () => {
      const text = buildSkillyardTestGuide({
        baseUrl: BASE_URL,
        mcpUrl: `${BASE_URL}/mcp`,
      });
      return { content: [{ type: "text", text }] };
    }
  );

  // ── setup_project ─────────────────────────────────────────────────────────
  server.registerTool(
    "setup_project",
    {
      title: "Wire Project to SkillYard",
      description:
        "Returns JSON: IDE MCP merge snippets, canonical AGENTS.md block (use this text — do not paraphrase), zip_extract rules, mcp_documentation (MCP + IDE links), and ordered steps. Server does not write files. Call early: if list_skills already works, treat mcp_configs as optional reference for other machines; still merge agents_md if sentinel missing.",
      inputSchema: {
        ide: z.enum(["cursor", "windsurf", "claude-code", "vscode", "all"])
          .describe("The IDE to configure, or 'all' for every supported IDE"),
        server_url: z.string().optional()
          .describe("SkillYard server URL — defaults to http://localhost:3333/mcp"),
      },
    },
    async ({ ide, server_url }) => {
      const url = server_url ?? `${BASE_URL}/mcp`;

      const configs: Record<string, { file: string; content: unknown }> = {
        cursor: {
          file: "%USERPROFILE%\\.cursor\\mcp.json (Windows) or ~/.cursor/mcp.json (macOS/Linux)",
          content: { mcpServers: { skillyard: { url } } },
        },
        windsurf: {
          file: "%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json (Windows) or ~/.codeium/windsurf/mcp_config.json (macOS/Linux)",
          content: { mcpServers: { skillyard: { url } } },
        },
        "claude-code": {
          file: ".mcp.json in project root (project-scoped) or ~/.claude/mcp.json (global)",
          content: { mcpServers: { skillyard: { url } } },
        },
        vscode: {
          file: ".vscode/mcp.json in project root",
          content: { servers: { skillyard: { type: "http", url } } },
        },
      };

      const selected = ide === "all" ? Object.entries(configs) : [[ide, configs[ide as keyof typeof configs]]];

      const agentsMdSection = `<!-- skillyard:start -->
## SkillYard
Agent skills are managed via SkillYard (${url}). Use the skillyard MCP tools to discover and install skills into .agents/skills/. The MCP server provides full usage instructions on connection.
<!-- skillyard:end -->`;

      const skillsDir = ".agents/skills/";
      const baseNoMcp = url.replace(/\/mcp\/?$/, "");
      const result = {
        skills_dir: skillsDir,
        download_url_pattern: `${baseNoMcp}/skills/<skill-name>/download`,
        zip_extract: {
          skills_root: skillsDir,
          rule: "Unzip/Expand-Archive destination must be the skills root (skills_dir), never skills_dir + folderName when the ZIP already contains that folder.",
          powershell_example: `Invoke-WebRequest "<downloadUrl>" -OutFile skill.zip; Expand-Archive skill.zip -DestinationPath ${skillsDir.replace(/\/$/, "")}`,
          bash_example: `curl -L "<downloadUrl>" -o skill.zip && unzip -o skill.zip -d ${skillsDir.replace(/\/$/, "")}`,
          antipattern: `Wrong: -DestinationPath ${skillsDir}<folderName> or unzip -d ${skillsDir}<folderName> for a ZIP whose root is <folderName>/ — creates double nesting.`,
        },
        mcp_configs: Object.fromEntries(
          selected.map(([name, cfg]) => [name, {
            file: (cfg as { file: string; content: unknown }).file,
            merge: (cfg as { file: string; content: unknown }).content,
            instruction: "Merge the 'skillyard' key into the existing config — do not replace the whole file",
          }])
        ),
        agents_md: {
          sentinel: "<!-- skillyard:start -->",
          section: agentsMdSection,
          instruction: "Append agents_md.section to AGENTS.md only if the sentinel is not already present — use exact section text, do not substitute shorter prose",
        },
        steps: [
          "If you can call SkillYard tools in this chat, MCP is already wired for this client — skip MCP config/restart steps.",
          "If tools are missing or failing: paste MCP JSON from SkillYard docs/CONNECT.md (or merge mcp_configs), then fully restart this client and verify list_skills().",
          "Merge agents_md.section into this project's AGENTS.md when the sentinel is absent (exact text from this response).",
          `Create skills directory if needed: PowerShell New-Item -ItemType Directory -Force ${skillsDir.replace(/\/$/, "")}  |  bash mkdir -p ${skillsDir.replace(/\/$/, "")}`,
          "Install skills: get_skill → downloadUrl; extract per zip_extract (destination = skills root only).",
        ],
        mcp_documentation: {
          skillyard_CONNECT:
            "https://github.com/loremacs/skillyard/blob/main/docs/CONNECT.md",
          mcp: "https://modelcontextprotocol.io/",
          mcp_spec: "https://modelcontextprotocol.io/specification/latest",
          mcp_clients: "https://modelcontextprotocol.io/clients",
          cursor_mcp: "https://docs.cursor.com/context/model-context-protocol",
          vscode_mcp: "https://code.visualstudio.com/docs/copilot/chat/mcp-servers",
        },
      };

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── skills as Resources ───────────────────────────────────────────────────
  // Expose skills via the MCP Resources primitive (application-controlled read-only data).
  // Tools remain the primary interface for autonomous agent use; Resources allow clients
  // that prefer the Resources pattern to consume the same data natively.
  server.resource(
    "skill",
    new ResourceTemplate("skillyard://skills/{name}", {
      list: async () => {
        const rows = await storage.listSkills();
        return {
          resources: rows.map((r) => ({
            uri: `skillyard://skills/${r.folderName}`,
            name: r.name,
            description: r.description,
            mimeType: "text/markdown",
          })),
        };
      },
    }),
    { description: "SKILL.md content for a SkillYard skill", mimeType: "text/markdown" },
    async (uri, variables) => {
      const skillName = variables.name as string;
      const bad = invalidSkillDirectoryReason(skillName);
      if (bad) {
        throw new Error(bad);
      }
      const skillPath = path.join(SKILLS_DIR, skillName, "SKILL.md");
      const row = await storage.getSkill(skillName);
      const text = row?.content ?? (fs.existsSync(skillPath) ? fs.readFileSync(skillPath, "utf-8") : null);
      if (text == null) {
        throw new Error(`Skill '${skillName}' not found`);
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text,
          },
        ],
      };
    }
  );

  return server;
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const app = createMcpExpressApp();
const storage = createStorageAdapter();

// ── REST (health, listing, smoke) — registered before MCP + ZIP ─────────────
app.get("/health", async (_req: Request, res: Response) => {
  try {
    const skillCount = await storage.getSkillCount();
    res.json({ status: "ok", skillCount, uptime: process.uptime() });
  } catch (e) {
    res.status(500).json({ status: "error", message: String(e) });
  }
});

app.get("/skills", async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const results = await storage.searchSkills(q?.trim() || undefined);
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/skills/:name", async (req: Request, res: Response) => {
  const raw = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
  const bad = invalidSkillDirectoryReason(raw);
  if (bad) {
    res.status(400).json({ error: bad });
    return;
  }
  try {
    const skill = await storage.getSkill(raw);
    if (!skill) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }
    res.json({
      folderName: skill.folderName,
      name: skill.name,
      description: skill.description,
      status: skill.status,
      version: skill.version,
      contentHash: skill.contentHash,
      downloadUrl: skill.downloadUrl,
      updatedAt: skill.updatedAt,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/feedback/test", async (req: Request, res: Response) => {
  if (process.env.SKILLYARD_DEV_MODE !== "true") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const category = body.category as string | undefined;
  const severity = body.severity as string | undefined;
  const title = body.title as string | undefined;
  const description = body.description as string | undefined;
  if (!category || !severity || !title || !description) {
    res.status(400).json({ error: "category, severity, title, description required" });
    return;
  }
  const cats = ["bug", "improvement", "documentation", "feature_request"];
  const sevs = ["low", "medium", "high", "critical"];
  if (!cats.includes(category) || !sevs.includes(severity)) {
    res.status(400).json({ error: "invalid category or severity" });
    return;
  }
  let skillName: string | null = (body.skill_name as string | undefined)?.trim() || null;
  if (skillName && !isValidFolderName(skillName)) {
    skillName = null;
  }
  const rawSid = body.test_session_id;
  let testSessionId: string | null = null;
  if (rawSid !== undefined && rawSid !== null && rawSid !== "") {
    if (typeof rawSid !== "string") {
      res.status(400).json({ error: "test_session_id must be a string" });
      return;
    }
    const t = rawSid.trim();
    if (!isValidTestSessionId(t)) {
      res.status(400).json({ error: "invalid test_session_id" });
      return;
    }
    testSessionId = t;
  }
  const skillContentHash =
    skillName != null ? (await storage.getSkill(skillName))?.contentHash ?? null : null;
  try {
    const id = await storage.insertFeedback({
      skillName,
      skillContentHash,
      category: category as "bug" | "improvement" | "documentation" | "feature_request",
      severity: severity as "low" | "medium" | "high" | "critical",
      title,
      description,
      llmModel: (body.llm_model as string) ?? null,
      ideName: (body.ide_name as string) ?? null,
      os: (body.os as string) ?? null,
      environment: (body.context as string) ?? null,
      errorLogs: (body.error_logs as string) ?? null,
      testSessionId,
    });
    res.json({ feedback_id: id, test_session_id: testSessionId });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/mcp", async (req: Request, res: Response) => {
  const server = createServer(storage);
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

// ── ZIP download endpoint ─────────────────────────────────────────────────────
app.get("/skills/:name/download", (req: Request, res: Response) => {
  const skillName = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
  const bad = invalidSkillDirectoryReason(skillName);
  if (bad) {
    res.status(400).json({ error: bad });
    return;
  }
  const skillDir = path.join(SKILLS_DIR, skillName);

  if (!fs.existsSync(skillDir) || !fs.existsSync(path.join(skillDir, "SKILL.md"))) {
    res.status(404).json({ error: `Skill '${skillName}' not found` });
    return;
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${skillName}.zip"`);

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("error", (err) => { throw err; });
  archive.pipe(res);
  archive.directory(skillDir, skillName);
  archive.finalize();
});

const PID_FILE = path.resolve(__dirname, "../mcp.pid");

async function bootstrap(): Promise<void> {
  await storage.initialize();
  const sync = await syncSkillsFromDisk(storage, SKILLS_DIR, BASE_URL, {});
  console.log(
    `Storage: synced=${sync.synced} skipped=${sync.skipped} deleted=${sync.deleted} warnings=${sync.warnings.length}`
  );
  if (sync.warnings.length) {
    for (const w of sync.warnings) console.warn(`  ${w}`);
  }

  app.listen(PORT, () => {
    fs.writeFileSync(PID_FILE, String(process.pid));
    console.log(`SkillYard MCP server running at http://localhost:${PORT}/mcp`);
    console.log(`Tools: list_skills, get_skill, setup_project, submit_feedback, list_feedback, get_skillyard_test_guide`);
    console.log(`REST: GET /health, GET /skills, GET /skills/:name, GET /skills/:name/download`);
    console.log(`PID: ${process.pid} (saved to mcp.pid)`);
  });
}

bootstrap().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});

function shutdown() {
  void storage.close().catch(() => {
    /* ignore */
  });
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
