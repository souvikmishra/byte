// Storage callback ordering in the popup, with no YouTube involved: popup.html
// is loaded on its own with a stubbed `chrome` whose callbacks fire only when
// the test says so.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, expect } = require('@playwright/test');

const POPUP = pathToFileURL(path.resolve(__dirname, '..', '..', 'popup', 'popup.html')).href;

function installControlledChrome() {
  const pendingGets = [];
  const listeners = [];
  window.__storage = {
    // Answer the popup's first read with this (possibly stale) snapshot.
    resolveGet(snapshot) { pendingGets.shift()(snapshot); },
    // Deliver a storage.onChanged event.
    fireChanged(changes) { listeners.forEach(l => l(changes, 'local')); },
  };
  window.chrome = {
    runtime: { lastError: undefined },
    storage: {
      local: { get(keys, cb) { pendingGets.push(cb); }, set(values, cb) { if (cb) cb(); } },
      onChanged: { addListener(l) { listeners.push(l); } },
    },
  };
}

test('a stale first read never undoes a change made before it returned, even after its echo', async ({ page }) => {
  await page.addInitScript(installControlledChrome);
  await page.goto(POPUP);
  const promos = page.locator('#toggle-promos');
  await expect(promos).toBeChecked(); // defaults show before storage answers

  await promos.uncheck({ force: true }); // saved while the first read is still pending
  // The write's echo arrives first, then the read, whose snapshot predates the write.
  await page.evaluate(() => window.__storage.fireChanged({ byte_hide_promos: { oldValue: true, newValue: false } }));
  await page.evaluate(() => window.__storage.resolveGet({ byte_hide_promos: true, byte_count: 5 }));

  await expect(promos).not.toBeChecked();
  await expect(page.locator('#shorts-count')).toHaveText('5'); // the rest of the read still applies
});
