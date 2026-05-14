# Agent Context Architecture

How context is assembled, what lives where, and what it costs.

## System Prompt (rebuilt every turn)

Built fresh on every user message. Components:

| Source | Contents | Consumes tokens every turn? |
|---|---|---|
| Instruction file (e.g. AGENTS.md) | Global + nearest ancestor project-level instruction file + any configured paths/URLs | Yes |
| Environment | Model settings, tool config, etc. | Yes |
| Skills listing | Name + description + location for **every** available skill | Yes |

The system block replaces itself each turn — it does not accumulate in history. But the token cost is paid on every API call.

## Skills

### Discovery — purely deterministic

- Glob patterns scan filesystem for `SKILL.md` files — no LLM involvement.
- YAML frontmatter is parsed. Only `name` (required) and `description` (optional) are extracted.
- A skill without a `description` is excluded from listings — invisible to the model.

### Selection — purely LLM decision

- The model sees only `name` + `description` in the available skills listing. Content is not loaded until the skill-loading tool is called.
- No deterministic routing, no triggers. The instruction file can give hints ("for X, use skill Y") but the model decides.
- Typos in skill name trigger an error with available skills listed — the model retries.

### Loading — verbatim paste

When the skill-loading tool is called, the SKILL.md body is pasted verbatim (no transformation), wrapped in:

```xml
<skill_content name="skill-name">
# Skill: skill-name
...markdown body...
Base directory for this skill: file:///path/to/skill
Relative paths in this skill are relative to this base directory.
Note: file list is sampled.
<skill_files>
<file>/abs/path/to/file1</file>
...
</skill_files>
</skill_content>
```

- The markdown body after frontmatter is inserted — the `description` is **not** included in the loaded output.
- The `<skill_files>` sample is unsorted (filesystem iteration order), up to 10 files, **not** an access-control list. The LLM can read any file relative to `Base directory`.
- Skill tool output is **protected from compaction pruning** — never truncated.

## Instruction File Nesting

- **Global**: Located in the agent's config directory.
- **Project**: The agent walks from the user's current working directory upward toward the project root — takes the **first** match, breaks. No stacking from multiple ancestors.
- **Custom**: Additional files/URLs from configuration.

The `cwd` is the user's terminal working directory when the agent was started. The project root is determined by the VCS root (e.g. git). Lookup starts from cwd and walks upward.

## Duplication Risk

- The instruction file and the skills listing live in the **system block** (fresh every turn).
- If the model reads the instruction file as a file (tool output), that content also lands in **message history** — two copies, wasting tokens.
- Skill content loaded via the skill-loading tool lives in message history (protected from pruning) but is not duplicated since it only loads once.

## Compaction

When context overflows:
1. Recent N turns are preserved as-is.
2. Older tool outputs are truncated (output text replaced with compaction marker).
3. Skill tool outputs are **never** truncated — they survive pruning.
4. A summary is generated to replace older conversation history.

## Summary

| Concern | Answer |
|---|---|
| Is skill discovery LLM-assisted? | No — pure filesystem glob |
| Does the LLM choose which skill to load? | Yes — purely its own judgment |
| Is the description pasted into context? | No — only name + content body |
| Are skills listing tokens paid every turn? | Yes |
| Is skill content protected from pruning? | Yes |
| Is the instruction file stacked from ancestors? | No — first match only |
