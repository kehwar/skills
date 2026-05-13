#!/usr/bin/env node

import process from 'node:process'
import { defineCommand, runMain } from 'citty'
import { Effect } from 'effect'
import { isCalledDirectly } from '../shared/index.js'
import { build } from './build.js'

export const buildCmd = defineCommand({
  meta: {
    name: 'build',
    description: 'Generate .claude-plugin/marketplace.json from authored/ skills',
  },
  async run() {
    const result = await Effect.runPromise(
      build({ root: process.cwd() }),
    )

    if (typeof result.message === 'string') {
      console.log(result.message)
    }

    process.exit(result.exitCode)
  },
})

if (isCalledDirectly(import.meta.url)) {
  void runMain(buildCmd)
}
