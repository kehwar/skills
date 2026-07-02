---
name: grill-with-docs
description: Grilling session that also builds docs — a relentless interview to sharpen a plan or design, creating ADRs and glossary entries as decisions land. Use when you have a codebase: stateful, retains what it learns.
disable-model-invocation: true
metadata:
  adapted-from-upstream-skill:
    - upstream/mattpocock/skills/engineering/grill-with-docs@1445797d
    - upstream/mattpocock/skills/productivity/grilling@1445797d
---

Interview the user relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering. If a question can be answered by exploring the codebase, explore the codebase instead.

As decisions crystallize, run the skill_view('domain-modeling') skill to keep the domain model current — sharpen terms, update `CONTEXT.md`, and record ADRs inline as you go.
