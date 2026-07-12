import tseslint from 'typescript-eslint';

// Flat config (ESLint 9). Mirrors the original minimal rule set from the old
// .eslintrc.json — intentionally without the shared "recommended" preset, to
// keep this a tooling swap rather than a change in lint semantics.
export default tseslint.config(
  {
    ignores: ['out/**', 'dist/**', '**/*.d.ts']
  },
  {
    files: ['src/**/*.ts'],
    plugins: {
      '@typescript-eslint': tseslint.plugin
    },
    languageOptions: {
      parser: tseslint.parser,
      sourceType: 'module'
    },
    rules: {
      '@typescript-eslint/naming-convention': 'warn',
      curly: 'warn',
      eqeqeq: 'warn',
      'no-throw-literal': 'warn'
    }
  },
  {
    // Test fixtures use i18n-style keys (dotted, capitalized) that intentionally
    // don't follow camelCase — don't enforce naming there.
    files: ['src/test/**/*.ts'],
    rules: {
      '@typescript-eslint/naming-convention': 'off'
    }
  }
);
