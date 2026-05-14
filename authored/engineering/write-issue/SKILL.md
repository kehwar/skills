---
name: write-issue
description: Turn the current conversation context into a Beads issue or edit an existing one. Use when user wants to create or update an issue (bug|feature|task|epic).
---

This skill takes the current conversation context and codebase understanding and produces or updates a Beads issue. Do NOT interview the user — just synthesize what you already know.

At the start, determine whether we are **creating** a new issue or **editing** an existing one. If the user mentions an issue ID (e.g. "issue 42"), contains words like "edit" or "update", or is refining previously discussed work — treat it as an edit.

## Principles

### Durability over precision

The issue may sit on the backlog for days or weeks. The codebase will change in the meantime. Write the description so it stays useful even as files are renamed, moved, or refactored.

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

1. Infer the issue type from the scope of the change:
   - **epic** — broad change spanning multiple user stories or subsystems (e.g. "add a plugin system")
   - **feature** — single coherent vertical slice deliverable to a user (e.g. "user can export a CSV")
   - **task** — small, well-defined unit of work (e.g. "add validation to the email field", "upgrade lodash")
   - **bug** — something is currently broken and needs to be fixed

2. Write the issue body using the template below, then publish to Beads Issue Tracker:

   ```bash
   bd create --type=<type> --title="<issue-title>" --description="<multi-line-body>" --acceptance="<multi-line-acceptance-criteria>"
   bd update <id> --title="<new-title>" --description="<new-body>"
   ```

   Accepted flags:
   - `--title` (required) — a concise, descriptive title of the issue
   - `--description` (required) — a detailed description of the issue
   - `--acceptance` (optional) — a list of testable acceptance criteria
   - `--notes` (optional) — implementation notes

<multi-line-epic-body-template>

## Current State

The current state or the problem that the user is facing, from the user's perspective.

## Desired State

The desired state or the solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Out of Scope

A description of the things that are out of scope for this epic.

## Further Notes

Any further notes about the feature.

</multi-line-epic-body-template>

<multi-line-acceptance-criteria-template>
- [ ] Testable criterion 1
- [ ] Testable criterion 2
- [ ] Testable criterion 3
</multi-line-acceptance-criteria-template>