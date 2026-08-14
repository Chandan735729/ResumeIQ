/**
 * ESLint Configuration
 * 
 * Code quality rules for TypeScript
 * - Enforce type safety
 * - Prevent common mistakes
 * - Keep code consistent
 */

module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    es2020: true,
  },
  rules: {
    '@typescript-eslint/explicit-module-boundary-types': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};
