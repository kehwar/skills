---
name: skill-router
description: Ask which skill or flow fits your situation. A router over the skills in this repo.
disable-model-invocation: true
metadata:
  adapted-from-upstream-skill:
    - upstream/mattpocock/skills/engineering/ask-matt@1445797d
    - upstream/mattpocock/skills/engineering/setup-matt-pocock-skills@1445797d
---

# Skill Router

You don't remember every skill, so ask.

A **flow** is a path through the skills. Most paths run along one **main flow**, and two **on-ramps** merge onto it. Everything else is standalone, or a vocabulary layer that runs underneath.

## The main flow: idea → ship

The route most work travels. You have an idea and want it built.

1. **skill_view('grill-with-docs')** — sharpen the idea by interview. Stateful: retains what it learns in `CONTEXT.md` and ADRs.
2. **Branch — can you settle every question in conversation?** If a question needs a runnable answer (state, business logic, a UI you have to see), detour through a prototype, bridged by **skill_view('handoff')** in both directions (see Crossing sessions):
   - **skill_view('handoff')** out, then open a fresh session against that file,
   - **skill_view('prototype')** to answer the question with throwaway code,
   - **skill_view('handoff')** back what you learned, and reference it from the original idea thread.
3. **Branch — is this a multi-session build?**
   - **Yes** → **skill_view('to-prd')** (turn the thread into a PRD) → **skill_view('to-issues')** (split the PRD into independently-grabbable issues). Because the issues are independent, **clear context between each one**: start a fresh session per issue and kick off **skill_view('implement')** by passing it the PRD and the single issue to work on.
   - **No** → **skill_view('implement')** right here, in the same context window.

   Either way, **skill_view('implement')** builds each issue by driving **skill_view('tdd')** internally — one red-green slice at a time — then closes out by running **skill_view('code-review')**, a two-axis review (Standards + Spec) of the diff, before committing. Reach for **skill_view('tdd')** on its own when you just want to build a concrete behaviour test-first without a full spec, and **skill_view('code-review')** on its own whenever you want to review a branch or PR against a fixed point.

### Context hygiene

Keep steps 1–3 in **one unbroken context window** — don't compact or clear until after skill_view('to-issues') — so the grilling, PRD, and issues all build on the same thinking. Each skill_view('implement') then starts fresh, working from the issue.

The limit on this is the **[smart zone](https://www.aihero.dev/ai-coding-dictionary/smart-zone)**: the window (~120k tokens on state-of-the-art models) within which the model still reasons sharply. If a session approaches it before skill_view('to-issues'), don't push on degraded — skill_view('handoff') and continue in a fresh thread.

## On-ramps

A starting situation that generates work, then merges onto the main flow.

- **Bugs and requests piling up** → **skill_view('triage')**. It moves issues through triage roles and produces agent-ready issues, which **skill_view('implement')** later picks up.

  Triage is only for issues **you didn't create** — bug reports, incoming feature requests, anything that arrives raw. Issues that skill_view('to-issues') produced are already agent-ready, so **don't triage them**.

- **Something's broken** → **skill_view('diagnosing-bugs')**. For the hard ones: the bug that resists a first glance, the intermittent flake, the regression that crept in between two known-good states. It refuses to theorise until it has a **tight feedback loop** — one command that already goes red on *this* bug — then fixes with a regression test. Its post-mortem hands off to **skill_view('improve-codebase-architecture')** when the real finding is that there's no good seam to lock the bug down.

## Codebase health

Not feature work — upkeep.

- **skill_view('improve-codebase-architecture')** — run whenever you have a spare moment to keep the codebase good for agents to operate in. It surfaces **deepening opportunities**; picking one _generates an idea_ you can take into the main flow at skill_view('grill-with-docs'). It's the survey that finds the candidates; **skill_view('codebase-design')** (below) is the bench you design the chosen one on.

## Vocabulary underneath

Two model-invoked references that run *beneath* the other skills — each the single source of truth for its vocabulary. Reach for them directly when the **words**, not the process, are the problem; or let the skills above pull them in.

- **skill_view('domain-modeling')** — sharpen the project's *domain* language: challenge a fuzzy term, resolve an overloaded word ("account" doing three jobs), record a hard-to-reverse decision as an ADR. It's the active discipline skill_view('grill-with-docs') drives to keep `CONTEXT.md` a clean glossary.
- **skill_view('codebase-design')** — the deep-module vocabulary (module, interface, depth, seam, adapter, leverage, locality) for designing a module's *shape*: a lot of behaviour behind a small interface at a clean seam. skill_view('tdd') and skill_view('improve-codebase-architecture') both speak it.

## Crossing sessions

- **skill_view('handoff')** — when a thread is full or you need to branch off (e.g. into a skill_view('prototype') session), this compacts the conversation into a markdown file. You don't continue in place — you **open a new session and reference that file** to carry the context across. It's the bridge between context windows, in either direction. Use it when you want a **fresh session** but need the **current conversation preserved**.
- **`/compact`** (built-in) — stay in the **same conversation**, letting the earlier turns be summarized. Use it at **intentional breaks between phases**, when you don't mind losing the verbatim history. Don't compact mid-phase — the agent can lose its way. skill_view('handoff') forks; `/compact` continues.

## Standalone

Off the main flow entirely.

- **skill_view('prototype')** — a small, throwaway program that answers one design question: does this state model feel right, or what should this UI look like. Throwaway from day one — keep the answer, delete the code. It's the detour in step 2 of the main flow, but reach for it any time a design question is hard to settle on paper.
- **skill_view('research')** — delegate reading legwork to a **background agent**: it investigates a question against **primary sources**, then leaves a cited Markdown file in the repo. Keep working while it reads. The file it produces is something to take *into* the main flow at skill_view('grill-with-docs') — research feeds the thinking, it doesn't replace it.
- **skill_view('teach')** — learn a concept over multiple sessions, using the current directory as a stateful workspace.
- **skill_view('writing-great-skills')** — reference for writing and editing skills well.

## Precondition

Before the first engineering flow, read [setup-reference.md](./setup-reference.md) and follow the instructions to configure issue tracker and domain docs for this repo. The setup reference also includes setup-reference.md, issue-tracker-github.md, issue-tracker-gitlab.md, issue-tracker-local.md, triage-labels.md, and domain.md as reference files.
