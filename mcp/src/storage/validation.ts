export const SKILL_FOLDER_RE = /^[a-z0-9][a-z0-9._-]{0,80}$/i;

export function isValidFolderName(name: string): boolean {
  return SKILL_FOLDER_RE.test(name);
}
