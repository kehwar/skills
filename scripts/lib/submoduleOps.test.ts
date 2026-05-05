import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { exec, submoduleExists } from './gitOps.ts'
import { ensureSubmodule } from './submoduleOps.ts'

describe('ensureSubmodule', () => {
  let tmp: string
  let remote: string
  let defaultBranch: string
  let root: string
  let origGitConfigGlobal: string | undefined

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'skills-submodule-test-'))

    // Point GIT_CONFIG_GLOBAL at a temp file that allows local file:// transport
    const gitConfigFile = join(tmp, '.gitconfig')
    writeFileSync(gitConfigFile, '[protocol "file"]\n\tallow = always\n')
    origGitConfigGlobal = process.env.GIT_CONFIG_GLOBAL
    process.env.GIT_CONFIG_GLOBAL = gitConfigFile

    // Create a local "remote" repo with two branches
    remote = join(tmp, 'remote')
    mkdirSync(remote)
    exec('git init', { cwd: remote })
    exec('git config user.email "t@t.com"', { cwd: remote })
    exec('git config user.name "T"', { cwd: remote })
    writeFileSync(join(remote, 'file.txt'), 'default content')
    exec('git add .', { cwd: remote })
    exec('git commit -m "init"', { cwd: remote })
    defaultBranch = exec('git branch --show-current', { cwd: remote })
    exec('git checkout -b feature', { cwd: remote })
    writeFileSync(join(remote, 'file.txt'), 'feature content')
    exec('git add .', { cwd: remote })
    exec('git commit -m "feature"', { cwd: remote })
    exec(`git checkout ${defaultBranch}`, { cwd: remote })

    // Create a root git repo that will hold the submodule
    root = join(tmp, 'root')
    mkdirSync(root)
    exec('git init', { cwd: root })
    exec('git config user.email "t@t.com"', { cwd: root })
    exec('git config user.name "T"', { cwd: root })
    writeFileSync(join(root, '.gitkeep'), '')
    exec('git add .', { cwd: root })
    exec('git commit -m "init"', { cwd: root })
  })

  afterEach(() => {
    if (origGitConfigGlobal !== undefined)
      process.env.GIT_CONFIG_GLOBAL = origGitConfigGlobal
    else
      delete process.env.GIT_CONFIG_GLOBAL
    rmSync(tmp, { recursive: true })
  })

  it('adds a new submodule when not registered', () => {
    ensureSubmodule(root, 'upstream/sub', remote)
    expect(existsSync(join(root, 'upstream/sub'))).toBe(true)
    expect(submoduleExists(root, 'upstream/sub')).toBe(true)
  })

  it('checks out the specified branch on a new submodule', () => {
    ensureSubmodule(root, 'upstream/sub', remote, 'feature')
    const branch = exec('git branch --show-current', { cwd: join(root, 'upstream/sub') })
    expect(branch).toBe('feature')
  })

  it('switches to a new branch on an existing submodule', () => {
    ensureSubmodule(root, 'upstream/sub', remote, defaultBranch)
    ensureSubmodule(root, 'upstream/sub', remote, 'feature')
    const branch = exec('git branch --show-current', { cwd: join(root, 'upstream/sub') })
    expect(branch).toBe('feature')
  })

  it('updates .gitmodules branch entry when switching branches', () => {
    ensureSubmodule(root, 'upstream/sub', remote, defaultBranch)
    ensureSubmodule(root, 'upstream/sub', remote, 'feature')
    const gitmodules = readFileSync(join(root, '.gitmodules'), 'utf-8')
    expect(gitmodules).toContain('branch = feature')
  })
})
