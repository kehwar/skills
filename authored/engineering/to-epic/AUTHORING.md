# to-prd

Sourced from: `upstream/mattpocock/skills/engineering/to-prd/`

```bash
diff upstream/mattpocock/skills/engineering/to-prd/SKILL.md authored/engineering/to-epic/SKILL.md
```

## Customizations for this repo

**Explicit Beads references:**
- Changed "issue tracker" to "Beads" throughout the skill
- Description explicitly names Beads as the publication target
- Beads is the canonical issue tracker for this workflow

**Triage labels removed:**
- Removed reference to triage label vocabulary in opening
- Removed automatic `needs-triage` label application when publishing to Beads
- No labels are applied; issues are created ready-to-work

**When syncing from upstream:**
If the upstream skill changes, preserve these customizations:
- Keep explicit Beads references throughout (do not revert to generic "issue tracker" language)
- Do NOT add triage labels back into the publish step
- Keep the workflow label-free
