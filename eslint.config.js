import antfu from '@antfu/eslint-config'

export default antfu({
  stylistic: false,
  formatters: false,
  ignores: ['src/data/**', 'src/pages/vocabulary/vocabulary.js', 'src/pages/vocabulary/wordSentences.ts', 'src/pages/vocabulary/synonym*.ts', 'src/pages/vocabulary/wordPhonetics.ts', 'auto-imports.d.ts', 'components.d.ts', 'dist/**', 'android/**'],
}, {
  rules: {
    'no-alert': 'warn',
    'vue/html-indent': 'off',
    'pnpm/yaml-enforce-settings': 'off',
  },
})
