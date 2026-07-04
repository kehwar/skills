# Setup Reference

Scaffold the Hermes profile files that the engineering skills assume:

- **`SOUL.md`** — the main profile entrypoint
- **`CONTEXT-MAP.md`** — the map of every project this profile manages
- **`CONTEXT.md`** — the profile domain glossary

This is a setup reference, not a deterministic script. Explore, present what you found, confirm with the user, then write.

## Process

### 1. Explore

Look at the current state to understand starting conditions. Read whatever exists; don't assume:

- `SOUL.md` at the profile root — does it exist? Is there already an `## Agent skills` section?
- `CONTEXT.md` and `CONTEXT-MAP.md` at the profile root
- `docs/adr/` and any `**/docs/adr/` directories

### 2. Present findings and ask

Summarise what's present and what's missing. Then walk the user through the decisions **one at a time** — present a question, get the user's answer, then move to the next. Don't dump them all at once.

### 3. Confirm and edit

Show the user a draft of:

- `SOUL.md` — pointing to the shared `skill-router` references and the local context files
- `CONTEXT-MAP.md` — the context map for this profile and its managed projects
- `CONTEXT.md` — the profile glossary / domain orientation

Let them edit before writing.

### 4. Write

If an `## Agent skills` block already exists in the chosen file, update its contents in-place rather than appending a duplicate. Don't overwrite user edits to the surrounding sections. Move the block to the top of the file if it isn't already there.

The block:

```markdown
## Agent skills

### Issue tracker

[one-line summary of where issues are tracked]. See /issue-tracker skill.

### Domain docs

[one-line summary of layout — "single-context" or "multi-context"]. Read `CONTEXT-MAP.md` at the profile root.
```

### 5. Done

Tell the user the setup is complete and which engineering skills will now read from these files. Mention they can edit these files directly later — re-running this skill is only necessary if they want to switch issue trackers or restart from scratch.
