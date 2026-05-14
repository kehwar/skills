import { defineCommand, runMain } from 'citty'
import { buildCmd } from './build/index.js'
import { cloneSkillsCmd } from './clone-skills/index.js'
import { syncCmd } from './sync/index.js'
import { upstreamCmd } from './upstream/index.js'

export const main = defineCommand({
  meta: {
    name: 'skills',
    description: 'Skills management tooling',
  },
  subCommands: {
    'build': buildCmd,
    'sync': syncCmd,
    'upstream': upstreamCmd,
    'clone-skills': cloneSkillsCmd,
  },
})

void runMain(main)
