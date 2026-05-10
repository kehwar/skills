import antfu from '@antfu/eslint-config'
import sonarjs from 'eslint-plugin-sonarjs'
import unicorn from 'eslint-plugin-unicorn'

const ignores = [
  'upstream/**',
  'skills/**',
  '.beads/**',
  'authored/**',
  'scripts/**',
]

export default antfu(
  {
    typescript: {
      tsconfigPath: './tsconfig.json',
    },
    markdown: false,
    formatters: {
      markdown: 'dprint',
    },
    ignores,
  },
  {
    name: 'sonarjs',
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.vue'],
    ignores,
    plugins: {
      sonarjs,
    },
    rules: {
      ...sonarjs.configs.recommended.rules,
    },
  },
  {
    name: 'unicorn',
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.vue'],
    ignores,
    plugins: {
      unicorn,
    },
    rules: {
      ...unicorn.configs.recommended.rules,
    },
  },
)
