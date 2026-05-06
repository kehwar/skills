import antfu from '@antfu/eslint-config'
import sonarjs from 'eslint-plugin-sonarjs'
import unicorn from 'eslint-plugin-unicorn'

export default antfu(
  {
    typescript: true,
    ignores: [
      'upstream/**',
      'skills/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.vue'],
    ignores: ['upstream/**', 'skills/**'],
    plugins: {
      sonarjs,
    },
    rules: {
      ...sonarjs.configs.recommended.rules,
      ...unicorn.configs.recommended.rules,
    },
  } as any,
)
