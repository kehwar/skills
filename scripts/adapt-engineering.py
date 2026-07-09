#!/usr/bin/env python3
"""
Adapt engineering skills from upstream/mattpocock into skills/engineering/.

Re-run after pulling the upstream submodule to refresh adapted copies.

Usage:
    ./scripts/adapt-engineering.py              # run transformations
    ./scripts/adapt-engineering.py --dry-run    # show what would change

The script never commits — run `git diff` after to review.
"""
import re, shutil, sys, subprocess, yaml
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST  = REPO_ROOT / "scripts" / "adapt-engineering.yaml"
UPSTREAM  = REPO_ROOT / "upstream" / "mattpocock" / "skills"
OUTPUT    = REPO_ROOT / "skills" / "engineering"
DRY_RUN   = "--dry-run" in sys.argv


# ── tools ────────────────────────────────────────────────────────────

def log(msg):
    print(f"  {'·' if DRY_RUN else '✓'} {msg}")

def copy_dir(src, dst):
    """Copy a skill directory, overwriting dst."""
    if DRY_RUN: return log(f"cp -a {src} → {dst}")
    if dst.exists(): shutil.rmtree(dst)
    shutil.copytree(src, dst)
    log(f"copied {src} → {dst}")

def replace_in_file(path, old, new, count=1, regex=False):
    """Find-and-replace (first N occurrences) in a file. When regex=True, old is a regex pattern."""
    p = Path(path)
    if DRY_RUN:
        return log(f"replace in {p.name}: {old[:50]!r}… → {new[:50]!r}…")
    content = _read(p)
    if content is None: return
    if regex:
        new_content = re.sub(old, new, content, count=count if count > 0 else 0, flags=re.MULTILINE)
        if content == new_content:
            return print(f"  ⚠  WARNING: regex pattern not found in {p}\n     {old[:80]!r}…")
    else:
        if old not in content:
            return print(f"  ⚠  WARNING: replacement target not found in {p}\n     {old[:80]!r}…")
        new_content = content.replace(old, new, count)
    if content != new_content: _write(p, new_content)

def replace_frontmatter_field(path, field, new_value, old_value=None):
    """Replace a YAML frontmatter field using proper YAML parsing."""
    p = Path(path)
    if DRY_RUN:
        return log(f"set frontmatter.{field} = {new_value[:50]!r}…")
    content = _read(p)
    if content is None: return

    parts = content.split("---", 2)
    if len(parts) < 3:
        return print(f"  ⚠  WARNING: no frontmatter in {p}")

    fm = yaml.safe_load(parts[1])
    if not isinstance(fm, dict):
        return print(f"  ⚠  WARNING: frontmatter not a dict in {p}")

    # Navigate to the field (support dotted paths)
    keys = field.split(".")
    cur = fm
    for k in keys[:-1]:
        if k not in cur:
            return print(f"  ⚠  WARNING: frontmatter field {field} not found in {p}")
        cur = cur[k]

    # Optional verification
    if old_value is not None:
        actual = str(cur.get(keys[-1], ""))
        if actual != old_value:
            return print(f"  ⚠  WARNING: frontmatter.{field} is {actual!r}, expected {old_value!r} in {p}")

    cur[keys[-1]] = new_value

    # Serialize frontmatter back
    new_fm = yaml.dump(fm, default_flow_style=False, allow_unicode=True, sort_keys=False).strip()
    new_content = f"---\n{new_fm}\n---{parts[2]}"
    _write(p, new_content)

def apply_patch(path, patch_file):
    """Apply a unified-diff patch from the file's parent directory."""
    p = Path(path)
    if DRY_RUN: return log(f"patch {p.name} ← {patch_file}")
    r = subprocess.run(
        ["patch", "--forward", "--no-backup-if-mismatch", "-p0"],
        cwd=p.parent, input=patch_file.read_text(),
        capture_output=True, text=True, timeout=30,
    )
    if r.returncode == 0:
        log(f"patched {p.name}")
    else:
        err = r.stderr.strip()
        if err and "already applied" not in err and "Skipping patch" not in err:
            print(f"  ⚠  patch had stderr for {p.name}:\n     {err[:200]}")

def _read(path):
    try: return Path(path).read_text(encoding="utf-8")
    except FileNotFoundError: return None

def _write(path, content):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(content, encoding="utf-8")
    log(f"wrote {Path(path).name}")

def load_manifest(path):
    with open(path) as f:
        data = yaml.safe_load(f)
    patches_dir = Path(data.get("patches_dir", "patches"))
    if not patches_dir.is_absolute():
        patches_dir = REPO_ROOT / patches_dir
    return patches_dir, data.get("skills", {})


# ── runner ───────────────────────────────────────────────────────────

def run():
    print("=== Adapting engineering skills from upstream/mattpocock ===")
    if DRY_RUN: print("  (DRY RUN — no files will be modified)")

    patches_dir, skills = load_manifest(MANIFEST)

    for name, cfg in sorted(skills.items()):
        source = cfg["source"]
        src_dir = UPSTREAM / source
        dst_dir = OUTPUT / name

        if not (src_dir / "SKILL.md").exists():
            print(f"  ⚠  SKIPPING {name}: upstream {source}/SKILL.md not found")
            continue

        copy_dir(src_dir, dst_dir)
        dst_file = dst_dir / "SKILL.md"

        for step in cfg.get("steps", []):
            if "replace" in step:
                r = step["replace"]
                target = r.get("target", "")
                if target.startswith("frontmatter."):
                    field = target[len("frontmatter."):]
                    replace_frontmatter_field(dst_file, field, r["new"], r.get("old"))
                else:
                    count = r.get("all", False) and -1 or 1
                    replace_in_file(dst_file, r["old"], r["new"], count, r.get("regex", False))
            elif "patch" in step:
                pf = patches_dir / step["patch"]
                if not pf.exists():
                    print(f"  ⚠  SKIPPING patch for {name}: {pf} not found")
                    continue
                apply_patch(dst_file, pf)

    print()
    print("=== Adaptation complete ===")
    print("  Run `git diff --stat` to review changes.")

if __name__ == "__main__":
    run()
