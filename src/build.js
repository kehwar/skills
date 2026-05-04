import { existsSync, readdirSync, rmSync, mkdirSync, readFileSync, renameSync, symlinkSync, readlinkSync } from 'fs'
import { join, resolve, relative, dirname, isAbsolute } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')
const PROVIDERS_DIR = join(ROOT, 'providers')
const OUTPUT_DIR = join(ROOT, 'skills')

// Step 0: Reverse any previous build — remove symlinks and move folders back to providers
function reverseSymlinks() {
    for (const providerDirent of readdirSync(PROVIDERS_DIR, { withFileTypes: true })) {
        if (!providerDirent.isDirectory()) continue

        const providerPath = join(PROVIDERS_DIR, providerDirent.name)
        const agentsSkillsPath = join(providerPath, '.agents', 'skills')
        const skillsRoot = existsSync(agentsSkillsPath) ? agentsSkillsPath : providerPath

        for (const skillDirent of readdirSync(skillsRoot, { withFileTypes: true })) {
            if (!skillDirent.isSymbolicLink()) continue

            const symlinkPath = join(skillsRoot, skillDirent.name)
            const linkTarget = readlinkSync(symlinkPath)
            const absoluteTarget = isAbsolute(linkTarget)
                ? linkTarget
                : resolve(skillsRoot, linkTarget)

            rmSync(symlinkPath)

            if (existsSync(absoluteTarget)) {
                renameSync(absoluteTarget, symlinkPath)
            }
        }
    }
}

reverseSymlinks()

// Step 1: Enumerate all (provider, skillName, sourcePath) triples
const entries = []

for (const providerDirent of readdirSync(PROVIDERS_DIR, { withFileTypes: true })) {
    if (!providerDirent.isDirectory()) continue

    const providerName = providerDirent.name
    const providerPath = join(PROVIDERS_DIR, providerName)

    // Read .ignore file — one skill name per line
    const ignorePath = join(providerPath, '.ignore')
    const ignored = new Set()
    if (existsSync(ignorePath)) {
        for (const line of readFileSync(ignorePath, 'utf-8').split('\n')) {
            const name = line.trim()
            if (name && !name.startsWith('#')) ignored.add(name)
        }
    }

    // Determine skills root:
    //   - providers that use the `skills` CLI store skills under .agents/skills/
    //   - kehwar (and any hand-authored provider) stores skills directly in the provider folder
    const agentsSkillsPath = join(providerPath, '.agents', 'skills')
    const skillsRoot = existsSync(agentsSkillsPath) ? agentsSkillsPath : providerPath

    for (const skillDirent of readdirSync(skillsRoot, { withFileTypes: true })) {
        if (!skillDirent.isDirectory()) continue
        if (ignored.has(skillDirent.name)) continue

        entries.push({
            provider: providerName,
            skillName: skillDirent.name,
            sourcePath: join(skillsRoot, skillDirent.name),
        })
    }
}

// Step 2: Detect name collisions across providers
const nameCount = new Map()
for (const { skillName } of entries) {
    nameCount.set(skillName, (nameCount.get(skillName) ?? 0) + 1)
}

// Step 3: Clear and recreate output directory
if (existsSync(OUTPUT_DIR)) {
    rmSync(OUTPUT_DIR, { recursive: true })
}
mkdirSync(OUTPUT_DIR, { recursive: true })

// Step 4: Move each skill to output dir and leave a relative symlink in its place
for (const { provider, skillName, sourcePath } of entries) {
    const outputName = nameCount.get(skillName) > 1 ? `${provider}-${skillName}` : skillName
    const outputPath = join(OUTPUT_DIR, outputName)

    renameSync(sourcePath, outputPath)
    symlinkSync(relative(dirname(sourcePath), outputPath), sourcePath)
}

console.log(`Built ${entries.length} skill(s) → skills/`)
