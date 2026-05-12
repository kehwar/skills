/**
 * CLI: Command dispatcher using citty for skills tooling
 */

import { defineCommand, runMain } from 'citty'
import { upstreamCmd } from './upstream/index.js'

/**
 * Main command definition
 */
export const main = defineCommand({
  meta: {
    name: 'skills',
    description: 'Skills management tooling',
  },
  subCommands: {
    upstream: upstreamCmd,
  },
})

// Run if called directly
void runMain(main)
