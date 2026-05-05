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
    const initRes = exec('git init', { cwd: remote })
    if (!initRes.ok)
      throw new Error(initRes.error)
    const emailRes = exec('git config user.email "t@t.com"', { cwd: remote })
    if (!emailRes.ok)
      throw new Error(emailRes.error)
    const nameRes = exec('git config user.name "T"', { cwd: remote })
    if (!nameRes.ok)
      throw new Error(nameRes.error)
    writeFileSync(join(remote, 'file.txt'), 'default content')
    const addRes = exec('git add .', { cwd: remote })
    if (!addRes.ok)
      throw new Error(addRes.error)
    const commitRes = exec('git commit -m "init"', { cwd: remote })
    if (!commitRes.ok)
      throw new Error(commitRes.error)
    const branchRes = exec('git branch --show-current', { cwd: remote })
    if (!branchRes.ok)
      throw new Error(branchRes.error)
    defaultBranch = branchRes.data
    const checkoutRes = exec('git checkout -b feature', { cwd: remote })
    if (!checkoutRes.ok)
      throw new Error(checkoutRes.error)
    writeFileSync(join(remote, 'file.txt'), 'feature content')
    const addRes2 = exec('git add .', { cwd: remote })
    if (!addRes2.ok)
      throw new Error(addRes2.error)
    const commitRes2 = exec('git commit -m "feature"', { cwd: remote })
    if (!commitRes2.ok)
      throw new Error(commitRes2.error)
    const checkoutRes2 = exec(`git checkout ${defaultBranch}`, { cwd: remote })
    if (!checkoutRes2.ok)
      throw new Error(checkoutRes2.error)

    // Create a root git repo that will hold the submodule
    root = join(tmp, 'root')
    mkdirSync(root)
    const rootInitRes = exec('git init', { cwd: root })
    if (!rootInitRes.ok)
      throw new Error(rootInitRes.error)
    const rootEmailRes = exec('git config user.email "t@t.com"', { cwd: root })
    if (!rootEmailRes.ok)
      throw new Error(rootEmailRes.error)
    const rootNameRes = exec('git config user.name "T"', { cwd: root })
    if (!rootNameRes.ok)
      throw new Error(rootNameRes.error)
    writeFileSync(join(root, 'README.md'), '# Root')
    const rootAddRes = exec('git add .', { cwd: root })
    if (!rootAddRes.ok)
      throw new Error(rootAddRes.error)
    const rootCommitRes = exec('git commit -m "init"', { cwd: root })
    if (!rootCommitRes.ok)
      throw new Error(rootCommitRes.error)
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
    const result = exec('git branch --show-current', { cwd: join(root, 'upstream/sub') })
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toBe('feature')
  })

  it('switches to a new branch on an existing submodule', () => {
    ensureSubmodule(root, 'upstream/sub', remote, defaultBranch)
    ensureSubmodule(root, 'upstream/sub', remote, 'feature')
    const result = exec('git branch --show-current', { cwd: join(root, 'upstream/sub') })
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toBe('feature')
  })

  it('updates .gitmodules branch entry when switching branches', () => {
    ensureSubmodule(root, 'upstream/sub', remote, defaultBranch)
    ensureSubmodule(root, 'upstream/sub', remote, 'feature')
    const gitmodules = readFileSync(join(root, '.gitmodules'), 'utf-8')
    expect(gitmodules).toContain('branch = feature')
  })
})
