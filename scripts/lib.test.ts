import type { Meta, SkillMeta, UpstreamMeta } from './types.ts'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copySkillsFromUpstream, ensureSubmodule, exec, findSkillDirs, getGitSha, saveMeta, submoduleExists } from './lib.ts'

// ── exec ─────────────────────────────────────────────────────────────────────

describe('exec', () => {
  it('returns trimmed stdout', () => {
    expect(exec('echo hello')).toBe('hello')
  })

  it('returns null on failure when safe: true', () => {
    expect(exec('false', { safe: true })).toBeNull()
  })

  it('throws on failure by default', () => {
    expect(() => exec('false')).toThrow()
  })

  it('returns undefined (void) for inherit variant', () => {
    const result = exec('echo hi', { inherit: true })
    expect(result).toBeUndefined()
  })

  it('respects cwd option', () => {
    const result = exec('pwd', { cwd: '/tmp' })
    expect(result).toContain('tmp')
  })
})

// ── submoduleExists ───────────────────────────────────────────────────────────

describe('submoduleExists', () => {
  let tmp: string
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'skills-test-')) })
  afterEach(() => { rmSync(tmp, { recursive: true }) })

  it('returns false when .gitmodules does not exist', () => {
    expect(submoduleExists(tmp, 'upstream/foo')).toBe(false)
  })

  it('returns false when .gitmodules does not contain the path', () => {
    writeFileSync(join(tmp, '.gitmodules'), '[submodule "upstream/bar"]\n\tpath = upstream/bar\n')
    expect(submoduleExists(tmp, 'upstream/foo')).toBe(false)
  })

  it('returns true when .gitmodules contains the path', () => {
    writeFileSync(join(tmp, '.gitmodules'), '[submodule "upstream/foo"]\n\tpath = upstream/foo\n')
    expect(submoduleExists(tmp, 'upstream/foo')).toBe(true)
  })
})

// ── findSkillDirs ─────────────────────────────────────────────────────────────

describe('findSkillDirs', () => {
  let tmp: string
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'skills-test-')) })
  afterEach(() => { rmSync(tmp, { recursive: true }) })

  it('returns empty array when no SKILL.md exists', () => {
    expect(findSkillDirs(tmp)).toEqual([])
  })

  it('finds SKILL.md in a subdirectory', () => {
    mkdirSync(join(tmp, 'my-skill'))
    writeFileSync(join(tmp, 'my-skill', 'SKILL.md'), '')
    expect(findSkillDirs(tmp)).toEqual(['my-skill'])
  })

  it('returns "." when root itself contains SKILL.md', () => {
    writeFileSync(join(tmp, 'SKILL.md'), '')
    expect(findSkillDirs(tmp)).toEqual(['.'])
  })

  it('skips node_modules', () => {
    mkdirSync(join(tmp, 'node_modules', 'some-skill'), { recursive: true })
    writeFileSync(join(tmp, 'node_modules', 'some-skill', 'SKILL.md'), '')
    expect(findSkillDirs(tmp)).toEqual([])
  })

  it('does not recurse into a matched directory', () => {
    mkdirSync(join(tmp, 'parent', 'nested'), { recursive: true })
    writeFileSync(join(tmp, 'parent', 'SKILL.md'), '')
    writeFileSync(join(tmp, 'parent', 'nested', 'SKILL.md'), '')
    expect(findSkillDirs(tmp)).toEqual(['parent'])
  })
})

// ── getGitSha ─────────────────────────────────────────────────────────────────

describe('getGitSha', () => {
  let tmp: string
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'skills-test-')) })
  afterEach(() => { rmSync(tmp, { recursive: true }) })

  it('returns null for a non-git directory', () => {
    expect(getGitSha(tmp)).toBeNull()
  })

  it('returns a sha string for a git repo', () => {
    exec('git init', { cwd: tmp })
    exec('git config user.email "test@test.com"', { cwd: tmp })
    exec('git config user.name "Test"', { cwd: tmp })
    writeFileSync(join(tmp, 'file.txt'), 'hello')
    exec('git add .', { cwd: tmp })
    exec('git commit -m "init"', { cwd: tmp })
    const sha = getGitSha(tmp)
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
  })
})

// ── saveMeta ──────────────────────────────────────────────────────────────────

describe('saveMeta', () => {
  let tmp: string
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'skills-test-')) })
  afterEach(() => { rmSync(tmp, { recursive: true }) })

  it('writes meta.json with upstream keys sorted alphabetically', () => {
    const meta: Meta = {
      upstreams: {
        zzz: { url: 'https://example.com/zzz' },
        aaa: { url: 'https://example.com/aaa' },
        mmm: { url: 'https://example.com/mmm' },
      },
    }
    saveMeta(meta, tmp)
    const written = JSON.parse(readFileSync(join(tmp, 'meta.json'), 'utf-8')) as Meta
    expect(Object.keys(written.upstreams)).toEqual(['aaa', 'mmm', 'zzz'])
  })

  it('writes a trailing newline', () => {
    const meta: Meta = { upstreams: { foo: { url: 'https://example.com/foo' } } }
    saveMeta(meta, tmp)
    const raw = readFileSync(join(tmp, 'meta.json'), 'utf-8')
    expect(raw.endsWith('\n')).toBe(true)
  })

  it('writes to meta.json in root', () => {
    const meta: Meta = { upstreams: { foo: { url: 'https://example.com/foo' } } }
    saveMeta(meta, tmp)
    expect(existsSync(join(tmp, 'meta.json'))).toBe(true)
  })
})

// ── copySkillsFromUpstream ────────────────────────────────────────────────────

describe('copySkillsFromUpstream', () => {
  let tmp: string
  let upstreamDir: string
  let root: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'skills-test-'))
    upstreamDir = join(tmp, 'upstream', 'my-upstream')
    root = join(tmp, 'root')
    mkdirSync(join(upstreamDir, 'my-skill'), { recursive: true })
    mkdirSync(join(root, 'skills'), { recursive: true })
    writeFileSync(join(upstreamDir, 'my-skill', 'SKILL.md'), '# My Skill')
  })

  afterEach(() => { rmSync(tmp, { recursive: true }) })

  it('copies skill files to skills/<outputName>', () => {
    const config: UpstreamMeta = {
      url: 'https://example.com/my-upstream',
      skills: { 'my-skill': 'my-skill' },
    }
    copySkillsFromUpstream('my-upstream', upstreamDir, config, root)
    expect(existsSync(join(root, 'skills', 'my-skill', 'SKILL.md'))).toBe(true)
  })

  it('writes meta.json with a real contentHash (not "pending")', () => {
    const config: UpstreamMeta = {
      url: 'https://example.com/my-upstream',
      skills: { 'my-skill': 'my-skill' },
    }
    copySkillsFromUpstream('my-upstream', upstreamDir, config, root)
    const meta = JSON.parse(readFileSync(join(root, 'skills', 'my-skill', 'meta.json'), 'utf-8')) as SkillMeta
    expect(meta.type).toBe('synced')
    if (meta.type === 'synced') {
      expect(meta.contentHash).not.toBe('pending')
      expect(meta.contentHash).toMatch(/^[0-9a-f]{12}$/)
    }
  })

  it('copies LICENSE to LICENSE.md', () => {
    writeFileSync(join(upstreamDir, 'LICENSE'), 'MIT License')
    const config: UpstreamMeta = {
      url: 'https://example.com/my-upstream',
      skills: { 'my-skill': 'my-skill' },
    }
    copySkillsFromUpstream('my-upstream', upstreamDir, config, root)
    expect(existsSync(join(root, 'skills', 'my-skill', 'LICENSE.md'))).toBe(true)
  })

  it('copies LICENSE.txt to LICENSE.md', () => {
    writeFileSync(join(upstreamDir, 'LICENSE.txt'), 'MIT License')
    const config: UpstreamMeta = {
      url: 'https://example.com/my-upstream',
      skills: { 'my-skill': 'my-skill' },
    }
    copySkillsFromUpstream('my-upstream', upstreamDir, config, root)
    expect(existsSync(join(root, 'skills', 'my-skill', 'LICENSE.md'))).toBe(true)
  })

  it('resets the output directory removing stale files', () => {
    const outputPath = join(root, 'skills', 'my-skill')
    mkdirSync(outputPath, { recursive: true })
    writeFileSync(join(outputPath, 'stale.txt'), 'stale')
    const config: UpstreamMeta = {
      url: 'https://example.com/my-upstream',
      skills: { 'my-skill': 'my-skill' },
    }
    copySkillsFromUpstream('my-upstream', upstreamDir, config, root)
    expect(existsSync(join(outputPath, 'stale.txt'))).toBe(false)
  })

  it('does not create output dir when source path is missing', () => {
    const config: UpstreamMeta = {
      url: 'https://example.com/my-upstream',
      skills: { 'nonexistent-skill': 'nonexistent-skill' },
    }
    copySkillsFromUpstream('my-upstream', upstreamDir, config, root)
    expect(existsSync(join(root, 'skills', 'nonexistent-skill'))).toBe(false)
  })

  it('writes correct synced meta.json fields', () => {
    const config: UpstreamMeta = {
      url: 'https://github.com/org/my-upstream',
      branch: 'main',
      skills: { 'my-skill': 'out-skill' },
    }
    copySkillsFromUpstream('my-upstream', upstreamDir, config, root)
    const meta = JSON.parse(readFileSync(join(root, 'skills', 'out-skill', 'meta.json'), 'utf-8')) as SkillMeta
    expect(meta.type).toBe('synced')
    if (meta.type === 'synced') {
      expect(meta.upstream).toBe('my-upstream')
      expect(meta.sourceUrl).toBe('https://github.com/org/my-upstream')
      expect(meta.branch).toBe('main')
      expect(meta.skillPath).toBe('my-skill')
    }
  })
})

// ── ensureSubmodule ───────────────────────────────────────────────────────────

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
