# Skills

A personal collection of skills for AI coding agents, installable via the [skills CLI](https://github.com/vercel-labs/skills).

## Install All Skills from This Collection

To install all skills tracked in this repository:

```bash
npx skills add kehwar/skills -a github-copilot -g
```

## Updating Skills from Home Directory

Sync your installed skills from home directory to the repository:

```bash
pnpm sync-from-home
```

This command:
1. Copies `.skill-lock.json` from `~/.agents/` to repo `.agents/`
2. For each skill in the lockfile, removes old copy and syncs fresh skill folder from `~/.agents/skills/`
3. Prepares your current skill setup for git commit

**Use cases:**
- Backup your installed skills to the repository
- Share skills configuration across team/machines via git
- Track skill installations and their contents in version control

## Restoring Skills to Home Directory

Sync skills from the repository to your home directory:

```bash
pnpm sync-to-home
```

This command:
1. Copies `.skill-lock.json` from repo `.agents/` to `~/.agents/`
2. For each skill in the lockfile, removes old copy and syncs skill folder from repo to `~/.agents/skills/`
3. Restores your skill setup from the repository

**Use cases:**
- Restore skills on a new machine after cloning
- Sync with repository's skill configuration
- Recover skills from version control

## License

MIT
