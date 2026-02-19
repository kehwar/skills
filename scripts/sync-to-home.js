#!/usr/bin/env node

import { readFileSync, existsSync, mkdirSync, cpSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const homeAgentsDir = join(homedir(), '.agents');
const homeLockFile = join(homeAgentsDir, '.skill-lock.json');
const repoLockFile = join(projectRoot, '.agents', '.skill-lock.json');
const homeSkillsDir = join(homeAgentsDir, 'skills');
const repoSkillsDir = join(projectRoot, '.agents', 'skills');

console.log('Syncing skills from repository to home directory...\n');
console.log(`Source: ${repoLockFile}`);
console.log(`Target: ${homeLockFile}`);

try {
    // Check if repo lockfile exists
    if (!existsSync(repoLockFile)) {
        console.error('\n❌ Error: Repository lockfile not found at:', repoLockFile);
        console.error('Run "pnpm sync-from-home" first to sync from home directory.');
        process.exit(1);
    }

    // Read the lockfile
    const lockfileContent = readFileSync(repoLockFile, 'utf8');
    const lockfile = JSON.parse(lockfileContent);

    console.log(`\n📊 Lockfile version: ${lockfile.version}`);
    console.log(`📦 Skills found: ${Object.keys(lockfile.skills || {}).length}`);

    // Check if home lockfile exists and warn
    if (existsSync(homeLockFile)) {
        const homeContent = readFileSync(homeLockFile, 'utf8');
        const homeLockfile = JSON.parse(homeContent);
        const homeSkillCount = Object.keys(homeLockfile.skills || {}).length;

        console.log(`\n⚠️  Warning: Existing lockfile found with ${homeSkillCount} skill(s)`);
        console.log('   This will overwrite your current lockfile.');
    }

    // Ensure .agents directory exists in home
    if (!existsSync(homeAgentsDir)) {
        mkdirSync(homeAgentsDir, { recursive: true });
    }

    // Copy lockfile from repo to home
    cpSync(repoLockFile, homeLockFile);

    console.log('\n✓ Lockfile synced to home directory!');
    console.log(`  ${homeLockFile}`);

    // Sync skill folders
    const skillNames = Object.keys(lockfile.skills || {});
    if (skillNames.length > 0) {
        console.log('\n📂 Syncing skill folders...');

        // Ensure skills directory exists in home
        if (!existsSync(homeSkillsDir)) {
            mkdirSync(homeSkillsDir, { recursive: true });
        }

        let syncedCount = 0;
        let skippedCount = 0;

        for (const skillName of skillNames) {
            const repoSkillPath = join(repoSkillsDir, skillName);
            const homeSkillPath = join(homeSkillsDir, skillName);

            if (!existsSync(repoSkillPath)) {
                console.log(`  ⚠️  Skipped ${skillName} (not found in repo)`);
                skippedCount++;
                continue;
            }

            // Remove existing skill folder in home if it exists
            if (existsSync(homeSkillPath)) {
                rmSync(homeSkillPath, { recursive: true, force: true });
            }

            // Copy skill folder from repo to home
            cpSync(repoSkillPath, homeSkillPath, { recursive: true });
            console.log(`  ✓ Synced ${skillName}`);
            syncedCount++;
        }

        console.log(`\n✅ Successfully synced ${syncedCount} skill(s) to home directory!`);
        if (skippedCount > 0) {
            console.log(`   ${skippedCount} skill(s) skipped (not found in repo)`);
        }
        console.log('\n💡 Tip: Skills are now available globally. Run "npx skills check" to verify.');
    }

} catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
}
