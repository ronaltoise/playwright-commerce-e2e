import js from '@eslint/js';
import playwright from 'eslint-plugin-playwright';
import tseslint from 'typescript-eslint';

const browser = {
  window: 'readonly',
  document: 'readonly',
  location: 'readonly',
  fetch: 'readonly',
  URLSearchParams: 'readonly',
  FormData: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
};
const node = {
  process: 'readonly',
  console: 'readonly',
  URL: 'readonly',
  Buffer: 'readonly',
  fetch: 'readonly',
  AbortSignal: 'readonly',
};

export default tseslint.config(
  { ignores: ['node_modules', 'playwright-report', 'test-results', 'report'] },
  js.configs.recommended,
  { files: ['app/public/**/*.js'], languageOptions: { sourceType: 'module', globals: browser } },
  { files: ['**/*.mjs'], languageOptions: { sourceType: 'module', globals: node } },
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommended],
  },
  {
    files: ['e2e/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      // A check inside a page object or helper counts as an assertion.
      'playwright/expect-expect': ['error', { assertFunctionPatterns: ['^expect[A-Z].*'] }],
      // Nothing is skipped or focused in a commit, and nothing waits on a fixed clock.
      'playwright/no-skipped-test': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/no-wait-for-timeout': 'error',
    },
  }
);
