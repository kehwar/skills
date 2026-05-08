# Plugin Manifest

## marketplace.json Structure

`marketplace.json` groups skills into categories. Each plugin entry has:

```json
{
  "plugins": [
    {
      "name": "engineering",
      "source": "./authored/engineering",
      "skills": [
        "./dev-log",
        "./tdd",
        "./to-prd"
      ]
    }
  ]
}
```

- **`name`** — Category name (converts kebab-case to Title Case in TUI run: "engineering" → "Engineering")
- **`source`** — Path to the skill directory
- **`skills`** — Array of skill paths relative to source

## Important Caveat

**Do NOT install authored skills locally in `./.agents/skills/`**

Skills must only exist in `./authored/` directories. If they're also installed locally, the CLI discovery will prefer them and ignore grouping.