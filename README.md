# skills

A personal collection of skills for AI coding agents, installable via the [skills CLI](https://github.com/vercel-labs/skills).

## Install

Install all skills from this collection:

```bash
npx skills add kehwar/skills
```

## Add Skills

To add skills and save them to the skills registry:

```bash
pnpm add-skill <repo> [-s <skill>]
```

**When you don't specify a skill** (`-s` flag), the script will:
1. List all available skills in the repository using `npx skills add <repo> -l`
2. Install each skill individually with `npx skills add <repo> -s <skill> -a github-copilot -y`
3. Add each skill to `.agents/skills.json`

**When you specify a skill**, it will install only that specific skill.

Examples:

```bash
# List and add ALL skills from a repository
pnpm add-skill https://github.com/vercel-labs/skills

# Add a specific skill from a repository
pnpm add-skill https://github.com/vercel-labs/skills -s find-skills
```

Skills added via this command are automatically:
- Installed with the `-a github-copilot -y` flags for auto-configuration
- Saved to `.agents/skills.json` for tracking and future updates

## Managing Skills

The `.agents/skills.json` file tracks all installed skills with their source repositories and installation dates. This allows you to:
- Keep track of what skills are installed
- Reinstall skills from the registry
- Update skills from their source repositories

### Reinstall All Skills

To reinstall all skills from the registry (useful after cloning or syncing):

```bash
pnpm install-skills
```

This command reads `.agents/skills.json` and reinstalls all tracked skills.

## License

MIT
