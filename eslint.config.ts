import antfu from '@antfu/eslint-config'
import sonarjs from 'eslint-plugin-sonarjs'

const ignores = [
  'upstream/**',
  'synced/**',
  '.beads/**',
  'authored/sap/**/assets/**/*.yaml',
  'authored/frappe/**/assets/**/*.json',
]

export default antfu(
  {
    typescript: {
      tsconfigPath: './tsconfig.json',
    },
    unicorn: {
      allRecommended: true,
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
