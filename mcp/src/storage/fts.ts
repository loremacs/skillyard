export function toFtsQuery(input: string): string {
  const tokens = input.toLowerCase().match(/[a-z0-9_]+/g);
  if (!tokens?.length) return "";
  return tokens.map((t) => `"${t}"`).join(" OR ");
}
