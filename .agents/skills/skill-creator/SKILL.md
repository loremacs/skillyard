---
name: skill-creator
description: Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize an existing skill, run evals to test a skill, benchmark skill performance with variance analysis, or optimize a skill's description for better triggering accuracy. This version works on any OS (Windows, macOS, Linux) and any agent tool (Claude Code, Windsurf, Cursor, Copilot, Gemini CLI, etc.) — use it whenever skill-creator is relevant, regardless of platform.
---

# Skill Creator

A skill for creating new skills and iteratively improving them, designed to work on any operating system and in any agent tool.

At a high level, the process of creating a skill goes like this:

- Decide what you want the skill to do and roughly how it should do it
- Write a draft of the skill
- Create a few test prompts and run the agent-with-access-to-the-skill on them
- Help the user evaluate the results both qualitatively and quantitatively
  - While the runs happen in the background, draft quantitative assertions if there aren't any. Then explain them to the user
  - Use `eval-viewer/generate_review.py` to show the user the results, and also show the quantitative metrics
- Rewrite the skill based on feedback from the user's evaluation of the results
- Repeat until you're satisfied
- Expand the test set and try again at larger scale

Your job is to figure out where the user is in this process and jump in to help them progress. If they say "I want to make a skill for X", help narrow it down, write a draft, write test cases, figure out how they want to evaluate, run all the prompts, and repeat. If they already have a draft, go straight to the eval/iterate part.

If the user says "I don't need a bunch of evaluations, just vibe with me" — that's fine too.

After the skill is in good shape, you can also run the description optimizer to improve triggering accuracy.

---

## Environment capabilities

Before starting, assess what your environment supports. This determines which steps are available to you.

**Subagents** — Can you spawn parallel subagents? Available in Claude Code, Cowork, and some multi-agent setups. If yes: run with-skill and baseline runs in parallel. If no: run them sequentially yourself, skip baseline runs, and rely on qualitative review.

**Display / browser** — Can you open a browser window? If yes: launch the eval viewer as a local server. If no: use `--static <path>` to generate a standalone HTML file and share the path with the user so they can open it themselves.

**Python** — All bundled scripts require Python 3.8+. Run `python --version` or `python3 --version` to confirm. If Python isn't available, perform aggregation and grading manually or inline.

**Claude CLI (`claude -p`)** — Available only in Claude Code. If present, description optimization via `run_loop.py` works fully. If absent, optimize the description manually using the guidance in the Description Optimization section below.

---

## Communicating with the user

The skill creator will be used by people across a wide range of familiarity with technical concepts. Pay attention to context cues to calibrate your language. In the default case:

- "evaluation" and "benchmark" are borderline, but OK
- for "JSON" and "assertion" you want to see cues from the user that they know what those things are before using them without explanation

Briefly explain terms when in doubt.

---

## Creating a skill

### Capture Intent

Start by understanding the user's intent. The current conversation might already contain a workflow the user wants to capture (e.g., they say "turn this into a skill"). If so, extract answers from the conversation history first — the tools used, the sequence of steps, corrections the user made, input/output formats observed. The user may need to fill the gaps and should confirm before proceeding.

1. What should this skill enable the agent to do?
2. When should this skill trigger? (what user phrases/contexts)
3. What's the expected output format?
4. Should we set up test cases to verify it works? Skills with objectively verifiable outputs (file transforms, data extraction, code generation, fixed workflow steps) benefit from test cases. Skills with subjective outputs (writing style, art) often don't need them. Suggest the appropriate default based on the skill type, but let the user decide.

### Interview and Research

Proactively ask questions about edge cases, input/output formats, example files, success criteria, and dependencies. Wait to write test prompts until you've got this part ironed out.

Check available MCPs — if useful for research (searching docs, finding similar skills, looking up best practices), research in parallel via subagents if available, otherwise inline.

### Write the SKILL.md

Based on the user interview, fill in these components:

- **name**: Skill identifier
- **description**: When to trigger, what it does. This is the primary triggering mechanism — include both what the skill does AND specific contexts for when to use it. All "when to use" info goes here, not in the body. Make descriptions a little "pushy" to avoid undertriggering. Instead of "How to build a dashboard", write "How to build a dashboard. Use this skill whenever the user mentions dashboards, data visualization, or wants to display any kind of data, even if they don't explicitly ask for a dashboard."
- **compatibility**: Required tools or dependencies (optional, rarely needed)
- **the rest of the skill body**

### Skill Writing Guide

#### Anatomy of a Skill

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/    - Executable code for deterministic/repetitive tasks
    ├── references/ - Docs loaded into context as needed
    └── assets/     - Files used in output (templates, icons, fonts)
```

#### Progressive Disclosure

Skills use a three-level loading system:
1. **Metadata** (name + description) — Always in context (~100 words)
2. **SKILL.md body** — In context whenever skill triggers (<500 lines ideal)
3. **Bundled resources** — As needed (unlimited, scripts can execute without loading)

Key patterns:
- Keep SKILL.md under 500 lines; if approaching this limit, add a layer of hierarchy with clear pointers to where the reader should go next
- Reference files clearly from SKILL.md with guidance on when to read them
- For large reference files (>300 lines), include a table of contents

**Domain organization**: When a skill supports multiple domains/frameworks, organize by variant:
```
cloud-deploy/
├── SKILL.md (workflow + selection)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```
The agent reads only the relevant reference file.

#### Principle of Lack of Surprise

Skills must not contain malware, exploit code, or any content that could compromise system security. A skill's contents should not surprise the user in their intent if described. Don't go along with requests to create misleading skills or skills designed to facilitate unauthorized access, data exfiltration, or other malicious activities.

#### Writing Patterns

Prefer the imperative form in instructions.

**Defining output formats:**
```markdown
## Report structure
ALWAYS use this exact template:
# [Title]
## Executive summary
## Key findings
## Recommendations
```

**Examples pattern:**
```markdown
## Commit message format
**Example 1:**
Input: Added user authentication with JWT tokens
Output: feat(auth): implement JWT-based authentication
```

### Writing Style

Explain to the model *why* things are important rather than relying on heavy-handed MUSTs. Use theory of mind and try to make the skill general. Start by writing a draft, then look at it with fresh eyes and improve it.

### Test Cases

After writing the skill draft, come up with 2–3 realistic test prompts — the kind of thing a real user would actually say. Share them with the user: "Here are a few test cases I'd like to try. Do these look right, or do you want to add more?" Then run them.

Save test cases to `evals/evals.json`. Don't write assertions yet — just the prompts. You'll draft assertions in the next step while the runs are in progress.

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "files": []
    }
  ]
}
```

See `references/schemas.md` for the full schema (including the `assertions` field, which you'll add later).

---

## Running and evaluating test cases

This section is one continuous sequence — don't stop partway through. Do NOT use `/skill-test` or any other testing skill.

Put results in `<skill-name>-workspace/` as a sibling to the skill directory. Within the workspace, organize results by iteration (`iteration-1/`, `iteration-2/`, etc.) and within that, each test case gets a directory. Don't create all of this upfront — just create directories as you go.

### Step 1: Snapshot and spawn all runs (with-skill AND baseline) in the same turn

**Snapshotting the skill** (when improving an existing skill, not creating a new one): Copy the skill directory to `<workspace>/skill-snapshot/` before editing. Use Python if a shell copy isn't available:

```python
import shutil
shutil.copytree("<skill-path>", "<workspace>/skill-snapshot/")
```

Alternatively, use your agent's built-in file-copy tools. The goal is a point-in-time copy before any edits.

**Spawning runs**: For each test case, spawn two runs in the same turn — one with the skill, one without. Don't spawn the with-skill runs first and come back for baselines later. Launch everything at once.

**With-skill run:**
```
Execute this task:
- Skill path: <path-to-skill>
- Task: <eval prompt>
- Input files: <eval files if any, or "none">
- Save outputs to: <workspace>/iteration-<N>/eval-<ID>/with_skill/outputs/
- Outputs to save: <what the user cares about>
```

**Baseline run** (same prompt, baseline depends on context):
- **Creating a new skill**: no skill at all, save to `without_skill/outputs/`
- **Improving an existing skill**: the snapshot. Point the baseline at `<workspace>/skill-snapshot/`, save to `old_skill/outputs/`

**If subagents are not available**: Run the test cases yourself sequentially. Read the skill's SKILL.md, then follow its instructions to accomplish the test prompt. Skip baseline runs — just run with the skill. This is less rigorous but still a useful sanity check, and the human review step compensates.

Write an `eval_metadata.json` for each test case (assertions can be empty for now). Give each eval a descriptive name — not just "eval-0":

```json
{
  "eval_id": 0,
  "eval_name": "descriptive-name-here",
  "prompt": "The user's task prompt",
  "assertions": []
}
```

### Step 2: While runs are in progress, draft assertions

Use this time productively. Draft quantitative assertions for each test case and explain them to the user. If assertions already exist in `evals/evals.json`, review them and explain what they check.

Good assertions are objectively verifiable and have descriptive names — they should read clearly in the benchmark viewer. Subjective skills (writing style, design quality) are better evaluated qualitatively — don't force assertions onto things that need human judgment.

Update the `eval_metadata.json` files and `evals/evals.json` with the assertions once drafted. Also explain to the user what they'll see in the viewer.

### Step 3: As runs complete, capture timing data

When each run completes, save timing data immediately to `timing.json` in the run directory:

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

This is the only opportunity to capture this data — process each notification as it arrives.

### Step 4: Grade, aggregate, and launch the viewer

Once all runs are done:

1. **Grade each run** — spawn a grader subagent (or grade inline) that reads `agents/grader.md` and evaluates each assertion against the outputs. Save results to `grading.json` in each run directory. The `expectations` array must use the fields `text`, `passed`, and `evidence` — the viewer depends on these exact field names. For assertions that can be checked programmatically, write and run a script.

2. **Aggregate into benchmark** — run the aggregation script. The `cwd` must be the skill-creator directory so the `-m` import resolves:

   ```python
   import subprocess, sys
   subprocess.run(
       [sys.executable, "-m", "scripts.aggregate_benchmark",
        "<workspace>/iteration-N", "--skill-name", "<name>"],
       cwd="<path-to-skill-creator>"
   )
   ```

   This produces `benchmark.json` and `benchmark.md` with pass rates, time, and tokens. Put each `with_skill` version before its baseline counterpart. If generating `benchmark.json` manually, see `references/schemas.md` for the exact schema.

3. **Do an analyst pass** — read the benchmark data and surface patterns the aggregate stats might hide. See `agents/analyzer.md` for what to look for: assertions that always pass regardless of skill (non-discriminating), high-variance evals (possibly flaky), time/token tradeoffs.

4. **Launch the viewer** — use Python so this works on all platforms:

   ```python
   import subprocess, sys

   args = [
       sys.executable,
       "<path-to-skill-creator>/eval-viewer/generate_review.py",
       "<workspace>/iteration-N",
       "--skill-name", "my-skill",
       "--benchmark", "<workspace>/iteration-N/benchmark.json",
   ]
   # For iteration 2+, add: "--previous-workspace", "<workspace>/iteration-<N-1>"

   # With display: starts a local server and opens the browser automatically
   # Without display: add "--static", "<output_path>" to write a standalone HTML file
   proc = subprocess.Popen(args)
   # Save proc so you can call proc.terminate() when done
   ```

   **No display / headless**: Add `"--static", "<output_path>"` to the args list. This writes a standalone HTML file. Share the file path with the user so they can open it in their own browser. Feedback will download as `feedback.json` when they click "Submit All Reviews" — copy it into the workspace directory for the next iteration.

   Note: please use `generate_review.py` to create the viewer; there's no need to write custom HTML.

5. **Tell the user** something like: "I've opened the results. There are two tabs — 'Outputs' lets you click through each test case and leave feedback, 'Benchmark' shows the quantitative comparison. When you're done, come back here and let me know."

### What the user sees in the viewer

The "Outputs" tab shows one test case at a time: the prompt, the output, previous output (iteration 2+), formal grades (if grading was run), and a feedback textbox. The "Benchmark" tab shows pass rates, timing, and token usage per configuration. Navigation is via prev/next buttons or arrow keys. "Submit All Reviews" saves all feedback to `feedback.json`.

### Step 5: Read the feedback

When the user tells you they're done, read `feedback.json`:

```json
{
  "reviews": [
    {"run_id": "eval-0-with_skill", "feedback": "the chart is missing axis labels", "timestamp": "..."},
    {"run_id": "eval-1-with_skill", "feedback": "", "timestamp": "..."},
    {"run_id": "eval-2-with_skill", "feedback": "perfect, love this", "timestamp": "..."}
  ],
  "status": "complete"
}
```

Empty feedback means the user thought it was fine. Focus improvements on the test cases where the user had specific complaints.

**Stop the viewer** when done:
```python
proc.terminate()
# or, if you only saved the PID:
import os, signal
os.kill(pid, signal.SIGTERM)  # works on macOS/Linux
# On Windows use: subprocess.run(["taskkill", "/F", "/PID", str(pid)])
```

---

## Improving the skill

This is the heart of the loop. You've run the test cases, the user has reviewed the results, and now you need to make the skill better based on their feedback.

### How to think about improvements

1. **Generalize from the feedback.** You and the user are iterating on a few examples because it moves fast. But if the skill only works for those examples, it's useless. Rather than making overfitty changes or oppressively constrictive MUSTs, try different metaphors or recommend different patterns of working when something is stubborn.

2. **Keep the prompt lean.** Remove things that aren't pulling their weight. Read the transcripts, not just the final outputs — if the skill is making the agent waste time on unproductive steps, get rid of the parts causing that.

3. **Explain the why.** Try hard to explain the *why* behind everything you're asking the model to do. Today's LLMs are smart. If you find yourself writing ALWAYS or NEVER in all caps, that's a yellow flag — reframe and explain the reasoning so the model understands why it matters.

4. **Look for repeated work across test cases.** If all 3 test cases resulted in the subagent independently writing a `create_docx.py` or a `build_chart.py`, that's a strong signal the skill should bundle that script. Write it once, put it in `scripts/`, and tell the skill to use it.

### The iteration loop

After improving the skill:

1. Apply your improvements to the skill
2. Rerun all test cases into a new `iteration-<N+1>/` directory, including baseline runs. For a new skill the baseline is always `without_skill`. For an existing skill, use judgment on whether to baseline against the original or the previous iteration.
3. Launch the reviewer with `--previous-workspace` pointing at the previous iteration
4. Wait for the user to review and tell you they're done
5. Read the new feedback, improve again, repeat

Keep going until the user says they're happy, feedback is all empty, or you're not making meaningful progress.

---

## Advanced: Blind comparison

For rigorous comparison between two versions (e.g., "is the new version actually better?"), there's a blind comparison system. Read `agents/comparator.md` and `agents/analyzer.md` for details. The basic idea: give two outputs to an independent agent without telling it which is which, and let it judge quality. Then analyze why the winner won.

This is optional, requires subagents, and most users won't need it.

---

## Description Optimization

The `description` field in `SKILL.md` frontmatter is the primary mechanism that determines whether an agent invokes a skill. After creating or improving a skill, offer to optimize the description for better triggering accuracy.

### Step 1: Generate trigger eval queries

Create 20 eval queries — a mix of should-trigger and should-not-trigger. Save as JSON:

```json
[
  {"query": "the user prompt", "should_trigger": true},
  {"query": "another prompt", "should_trigger": false}
]
```

Queries must be realistic and concrete — include file paths, personal context, column names, company names, URLs, casual speech, typos, abbreviations. Use a mix of lengths and focus on edge cases.

Bad: `"Format this data"`, `"Create a chart"`

Good: `"ok so my boss just sent me this xlsx file (its in downloads, called something like 'Q4 sales final FINAL v2.xlsx') and she wants me to add a column that shows the profit margin as a percentage. Revenue is in column C and costs in column D i think"`

For **should-trigger** (8–10): cover different phrasings, some formal, some casual. Include cases where the user doesn't name the skill or file type but clearly needs it.

For **should-not-trigger** (8–10): the most valuable are near-misses — queries that share keywords with the skill but actually need something different. "Write a fibonacci function" as a negative test for a PDF skill is too easy. Make them genuinely tricky.

### Step 2: Review with user

Present the eval set using the HTML template:

1. Read the template from `assets/eval_review.html`
2. Replace the placeholders:
   - `__EVAL_DATA_PLACEHOLDER__` → the JSON array of eval items (no quotes — it's a JS variable assignment)
   - `__SKILL_NAME_PLACEHOLDER__` → the skill's name
   - `__SKILL_DESCRIPTION_PLACEHOLDER__` → the skill's current description
3. Write to a temp file and open it using Python (works on all platforms):

   ```python
   import os, tempfile, webbrowser

   tmp_path = os.path.join(tempfile.gettempdir(), "eval_review_<skill-name>.html")
   with open(tmp_path, "w", encoding="utf-8") as f:
       f.write(filled_html)
   webbrowser.open(tmp_path)
   ```

4. The user can edit queries, toggle should-trigger, add/remove entries, then click "Export Eval Set"
5. The file downloads as `eval_set.json`. On most systems it lands in `~/Downloads/` (macOS/Linux) or `%USERPROFILE%\Downloads` (Windows). Check for the most recent version if multiple copies exist (e.g., `eval_set (1).json`).

This step matters — bad eval queries lead to bad descriptions.

### Step 3: Run the optimization loop

Tell the user: "This will take some time — I'll run the optimization loop and check on it periodically."

Save the eval set to the workspace, then run using Python (works on all platforms):

```python
import subprocess, sys

result = subprocess.run(
    [sys.executable, "-m", "scripts.run_loop",
     "--eval-set", "<path-to-trigger-eval.json>",
     "--skill-path", "<path-to-skill>",
     "--model", "<model-id-powering-this-session>",
     "--max-iterations", "5",
     "--verbose"],
    cwd="<path-to-skill-creator>"
)
```

Use the model ID from your system prompt so the triggering test matches what the user actually experiences.

While it runs, periodically check the output to give the user updates on iteration number and scores.

**If `claude -p` is not available**: Optimize manually. Review which trigger queries failed, rewrite the description to better cover them, and re-test. The goal is the same — improve precision and recall on your trigger eval set. Iterate 3–5 times or until scores plateau.

This script handles the full loop automatically when the CLI is available: splits the eval set into 60% train / 40% held-out test, evaluates the current description (running each query 3 times), calls the model to propose improvements based on what failed, and iterates up to the max. When done it returns JSON with `best_description` — selected by test score to avoid overfitting.

### How skill triggering works

Skills appear in the agent's `available_skills` list with their name + description. The agent decides whether to consult a skill based on that description. Agents only consult skills for tasks they can't easily handle on their own — simple one-step queries like "read this PDF" may not trigger a skill even if the description matches perfectly. Complex, multi-step, or specialized queries reliably trigger skills when the description matches.

### Step 4: Apply the result

Take `best_description` from the JSON output and update the skill's `SKILL.md` frontmatter. Show the user before/after and report the scores.

---

## Packaging

Package the skill for distribution using Python (works on all platforms):

```python
import subprocess, sys
subprocess.run(
    [sys.executable, "-m", "scripts.package_skill", "<path/to/skill-folder>"],
    cwd="<path-to-skill-creator>"
)
```

This validates the skill and creates a `.skill` file (zip format). Direct the user to the resulting `.skill` file path so they can install it.

If the `present_files` tool is available in your environment, use it to deliver the `.skill` file directly to the user.

---

## Updating an existing skill

The user might be asking you to update an existing skill, not create a new one. In this case:

- **Preserve the original name.** Note the skill's directory name and `name` frontmatter field — use them unchanged.
- **Copy to a writable location before editing.** The installed skill path may be read-only. Use Python to copy it:

  ```python
  import shutil, tempfile, os
  tmp_dir = os.path.join(tempfile.gettempdir(), "<skill-name>")
  shutil.copytree("<installed-skill-path>", tmp_dir)
  ```

  Edit the copy, then package from the copy.

---

## Reference files

The `agents/` directory contains instructions for specialized subagents. Read them when you need to spawn the relevant subagent.

- `agents/grader.md` — How to evaluate assertions against outputs
- `agents/comparator.md` — How to do blind A/B comparison between two outputs
- `agents/analyzer.md` — How to analyze why one version beat another

The `references/` directory has additional documentation:
- `references/schemas.md` — JSON structures for evals.json, grading.json, benchmark.json, etc.

---

The core loop, one more time:

- Figure out what the skill is about
- Draft or edit the skill
- Run the agent-with-access-to-the-skill on test prompts
- With the user, evaluate the outputs: generate `benchmark.json` and run `eval-viewer/generate_review.py` for qualitative review, run quantitative evals
- Repeat until you and the user are satisfied
- Package the final skill

Add these steps to your TodoList so you don't forget. Specifically: put "Generate eval viewer via `generate_review.py` so user can review test cases before I revise" in your TodoList — it's the step most often skipped.

Good luck!
