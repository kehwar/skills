---
name: release-notes
description: Generate structured release notes from git history. Use when asked to "generate release notes", "write a changelog", or "summarize changes since last release".
license: MIT
---

# Release Notes

Generate clear, structured release notes from the git commit history.

## When to Use

- User asks to "generate release notes", "write a changelog", or "summarize changes since last release"
- Preparing a new version release
- Updating `CHANGELOG.md`

## Steps

1. **Identify the range** – Determine the range of commits to include:
   - If a previous tag is specified, use `git log <previous-tag>..HEAD --oneline`
   - If no range is given, find the most recent tag with `git describe --tags --abbrev=0` and use that as the base
   - If there are no tags, use all commits: `git log --oneline`

2. **Categorize commits** by conventional commit type:

   | Category | Prefixes |
   |----------|----------|
   | 🚀 Features | `feat:` |
   | 🐛 Bug Fixes | `fix:` |
   | ⚡ Performance | `perf:` |
   | ♻️ Refactoring | `refactor:` |
   | 📚 Documentation | `docs:` |
   | 🧪 Tests | `test:` |
   | 🔧 Chores | `chore:`, `build:`, `ci:` |
   | 💥 Breaking Changes | commits with `BREAKING CHANGE` in the footer or `!` after the type |

   For commits that don't follow conventional commits format, use your judgment to place them in the most appropriate category.

3. **Write the release notes** using this structure:

   ```markdown
   ## [<version>] – <date>

   ### 💥 Breaking Changes
   - <!-- Only include if there are breaking changes -->

   ### 🚀 Features
   - <!-- New capabilities added in this release -->

   ### 🐛 Bug Fixes
   - <!-- Bugs resolved in this release -->

   ### ⚡ Performance
   - <!-- Performance improvements -->

   ### ♻️ Refactoring
   - <!-- Internal code improvements with no behavior change -->

   ### 📚 Documentation
   - <!-- Documentation updates -->

   ### 🔧 Chores
   - <!-- Dependency updates, CI changes, build tooling -->
   ```

   Omit empty sections.

4. **Determine the version** – If the user hasn't specified a version:
   - Check if there's a `package.json`, `pyproject.toml`, `Cargo.toml`, or similar with a version field
   - Otherwise, suggest a semver version based on the changes (bump major for breaking changes, minor for features, patch for fixes)

5. **Output the release notes** and ask the user if they'd like to:
   - Append to `CHANGELOG.md`
   - Create a GitHub release with `gh release create`
   - Simply view the notes without writing to a file

## Guidelines

- Write in present tense ("add feature" not "added feature")
- Keep each bullet point concise (one line when possible)
- Group related commits into a single bullet rather than listing each commit separately
- Include the PR or issue number when available (e.g. `(#123)`)
- Omit trivial commits like "fix typo" or "WIP" unless they are the only changes
