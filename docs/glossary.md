# Skills

A personal collection of AI agent skills. Tracks upstream repos and authors new skills, making them available to AI coding agents.

## Language

**Skill**:
A self-contained folder containing at minimum a `SKILL.md`, consumed directly by AI coding agents.

**Authored Skill**:
A skill owned by this repo — committed directly here and never overwritten by Sync.
_Avoid_: Manual skill, custom skill

**Domain**:
An organizational category for Authored Skills (e.g., `frappe`, `sap`, `typst`, `engineering`). Skills with a domain are grouped in `authored/<domain>/`. Domain names may match Upstream names, but they are independent concepts.
_Avoid_: Upstream, category, folder, organization

**Synced Skill**:
A copy of a Skill from an Upstream, stored under `synced/<name>/`. Synced Skills are ephemeral — they are created by Sync and can be removed by Cleanup.
_Avoid_: Upstream skill, copied skill

**Upstream**:
An external GitHub repo tracked as a git submodule under `upstream/<key>`. May contribute Skills (if it contains `SKILL.md` files) and/or serve as reference material for Authored Skills.
_Avoid_: Vendor, source, provider, dependency

## Relationships

- A **Skill** is either an **Authored Skill** or a **Synced Skill**
- A **Synced Skill** is a copy of a Skill from an **Upstream**
- An **Upstream** contributes zero or more **Synced Skills** (selected subset, not all)
- **Sync** only touches **Synced Skills**; **Authored Skills** are never overwritten

## Example dialogue

> **Dev:** "I added a new Frappe doctype skill — should I commit it under the frappe Upstream?"
> **Domain expert:** "No. Upstreams are read-only. Your skill goes under `authored/` as an Authored Skill. You can optionally reference the Upstream as its source, but it's owned here."

> **Dev:** "What's the difference between `frappe` and `antfu` as Upstreams?"
> **Domain expert:** "None structurally. `antfu` happens to have `SKILL.md` files so Sync copies skills from it. `frappe` doesn't, so it's reference-only. Same concept either way."

> **Dev:** "I organized my Frappe skills under `authored/frappe/`. Does that mean they're synced from the Frappe upstream?"
> **Domain expert:** "No. The domain is just a folder organization choice. `upstream/frappe` is the reference source (read-only). The authored skills you wrote in `authored/frappe/` are yours and never overwritten. They happen to use Frappe APIs, but they're not synced."
