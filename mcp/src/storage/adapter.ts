export interface Skill {
  folderName: string;
  name: string;
  description: string;
  content: string;
  status: "beta" | "mainline" | "private";
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
  category: "bug" | "improvement" | "documentation" | "feature_request";
  severity: "low" | "medium" | "high" | "critical";
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
