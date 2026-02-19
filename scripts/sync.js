#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, rmSync } from 'fs';
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

console.log('Syncing skills from home directory to repository...\n');
console.log(`Source: ${homeLockFile}`);
console.log(`Target: ${repoLockFile}`);

try {
    // Check if home lockfile exists
    if (!existsSync(homeLockFile)) {
        console.error('\n❌ Error: Home lockfile not found at:', homeLockFile);
        console.error('Run "npx skills add" first to create the lockfile.');
        process.exit(1);
    }

    // Read the lockfile
    const lockfileContent = readFileSync(homeLockFile, 'utf8');
    const lockfile = JSON.parse(lockfileContent);

    console.log(`\n📊 Lockfile version: ${lockfile.version}`);
    console.log(`📦 Skills found: ${Object.keys(lockfile.skills || {}).length}`);

    // Ensure .agents directory exists in repo
    const repoAgentsDir = dirname(repoLockFile);
    if (!existsSync(repoAgentsDir)) {
        mkdirSync(repoAgentsDir, { recursive: true });
    }

    // Write to repo
    writeFileSync(repoLockFile, JSON.stringify(lockfile, null, 2) + '\n');

    console.log('\n✓ Lockfile synced to repository!');
    console.log(`  ${repoLockFile}`);

    // Sync skill folders
    const skillNames = Object.keys(lockfile.skills || {});
    if (skillNames.length > 0) {
        console.log('\n📂 Syncing skill folders...');

        // Ensure skills directory exists in repo
        if (!existsSync(repoSkillsDir)) {
            mkdirSync(repoSkillsDir, { recursive: true });
        }

        let syncedCount = 0;
        let skippedCount = 0;

        for (const skillName of skillNames) {
            const homeSkillPath = join(homeSkillsDir, skillName);
            const repoSkillPath = join(repoSkillsDir, skillName);

            if (!existsSync(homeSkillPath)) {
                console.log(`  ⚠️  Skipped ${skillName} (not found in home)`);
                skippedCount++;
                continue;
            }

            // Remove existing skill folder in repo if it exists
            if (existsSync(repoSkillPath)) {
                rmSync(repoSkillPath, { recursive: true, force: true });
            }

            // Copy skill folder from home to repo
            cpSync(homeSkillPath, repoSkillPath, { recursive: true });
            console.log(`  ✓ Synced ${skillName}`);
            syncedCount++;
        }

        console.log(`\n✅ Successfully synced ${syncedCount} skill(s) to repository!`);
        if (skippedCount > 0) {
            console.log(`   ${skippedCount} skill(s) skipped (not found in home)`);
        }
    }

} catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
}
