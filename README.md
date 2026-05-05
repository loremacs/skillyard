# SkillYard — Agent Briefing

---

## The problem

AI coding agents (Cursor, Claude Code, Windsurf, GitHub Copilot, OpenAI Codex,
Gemini CLI, and others) all read instruction files from a project before doing
anything. Those files tell the agent what conventions to follow, what commands
to run, what to avoid, and what the project is trying to accomplish.

Without a shared source for those instructions:

- Every project re-invents the same conventions from scratch
- Agents behave inconsistently across projects and teams
- New teams start with no context and repeat the same mistakes
- Guidance written for one session is lost by the next

---

## The core idea

Define guidance once, in a structured and portable way. Refine it through real
use. Distribute it so any project or team can inherit it without starting over.

The mechanism is three open file formats — `AGENTS.md`, `SKILL.md`, and rules
files — that every major agent tool already reads natively.

---

## The three file types

### `AGENTS.md`

The primary instruction file. Every major AI coding agent reads this when it
opens a project. It is the first thing loaded and the source of truth for all
other guidance.

**What belongs in it:** commands, project structure, conventions, gotchas
(non-obvious facts that agents consistently get wrong), and a three-tier
boundary (always do / ask first / never do).

**What does not belong:** full procedures, architecture essays, or anything
an agent would only need once. Those belong in skills.

**Open standard:** [agents.md](https://agents.md) — stewarded by the Agentic
AI Foundation under the Linux Foundation. Natively supported by Cursor, Claude
Code, OpenAI Codex, Gemini CLI, GitHub Copilot, Windsurf, Aider, Warp, Zed,
and more.

### `SKILL.md`

A reusable workflow instruction. A skill is a self-contained unit of guidance
with a trigger (when to use it) and a body (how to do it). Skills are stored
in a directory named after the skill, inside `.agents/skills/`:

```
.agents/skills/
  skill-name/
    SKILL.md          ← required: frontmatter + instructions
    references/       ← optional: supporting docs loaded on demand
```

Skills are not loaded by default. An agent activates a skill when the task
matches its trigger, or when explicitly asked.

**Open standard:** [agentskills.io](https://agentskills.io)

Minimal structure:

```yaml
---
name: skill-name
description: >
  Use this skill when the user asks for X or needs Y.
---

# Skill Name

One sentence: what this skill does and why.

## Workflow

1. First step — concrete and imperative
2. Second step
3. Validate: [specific check]

## Done when

[Clear, verifiable completion signal]
```

### Rules files

IDE-specific always-on or file-scoped behavior rules. Primarily a Cursor
concept — rules live in `.cursor/rules/` and activate based on file type or
always-apply flags. Any agent can author a rules file using the `create-rule`
skill.

---

## The three users

**The Developer** sets up projects, manages the skill library, reviews the
queue, and authorises skill promotions. They interact with SkillYard directly.

**The QA Tester** clones repos, uses agents, writes tests. They never interact
with SkillYard directly. They benefit from it without knowing it exists.
This is the measure of whether SkillYard is working: a new team member gets
correctly structured output on the first try, without installing anything,
configuring anything, or reading any documentation.

**The Team Lead** reviews the quality pipeline, authorises promotions to the
mainline library, and sets quality thresholds. They interact occasionally —
typically a few minutes per week.

---

## The user flow

```
Define → Refine → Audit → Distribute → Contribute back → Inherit
```

**Define**
A developer describes what they are building. SkillYard reads the description
and recommends a profile — a curated set of skills matched to the project's
stack and needs. The developer approves a plan. SkillYard installs the guidance
files. The agent now knows the project's conventions, testing approach, folder
layout, and workflow without being told any of it manually.

**Refine**
The guidance is used in real projects. When an agent makes a mistake that
requires correction, that correction becomes a new gotcha or rule. When a
workflow repeats, it becomes a skill. Guidance improves through real usage,
not through anticipation of what might go wrong.

**Audit**
An agent reads the project — its stack, structure, and installed skills — and
identifies what workflows have no skill coverage. The agent surfaces the gaps.
The developer decides which ones to fill. This audit can run at any time:
project start, after a sprint, or when something breaks in a way a skill
could have prevented.

**Distribute**
SkillYard is not a skill store. It is a service that manages the entire
pipeline from gap identification through to skill delivery.

When a gap is identified, the agent queries SkillYard. If a matching skill
exists it is returned immediately. Skills reach a project in three ways:

- **On demand via MCP** — agent queries SkillYard at runtime. Skill is
  served directly, no file management required.
- **Global** — SkillYard installed once on a machine; skills available
  across every project automatically.
- **Local** — skills pulled into the project's repository and committed.
  Every team member gets them through version control with no additional setup.

This is what makes SkillYard different from existing tools: those tools
require a human to decide what to install before an agent can use anything.
SkillYard closes that loop — the agent audits, surfaces gaps, and requests
what is missing without the human needing to know in advance what skills
exist or what the project needs.

**Contribute back**
When a skill does not exist, there are two paths:

- **Request** — a developer or agent describes what is needed. Maintainers
  create it.
- **Submit** — a developer or agent writes the skill and submits it for
  review. The maintainer group approves or rejects it.

Skills that are submitted enter a beta pipeline. They become available to
other projects with a visible beta label. As real projects use the skill and
confirm it works, confidence accumulates. When the threshold is reached the
team lead sees it in the pipeline and can promote it to mainline. Nothing
reaches mainline without explicit authorisation.

**Inherit**
A second team starting a new project inherits the full accumulated knowledge
of every team that came before them. They describe their project. SkillYard
recommends a profile built from everything the org has learned. They approve.
They are building in minutes, not days.

---

## Quality and safety

**Skills earn their way in.** New skills start in beta. They are confirmed by
real projects in real use. When enough projects confirm a skill works, it
becomes eligible for promotion. A team lead reviews and authorises. Only then
does it become mainline.

**Problem reporting is automatic.** When an agent encounters a situation a
skill does not handle correctly, it recognises the gap and offers to file a
report. The developer or tester says yes or no — one step. Reports accumulate.
When multiple reports describe the same problem, the maintainer has clear
signal. They fix the skill once. Every project gets the improvement on next
sync.

**No change is irreversible.** Every time a skill updates, the previous
version is archived automatically. A developer can inspect what changed,
compare any two versions, and revert in one step. Skills can be pinned so
a specific version is never overridden by an update.

**Private skills stay private.** An org can create skills that never leave
their environment. Those skills are never synced, never auto-updated, and
never touched by any outside process. If the org later decides a private
skill is good enough to share, a copy enters the contribution pipeline — the
original stays exactly where it is.

**Offline-first.** Everything works without a network connection. Skills are
served from a local cache. Problem reports and skill requests queue locally.
When connectivity returns, the queue drains automatically and any remote
updates are pulled.

---

## What no user ever has to do

The QA tester never has to:
- Install SkillYard
- Know what a skill is
- Configure anything
- Choose which skills apply
- Read documentation
- Know why the agent behaves correctly

The developer never has to:
- Copy skills between projects manually
- Remember which skills exist
- Explain conventions to new agents each session
- Hunt version history when something breaks
- Update skill files across multiple repos
- Configure each new project from scratch

The team lead never has to:
- Review every individual report
- Manually track skill usage across projects
- Chase developers to update stale skills
- Rebuild conventions when someone new joins

---

## What SkillYard provides

SkillYard starts with **meta-skills** — skills for creating and maintaining
guidance files. These are the seed that ensures everything contributed later
is structured consistently and works correctly across agent tools.

But meta-skills are not the destination. The goal is for the registry to grow
into the org's full accumulated knowledge: how the org builds software, what
its conventions are, how specific stacks are set up, what CI/CD looks like,
how the team handles migrations, reviews, and testing — all of it encoded as
skills any agent can use.

This happens through teams contributing back. A team solves a problem, refines
a workflow, and submits it. After review it becomes available to every other
team. The compounding effect: every team that contributes makes it more
valuable for the next team. A new team starting a project inherits the full
accumulated knowledge of every team that came before them, instantly.

**The current seed skills:**

| Skill | What it does |
|---|---|
| `create-agents-md` | Authors or improves an `AGENTS.md` for any project |
| `create-skill` | Authors a new `SKILL.md` following the agentskills.io spec |
| `create-rule` | Creates a Cursor `.mdc` rule file |
| `universal-agent-config` | Wires all agent tools to read a single `AGENTS.md` |

---

## Distribution model

SkillYard is released as an open source project. It contains the core concept,
the meta-skills, and the process for building and maintaining a skill library.

An organization clones the public repo into a private repository. From there:

- The meta-skills come pre-installed from the public repo
- The org adds its own domain-specific skills over time
- Those org-specific skills stay private unless the org chooses to contribute
  them back to the public project

```
Public SkillYard (open source)
  ↓  clone
Org private repo
  ↓  teams contribute domain skills
Org knowledge registry (grows over time)
  ↓  optionally contribute improvements back
Public SkillYard (improves over time)
```

The open source project benefits from the community refining the meta-skills
and the process. The org benefits from that refinement without exposing its
own domain knowledge.

---

## The meta principle

SkillYard follows the same rules it teaches. Its own `AGENTS.md` is an example
of what `create-agents-md` should produce. Its own skills follow what
`create-skill` teaches. The project is its own first user.

---

## In one paragraph

A developer describes an idea in a chat window and gets a fully structured,
agent-ready project in under two minutes. A QA tester clones that project and
the agent already follows the project's exact conventions without being told.
When a new capability is needed mid-project the agent finds the right skill
and installs it. When a skill doesn't exist the agent logs the gap and keeps
helping. When a skill has a problem the agent files a report and works around
it. Those reports flow back to the maintainer, who fixes the skill once, and
every project gets the improvement on next sync. Skills that teams build and
test locally enter a beta pipeline, get confirmed by real projects, and earn
their way into mainline through demonstrated quality. Private organisational
skills live protected in a local tier that no update ever touches. Everything
works offline. No change is ever irreversible. Non-technical users benefit
from all of it without knowing any of it exists.

---

## References (official sources only)

- AGENTS.md open standard: [agents.md](https://agents.md)
- SKILL.md open standard: [agentskills.io](https://agentskills.io)
- AGENTS.md best practices: [agentsmd.io/agents-md-best-practices](https://agentsmd.io/agents-md-best-practices)
- MCP specification: [modelcontextprotocol.io](https://modelcontextprotocol.io/specification/latest/server)
