import { defineCommand, runMain } from 'citty'
import { upstreamCmd } from './upstream/index.js'

export const main = defineCommand({
  meta: {
    name: 'skills',
    description: 'Skills management tooling',
  },
  subCommands: {
    upstream: upstreamCmd,
  },
})

void runMain(main)
