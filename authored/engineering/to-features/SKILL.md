---
name: to-features
description: Break a plan, spec, or PRD into independently-grabbable features using tracer-bullet vertical slices. Use when user wants to decompose an epic into independent features that can be implemented sequentially.
---

# To Features

Break an epic into independently-grabbable features using vertical slices (tracer bullets).

## Principles

### Durability over precision

The feature plan may stay on backlog for days or weeks. The codebase will change in the meantime. Write the feature plan so it stays useful even as files are renamed, moved, or refactored.

- **Do** describe interfaces, types, and behavioral contracts
- **Do** name specific types, function signatures, or config shapes that the agent should look for or modify
- **Don't** reference file paths — they go stale
- **Don't** reference line numbers
- **Don't** assume the current implementation structure will remain the same

### Behavioral, not procedural

Describe **what** the system should do, not **how** to implement it. The agent will explore the codebase fresh and make its own implementation decisions.

- **Good:** "The `SkillConfig` type should accept an optional `schedule` field of type `CronExpression`"
- **Bad:** "Open src/types/skill.ts and add a schedule field on line 42"
- **Good:** "When a user runs `/triage` with no arguments, they should see a summary of issues needing attention"
- **Bad:** "Add a switch statement in the main handler function"

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes an issue reference as an argument, fetch it from the Beads Issue Tracker `bd show <id>`, fetch any parent for full context and any blocker for prior art.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Issue titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.
Identify existing quality checks: type-checking, linting and testing frameworks.

### 3. Draft vertical slices

Break the plan into **tracer bullet** features. Each feature is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

Sketch out the major modules you will need to build or modify to complete the implementation. Actively look for opportunities to extract deep modules that can be tested in isolation.

A deep module (as opposed to a shallow module) is one which encapsulates a lot of functionality in a simple, testable interface which rarely changes.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE end-to-end path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
- Acceptance criteria for each feature are a scoped subset of the epic's criteria—only cover what THIS feature delivers
- Each slice must pass all existing quality checks: type-checking and linting.
</vertical-slice-rules>

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each feature, show:

- **Title**: short descriptive name
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories this addresses (if the source material has them, reference them here)

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?
- Does each feature deliver a complete end-to-end vertical slice that can be tested independently?

Iterate until the user approves the breakdown.

### 5. Publish the issues

For each approved feature, publish a new issue to Beads Issue Tracker using:

```bash
bd create --title="<feature-title>" --description="<multi-line-issue-body>" --acceptance="<multi-line-acceptance-criteria>" --type=task [--parent=<epic_id>] [--deps "blocks:<id1>,blocks:<id2>"]
```

Use the feature body template below for the description. Publish features in dependency order (blockers first) so you can reference real feature identifiers.

<multi-line-feature-template>
## Current State

The current state or the problem that the user is facing, from the user's perspective. Scoped to what this feature addresses.

## Desired State

The desired state or the solution to the problem, from the user's perspective. Scoped to what this feature delivers.

## User Stories

A numbered list of user stories relevant to this feature. Each user story should be in the format of:

1. As an <actor>, I want a <capability>, so that <benefit>

This list of user stories should cover all aspects of what this feature delivers. If the source material has user stories, copy the relevant ones here.

## Out of Scope

A description of the things that are out of scope for this feature.

## Further Notes

Any further notes about this feature.
</multi-line-feature-template>

<multi-line-acceptance-criteria-template>
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3
</multi-line-acceptance-criteria-template>
