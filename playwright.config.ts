import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  // the quick-start tour has already been seen in every test except tour.spec.ts
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1300, height: 900 }, storageState: 'e2e/state.json' },
  webServer: { command: 'npm run dev -- --port 5173', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
