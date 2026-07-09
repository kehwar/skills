---
name: issue-tracker
description: Use when triaging, publishing, or resolving issues; writing specs; charting wayfinder maps; or resolving TICKET- references from commit messages. Tickets, specs, and wayfinding items live as Obsidian notes in the vault.
---

# Issue Tracker: Obsidian Vault

Tickets, specs, and wayfinding items live as **flat** markdown notes in `$OBSIDIAN_VAULT_PATH/Library/`. The vault **is** the tracker — no external API, no separate service — so every discovery is a deterministic filename glob across a flat namespace.

## Conventions

### File naming

All tracker notes use a uniform naming scheme. The number namespace is shared across issues, specs, and wayfinding items:

```
Library/TICKET-<NNNNNN>-<slug>.md
```

Examples:
| File | What it is |
|---|---|
| `TICKET-000001-add-login.md` | Issue |
| `TICKET-000002-auth-spec.md` | Spec |
| `TICKET-000003-explore-apis.md` | Wayfinder research |
| `TICKET-000004-prototype-ui.md` | Wayfinder prototype |

The `<NNNNNN>` is zero-padded to 6 digits so filenames sort numerically. The `<slug>` is a short kebab-case descriptor.

**Library/ must remain flat.** No subdirectories for tickets. Everything lives at one level — the flat structure is what makes glob-based discovery deterministic.

### Frontmatter schema

Every tracker note uses the `task` tag and carries `task_labels` to distinguish its role:

| Property | Required | Description |
|---|---|---|
| `tags` | ✅ | Always `[task]` (the tag schema that defines all task_* properties) |
| `task_ticket_id` | ✅ | The numeric identifier (matches `<NNNNNN>` in filename) |
| `task_status` | ✅ | Triage + execution state (see below) |
| `task_priority` | ✅ | Default `none` |
| `task_blocked_by` | ✅ | List of Obsidian wikilinks to tickets that block this one (default `[]`) |
| `task_projects` | ✅ | List of Obsidian wikilinks to parent maps or projects this ticket belongs to (default `[]`) |
| `task_labels` | ✅ | Unified classifier — includes ticket roles, wayfinder types, AND free-form classification tags (`feature`, `bugfix`, `config`, `epic`, `commissions`, ...). Replaces former `task_tags`. |
| `raised_by` | ❌ | Who reported / requested |
| `task_due` | ❌ | Due date |
| `task_scheduled` | ❌ | Scheduled date |
| `task_completed` | ❌ | Completion date (set when `task_status: done`) |
| `task_created` | ❌ | Created datetime (linter-managed) |
| `task_modified` | ❌ | Modified datetime (linter-managed) |
| `title` | ❌ | Auto-inferred from H1 by linter — **don't set manually** |

### Task status values (enum)

The `task_status` enum combines triage pipeline and execution tracks:

| Value | Meaning | Used by |
|---|---|---|
| `none` | Unset / not yet evaluated | Linter default |
| `needs-triage` | Needs maintainer evaluation | triage |
| `needs-info` | Waiting on reporter for more information | triage |
| `ready-for-agent` | Fully specified, ready for an agent to take | triage, to-tickets, to-spec |
| `ready-for-human` | Needs human judgment/access | triage |
| `wontfix` | Will not be actioned | triage |
| `done` | Completed (closed) | triage, wayfinder |
| `canceled` | Abandoned (closed) | triage, wayfinder |
| `bloqued` | Blocked by external dependency | execution |
| `sometime-soon` | Backlog | execution |
| `next-in-line` | Next up | execution |

### Task labels (open-ended list)

| Value | When to use |
|---|---|
| `ticket` | This note is an issue/ticket |
| `spec` | This note is a specification document |
| `bug` | Category: something is broken (triage) |
| `enhancement` | Category: new feature or improvement (triage) |
| `wayfinder:map` | This note is a wayfinder investigation map |
| `wayfinder:research` | This note is a wayfinder research ticket |
| `wayfinder:prototype` | This note is a wayfinder prototype ticket |
| `wayfinder:grilling` | This note is a wayfinder grilling ticket |
| `wayfinder:task` | This note is a wayfinder task ticket |
| `feature` | Classification: new feature |
| `bugfix` | Classification: bug fix |
| `config` | Classification: configuration change |
| `support` | Classification: support request |
| `report` | Classification: report/query |
| `training` | Classification: training request |
| `issue` | Classification: general issue |
| `epic` | Classification: large multi-step effort |
| `commissions` | Classification: commissions-related |
| *(any)* | Free-form — no schema constraint |

A ticket normally carries exactly one category label (`bug` or `enhancement`) alongside `ticket`. A spec carries `spec` (and NOT `ticket` — it *is* a spec, not a bug report). A wayfinder item carries its `wayfinder:*` type.

### Blocking edges

Use `task_blocked_by` for dependency edges. Values are Obsidian wikilinks pointing to the target ticket's full filename:

```yaml
task_blocked_by:
  - '[[TICKET-000012-payment-gateway]]'
  - '[[TICKET-000014-auth-flow]]'
```

A ticket whose `task_blocked_by` is empty or `[]` has no blockers and can start.

### Project membership (map → child)

Use `task_projects` for the wayfinder parent→child relationship. A wayfinder child lists its map as an Obsidian wikilink here:

```yaml
task_projects:
  - '[[TICKET-000005-sale-pipeline-spec]]'
```

This links a wayfinder research/prototype/grilling/task ticket to its map. For wayfinder, the map's `task_projects` stays empty (the map is the root — nothing points up from it).

### Comments

Conversation history, triage notes, and agent briefs are appended at the end of the note body under a `## Comments` heading. Every comment added by a triage session must start with:

> *This was generated by AI during triage.*

Format:

```markdown
## Comments

> *This was generated by AI during triage.*

**Triage Notes — 2026-07-09**

What we've established so far:
- ...

What we still need:
- ...
```

### Cross-references in commit messages

When code-review or any other skill resolves issue references from commit messages (e.g. `Closes TICKET-000042`), strip the `TICKET-` prefix and leading zeros to get the bare number, then search `Library/TICKET-000042-*.md` by filename glob.

---

## Frontmatter Templates

Full reference with every variant → [`references/templates.md`](references/templates.md). The schema table above defines all valid properties; templates are convenience presets.

When writing a note, open `references/templates.md` and pick the variant that matches, then fill in the `task_ticket_id` and slug.

---

## Operations Reference (by consuming skill)

### triage — state machine

1. **Discover un-triaged tickets:** Search `Library/` for notes where `task_status: none` or `task_status: needs-triage`, tagged `task`, with `task_labels` containing `ticket`. (Criterion: every match in the vault collected and presented — don't stop at the first hit.)
2. **Check for reporter replies:** When returning to a `needs-info` ticket, read the `## Comments` section. If new text appears after the last triage comment, the reporter has replied. (Criterion: confirmed yes/no on whether new text exists.)
3. **Assign category:** Set `task_labels` to include `bug` or `enhancement`. Replace, don't append — a ticket has exactly one category. (Criterion: `task_labels` updated on the note.)
4. **Assign state:** Set `task_status` to the target value. Remove the old state. (Criterion: `task_status` updated.)
5. **Close:** Set `task_status: done` (completed) or `task_status: canceled` (wontfix/abandoned). For completed tickets, also set `task_completed: YYYY-MM-DD`.
6. **Add comment:** Append under `## Comments` with the triage disclaimer.
7. **Find by number:** Glob `Library/TICKET-<NNNNNN>-*.md` or search `task_ticket_id: <NNNNNN>` in frontmatter. (Criterion: note open on screen or confirmed absent — don't guess.)

### to-tickets — publish breakdown

1. **Create ticket files:** Write each ticket to `Library/TICKET-<NNNNNN>-<slug>.md` with the correct frontmatter.
2. **Assign numbers:** Allocate sequentially. The user will tell you the starting number or you can discover the next available by listing existing `TICKET-` files and taking `max + 1`, then zero-padding to 6 digits.
3. **Wire blocking edges:** For ticket A that depends on B, add `'[[TICKET-<B-NNNNNN>-<slug>]]'` to A's `task_blocked_by` frontmatter.
4. **Apply `ready-for-agent`:** Set `task_status: ready-for-agent` on each ticket.
5. **Create in dependency order:** Write blockers first so their numbers are known. In a linear chain that means TICKET-000001 first, TICKET-000002 second, etc.
(Criterion for the whole section: every ticket in the breakdown has a file on disk with the correct frontmatter and slug.)

### to-spec — publish specification

1. **Create spec file:** Write to `Library/TICKET-<NNNNNN>-<slug>.md`.
2. **Frontmatter:** `tags: [task]`, `task_labels: [spec]`, `task_status: ready-for-agent`.
3. **Body:** Use the spec-template from the to-spec skill (Problem Statement, Solution, User Stories, etc.).

### code-review — resolve issue references

1. **Parse commit messages:** Match `TICKET-<NNNNNN>` (padded), `Closes TICKET-<NNNNNN>`, and bare `#<NN>` patterns across every commit in scope. (Criterion: every commit parsed — one pass, no re-reading.)
2. **Resolve:** Glob `Library/TICKET-<NNNNNN>-*.md` for the filename, or search `task_ticket_id: <NNNNNN>` in frontmatter. (Criterion: each reference resolved to a note or flagged absent.)
3. **Read spec for Spec-axis review:** Look for notes with `task_labels` containing `spec` that match the feature domain.
4. **No match found?** Fall back to checking `Library/PRD-<slug>.md` or `Library/` for feature-matching files (legacy format, being migrated to TICKET- convention).

### wayfinder — charting and working the map

1. **Chart the map:**
   - Create the map note: `TICKET-<NNNNNN>-<slug>.md` with `task_labels: [wayfinder:map]`.
   - Create child tickets as separate `TICKET-<NNNNNN>-<slug>.md` files with `task_labels: [wayfinder:<type>]`.
   - Wire child→map relationship via `task_projects: ['[[TICKET-<map-NNNNNN>-<slug>]]']` on each child.
2. **Wire blocking edges** between wayfinder tickets using `task_blocked_by` with wikilinks.
3. **Find the frontier:** Search `Library/` for notes with `wayfinder:*` labels whose `task_blocked_by` is `[]` and `task_status` is NOT `done` or `canceled`. Unassigned = any such note. (Criterion: every match in the vault collected — don't return the first hit.)
4. **Claim a ticket:** Open the note and read its body. No formal claim mechanism in a file-based system — just pick one and start working.
5. **Resolve a ticket:**
   - Append the answer under `## Comments` with a `## Resolution` heading.
   - Set `task_status: done`.
   - Update the map note's `## Decisions so far` section.
   - Promote any fog that's now specifiable into new child tickets (new `TICKET-` files linked via `task_projects`).
6. **Find children of a map:** Search for notes where `task_projects` contains `TICKET-<map-NNNNNN>-` (the numeric prefix inside the wikilink is enough to glob-match).

---

## Aliases and Migration

The following property aliases exist for backward compatibility with notes created under the old schema:

| Old name | New name | Status |
|---|---|---|
| `ticket_status` | `task_status` | Active alias (property schema) |
| `ticket_priority` | `task_priority` | Active alias (property schema) |
| `task_tags` | `task_labels` | Merged (alias in property schema, bulk-renamed on next lint pass) |
| `task_board` | *(removed)* | Migrated to `task_labels` (July 2026) |
| `task_type` | *(removed)* | Migrated to `task_labels` (July 2026) |

The `task_status` enum was migrated July 2026:

| Old value | New value |
|---|---|
| `triage` | `needs-triage` |
| `ready` | `ready-for-agent` |
| `needs-human` | `ready-for-human` |
| *(missing)* | `done` (added) |
