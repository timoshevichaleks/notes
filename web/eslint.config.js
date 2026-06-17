// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const prettierRecommended = require('eslint-plugin-prettier/recommended');

const MESSAGES = {
  NO_SET_TIMEOUT: 'Use RxJS timer() or delay() instead of setTimeout for better composability and testability',
  NO_CLEAR_TIMEOUT: 'Use RxJS operators and unsubscribe instead of clearTimeout',
  NO_SET_INTERVAL: 'Use RxJS interval() instead of setInterval for better composability and memory management',
  NO_CLEAR_INTERVAL: 'Use RxJS operators and unsubscribe instead of clearInterval',
};

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.angular/**', 'coverage/**'],
  },

  // TypeScript files
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
      prettierRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: 'app', style: 'camelCase' }],
      '@angular-eslint/component-selector': ['error', { type: 'element', prefix: 'app', style: 'kebab-case' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'setTimeout', message: MESSAGES.NO_SET_TIMEOUT },
        { name: 'clearTimeout', message: MESSAGES.NO_CLEAR_TIMEOUT },
        { name: 'setInterval', message: MESSAGES.NO_SET_INTERVAL },
        { name: 'clearInterval', message: MESSAGES.NO_CLEAR_INTERVAL },
      ],
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },

  // Angular HTML templates
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },

  // Test files: relax strictness (mirrors ReefReview conventions)
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
