---
name: create-pr
description: Create a well-formatted pull request with a descriptive title, summary of changes, and testing notes. Use when asked to "create a PR", "open a pull request", or "submit my changes".
license: MIT
---

# Create Pull Request

Create a well-structured pull request that clearly communicates the purpose and scope of the changes.

## When to Use

- User asks to "create a PR", "open a pull request", or "submit my changes"
- User wants to share changes for review
- User wants to merge a feature branch into the main branch

## Steps

1. **Gather context** – Run `git diff main...HEAD` (or the relevant base branch) to understand all changes. Also run `git log main...HEAD --oneline` to see the commit history.

2. **Determine the PR title** – Write a concise title using the conventional commits format:
   - `feat: <description>` for new features
   - `fix: <description>` for bug fixes
   - `chore: <description>` for maintenance tasks
   - `docs: <description>` for documentation changes
   - `refactor: <description>` for code refactoring
   - `test: <description>` for test changes

3. **Write the PR body** using this structure:

   ```markdown
   ## Summary

   <!-- One or two sentences describing what this PR does and why. -->

   ## Changes

   - <!-- Bullet list of key changes -->
   - <!-- Be specific about what was added, modified, or removed -->

   ## Testing

   - <!-- How was this tested? -->
   - <!-- List manual steps or automated tests that were run -->

   ## Notes

   <!-- Any additional context, caveats, or follow-up work (optional) -->
   ```

4. **Create the PR** using `gh pr create`:

   ```bash
   gh pr create --title "<title>" --body "<body>"
   ```

   If the user hasn't specified a base branch, default to `main`. If `main` doesn't exist, use `master`.

5. **Share the PR URL** with the user after creation.

## Guidelines

- Keep the title under 72 characters
- Use present tense in the title ("add feature" not "added feature")
- Link related issues with `Closes #<number>` or `Fixes #<number>` in the body when applicable
- If the diff is large, summarize the most impactful changes rather than listing every file
