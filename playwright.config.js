// @ts-check
// e2e: loads this folder as an unpacked extension in Playwright's Chromium and
// runs against live youtube.com. See test/e2e/fixtures.js.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'test/e2e',
  // Live YouTube is slow and sometimes plays ads; keep budgets generous and
  // wait on conditions, never on fixed sleeps.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // One browser at a time: each test launches its own persistent profile, and
  // parallel sessions against YouTube make results noisier.
  workers: 1,
  fullyParallel: false,
  // No retries: a flaky test should show up as a failure, not be hidden.
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
});
