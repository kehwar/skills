---
name: execute-plan-phase
description: Execute a single phase from a prd-to-plan Markdown plan file, then update the plan and PRD to reflect outcomes, steering corrections, and any scope changes discovered during implementation. Use when user says "work on phase N", "execute phase", "implement the next phase", "continue the plan", or references a plan file in docs/plans/.
---

# Execute Plan Phase

Work on one phase of an existing plan, then close the loop by updating the plan and PRD to reflect reality.

## Quick start

```
User: "Work on phase 2 of docs/plans/feature-x.md"
```

1. Read the plan file and the linked PRD
2. Implement
3. Update plan + PRD

---

## Workflow

### 1. Load context

- Read the plan file (e.g. `docs/plans/feature-x.md`)
- Find the linked PRD (`Source PRD:` header) and read it too
- Identify which phase to work on — if the user didn't specify, pick the first phase whose acceptance criteria are **not** all checked

### 2. Implement

Work through the phase. Use `manage_todo_list` to track sub-tasks within the phase.

While implementing, note:
- **Deviations**: implementation details that differ from the plan description
- **Discoveries**: new constraints or integration details surfaced during work
- **Scope changes**: acceptance criteria that proved unnecessary, impossible, or need splitting

### 3. Update the plan file

After completing the phase (or reaching a stopping point), edit the plan file:

**Always do:**
- Check off completed acceptance criteria: `- [ ]` → `- [x]`
- Add a `### Notes` section under the phase with implementation deviations and discoveries

**If scope changed:**
- Rewrite the `### What to build` or acceptance criteria of *future* phases affected by what you learned
- Add or remove phases if the work revealed the breakdown was wrong
- Mark skipped criteria with `~~strikethrough~~` and a note explaining why

**Phase completion marker** — append at the top of the phase block when all criteria are met:

```md
> ✅ Completed — <brief summary of what was built>
```

### 4. Update the PRD (only if needed)

Update the source PRD **only** when the implementation revealed that a PRD requirement was wrong, impossible, or needs re-scoping. Do not update the PRD for normal implementation detail choices.

Triggers that warrant a PRD update:
- A user story turned out to be technically infeasible as written
- A new integration constraint changes the expected UX or data model
- Scope was explicitly approved-down by the user during this session

When updating, add an `## Amendment` section at the bottom of the PRD:

```md
## Amendment — Phase N execution (<date>)

**Changed**: <what changed and why>
**Original text**: <quote the original>
**New text**: <the replacement>
```

Never silently rewrite PRD body text — only append amendments.

---

## Rules

- Work on **one phase at a time** — do not bleed into the next phase
- If you hit a blocker that requires solving something from a future phase, flag it and ask the user whether to proceed or re-sequence
- Keep plan updates surgical — only change what changed; preserve untouched phases exactly
- Do not rewrite acceptance criteria that are already checked off
