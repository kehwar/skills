#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const skillsJsonPath = join(projectRoot, '.agents', 'skills.json');

if (!existsSync(skillsJsonPath)) {
    console.log('No skills.json found. Nothing to install.');
    process.exit(0);
}

let skillsData;
try {
    const content = readFileSync(skillsJsonPath, 'utf8');
    skillsData = JSON.parse(content);
} catch (err) {
    console.error('Error reading skills.json:', err.message);
    process.exit(1);
}

if (!Array.isArray(skillsData.skills) || skillsData.skills.length === 0) {
    console.log('No skills found in skills.json.');
    process.exit(0);
}

console.log(`Found ${skillsData.skills.length} skill(s) to install:\n`);

for (const skillEntry of skillsData.skills) {
    const { repo, skill } = skillEntry;

    let command = `npx skills add ${repo}`;
    if (skill) {
        command += ` -s ${skill}`;
    }
    command += ' -a github-copilot -y';

    const displayName = skill ? `${repo} (skill: ${skill})` : repo;
    console.log(`\nInstalling: ${displayName}`);
    console.log(`Command: ${command}\n`);

    try {
        execSync(command, { stdio: 'inherit', cwd: projectRoot });
    } catch (err) {
        console.error(`Failed to install ${displayName}:`, err.message);
    }
}

console.log('\n✓ Finished installing skills from registry');
