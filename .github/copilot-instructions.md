# GitHub Copilot Instructions for Skills Repository

## Repository Overview

This is a personal collection of skills for AI coding agents, managed via the [skills CLI](https://github.com/vercel-labs/skills). The repository uses the official `.skill-lock.json` format and syncs skills from the user's home directory (`~/.agents/`) to the repository for version control.

## ⚠️ Critical: Agent Workflow

**When working with this repository as an AI agent:**

1. **First action**: Check if `~/.agents/.skill-lock.json` exists
2. **If it doesn't exist**: Run `pnpm sync-to-home` to restore skills from repo to home directory
3. **Always use `-g` flag**: When adding/updating skills, the `-g` flag is REQUIRED for the lockfile to update
4. **After any skill changes**: Run `pnpm sync-from-home` to sync back to the repository

**Why this matters:**
- Agents start with a fresh home directory (no `~/.agents/` folder)
- Without syncing to home first, you can't add or update skills properly
- The `-g` flag ensures skills install to `~/.agents/` where the lockfile can track them
- Without `-g`, skills install to project-local `.agents/` and won't update the global lockfile

## How It Works

### Skills Installation
Skills must be installed **globally** to `~/.agents/` using these required flags:
- **`-g`** - Installs to home directory (REQUIRED for lockfile tracking)
- **`-a github-copilot`** - Uses universal `.agents` path (ensures compatibility)

```bash
# Install all skills from a repository
npx skills add <owner/repo> -a github-copilot -g

# Install a specific skill
npx skills add <owner/repo> -s <skill-name> -a github-copilot -g
```

### Sync Commands

**`pnpm sync-from-home`** - Home → Repository
- Copies `.skill-lock.json` from `~/.agents/` to repo `.agents/`
- Copies all skill folders from `~/.agents/skills/` to repo `.agents/skills/`
- Use after installing/updating skills to prepare for git commit

**`pnpm sync-to-home`** - Repository → Home
- Copies `.skill-lock.json` and skill folders from repo to `~/.agents/`
- Use on new machines or fresh agent environments to restore skills
- Skills become immediately available globally

## Common Tasks

### Adding a New Skill (Agent Workflow)
1. **First time**: `pnpm sync-to-home` (restore existing skills to home)
2. `npx skills add <repo> -s <skill> -a github-copilot -g` (**-g is required!**)
3. `pnpm sync-from-home` (sync updated lockfile and skills back to repo)
4. Commit changes

**Critical**: The `-g` flag is mandatory. Without it, the skill installs locally and the global lockfile won't update.

### Updating Skills
1. **First time**: `pnpm sync-to-home` (if home directory is empty)
2. `npx skills update` or `npx skills check`
3. `pnpm sync-from-home`
4. Commit changes

### Syncing on New Machine (or Fresh Agent Environment)
1. Clone repository
2. **Always run first**: `pnpm sync-to-home` (restore skills from repo to `~/.agents/`)
3. Skills are now available globally and ready for updates/additions

## Important Notes

- Never manually edit `.agents/.skill-lock.json` - it's managed by the skills CLI
- Always use `-a github-copilot -g` flags when adding/updating skills
- The repository stores a snapshot of skills for version control and sharing
- For agents/fresh environments: Always run `pnpm sync-to-home` before making changes

