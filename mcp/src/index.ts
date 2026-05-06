import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type { Request, Response } from "express";
import archiver from "archiver";
import { createStorageAdapter } from "./storage/factory.js";
import { syncSkillsFromDisk } from "./skills/repository.js";
import { isValidFolderName } from "./storage/validation.js";
import type { StorageAdapter } from "./storage/adapter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = process.env.SKILLYARD_DIR ?? path.resolve(__dirname, "../../.agents/skills");
const PORT = Number(process.env.PORT ?? 3333);
const BASE_URL = (process.env.BASE_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "");

interface FileEntry {
  path: string;
  size_bytes: number;
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

const adapter: StorageAdapter = createStorageAdapter();

function createServer(): McpServer {
  const server = new McpServer(
    { name: "skillyard", version: "0.3.0" },
    {
      instructions: `SkillYard serves reusable agent skills on demand.

WORKFLOW — follow this order for any skill-related task:
1. DISCOVER — Call list_skills() or list_skills(query:"keyword") to find skills. Returns folderName + description.
2. FETCH — Call get_skill(name) to get the full content, contentHash, manifest, and download URL.
3. INSTALL — Download the ZIP from the returned download_url and extract into .agents/skills/:
   PowerShell: Invoke-WebRequest <download_url> -OutFile skill.zip; Expand-Archive skill.zip -DestinationPath .agents/skills/
   bash/zsh:   curl -L <download_url> -o skill.zip && unzip skill.zip -d .agents/skills/

RULES:
- Skills always install to .agents/skills/<skill-name>/ — preserve all subdirectories
- Never modify SKILL.md frontmatter name or description fields
- If this project has not been wired to SkillYard yet, call setup_project(ide) once to generate the IDE config and a project marker
- Use submit_feedback to report bugs, improvements, or missing skills`,
    }
  );

  // ── list_skills ───────────────────────────────────────────────────────────
  server.registerTool(
    "list_skills",
    {
      title: "Browse SkillYard Skills",
      description: "List available SkillYard skills (name + description only). Pass an optional query to filter by keyword — e.g. 'playwright', 'typescript', 'git'. Only returns metadata; use get_skill to fetch full content.",
      inputSchema: { query: z.string().optional().describe("Keyword to filter by (matched against name and description, case-insensitive)") },
    },
    async ({ query }) => {
      const skills = await adapter.searchSkills(query);
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
      description: "Get the SKILL.md content for a named skill plus a manifest of all supporting files and a download URL. Use the download URL to fetch the full skill as a ZIP.",
      inputSchema: { name: z.string().describe("Skill name, e.g. 'skill-creator'") },
    },
    async ({ name }) => {
      if (!isValidFolderName(name)) {
        return {
          content: [{ type: "text", text: "Invalid skill name: use a single directory segment (letters, digits, ., _, -), max 80 chars." }],
          isError: true,
        };
      }

      const skill = await adapter.getSkill(name);
      if (!skill) {
        return {
          content: [{ type: "text", text: `Skill '${name}' not found. Use list_skills to see available skills.` }],
          isError: true,
        };
      }

      const skillDir = path.join(SKILLS_DIR, name);
      const allFiles = fs.existsSync(skillDir) ? walkDir(skillDir, "") : [];
      const supportingFiles = allFiles.filter((f) => f.path !== "SKILL.md");

      const response = {
        name: skill.name,
        folderName: skill.folderName,
        description: skill.description,
        contentHash: skill.contentHash,
        install_path: `.agents/skills/${name}/`,
        download_url: skill.downloadUrl,
        content: skill.content,
        supporting_files: supportingFiles,
        install_note: `Download all files at once: GET ${BASE_URL}/skills/${name}/download — extract into .agents/skills/`,
      };

      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );

  // ── setup_project ─────────────────────────────────────────────────────────
  server.registerTool(
    "setup_project",
    {
      title: "Wire Project to SkillYard",
      description:
        "One-time project wiring: returns JSON with IDE MCP config snippets and an AGENTS.md section to merge — the server does not write files. Call once per project. Safe to re-run — sentinel text prevents duplicate AGENTS.md blocks when applied manually. Also returns skills_dir and download_url_pattern.",
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

      const result = {
        skills_dir: ".agents/skills/",
        download_url_pattern: `${url.replace("/mcp", "")}/skills/<skill-name>/download`,
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
          instruction: "Append to AGENTS.md only if the sentinel is not already present",
        },
        steps: [
          "1. Merge mcp_configs entries into the appropriate IDE config files",
          "2. Append agents_md.section to this project's AGENTS.md if the sentinel is absent",
          "3. Restart the IDE to activate the MCP connection",
          "4. Verify with list_skills()",
        ],
      };

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── submit_feedback ───────────────────────────────────────────────────────
  server.registerTool(
    "submit_feedback",
    {
      title: "Submit Feedback",
      description: "Report a bug, improvement, documentation gap, or feature request. The server auto-links the current skill version — no hash required.",
      inputSchema: {
        skill_name: z.string().max(80).optional().describe(
          "Folder name of the skill this feedback is about. Omit for general SkillYard feedback."
        ),
        category: z.enum(["bug", "improvement", "documentation", "feature_request"]).describe(
          "bug = skill fails or produces wrong output. improvement = works but could be better. documentation = guidance unclear or missing. feature_request = new skill or capability needed."
        ),
        severity: z.enum(["low", "medium", "high", "critical"]).describe(
          "low = minor. medium = partially blocks workflow. high = fully blocks task. critical = data loss or corruption."
        ),
        title: z.string().min(5).max(120).describe("One-line summary."),
        description: z.string().min(10).max(2000).describe("What you tried, what happened, and what you expected."),
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
          "Any additional context not covered by the structured fields above."
        ),
        error_logs: z.string().max(2000).optional().describe(
          "Relevant error messages or stack traces."
        ),
      },
    },
    async ({ skill_name, category, severity, title, description, llm_model, ide_name, os, context, error_logs }) => {
      const skillHash = skill_name && isValidFolderName(skill_name)
        ? (await adapter.getSkill(skill_name))?.contentHash ?? null
        : null;
      const id = await adapter.insertFeedback({
        skillName:        skill_name        ?? null,
        skillContentHash: skillHash,
        category,
        severity,
        title,
        description,
        llmModel:    llm_model   ?? null,
        ideName:     ide_name    ?? null,
        os:          os          ?? null,
        environment: context     ?? null,
        errorLogs:   error_logs  ?? null,
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ feedback_id: id, message: "Feedback recorded. Thank you." }) }],
      };
    }
  );

  // ── skills as Resources ───────────────────────────────────────────────────
  // Expose skills via the MCP Resources primitive (application-controlled read-only data).
  // Tools remain the primary interface for autonomous agent use; Resources allow clients
  // that prefer the Resources pattern to consume the same data natively.
  server.resource(
    "skill",
    new ResourceTemplate("skillyard://skills/{name}", {
      list: async () => ({
        resources: (await adapter.listSkills()).map((s) => ({
          uri: `skillyard://skills/${s.folderName}`,
          name: s.name,
          description: s.description,
          mimeType: "text/markdown",
        })),
      }),
    }),
    { description: "SKILL.md content for a SkillYard skill", mimeType: "text/markdown" },
    async (uri, variables) => {
      const skillName = variables.name as string;
      if (!isValidFolderName(skillName)) throw new Error("Invalid skill name");
      const skill = await adapter.getSkill(skillName);
      if (!skill) throw new Error(`Skill '${skillName}' not found`);
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: skill.content }],
      };
    }
  );

  return server;
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const app = createMcpExpressApp();

app.post("/mcp", async (req: Request, res: Response) => {
  const server = createServer();
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

// ── REST endpoints ────────────────────────────────────────────────────────────
app.get("/health", async (_req: Request, res: Response) => {
  const skillCount = await adapter.getSkillCount();
  res.json({ status: "ok", skillCount, uptime: process.uptime() });
});

app.get("/skills", async (req: Request, res: Response) => {
  const query = typeof req.query.q === "string" ? req.query.q : undefined;
  res.json(await adapter.searchSkills(query));
});

app.get("/skills/:name/download", (req: Request, res: Response) => {
  const skillName = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
  if (!isValidFolderName(skillName)) {
    res.status(400).json({ error: "Invalid skill name" });
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

app.get("/skills/:name", async (req: Request, res: Response) => {
  const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
  if (!isValidFolderName(name)) {
    res.status(400).json({ error: "Invalid skill name" });
    return;
  }
  const skill = await adapter.getSkill(name);
  if (!skill) {
    res.status(404).json({ error: "Skill not found" });
    return;
  }
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

app.post("/feedback/test", async (req: Request, res: Response) => {
  if (process.env.SKILLYARD_DEV_MODE !== "true") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const { category, severity, title, description } = req.body;
  if (!category || !severity || !title || !description) {
    res.status(400).json({ error: "category, severity, title, description required" });
    return;
  }
  const id = await adapter.insertFeedback({
    skillName:        req.body.skill_name         ?? null,
    skillContentHash: req.body.skill_content_hash ?? null,
    category, severity, title, description,
    llmModel:    req.body.llm_model   ?? null,
    ideName:     req.body.ide_name    ?? null,
    os:          req.body.os          ?? null,
    environment: req.body.context     ?? null,
    errorLogs:   req.body.error_logs  ?? null,
  });
  res.json({ feedback_id: id });
});

const PID_FILE = path.resolve(__dirname, "../mcp.pid");

(async () => {
  await adapter.initialize();
  const syncResult = await syncSkillsFromDisk(adapter, SKILLS_DIR, BASE_URL);
  console.log(`Skills synced: ${syncResult.synced} upserted, ${syncResult.skipped} unchanged, ${syncResult.deleted} removed`);
  if (syncResult.warnings.length > 0) syncResult.warnings.forEach((w) => console.warn(`WARN: ${w}`));
  app.listen(PORT, () => {
    fs.writeFileSync(PID_FILE, String(process.pid));
    console.log(`SkillYard MCP server running at http://localhost:${PORT}/mcp`);
    console.log(`Tools: list_skills, get_skill, setup_project, submit_feedback`);
    console.log(`PID: ${process.pid} (saved to mcp.pid)`);
  });
})();

function shutdown() {
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
