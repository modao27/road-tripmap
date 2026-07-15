import { defineConfig, configDefaults } from 'vitest/config';

// Les specs Playwright (e2e/) ont leur propre runner — Vitest ne doit
// pas les ramasser.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
