import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  ignores: [
    'upstream/**',
    'skills/**',
    'authored/**',
  ],
}, {
  rules: {
    'node/prefer-global/process': 'off',
    'style/max-statements-per-line': 'off',
  },
})
