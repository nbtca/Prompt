import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const forTypeScript = (configs) => configs.map((config) => ({ ...config, files: ['src/**/*.ts'] }));

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'assets/**', 'src/logo/**'],
  },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  {
    ...eslint.configs.recommended,
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
  ...forTypeScript(tseslint.configs.strictTypeChecked),
  ...forTypeScript(tseslint.configs.stylisticTypeChecked),
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.typecheck.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'off',
      'no-control-regex': 'off',
      'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  prettier,
];
