import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      'lib/**',
      'coverage/**',
      'node_modules/**',
      'docs/**',
      '.cargo-home/**',
      'native-window/target/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['src/host/**/*.ts', 'src/shared/**/*.ts', 'tests/host/**/*.ts', 'tests/shared/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/client/**/*.{ts,tsx}', 'src/types/client/**/*.d.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/client/**/*.tsx', 'tests/client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    ...jsxA11y.flatConfigs.recommended,
    files: ['src/client/**/*.tsx'],
  },
  {
    files: ['tests/client/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.js', 'vitest.config.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  prettier,
)
