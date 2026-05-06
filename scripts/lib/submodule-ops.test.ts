import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { exec, submoduleExists } from './git-ops.ts'
import { ensureSubmodule } from './submodule-ops.ts'

describe('ensureSubmodule', () => {
  let temporary: string
  let remote: string
  let defaultBranch: string
  let root: string
  let origGitConfigGlobal: string | undefined

  beforeEach(() => {
    temporary = mkdtempSync(path.join(tmpdir(), 'skills-submodule-test-'))

    // Point GIT_CONFIG_GLOBAL at a temp file that allows local file:// transport
    const gitConfigFile = path.join(temporary, '.gitconfig')
    writeFileSync(gitConfigFile, '[protocol "file"]\n\tallow = always\n')
    origGitConfigGlobal = process.env.GIT_CONFIG_GLOBAL
    process.env.GIT_CONFIG_GLOBAL = gitConfigFile

    // Create a local "remote" repo with two branches
    remote = path.join(temporary, 'remote')
    mkdirSync(remote)
    const initResult = exec('git init', { cwd: remote })
    if (!initResult.ok)
      throw new Error(initResult.error)
    const emailResult = exec('git config user.email "t@t.com"', { cwd: remote })
    if (!emailResult.ok)
      throw new Error(emailResult.error)
    const nameResult = exec('git config user.name "T"', { cwd: remote })
    if (!nameResult.ok)
      throw new Error(nameResult.error)
    writeFileSync(path.join(remote, 'file.txt'), 'default content')
    const addResult = exec('git add .', { cwd: remote })
    if (!addResult.ok)
      throw new Error(addResult.error)
    const commitResult = exec('git commit -m "init"', { cwd: remote })
    if (!commitResult.ok)
      throw new Error(commitResult.error)
    const branchResult = exec('git branch --show-current', { cwd: remote })
    if (!branchResult.ok)
      throw new Error(branchResult.error)
    defaultBranch = branchResult.data
    const checkoutResult = exec('git checkout -b feature', { cwd: remote })
    if (!checkoutResult.ok)
      throw new Error(checkoutResult.error)
    writeFileSync(path.join(remote, 'file.txt'), 'feature content')
    const addResult2 = exec('git add .', { cwd: remote })
    if (!addResult2.ok)
      throw new Error(addResult2.error)
    const commitResult2 = exec('git commit -m "feature"', { cwd: remote })
    if (!commitResult2.ok)
      throw new Error(commitResult2.error)
    const checkoutResult2 = exec(`git checkout ${defaultBranch}`, { cwd: remote })
    if (!checkoutResult2.ok)
      throw new Error(checkoutResult2.error)

    // Create a root git repo that will hold the submodule
    root = path.join(temporary, 'root')
    mkdirSync(root)
    const rootInitResult = exec('git init', { cwd: root })
    if (!rootInitResult.ok)
      throw new Error(rootInitResult.error)
    const rootEmailResult = exec('git config user.email "t@t.com"', { cwd: root })
    if (!rootEmailResult.ok)
      throw new Error(rootEmailResult.error)
    const rootNameResult = exec('git config user.name "T"', { cwd: root })
    if (!rootNameResult.ok)
      throw new Error(rootNameResult.error)
    writeFileSync(path.join(root, 'README.md'), '# Root')
    const rootAddResult = exec('git add .', { cwd: root })
    if (!rootAddResult.ok)
      throw new Error(rootAddResult.error)
    const rootCommitResult = exec('git commit -m "init"', { cwd: root })
    if (!rootCommitResult.ok)
      throw new Error(rootCommitResult.error)
  })

  afterEach(() => {
    if (origGitConfigGlobal === undefined) {
      delete process.env.GIT_CONFIG_GLOBAL
    }
    else {
      process.env.GIT_CONFIG_GLOBAL = origGitConfigGlobal
    }
    rmSync(temporary, { recursive: true })
  })

  it('adds a new submodule when not registered', () => {
    ensureSubmodule(root, 'upstream/sub', remote)
    expect(existsSync(path.join(root, 'upstream/sub'))).toBe(true)
    expect(submoduleExists(root, 'upstream/sub')).toBe(true)
  })

  it('checks out the specified branch on a new submodule', () => {
    ensureSubmodule(root, 'upstream/sub', remote, 'feature')
    const result = exec('git branch --show-current', { cwd: path.join(root, 'upstream/sub') })
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toBe('feature')
  })

  it('switches to a new branch on an existing submodule', () => {
    ensureSubmodule(root, 'upstream/sub', remote, defaultBranch)
    ensureSubmodule(root, 'upstream/sub', remote, 'feature')
    const result = exec('git branch --show-current', { cwd: path.join(root, 'upstream/sub') })
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toBe('feature')
  })

  it('updates .gitmodules branch entry when switching branches', () => {
    ensureSubmodule(root, 'upstream/sub', remote, defaultBranch)
    ensureSubmodule(root, 'upstream/sub', remote, 'feature')
    const gitmodules = readFileSync(path.join(root, '.gitmodules'), 'utf8')
    expect(gitmodules).toContain('branch = feature')
  })
})
