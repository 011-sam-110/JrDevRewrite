import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Playwright boots both services itself if they aren't already running.
  // NOTE (battle e2e): the env overrides below only apply to servers Playwright
  // spawns — a dev server you started yourself (with .env's JUDGE0_URL) will be
  // reused as-is, so stop it before running the battle spec.
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        // Hermetic battles: judge submissions on the local process runner
        // (no Judge0 containers competing for CPU — the close.spec lesson),
        // and pin the match-time problem draw to the seeded e2e problem.
        // JUDGE_FORCE_LOCAL (not an emptied JUDGE0_URL) because Next's env
        // loader refills empty-string vars from .env.
        JUDGE_FORCE_LOCAL: '1',
        E2E_FORCE_PROBLEM_SLUG: 'e2e-sum-two-integers',
      },
    },
    {
      command: 'npm run dev:ws',
      url: 'http://localhost:3001/healthz',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
