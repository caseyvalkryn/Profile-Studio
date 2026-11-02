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
  {
    // Board fence (lane 9.2.6): src/board renders SVG strings for Build, the Library and the
    // Report. Pure TS like the engine; it may import types from src/state/ui, nothing else.
    files: ['src/board/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'src/board is pure TS: no React.' },
            { name: 'react-dom', message: 'src/board is pure TS: no React.' },
          ],
          patterns: [
            {
              group: ['**/state', '**/state/**'],
              allowTypeImports: true,
              message: 'src/board may import only types from src/state.',
            },
            {
              // src/ui by relative path from src/board and src/board/layers; '**/ui' would
              // also match src/state/ui.
              group: [
                '../ui',
                '../ui/**',
                '../../ui',
                '../../ui/**',
                '**/features',
                '**/features/**',
              ],
              message: 'src/board must not import from src/ui or src/features.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/board has no DOM.' },
        { name: 'document', message: 'src/board has no DOM.' },
      ],
    },
  },
);
