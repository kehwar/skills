---
name: handoff
description: Use when a conversation is too full to continue cleanly, or when you need to move work into a fresh session while preserving the current context in a handoff document.
argument-hint: "What will the next session be used for?"
metadata:
  adapted-from-upstream-skill:
    - upstream/mattpocock/skills/productivity/handoff@1445797d
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS - not the current workspace.

Include a "suggested skills" section in the document, which suggests skills that the agent should invoke.

Do not duplicate content already captured in other artifacts (PRDs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.
