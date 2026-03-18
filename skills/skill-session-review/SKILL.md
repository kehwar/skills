---
name: skill-session-review
description: Review skills that were actively applied in the current session, detecting errors (wrong API, wrong workflow, broken file references, wrong tool calls), inconsistencies between skill documentation and observed behaviour, and cases where a skill was loaded but not followed. Appends a dated section to SESSION_REVIEW.md inside each reviewed skill's folder. Use when asked to "review skills", "review all used skills", "audit skills", or "skill review" at the end of a session.
---

# Skill Session Review

Audit skills that were actively used in this session and document observed issues in their own folders.

## Process

### 1 — Identify skills to review

Scan the conversation for skills that were:

- **Loaded and applied**: `read_file` was called on a `SKILL.md` and the agent followed its instructions
- **Explicitly requested but not applied**: the user explicitly named or invoked the skill (e.g. "use the X skill", "load X", "run X") and `SKILL.md` was read but the agent's output did not follow its guidance — flag the inferred reason

Only review skills that were actively loaded (i.e. `read_file` was called on a `SKILL.md`). Skip skills merely referenced by name without being loaded. Only flag "not applied" when the user explicitly called for the skill — do not flag cases where the agent loaded a skill on its own initiative but didn't follow through.

### 2 — Re-read each skill's SKILL.md

Before analysing each skill, re-read its `SKILL.md` to have the authoritative documentation in context for comparison.

### 3 — Scan the session for observed issues

For each skill, look for evidence of these categories:

| Category | What to look for |
|----------|-----------------|
| **Wrong API** | Skill documents a function call with wrong params, wrong return type, or a non-existent call |
| **Wrong workflow** | Skill describes steps in wrong order, missing required steps, or steps that caused errors |
| **Broken reference** | Skill cites a file path, module, or URL that does not exist — verify paths with file search |
| **Wrong tool call** | Skill instructs use of a tool with incorrect arguments or a tool that behaved differently than documented |
| **Not applied** | User explicitly called for the skill but output did not follow its guidance — infer reason from conversation context |
| **Ambiguity** | Skill instruction was unclear enough that the agent chose a wrong or unexpected interpretation |

**Scope rule**: Do not proactively read workspace files to verify claims. Only flag what was **observed to fail or contradict** during this session. Exception: for **broken reference** issues, do verify cited paths using file search to confirm the file is absent.

### 4 — Write SESSION_REVIEW.md

Append a dated section to `SESSION_REVIEW.md` inside each skill's own folder. Create the file if it does not exist.

**File location**: `<skill-folder>/SESSION_REVIEW.md`

**Section format**:

```md
## Session: YYYY-MM-DD

### Summary

One sentence describing how the skill was used this session.

### Status

- Applied: yes / no
- If not applied: [inferred reason from conversation]

### Issues observed

#### [Category] — [Short title]

**Evidence**: Quote or describe the exact moment in the session where this surfaced.  
**Impact**: How it affected the session (e.g. wrong output produced, had to retry, caused a runtime error).

#### [Category] — [Short title]

...

### No issues observed

_(Only include this heading when no issues were found for this skill)_
```

If the skill was invoked multiple times in the same session, consolidate all observations into one section.

If a `SESSION_REVIEW.md` already has a section for today's date, append a `#### Addendum` sub-section rather than duplicating the heading.

### 5 — Output a summary

After writing all review files, print a summary table in the conversation:

| Skill | Status | Issues found |
|-------|--------|-------------|
| skill-name | Applied | 2 |
| other-skill | Not applied — reason | 1 |

Then state:

> Review complete. SESSION_REVIEW.md updated for each skill above. These files will be used to refine the skills in future sessions.

## Rules

- Work only on what is visible in the current context window. Do not ask the user for additional context.
- Record **observations only** — do not propose edits to SKILL.md in the review file.
- Always write an entry for every loaded skill, even if no issues were found ("No issues observed").
- Keep evidence quotes concise — paraphrase rather than paste large blocks.
