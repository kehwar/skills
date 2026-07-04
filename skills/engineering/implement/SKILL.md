---
name: implement
description: "Implement a piece of work based on a PRD or set of issues."
metadata:
  adapted-from-upstream-skill:
    - upstream/mattpocock/skills/engineering/implement@1445797d
---

Implement the work described by the user in the PRD or issues.

Use the /tdd skill where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use the /code-review skill to review the work.

Commit your work to the current branch.
