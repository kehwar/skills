import antfu from '@antfu/eslint-config'
import sonarjs from 'eslint-plugin-sonarjs'

const ignores = [
  'upstream/**',
  'skills/**',
  '.beads/**',
  'authored/**/*.yaml',
  'scripts/**',
]

export default antfu(
  {
    typescript: {
      tsconfigPath: './tsconfig.json',
    },
    markdown: false,
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
)
