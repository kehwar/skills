---
name: to-tasks
description: Break a plan, spec, or PRD into independently-grabbable tasks/issues on Beads Issue Tracker using tracer-bullet vertical slices. Use when user wants to convert a plan into tasks, create implementation tickets, or break down work into tasks.
---

# To Tasks

Break a plan into independently-grabbable issues using vertical slices (tracer bullets).

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes an issue reference as an argument, fetch it from the Beads Issue Tracker `bd show <id>`, fetch any parent and linked issues for full context.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Issue titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.
Identify existing quality checks: type-checking, linting and testing frameworks.

### 3. Draft vertical slices

Break the plan into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

Slices may be 'HITL' or 'AFK'. HITL slices require human interaction, such as an architectural decision or a design review. AFK slices can be implemented and merged without human interaction. Prefer AFK over HITL where possible.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
- When applicable, structure slices as TDD red-green-refactor cycles
- Each slice must pass all existing quality checks: type-checking and linting.
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
- Are the TDD applicability markers correct? Should more slices be TDD-compatible?

Iterate until the user approves the breakdown.

### 5. Publish the issues

For each approved slice, publish a new issue to Beads Issue Tracker using:

```bash
bd create --title="<issue-title>" --description="<multi-line-issue-body>" --acceptance="<multi-line-acceptance-criteria>" --type=task [--parent=<parent_id>] [--deps "blocks:<id1>,blocks:<id2>,blocks:<id3>"]
```

Use the issue body template below for the description. Publish issues in dependency order (blockers first) so you can reference real issue identifiers.

<multi-line-issue-template>
## What to build
A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation.
</multi-line-issue-template>

<multi-line-acceptance-criteria-template>
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3
</multi-line-acceptance-criteria-template>
