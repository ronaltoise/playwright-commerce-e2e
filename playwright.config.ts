import { defineConfig, devices, type Project } from '@playwright/test';

const CI = !!process.env.CI;
const STABLE_URL = process.env.E2E_STABLE_URL ?? 'http://localhost:4173';
const BUGGY_URL = process.env.E2E_BUGGY_URL ?? 'http://localhost:4174';

// The nightly gives each build its own folder, so one run can't overwrite the other's results.
const reportDir = process.env.E2E_REPORT_DIR ?? 'report/latest';

const SPECS = /specs\/.*\.spec\.ts/;
const SETUP = /fixtures\/auth\.setup\.ts/;

/** The same specs run against each build: a login job first, then the tests that depend on it. */
function buildProjects(name: string, baseURL: string): Project[] {
  return [
    { name: `${name}-setup`, testMatch: SETUP, use: { baseURL } },
    {
      name,
      testMatch: SPECS,
      dependencies: [`${name}-setup`],
      use: { ...devices['Desktop Chrome'], baseURL },
    },
  ];
}

export default defineConfig({
  testDir: './e2e',
  outputDir: `${reportDir}/artifacts`,
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : 4,
  timeout: 30_000,
  globalTimeout: 20 * 60_000,
  expect: { timeout: 5_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: `${reportDir}/playwright-report`, open: 'never' }],
    ['json', { outputFile: `${reportDir}/results.json` }],
  ],
  use: {
    // A click on a missing element fails in seconds rather than eating the whole test timeout.
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    ...buildProjects('stable', STABLE_URL),
    ...buildProjects('buggy', BUGGY_URL),
    {
      // The critical journeys again on a phone-sized screen.
      name: 'stable-mobile',
      testMatch: SPECS,
      grep: /@smoke/,
      dependencies: ['stable-setup'],
      use: { ...devices['Pixel 7'], baseURL: STABLE_URL },
    },
  ],
  webServer: [
    {
      command: 'node app/server.mjs',
      env: { PORT: '4173', TEST_HOOKS: '1' },
      url: `${STABLE_URL}/api/health`,
      reuseExistingServer: !CI,
    },
    {
      command: 'node app/server.mjs',
      env: { PORT: '4174', TEST_HOOKS: '1', SEEDED_BUGS: 'all' },
      url: `${BUGGY_URL}/api/health`,
      reuseExistingServer: !CI,
    },
  ],
});
