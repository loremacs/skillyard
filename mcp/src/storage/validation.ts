export const SKILL_FOLDER_RE = /^[a-z0-9][a-z0-9._-]{0,80}$/i;

/** E2E run id for feedback chaining (submit_feedback + list_feedback). */
export const TEST_SESSION_ID_RE = /^[a-zA-Z0-9._:-]{1,120}$/;

export function isValidFolderName(name: string): boolean {
  return SKILL_FOLDER_RE.test(name);
}

export function isValidTestSessionId(id: string): boolean {
  return TEST_SESSION_ID_RE.test(id);
}
