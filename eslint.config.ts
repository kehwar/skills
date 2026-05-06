import antfu from '@antfu/eslint-config'
import sonarjs from 'eslint-plugin-sonarjs'

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
    ...sonarjs.configs.recommended,
  } as any,
)
