---
name: to-tasks
description: Break a plan, spec, or PRD into independently-grabbable tasks on Beads using tracer-bullet vertical slices. Use when user wants to convert a plan into tasks, create implementation tickets, or break down work into tasks.
---

# To Tasks

Break a plan into independently-grabbable issues using vertical slices (tracer bullets).

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes an issue reference (issue number, URL, or path) as an argument, fetch it from the issue tracker and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Issue titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

### 3. Draft vertical slices

Break the plan into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

Slices may be 'HITL' or 'AFK'. HITL slices require human interaction, such as an architectural decision or a design review. AFK slices can be implemented and merged without human interaction. Prefer AFK over HITL where possible.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
</vertical-slice-rules>

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Type**: HITL / AFK
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories this addresses (if the source material has them)

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?
- Are the correct slices marked as HITL and AFK?

Iterate until the user approves the breakdown.

### 5. Publish the issues to Beads

For each approved slice, publish a new issue to Beads. Use the issue body template below.

Publish issues in dependency order (blockers first) so you can reference real issue identifiers in the "Blocked by" field.

<issue-template>
## Parent

A reference to the parent issue on the issue tracker (if the source was an existing issue, otherwise omit this section).

## What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- A reference to the blocking ticket (if any)

Or "None - can start immediately" if no blockers.

</issue-template>

Do NOT close or modify any parent issue.

## Beads Issue Tracker Reference

- **Create an issue**: `bd create --title="..." --description="..." --type=task|bug|feature|epic [--parent=<parent_id>]`. Use multi-line descriptions for context.
- **Read an issue**: `bd show <id>` to view full details, dependencies, and notes.
- **List issues**: `bd list --status=open` for open issues, `bd list --status=in_progress` for active work, `bd ready` for issues ready to start (no blockers).
- **Comment on an issue**: `bd update <id> --notes="..."` to set notes.
- **Update fields**: `bd update <id> --title/--description/--notes/--design` to modify inline.
- **Close**: `bd close <id>` to mark complete, or `bd close <id1> <id2> ...` to close multiple at once.
- **More commands**: `bd` for full command list.