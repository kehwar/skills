# Plugin Manifest

## plugin.json Structure

`plugin.json` lists all skills (authored + synced) in a single flat array:

```json
{
  "name": "kehwar-skills",
  "skills": [
    "./authored/engineering/dev-log",
    "./authored/engineering/tdd",
    "./synced/antfu",
    "./synced/pdf"
  ]
}
```

- **`name`** — Plugin name
- **`skills`** — Array of skill paths relative to project root (each path points to a directory containing `SKILL.md`)
