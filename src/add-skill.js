import { execSync } from 'child_process'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')

const args = process.argv.slice(2)
const pkg = args[0]

if (!pkg) {
    console.error('Usage: pnpm skill-add <org/repo> [--skill <name>]')
    process.exit(1)
}

const provider = pkg.split('/')[0]
const providerDir = join(ROOT, 'providers', provider)

mkdirSync(providerDir, { recursive: true })

const quotedArgs = args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ')
execSync(`pnpm exec skills add ${quotedArgs}`, {
    cwd: providerDir,
    stdio: 'inherit',
})
