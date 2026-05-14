# Issue tracker: Beads

Issues and work for this repo live in Beads. Use the `bd` CLI for all operations.

## Conventions

- **Create an issue**: `bd create --title="..." --description="..." --type=task|bug|feature|epic [--parent=<parent_id>]`. Use multi-line descriptions for context.
- **Read an issue**: `bd show <id>` to view full details, dependencies, and notes.
- **List issues**: `bd list --status=open` for open issues, `bd list --status=in_progress` for active work, `bd ready` for issues ready to start (no blockers).
- **Comment on an issue**: `bd update <id> --notes="..."` to set notes.
- **Update fields**: `bd update <id> --title/--description/--notes/--design` to modify inline.
- **Close**: `bd close <id>` to mark complete, or `bd close <id1> <id2> ...` to close multiple at once.
- **More commands**: `bd` for full command list.

All work is tracked in Beads. Use `bd` for all operations — do NOT use markdown files or TodoWrite.

## When a skill says "publish to the issue tracker"

Create a Beads issue: `bd create --title="..." --description="..." --type=task`

## When a skill says "fetch the relevant ticket"

Run `bd show <id>` to view full details including dependencies and notes.
