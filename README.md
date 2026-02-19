# Skills

A personal collection of skills for AI coding agents, installable via the [skills CLI](https://github.com/vercel-labs/skills).

## Install All Skills from This Collection

To install all skills tracked in this repository:

```bash
npx skills add kehwar/skills
```

## Updating Skills from Home Directory

Sync your installed skills from home directory to the repository:

```bash
pnpm sync
```

This command:
1. Copies `.skill-lock.json` from `~/.agents/` to repo `.agents/`
2. For each skill in the lockfile, removes old copy and syncs fresh skill folder from `~/.agents/skills/`
3. Prepares your current skill setup for git commit

**Use cases:**
- Backup your installed skills to the repository
- Share skills configuration across team/machines via git
- Track skill installations and their contents in version control

## License

MIT
