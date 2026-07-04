---
name: issue-tracker
description: Use when you need to interact with the profile issue tracker.
metadata:
  adapted-from-upstream-skill:
    - upstream/mattpocock/skills/engineering/setup-matt-pocock-skills@1445797d
---

# Issue tracker: Obsidian Vault

Issues and PRDs for this profile live as markdown files in `$OBSIDIAN_VAULT_PATH/Library/`.

## Conventions

- One feature per file: `$OBSIDIAN_VAULT_PATH/Library/ISSUE-<feature-slug>/`
- The PRD is `$OBSIDIAN_VAULT_PATH/Library/PRD-<feature-slug>.md`
- Implementation issues are `$OBSIDIAN_VAULT_PATH/Library/ISSUE-<feature-slug>-<NN>-<slug>.md`, numbered from `01`
- Triage state is recorded as a `task_status` frontmatter property
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `$OBSIDIAN_VAULT_PATH/Library/ISSUE-<feature-slug>/`.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Triage Labels

The skills speak in terms of five canonical triage roles.

| Label in our tracker | Meaning |
| -------------------- | ---------------------------------------- |
| `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`    | Requires human implementation            |
| `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), set the `task_status` field in the file's frontmatter to the corresponding value from this table.
