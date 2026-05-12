# to-epic

**Sourced from:** `upstream/mattpocock/skills/engineering/to-prd/SKILL.md`

```bash
diff upstream/mattpocock/skills/engineering/to-prd/SKILL.md authored/engineering/to-epic/SKILL.md
```

## Key Changes from Upstream

### Renaming
- Skill renamed: `to-prd` → `to-epic` 
- Title renamed: "to-prd" → "Turn the current conversation context into an epic"
- Reflects Beads terminology: PRD in upstream = epic in this project

### Vocabulary Changes Throughout
- "PRD" → "epic" (all instances)
- "issue tracker" → "Beads Issue Tracker"
- "publish it to the project issue tracker" → "publish it to Beads Issue Tracker"

### Simplified Template Structure
- **Removed:** "Implementation Decisions" section
- **Removed:** "Testing Decisions" section  
- **Renamed:** "Problem Statement" → "Current State"
- **Renamed:** "Solution" → "Desired State"
- Result: Cleaner template focused on: Current State, Desired State, User Stories, Out of Scope, Further Notes

### Publication Workflow
- Upstream: Implied label-based approach ("apply `ready-for-agent` triage label")
- Authored: Explicit Beads command: `bd create --type=epic --title="..." --description="..." --acceptance="..."`
- No triage labels applied; created ready-to-work

### Removed References
- Removed: "`run /setup-matt-pocock-skills` if not" reference
- Not needed in Beads context

### Preserved from Upstream
- "Durability over precision" principle (avoid file paths, line numbers)
- "Behavioral, not procedural" guidance  
- Process structure: Explore → Sketch → Quiz → Publish
- Deep modules concept
- User story guidance and examples

## When Syncing

**Always preserve:**
- Skill name "to-epic" (do NOT revert to "to-prd")
- All Beads terminology and `bd create` command workflow
- Simplified template structure (no Implementation/Testing Decisions)
- No triage labels

**Merge carefully:**
- Core principles may evolve upstream — pull improvements
- Do NOT add triage label workflow back if upstream adds it
