# skills

A personal collection of skills for AI coding agents, installable via the [skills CLI](https://github.com/vercel-labs/skills).

## Install

```bash
npx skills add kehwar/skills
```

## Available Skills

### create-pr

Creates a well-formatted pull request with a descriptive title, summary of changes, and testing notes. Use when asked to "create a PR", "open a pull request", or "submit my changes".

### release-notes

Generates structured release notes from git history. Use when asked to "generate release notes", "write a changelog", or "summarize changes since last release".

## Usage

Once installed, skills are automatically available to your coding agent. Examples:

```
Create a PR for my changes
```

```
Generate release notes since v1.0.0
```

## Skill Structure

Each skill is a directory containing a `SKILL.md` file with YAML frontmatter (`name`, `description`) followed by instructions for the agent.

## License

MIT