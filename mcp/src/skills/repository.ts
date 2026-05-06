import fs from "fs";
import path from "path";
import crypto from "crypto";
import { parse as parseYaml } from "yaml";
import { isValidFolderName } from "../storage/validation.js";
import type { StorageAdapter } from "../storage/adapter.js";

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  try {
    const parsed = parseYaml(match[1]) ?? {};
    return {
      name:        typeof parsed.name        === "string" ? parsed.name.trim()        : undefined,
      description: typeof parsed.description === "string" ? parsed.description.trim() : undefined,
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
    const skillMdPath = path.join(skillsDir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) continue;

    const content = fs.readFileSync(skillMdPath, "utf-8");
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
      status:      existing?.status ?? "mainline",
      version:     existing?.version ?? 1,
      contentHash: hash,
      downloadUrl: `${baseUrl}/skills/${entry.name}/download`,
      updatedAt:   new Date().toISOString(),
    });
    synced++;
  }

  if (diskFolderNames.length === 0) {
    console.warn("WARNING: No valid skills found on disk — skipping deletion to avoid wiping all cached skills. Check SKILLYARD_DIR and SKILL.md files.");
    return { synced, skipped, deleted: 0, warnings };
  }

  const deleted = await adapter.deleteSkillsNotIn(diskFolderNames);
  return { synced, skipped, deleted, warnings };
}
