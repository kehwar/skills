# to-features

**Sourced from:** `upstream/mattpocock/skills/engineering/to-issues/SKILL.md`

```bash
diff upstream/mattpocock/skills/engineering/to-issues/SKILL.md authored/engineering/to-features/SKILL.md
```

## Key Changes from Upstream

### Renaming  
- Skill renamed: `to-issues` → `to-features`
- Title renamed: "To Issues" → "To Features"
- Reflects Beads terminology and workflow: "issues" are broken into "features"

### Vocabulary Changes Throughout
- "issues" → "features" (all instances)
- "issue tracker" → "Beads Issue Tracker"
- "issue number, URL, or path" → simplified for Beads context

### Removed Concepts
- **HITL/AFK distinction removed:** Upstream had "Human-In-The-Loop" vs "Away-From-Keyboard" slices
  - HITL = requires human decision (design review, architectural decision)
  - AFK = can run autonomous
  - Authored version doesn't include this complexity
- Removed from quiz presentation: "Type: HITL / AFK"
- Removed guidance: "Prefer AFK over HITL where possible"

### Simplified Structure  
- Upstream template was more procedural with explicit HITL/AFK typing
- Authored version focuses on behavior and acceptance criteria
- Issue template simplified for Beads workflow

### Publication Workflow
- Upstream: Generic "publish to issue tracker" with triage labels
- Authored: Explicit Beads commands: `bd create --title="..." --description="..." --acceptance="..." --type=task [--parent=<epic_id>] [--deps "blocks:<id1>,blocks:<id2>"]`
- No triage labels; created ready-to-work
- Features published in dependency order for real ID references

### Removed References
- Removed: "`run /setup-matt-pocock-skills`" reference
- Not needed in Beads context

### Preserved from Upstream
- "Durability over precision" principle (avoid file paths, line numbers)  
- "Behavioral, not procedural" guidance
- Vertical slice concept and rules
- Process structure: Gather → Explore → Draft → Quiz → Publish
- Deep modules concept
- User story integration

## When Syncing

**Always preserve:**
- Skill name "to-features" (do NOT revert to "to-issues")
- All Beads terminology and `bd create` command workflow
- Do NOT add HITL/AFK distinction back
- No triage labels

**Merge carefully:**
- Core principles may evolve upstream — pull improvements
- Do NOT add triage label workflow back if upstream adds it
- Keep feature/vertical slice emphasis
