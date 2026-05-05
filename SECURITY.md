# Security Policy

## Scope

SkillYard is a repository of agent instruction files (Markdown and Python scripts). It does not run a server, store user data, or handle authentication. The primary security surface is the content of skill files and scripts that agents may execute.

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Email the maintainers directly or use [GitHub private vulnerability reporting](https://github.com/loremacs/skillyard/security/advisories/new).

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

You will receive a response within 72 hours. We will coordinate a fix and disclosure timeline with you.

## What counts as a vulnerability

- A skill or script that causes an agent to execute harmful commands on a user's machine
- A skill that exfiltrates data or credentials when activated
- A script in `.agents/skills/*/scripts/` with a command injection or path traversal flaw

## What does not count

- An agent producing incorrect or suboptimal output (use a bug report instead)
- Theoretical risks with no practical exploit path

## Supported versions

Only the latest commit on `main` is supported. There are no versioned releases with independent security patches at this time.
