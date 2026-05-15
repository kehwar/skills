## Before exploring, read these

- **`docs/glossary.md`** — domain glossary and language for this project
- **`docs/adr/`** — ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront.

## Issue tracker

Issues are tracked exclusively with Beads Issue Tracker (`bd`). When working with issues read `docs/issue-tracker.md`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap, flag it to the user.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

## File structure & key locations

```
/
├── docs/glossary.md        # domain glossary
├── docs/issue-tracker.md   # issue guidelines
├── docs/adr/               # architecture decisions
├── meta.json               # Upstream config (url, branch, skill selections)
├── authored/<domain>/      # Authored Skills (type: "authored") — never overwritten
├── synced/<name>/          # Synced Skills (copied from Upstreams) — ephemeral!
├── upstream/<key>/         # read-only Upstream submodules — never edit
```