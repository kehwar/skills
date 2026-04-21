---
name: dev-log
description: Write a development log entry capturing implementation decisions, bug findings, insights, or implementation details. Entries are saved as Markdown files in docs/development-log/. Use when user says "write a dev log", "log this decision", "document this", "write a dev journal entry", "record what happened", or after completing a plan phase, PRD, session, or set of commits.
---

# Dev Log

Write a focused development log entry and save it to `docs/development-log/`.

## Quick start

```
User: "Write a dev log for what we just did"
User: "Log this implementation decision"
User: "Write a dev log for phase 2 completion"
```

---

## Workflow

### 1. Determine scope and topic

If the user did not specify, infer from context:

| Context clue | What to do |
|---|---|
| "current session" | Summarise all significant decisions/events from the conversation |
| "current changes" / staged files | Inspect `git diff --staged` or `git status` |
| "last N commits" | Run `git log -N --oneline` then read the diffs |
| "plan phase" | Read the plan file; summarise what was built and why |
| "PRD/plan completed" | High-level retrospective of the full feature |
| Specific topic stated by user | Use that topic directly |

### 2. Interview until shared understanding

Before writing, confirm with the user:

- **What is the core topic?** One sentence. If you can't say it in one sentence, it may be too broad.
- **What should be included vs omitted?** Surface ambiguous areas and let the user decide.

The audience is always the author's future self — write to answer "why did we do this?" not to explain basics.

Keep iterating until both you and the user agree on what the entry covers.

**Breadth check:** If the draft outline covers more than ~3 distinct decisions or events, flag it:

> "This is shaping up to cover [X, Y, Z]. Would you prefer one broad entry, or split into separate entries per topic?"

Respect the user's answer — do not force a split.

### 3. Gather evidence

Collect the raw material before writing:

- Read relevant files, diffs, or plan phases
- Note: decisions made and the alternatives that were rejected, bugs found and root causes, non-obvious constraints or discoveries, file/module paths that are central to the topic

### 4. Generate slug

Derive a short kebab-case slug from the topic (3–6 words max).  
Examples: `composite-key-routing`, `phase-3-job-complete`, `vat-rounding-bug`.

### 5. Write the file

Path: `docs/development-log/YYYY_MM_DD_<slug>.md`  
Use today's date. Create the directory if it doesn't exist.

Use the template below — keep sections that are relevant, omit the rest.

---

## Entry template

```md
---
date: YYYY-MM-DD
---

# <Title>

## Problem Statement

<Why this entry exists. What problem, situation, or question prompted it — from the developer's perspective. 2–4 sentences.>

## Solution

<What was built, fixed, or decided. Be specific. Include code snippets, config values, or file paths where useful.>

## Implementation Decisions

<A list of the key technical choices made. For each decision, include what was chosen and why. Cover:>

- Modules built or modified and their interfaces
- Architectural choices
- Schema or API changes
- Non-obvious constraints or discoveries

## Alternatives Considered

<Alternatives that were evaluated and rejected, and the reason each was ruled out.>

## Further Notes

<Result: what now works, what changed, what future work this enables or constrains, and any loose ends or follow-up observations.>
```

---

## Tips

- **Prefer specificity.** A narrow, focused entry ages better than a broad one — but broad entries are valid when the user wants a high-level summary.
- **One topic per entry** is the default. If a session covered distinct decisions, offer to split.
- **Be specific.** Vague entries ("we refactored the sync job") are worthless in 6 months. Name files, fields, and values.
- **Don't over-document.** Skip obvious choices. Only record things that would be non-obvious to a future reader (including yourself).
