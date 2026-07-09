#!/usr/bin/env python3
"""
Manage upstream git submodules and their metadata in upstream.yaml.

Usage:
    ./scripts/upstreams.py                          # update all + yaml
    ./scripts/upstreams.py --yaml                   # refresh yaml from disk only
    ./scripts/upstreams.py --update <name>          # update single upstream
    ./scripts/upstreams.py --add <name> <url>       # add new upstream
    ./scripts/upstreams.py --add <name> <url> --branch <b>
    ./scripts/upstreams.py --remove <name>          # remove upstream
"""

import subprocess
import sys
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parent.parent
UPSTREAM_DIR = REPO_ROOT / "upstream"
GITMODULES = REPO_ROOT / ".gitmodules"
UPSTREAM_YAML = REPO_ROOT / "upstream.yaml"


# ── helpers ──────────────────────────────────────────────────────────

def run(cmd, cwd=None, capture=True, timeout=300):
    try:
        r = subprocess.run(
            cmd, cwd=cwd or str(REPO_ROOT),
            capture_output=capture, text=True, timeout=timeout,
        )
        if capture:
            return r.stdout.strip(), r.stderr.strip(), r.returncode
        return "", "", r.returncode
    except subprocess.TimeoutExpired:
        print(f"  \u26a0  timeout: {' '.join(cmd)}")
        return "", "timeout", 1


def gmt5_now():
    tz = timezone(timedelta(hours=-5))
    return f"{datetime.now(tz).strftime('%Y-%m-%dT%H:%M:%S')}-05:00"


# ── .gitmodules parsing ──────────────────────────────────────────────

def parse_gitmodules():
    entries = {}
    current = None
    for line in GITMODULES.read_text().splitlines():
        line = line.strip()
        if line.startswith("[submodule"):
            current = line.split('"')[1]
            entries[current] = {"path": None, "url": None, "branch": None}
        elif current and "=" in line:
            k, v = (x.strip() for x in line.split("=", 1))
            entries[current][k] = v
    result = {}
    for name, info in entries.items():
        p = info["path"]
        key = p.split("/", 1)[1] if p and p.startswith("upstream/") else name
        result[key] = info
    return result


def write_gitmodules(modules):
    """Write a {name: {url, path, branch}} dict back to .gitmodules."""
    lines = []
    for name in sorted(modules):
        info = modules[name]
        lines.append(f'[submodule "upstream/{name}"]')
        lines.append(f'\tpath = upstream/{name}')
        lines.append(f'\turl = {info["url"]}')
        if info.get("branch"):
            lines.append(f'\tbranch = {info["branch"]}')
        lines.append("")
    GITMODULES.write_text("\n".join(lines) + "\n")


# ── commit info ──────────────────────────────────────────────────────

def get_commit_info(submodule_path):
    hash_, _, rc = run(["git", "rev-parse", "HEAD"], cwd=submodule_path)
    if rc != 0:
        return None, None
    date_, _, _ = run(["git", "log", "-1", "--format=%cI"], cwd=submodule_path)
    return hash_, date_ or None


# ── upstream.yaml I/O ────────────────────────────────────────────────

def refresh_yaml(modules=None):
    """Read current submodule state and write upstream.yaml."""
    if modules is None:
        modules = parse_gitmodules()
    now = gmt5_now()
    upstreams = {}
    for name in sorted(modules):
        info = modules[name]
        sub_path = UPSTREAM_DIR / name
        hash_, date_ = get_commit_info(sub_path) if sub_path.is_dir() else (None, None)
        branch = info.get("branch")
        if not branch and sub_path.is_dir():
            url = info["url"]
            out, _, _ = run(["git", "ls-remote", "--symref", url, "HEAD"], timeout=15)
            for line in out.splitlines():
                if line.startswith("ref:"):
                    branch = line.split("/")[-1].split("\t")[0].strip()
                    break
        upstreams[name] = {
            "url": info["url"],
            "branch": branch,
            "last_commit": {"hash": hash_ or "N/A", "date": date_ or "N/A"},
            "last_fetch": now if sub_path.is_dir() else "N/A",
        }
    yaml_content = yaml.dump(
        {"upstreams": upstreams},
        default_flow_style=False, allow_unicode=True, sort_keys=False,
    )
    UPSTREAM_YAML.write_text(
        f"# Upstream repositories. Managed by scripts/upstreams.py\n{yaml_content}"
    )
    print(f"\N{check mark} upstream.yaml written ({len(upstreams)} upstreams)")


# ── mergify exclusion ─────────────────────────────────────────────────

def exclude_mergify_refs(name):
    """Configure the submodule to skip mergify/* refs during fetch.
    These automated backport branches clutter ref storage and cause
    permissions/locking errors on long branch names.
    """
    git_mod_dir = REPO_ROOT / ".git" / "modules" / "upstream" / name
    config_file = git_mod_dir / "config"
    if not config_file.exists():
        return  # not initialised yet — skip

    # Check if the exclusion is already set
    out, _, rc = run(
        ["git", "config", "--get", "remote.origin.fetch",
         r"\^refs/heads/mergify/\*"],
        cwd=str(git_mod_dir),
    )
    if rc == 0 and out:
        return  # already excluded

    # Add the negative refspec
    _, _, rc = run(
        ["git", "config", "--add", "remote.origin.fetch",
         "^refs/heads/mergify/*"],
        cwd=str(git_mod_dir),
    )
    if rc == 0:
        print(f"  \N{check mark} mergify refs excluded for {name}")
    else:
        print(f"  \u26a0  could not set mergify exclusion for {name}")


# ── operations ───────────────────────────────────────────────────────

def update_all():
    print("=== Updating all upstream submodules ===")
    _, err, rc = run(["git", "submodule", "update", "--remote", "--init", "--depth", "1"])
    if rc != 0:
        print(f"  \u26a0  submodule update exited {rc}")
        for line in err.splitlines() if err else []:
            print(f"     {line}")
    else:
        print("  \N{check mark} all submodules updated")
    print("\n=== Status ===")
    out, _, _ = run(["git", "submodule", "status"])
    for line in out.splitlines():
        print(f"  {line}")
    # Apply mergify exclusion to all existing submodules
    modules = parse_gitmodules()
    for name in modules:
        exclude_mergify_refs(name)
    refresh_yaml()


def update_one(name):
    modules = parse_gitmodules()
    if name not in modules:
        print(f"error: upstream '{name}' not found in .gitmodules")
        sys.exit(1)
    sub_path = UPSTREAM_DIR / name
    if not sub_path.is_dir():
        print(f"init upstream/{name}...")
        run(["git", "submodule", "update", "--init", "--depth", "1", f"upstream/{name}"])
    print(f"updating upstream/{name}...")
    _, err, rc = run(["git", "submodule", "update", "--remote", "--depth", "1", f"upstream/{name}"])
    if rc != 0:
        print(f"  \u26a0  update exited {rc}")
        for line in err.splitlines() if err else []:
            print(f"     {line}")
    else:
        print("  \N{check mark} updated")
    exclude_mergify_refs(name)
    # refresh yaml for just this entry
    now = gmt5_now()
    hash_, date_ = get_commit_info(sub_path)
    print(f"  {name} @ {hash_[:12]}" if hash_ else f"  {name}: no commit info")
    refresh_yaml()


def add_upstream(name, url, branch=None):
    """Add a new upstream submodule."""
    modules = parse_gitmodules()
    if name in modules:
        print(f"error: upstream '{name}' already exists")
        sys.exit(1)
    sub_path = UPSTREAM_DIR / name
    if sub_path.exists():
        print(f"error: upstream/{name} already exists on disk")
        sys.exit(1)

    print(f"adding upstream/{name} -> {url}")

    # detect default branch if not specified
    if not branch:
        out, _, _ = run(["git", "ls-remote", "--symref", url, "HEAD"])
        for line in out.splitlines():
            if line.startswith("ref:"):
                branch = line.split("/")[-1].split("\t")[0].strip()
                break
        if branch:
            print(f"  detected default branch: {branch}")

    cmd = ["git", "submodule", "add", "--name", name, url, f"upstream/{name}"]
    _, err, rc = run(cmd)
    if rc != 0:
        print(f"error: git submodule add failed\n{err}")
        sys.exit(1)

    # shallow the checkout
    run(["git", "submodule", "update", "--init", "--depth", "1", f"upstream/{name}"], capture=False)

    if branch:
        run(["git", "config", "-f", ".gitmodules", f"submodule.{name}.branch", branch])

    exclude_mergify_refs(name)

    # re-read modules to get the updated branch info
    modules = parse_gitmodules()
    refresh_yaml(modules)
    print(f"\N{check mark} added upstream/{name}")


def remove_upstream(name):
    """Remove an upstream submodule entirely."""
    modules = parse_gitmodules()
    if name not in modules:
        print(f"error: upstream '{name}' not found")
        sys.exit(1)

    sub_path = UPSTREAM_DIR / name
    print(f"removing upstream/{name}...")

    # deinit (ok if already deinitialised)
    run(["git", "submodule", "deinit", "-f", f"upstream/{name}"], capture=False)

    # remove from index (--cached to avoid git's .gitmodules consistency check)
    run(["git", "rm", "--cached", "-f", f"upstream/{name}"], capture=False)
    # fallback: if .gitmodules is dirty and git rm refused, force via update-index
    run(["git", "update-index", "--force-remove", f"upstream/{name}"], capture=False)

    # nuke any leftover dir
    if sub_path.exists():
        run(["rm", "-rf", str(sub_path)], capture=False)

    # remove .git/modules/<name>
    git_mod = REPO_ROOT / ".git" / "modules" / name
    if git_mod.exists():
        run(["rm", "-rf", str(git_mod)], capture=False)

    # purge submodule sections from .gitmodules (may exist under either key form)
    for key in (name, f"upstream/{name}"):
        section = f"submodule.{key}"
        run(["git", "config", "-f", ".gitmodules", "--remove-section", section], capture=False)

    # stage the .gitmodules change if anything was modified
    run(["git", "add", ".gitmodules"], capture=False)

    refresh_yaml()
    print(f"\N{check mark} removed upstream/{name}")


# ── entry point ──────────────────────────────────────────────────────

def main():
    if len(sys.argv) == 1:
        return update_all()

    cmd = sys.argv[1]

    if cmd == "--yaml":
        return refresh_yaml()

    if cmd == "--update":
        if len(sys.argv) < 3:
            print("usage: update-upstreams.py --update <name>")
            sys.exit(1)
        return update_one(sys.argv[2])

    if cmd == "--add":
        if len(sys.argv) < 4:
            print("usage: update-upstreams.py --add <name> <url> [--branch <b>]")
            sys.exit(1)
        name, url = sys.argv[2], sys.argv[3]
        branch = None
        if len(sys.argv) > 4 and sys.argv[4] == "--branch":
            branch = sys.argv[5] if len(sys.argv) > 5 else None
        return add_upstream(name, url, branch)

    if cmd == "--remove":
        if len(sys.argv) < 3:
            print("usage: update-upstreams.py --remove <name>")
            sys.exit(1)
        return remove_upstream(sys.argv[2])

    print(f"unknown flag: {cmd}")
    print(__doc__.strip())
    sys.exit(1)


if __name__ == "__main__":
    main()
