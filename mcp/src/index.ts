import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type { Request, Response } from "express";
import archiver from "archiver";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = process.env.SKILLYARD_DIR ?? path.resolve(__dirname, "../../.agents/skills");
const PORT = Number(process.env.PORT ?? 3333);
const BASE_URL = (process.env.BASE_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "");

interface SkillMeta {
  name: string;
  description: string;
}

interface FileEntry {
  path: string;
  size_bytes: number;
}

function parseFrontmatter(content: string): SkillMeta {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: "", description: "" };

  const block = match[1];
  const nameMatch = block.match(/^name:\s*(.+)$/m);

  let description = "";
  const blockScalar = block.match(/^description:\s*>-?\s*\n([\s\S]*?)(?=\n\S|$)/m);
  const plainString = block.match(/^description:\s*(.+)$/m);

  if (blockScalar) {
    // Multi-line block scalar (>- or >)
    description = blockScalar[1]
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ");
  } else if (plainString) {
    // Single-line plain string
    description = plainString[1].trim();
  }

  return { name: nameMatch?.[1]?.trim() ?? "", description };
}

function listSkillDirs(): string[] {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs.readdirSync(SKILLS_DIR).filter((entry: string) =>
    fs.existsSync(path.join(SKILLS_DIR, entry, "SKILL.md"))
  );
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

function createServer(): McpServer {
  const server = new McpServer(
    { name: "skillyard", version: "0.2.0" },
    {
      instructions: `SkillYard serves reusable agent skills on demand.

WORKFLOW — follow this order for any skill-related task:
1. DISCOVER — Call list_skills() or list_skills(query:"keyword") to find skills. Returns name + description only.
2. FETCH — Call get_skill(name) to get the full SKILL.md, file manifest, and download URL.
3. INSTALL — Download the ZIP from the returned download_url and extract into .agents/skills/:
   PowerShell: Invoke-WebRequest <download_url> -OutFile skill.zip; Expand-Archive skill.zip -DestinationPath .agents/skills/
   bash/zsh:   curl -L <download_url> -o skill.zip && unzip skill.zip -d .agents/skills/

RULES:
- Skills always install to .agents/skills/<skill-name>/ — preserve all subdirectories
- Never modify SKILL.md frontmatter name or description fields
- If this project has not been wired to SkillYard yet, call setup_project(ide) once to generate the IDE config and a project marker`,
    }
  );

  // ── list_skills ───────────────────────────────────────────────────────────
  server.tool(
    "list_skills",
    "List available SkillYard skills (name + description only). Pass an optional query to filter by keyword — e.g. 'playwright', 'typescript', 'git'. Only returns metadata; use get_skill to fetch full content.",
    { query: z.string().optional().describe("Keyword to filter by (matched against name and description, case-insensitive)") },
    async ({ query }) => {
      const dirs = listSkillDirs();
      let skills = dirs.map((dir) => {
        const content = fs.readFileSync(path.join(SKILLS_DIR, dir, "SKILL.md"), "utf-8");
        const { name, description } = parseFrontmatter(content);
        return { name: name || dir, description };
      });

      if (query) {
        const q = query.toLowerCase();
        skills = skills.filter(
          (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
        );
      }

      if (skills.length === 0) {
        return {
          content: [{ type: "text", text: query ? `No skills found matching '${query}'.` : "No skills available." }],
        };
      }

      return { content: [{ type: "text", text: JSON.stringify(skills, null, 2) }] };
    }
  );

  // ── get_skill ─────────────────────────────────────────────────────────────
  server.tool(
    "get_skill",
    "Get the SKILL.md content for a named skill plus a manifest of all supporting files and a download URL. Use the download URL to fetch the full skill as a ZIP.",
    { name: z.string().describe("Skill name, e.g. 'skill-creator'") },
    async ({ name }) => {
      const skillDir = path.join(SKILLS_DIR, name);
      const skillPath = path.join(skillDir, "SKILL.md");

      if (!fs.existsSync(skillPath)) {
        return {
          content: [{ type: "text", text: `Skill '${name}' not found. Use list_skills to see available skills.` }],
          isError: true,
        };
      }

      const allFiles = walkDir(skillDir, "");
      const supportingFiles = allFiles.filter((f) => f.path !== "SKILL.md");

      const response = {
        install_path: `.agents/skills/${name}/`,
        download_url: `${BASE_URL}/skills/${name}/download`,
        skill_md: fs.readFileSync(skillPath, "utf-8"),
        supporting_files: supportingFiles,
        install_note: `Download all files at once: GET ${BASE_URL}/skills/${name}/download — extract into .agents/skills/`,
      };

      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );

  // ── setup_project ─────────────────────────────────────────────────────────
  server.tool(
    "setup_project",
    "One-time project wiring: generates the IDE MCP config entry and AGENTS.md section for this project. Call once per project. Safe to re-run — uses a sentinel to prevent duplicate AGENTS.md entries. Also returns the skills directory structure and download URL pattern.",
    {
      ide: z.enum(["cursor", "windsurf", "claude-code", "vscode", "all"])
        .describe("The IDE to configure, or 'all' for every supported IDE"),
      server_url: z.string().optional()
        .describe("SkillYard server URL — defaults to http://localhost:3333/mcp"),
    },
    async ({ ide, server_url }) => {
      const url = server_url ?? `http://localhost:${PORT}/mcp`;

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

// ── ZIP download endpoint ─────────────────────────────────────────────────────
app.get("/skills/:name/download", (req: Request, res: Response) => {
  const skillName = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
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

app.listen(PORT, () => {
  fs.writeFileSync(PID_FILE, String(process.pid));
  console.log(`SkillYard MCP server running at http://localhost:${PORT}/mcp`);
  console.log(`Tools: list_skills, get_skill, setup_project`);
  console.log(`PID: ${process.pid} (saved to mcp.pid)`);
});

function shutdown() {
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
