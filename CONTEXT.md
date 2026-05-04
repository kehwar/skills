# Skills

A personal collection of AI agent skills. Tracks upstream repos and authors new skills, making them available to AI coding agents.

## Language

**Skill**:
A self-contained folder containing at minimum a `SKILL.md`, consumed directly by AI coding agents.

**Authored Skill**:
A skill owned by this repo — committed directly here and never overwritten by Sync.
_Avoid_: Manual skill, custom skill

**Source-Derived Skill**:
An Authored Skill produced using an Upstream as reference material.
_Avoid_: Generated skill, extracted skill

**Upstream**:
An external GitHub repo tracked as a git submodule under `upstream/<key>`. May contribute Skills (if it contains `SKILL.md` files) and/or serve as reference material for Authored Skills.
_Avoid_: Vendor, source, provider, dependency

**Sync**:
The non-interactive, idempotent process of pulling latest Upstream submodules and copying selected skills into `skills/`.
_Avoid_: Install, update, publish

**Cleanup**:
The process of detecting and removing skills or submodules that are no longer declared in the repo config.

## Relationships

- A **Skill** is either an **Authored Skill**, a **Source-Derived Skill**, or copied from an **Upstream**
- A **Source-Derived Skill** is a specialisation of **Authored Skill** — the **Upstream** is reference only; the skill is still owned here
- An **Upstream** contributes zero or more **Skills** (selected subset, not all)
- **Sync** only touches Upstream-sourced skills; **Authored Skills** and **Source-Derived Skills** are never overwritten

## Example dialogue

> **Dev:** "I added a new Frappe doctype skill — should I commit it under the frappe Upstream?"
> **Domain expert:** "No. Upstreams are read-only. Your skill goes under `skills/` as an Authored Skill — or a Source-Derived Skill if you used the frappe Upstream as reference."

> **Dev:** "What's the difference between `frappe` and `antfu` as Upstreams?"
> **Domain expert:** "None structurally. `antfu` happens to have `SKILL.md` files so Sync copies skills from it. `frappe` doesn't, so it's reference-only. Same concept either way."
