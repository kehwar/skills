# to-code

**Sourced from:** `upstream/mattpocock/skills/engineering/tdd/SKILL.md`

```bash
diff upstream/mattpocock/skills/engineering/tdd/SKILL.md authored/engineering/to-code/SKILL.md
```

## Key Changes from Upstream

### Major Additions

1. **Issue Tracker Integration**
   - Added: `bd show <id>` to fetch issue from Beads
   - Added: `bd update <id> --claim` to claim the issue  
   - Added: `bd update <id> --acceptance ... --notes ... --status closed` to close issue
   - Upstream has no issue tracker integration

2. **New: Naming & Comments Section**
   - Self-documenting code guidelines (full names, no abbreviations)
   - When/how to write comments (why, not what)
   - Guidance for obscure logic (regex, bitwise, algorithms)
   - Entire section not in upstream

3. **Title Change**
   - Upstream: "Test-Driven Development"
   - Authored: "Test-Driven Development Issue to Code Workflow"

4. **Planning Additions**
   - Added: Fetch issue from Beads tracker
   - Added: "If implementation looks large, consider breaking further"
   - Added: `bd update <id> --claim` step

6. **Issue Closure Process**
   - Added final step with `bd update` command and template for acceptance criteria

### Preserved from Upstream

- Core TDD philosophy (behavior vs implementation testing)
- Workflow structure: Planning → Tracer Bullet → Incremental Loop → Refactor
- Checklist per cycle
- "DO NOT" guidance on horizontal slicing
- Anti-patterns and correct approaches

## When Syncing

**Always preserve:**
- All Beads CLI commands and workflow  
- "Naming & Comments" section
- "Issue to Code Workflow" title
- Supporting document references
- Planning guidance about breaking features further

**Merge carefully:**
- Core TDD philosophy may evolve upstream — pull improvements
- Do NOT remove Beads integration if upstream removes it
