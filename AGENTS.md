# AGENTS.md

## Be Concise
State only what cannot be inferred. Verbose guidance is a defect.

## Single Source of Truth
Maintain one canonical source for each reusable item, including code, config, schemas, rules, skills, and shared documentation.

Reference, import, or generate from the canonical source instead of duplicating content. Before adding anything new, search the repo for an existing source that can be reused or extended.

If duplication is required for tooling compatibility, clearly mark which source is canonical and ensure all other copies are generated or synced from it.

## Skill Files
Skills live in `.agents/skills/<name>/SKILL.md`. When creating or modifying any skill, use the `skill-creator` skill.