import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'src',
          include: ['src/**/*.test.ts'],
        },
      },
    ],
  },
})
