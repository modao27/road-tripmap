/**
 * E2E Playwright — parcours publics (sans compte), navigateur réel.
 * L'app est servie telle quelle (zéro build) par `serve`.
 * Lancement : npm run test:e2e
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173',
    trace:   'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npx -y serve -l 4173 .',
    url:     'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
