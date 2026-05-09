---
name: to-epic
description: Turn the current conversation context into an epic and publish it to Beads Issue Tracker. Use when user wants to create an epic from the current context.
---

This skill takes the current conversation context and codebase understanding and produces an epic. Do NOT interview the user — just synthesize what you already know.

## Principles

### Durability over precision

The epic may stay on backlog for days or weeks. The codebase will change in the meantime. Write the epic so it stays useful even as files are renamed, moved, or refactored.

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

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the epic, and respect any ADRs in the area you're touching.

2. Sketch out the major modules you will need to build or modify to complete the implementation. Actively look for opportunities to extract deep modules that can be tested in isolation.

A deep module (as opposed to a shallow module) is one which encapsulates a lot of functionality in a simple, testable interface which rarely changes.

Check with the user that these modules match their expectations. Check with the user which modules they want tests written for.

3. Write the epic using the template below, then publish it to Beads Issue Tracker using:

```bash
bd create --type=epic --title="<epic-title>" --description="<multi-line-epic-body>" --acceptance="<multi-line-acceptance-criteria>"
```

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