## Sync guidance

When the `write-a-skill` skill from `mattpocock` upstream updates:

1. **Preserve repo-specific additions**:
   - Domain prompting step (determines domain with user if unclear)
   - Reading `instructions/domain/<domain>.md` and `instructions/skills/<skill-name>.md`
   - Using `pnpm write-skill <skill-name> [--domain <domain>]` to scaffold

2. **Preserve editing workflow**:
   - "When editing an existing skill" section covering:
     - Checking `skills/<skill-name>/meta.json` for skill type (authored vs synced)
     - Reading applicable instructions before editing
     - Updating SKILL.md, reviewing changes

3. **Merge upstream content**:
   - Copy general guidance (SKILL.md template, description requirements, scripts)
   - Keep progressive disclosure structure
   - Update examples and checklists from upstream

**Rationale**: The upstream skill focuses on creation; this version integrates domain-aware scaffolding and editing workflows specific to this repo's architecture.
