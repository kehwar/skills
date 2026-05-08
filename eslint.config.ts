import antfu from '@antfu/eslint-config'
import sonarjs from 'eslint-plugin-sonarjs'

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
    name: 'sonarjs',
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.vue'],
    ignores: ['upstream/**', 'skills/**', '.beads/**'],
    plugins: {
      sonarjs,
    },
    rules: {
      ...sonarjs.configs.recommended.rules,
    },
  },
  // {
  //   "name": "unicorn",
  //   files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.vue'],
  //   ignores: ['upstream/**', 'skills/**', '.beads/**'],
  //   plugins: {
  //     unicorn,
  //   },
  //   rules: {
  //     ...unicorn.configs['flat/recommended'].rules,
  //   },
  // },
)
