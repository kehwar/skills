# to-tasks

Sourced from: `upstream/mattpocock/skills/engineering/to-issues/`

```bash
diff upstream/mattpocock/skills/engineering/to-issues/SKILL.md authored/engineering/to-tasks/SKILL.md
```

## Customizations for this repo

**Explicit Beads references:**
- Changed "issue tracker" to "Beads" throughout the skill
- Description explicitly names Beads as the target platform
- Beads is the canonical issue tracker for this workflow

**Triage labels removed:**
- Removed reference to triage label vocabulary in opening
- Removed automatic `needs-triage` label application when publishing issues to Beads
- No labels are applied; issues are created ready-to-work

**When syncing from upstream:**
If the upstream skill changes, preserve these customizations:
- Keep explicit Beads references throughout (do not revert to generic "issue tracker" language)
- Do NOT add triage labels back into the publish step
- Keep the workflow label-free

## Beads Issue Tracker Reference

Copy the "Conventions" block from [`../setup-workflow-skills/issue-tracker.md`](../setup-workflow-skills/issue-tracker.md) into the skill's SKILL.md when syncing or updating references to Beads commands. This ensures consistency across skills when the Beads reference is updated.
