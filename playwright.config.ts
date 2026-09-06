import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  // the quick-start tour has already been seen in every test except tour.spec.ts
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1300, height: 900 }, storageState: 'e2e/state.json' },
  webServer: [
    { command: 'npm run dev -- --port 5173', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
    // the API: local D1 with the schema applied, local R2, magic links echoed for tests (see .dev.vars.example)
    { command: 'npm run db:local && npm run dev:api', url: 'http://localhost:8788/api/health', reuseExistingServer: true, timeout: 120_000 },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
