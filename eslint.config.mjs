import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      'legacy/',
      'fixtures/',
      'playwright-report/',
      'test-results/',
      'e2e/__results__/',
      '.worktrees/',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    // Engine fence: pure TS, no React, no DOM, no app layers.
    files: ['src/engine/**/*.{ts,tsx}'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'src/engine is pure TS: no React.' },
            { name: 'react-dom', message: 'src/engine is pure TS: no React.' },
          ],
          patterns: [
            {
              group: ['react/*', 'react-dom/*'],
              message: 'src/engine is pure TS: no React.',
            },
            {
              group: [
                '**/state',
                '**/state/**',
                '**/ui',
                '**/ui/**',
                '**/features',
                '**/features/**',
              ],
              message: 'src/engine must not import from src/state, src/ui or src/features.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/engine has no DOM.' },
        { name: 'document', message: 'src/engine has no DOM.' },
      ],
    },
  },
);
