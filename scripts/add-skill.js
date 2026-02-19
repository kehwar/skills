#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const skillsJsonPath = join(projectRoot, '.agents', 'skills.json');

// Parse command line arguments
const args = process.argv.slice(2);
let repo = null;
let skill = null;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '-s' && i + 1 < args.length) {
        skill = args[i + 1];
        i++;
    } else if (!args[i].startsWith('-') && !repo) {
        repo = args[i];
    }
}

if (!repo) {
    console.error('Error: Repository argument is required');
    console.error('Usage: pnpm add-skill <repo> [-s <skill>]');
    console.error('Example: pnpm add-skill https://github.com/vercel-labs/skills -s find-skills');
    process.exit(1);
}

// Function to load or create skills.json
function loadSkillsJson() {
    let skillsData = { skills: [] };
    if (existsSync(skillsJsonPath)) {
        try {
            const content = readFileSync(skillsJsonPath, 'utf8');
            skillsData = JSON.parse(content);
        } catch (err) {
            console.warn('Could not parse existing skills.json, creating new one');
        }
    } else {
        // Ensure .agents directory exists
        const agentsDir = dirname(skillsJsonPath);
        if (!existsSync(agentsDir)) {
            mkdirSync(agentsDir, { recursive: true });
        }
    }

    if (!Array.isArray(skillsData.skills)) {
        skillsData.skills = [];
    }

    return skillsData;
}

// Function to save skills.json
function saveSkillsJson(skillsData) {
    writeFileSync(skillsJsonPath, JSON.stringify(skillsData, null, 2) + '\n');
}

// Function to add a skill entry to skills.json
function addSkillToJson(skillsData, repo, skillName) {
    const skillEntry = {
        repo,
        skill: skillName,
        added: new Date().toISOString()
    };

    // Check if this skill already exists
    const existingIndex = skillsData.skills.findIndex(s =>
        s.repo === repo && s.skill === skillName
    );

    if (existingIndex >= 0) {
        // Update existing entry
        skillsData.skills[existingIndex] = {
            ...skillsData.skills[existingIndex],
            ...skillEntry,
            updated: new Date().toISOString()
        };
        console.log(`Updated skill entry: ${skillName}`);
    } else {
        // Add new entry
        skillsData.skills.push(skillEntry);
        console.log(`Added skill entry: ${skillName}`);
    }
}

// Function to parse skill names from list output
function parseSkillsList(output) {
    const skills = [];
    const lines = output.split('\n');
    let inSkillsSection = false;

    for (const line of lines) {
        // Detect when we enter the "Available Skills" section
        if (line.includes('Available Skills')) {
            inSkillsSection = true;
            continue;
        }

        // Stop when we hit the end marker
        if (line.includes('Use --skill') || line.includes('└')) {
            break;
        }

        if (inSkillsSection) {
            // Match skill names that appear as indented text (without description)
            // Look for lines that start with spaces/│ followed by non-whitespace
            const trimmed = line.replace(/^[│\s]+/, '').trim();

            // Skip empty lines and lines that look like descriptions (longer text)
            if (trimmed && trimmed.length < 50 && !trimmed.includes(' ')) {
                // This looks like a skill name (short, no spaces)
                if (/^[a-z0-9-]+$/i.test(trimmed)) {
                    skills.push(trimmed);
                }
            }
        }
    }

    return skills;
}

try {
    const skillsData = loadSkillsJson();
    let skillsToAdd = [];

    if (skill) {
        // If a specific skill is provided, just add that one
        skillsToAdd = [skill];
    } else {
        // List skills first
        const listCommand = `npx skills add ${repo} -l`;
        console.log(`Listing skills from repository...`);
        console.log(`Running: ${listCommand}\n`);

        try {
            const output = execSync(listCommand, {
                cwd: projectRoot,
                encoding: 'utf8'
            });

            console.log(output);

            // Parse the output to extract skill names
            skillsToAdd = parseSkillsList(output);

            if (skillsToAdd.length === 0) {
                console.log('\nNo skills found in the repository.');
                process.exit(0);
            }

            console.log(`\nFound ${skillsToAdd.length} skill(s): ${skillsToAdd.join(', ')}`);
            console.log('Installing each skill individually...\n');
        } catch (err) {
            console.error('Error listing skills:', err.message);
            process.exit(1);
        }
    }

    // Install each skill individually
    for (const skillName of skillsToAdd) {
        const command = `npx skills add ${repo} -s ${skillName} -a github-copilot -y`;
        console.log(`\n[${skillName}] Running: ${command}`);

        try {
            execSync(command, { stdio: 'inherit', cwd: projectRoot });
            addSkillToJson(skillsData, repo, skillName);
        } catch (err) {
            console.error(`\nError installing skill "${skillName}":`, err.message);
            // Continue with other skills
        }
    }

    // Save all changes to skills.json
    saveSkillsJson(skillsData);
    console.log(`\n✓ Saved to ${skillsJsonPath}`);

} catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
}
