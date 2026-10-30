import tsParser from '@typescript-eslint/parser';

// A small correctness gate for all maintained JS/TS. TypeScript owns type/name
// checking; style/unused-code migration is deliberately outside this package.
export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/android/**', '**/ios/**', '**/.expo/**', 'local-data/**', 'private-data/**', 'docs/**'] },
  {
    files: ['apps/**/*.{ts,tsx,js,cjs,mjs}', 'packages/**/*.{ts,tsx,js,cjs,mjs}', 'supabase/functions/**/*.{ts,js}', 'tests/mobile/**/*.ts', 'scripts/*.{js,mjs}', 'pocs/vereinsflieger-api-anything/*.mjs', '*.js'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      'constructor-super': 'error',
      'for-direction': 'error',
      'getter-return': 'error',
      'no-async-promise-executor': 'error',
      'no-compare-neg-zero': 'error',
      'no-cond-assign': ['error', 'except-parens'],
      'no-constant-binary-expression': 'error',
      'no-dupe-args': 'error',
      'no-dupe-else-if': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-fallthrough': 'error',
      'no-loss-of-precision': 'error',
      'no-promise-executor-return': 'error',
      'no-self-assign': 'error',
      'no-setter-return': 'error',
      'no-unexpected-multiline': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },
];
