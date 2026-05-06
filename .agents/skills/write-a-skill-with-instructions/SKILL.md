---
name: write-a-skill-with-instructions
description: Create or edit agent skills with proper structure, progressive disclosure, and bundled resources. Use when user wants to create, write, edit, or build a new skill.
---

# Writing Skills

## When creating a new skill

1. **Determine domain** - ask user if unclear:
   - Does this skill belong to a domain (e.g., `frappe`, `sap`, `typst`, `engineering`)?
   - Flat skills (no domain) stay at `authored/`; domain skills group in `authored/<domain>/`

2. **Read applicable instructions** - check if any exist:
   - `instructions/domain/<domain>.md` — domain-specific authoring conventions
   - `instructions/skills/<skill-name>.md` — skill-specific guidance
   - Use these as constraints and context

3. **Scaffold with pnpm write-skill** - run:
   ```bash
   pnpm write-skill <skill-name> [--domain <domain>]
   ```
   This creates the skill structure: SKILL.md, meta.json, etc.

4. **Gather requirements** - ask user about:
   - What task/domain does the skill cover?
   - What specific use cases should it handle?
   - Does it need executable scripts or just instructions?
   - Any reference materials to include?

5. **Draft the skill** - create/update:
   - SKILL.md with concise instructions
   - Additional reference files if content exceeds 500 lines
   - Utility scripts if deterministic operations needed

6. **Review with user** - present draft and ask:
   - Does this cover your use cases?
   - Anything missing or unclear?
   - Should any section be more/less detailed?

## When updating an existing skill

1. **Check skill type** - review `skills/<skill-name>/meta.json`:
   - `type: "authored"` → safe to edit directly
   - `type: "synced"` → managed by Sync; edits will be lost on next `pnpm sync`

2. **Read applicable instructions** - check if any exist:
   - `instructions/domain/<domain>.md` — domain-specific conventions (if skill has a domain)
   - `instructions/skills/<skill-name>.md` — skill-specific guidance
   - Apply these as constraints to your edits

3. **Make targeted updates** - edit:
   - SKILL.md frontmatter (description, name triggers)
   - Workflow sections for clarity and completeness
   - Reference files and examples as needed

4. **Review changes** - ensure:
   - Description still clearly signals when to use the skill
   - Workflows follow established domain conventions
   - All examples remain accurate and tested

## Skill Structure

```
skill-name/
├── SKILL.md           # Main instructions (required)
├── REFERENCE.md       # Detailed docs (if needed)
├── EXAMPLES.md        # Usage examples (if needed)
├── meta.json          # Skill metadata (auto-generated)
└── scripts/           # Utility scripts (if needed)
    └── helper.js
```

## SKILL.md Template

A SKILL.md file starts with YAML frontmatter and contains clear, progressive disclosure:

```md
---
name: skill-name
description: Brief description of capability. Use when [specific triggers].
---

# Skill Name

## Quick start

[Minimal working example]

## Workflows

[Step-by-step processes with checklists for complex tasks]

## Advanced features

[Link to separate files: See [REFERENCE.md](REFERENCE.md)]
```

## Description Requirements

The frontmatter `description` is **the only thing the agent sees** when deciding which skill to load. It's surfaced in the system prompt alongside all other installed skills. Your agent reads these descriptions and picks the relevant skill based on the user's request.

**Goal**: Give the agent just enough info to know:

1. What capability this skill provides
2. When/why to trigger it (specific keywords, contexts, file types)

**Format**:

- Max 1024 chars
- Write in third person
- First sentence: what it does
- Second sentence: "Use when [specific triggers]"

**Good example**:

```
Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when user mentions PDFs, forms, or document extraction.
```

**Bad example**:

```
Helps with documents.
```

The bad example gives the agent no way to distinguish this from other document skills.

## When to Add Scripts

Add utility scripts when:

- Operation is deterministic (validation, formatting)
- Same code would be generated repeatedly
- Operation reduces manual errors
- Errors need explicit handling

Scripts save tokens and improve reliability vs generated code.

## When to Split Files

Split into separate files when:

- SKILL.md exceeds 100 lines
- Content has distinct domains (finance vs sales schemas)
- Advanced features are rarely needed

## Review Checklist

After drafting, verify:

- [ ] Description includes triggers ("Use when...")
- [ ] SKILL.md under 100 lines
- [ ] No time-sensitive info
- [ ] Consistent terminology
- [ ] Concrete examples included
- [ ] References one level deep
