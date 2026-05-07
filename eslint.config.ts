import antfu from '@antfu/eslint-config'
import sonarjs from 'eslint-plugin-sonarjs'
import unicorn from 'eslint-plugin-unicorn'

export default antfu(
  {
    typescript: true,
    markdown: false,
    formatters: {
      markdown: 'dprint',
    },
    ignores: [
      'upstream/**',
      'skills/**',
      '.beads/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.vue'],
    ignores: ['upstream/**', 'skills/**', '.beads/**'],
    plugins: {
      sonarjs,
    },
    rules: {
      ...sonarjs.configs.recommended.rules,
      ...unicorn.configs.recommended.rules,
    },
  },
)
