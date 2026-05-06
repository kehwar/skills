# Domain Docs: Multi-Context

How the engineering skills should consume this repo's domain documentation when exploring the codebase in a multi-context (monorepo) setup.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — points to each context's `CONTEXT.md`
- **`docs/adr/`** at the repo root — system-wide architectural decisions
- **`src/<context>/CONTEXT.md`** — the domain glossary for the specific context you're working in
- **`src/<context>/docs/adr/`** — decisions scoped to this context

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT-MAP.md                    ← points to each context
├── docs/adr/                         ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                 ← ordering-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/                 ← billing-specific decisions
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md` (global or context-scoped). Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR (system-wide or context-scoped), surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
