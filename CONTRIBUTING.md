# Contributing to SkillYard

SkillYard grows through community contributions. The most valuable contributions are new skills and improvements to existing ones.

## What you can contribute

- **New skills** — reusable agent workflows for a specific task or domain
- **Skill improvements** — better instructions, clearer triggers, fixed edge cases
- **Meta-skill improvements** — improvements to `create-skill`, `create-agents-md`, `create-rule`, or `universal-agent-config`
- **Bug reports** — a skill produced wrong output in a real project
- **Skill requests** — you need a skill that doesn't exist yet

## Before you start

Search [existing issues](https://github.com/loremacs/skillyard/issues) and [skills](https://github.com/loremacs/skillyard/tree/main/.agents/skills) to avoid duplicating work.

## Skill structure

Every skill lives in its own directory:

```
.agents/skills/<skill-name>/
  SKILL.md              ← required
  references/           ← optional supporting docs
  scripts/              ← optional automation scripts
```

`SKILL.md` must begin with YAML frontmatter:

```yaml
---
name: skill-name
description: >
  One or two sentences. Start with a verb. Describe when to use this skill,
  not what it does internally.
---
```

The description is the trigger. Write it so the agent activates this skill when and only when it is relevant.

## Submitting a new skill

1. Fork the repo and create a branch: `skill/<skill-name>`
2. Create `.agents/skills/<skill-name>/SKILL.md` following the structure above
3. Test the skill against at least 3 realistic prompts in your agent tool of choice
4. Open a PR using the skill submission template
5. Describe your test results — what worked, what didn't, what edge cases you found

Skills start in beta. After real-project confirmation by multiple contributors they become eligible for mainline promotion.

## Improving an existing skill

1. Fork and branch: `improve/<skill-name>`
2. Edit the skill file
3. Note what was wrong and what you changed in the PR description
4. If you tested it, include results

## Reporting a skill problem

Use the [bug report template](https://github.com/loremacs/skillyard/issues/new?template=bug_report.md). Include:
- Which skill failed
- The prompt you used
- What the agent produced
- What you expected

## Code contributions

Python scripts in `.agents/skills/skill-creator/scripts/` require Python 3.8+. Run `python --version` to confirm before contributing.

No build step is required. No test runner is required (yet). Manual validation against real agent prompts is the current standard.

## Commit style

Use the imperative mood and keep it under 72 characters:

```
Add skill for database migration workflows
Fix create-skill trigger firing on unrelated prompts
Improve universal-agent-config Windows path handling
```

## License

By contributing you agree your contributions are licensed under Apache 2.0, consistent with the rest of this project.
