import { defineCommand, runMain } from 'citty'
import { cloneSkillsCmd } from './clone-skills/index.js'
import { upstreamCmd } from './upstream/index.js'

export const main = defineCommand({
  meta: {
    name: 'skills',
    description: 'Skills management tooling',
  },
  subCommands: {
    'upstream': upstreamCmd,
    'clone-skills': cloneSkillsCmd,
  },
})

void runMain(main)
