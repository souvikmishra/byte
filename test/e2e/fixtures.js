// Playwright fixtures: a fresh Chromium profile per test with this folder
// loaded as an unpacked extension (the same as "Load unpacked").
//
//   context      persistent context with the extension; consent cookie preset
//   extensionId  id of the loaded extension
//   extension    helpers: getStorage/setStorage, openPopup(targetPage)
//   page         first tab; collects errors thrown by the extension's content
//                scripts and fails the test if there are any
//
// HEADED=1 npm run e2e  shows the browser.
// E2E_BROWSER_PATH="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" npm run e2e  runs in Brave.

const { test: base, expect, chromium } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXT_DIR = path.resolve(__dirname, '..', '..');

// Skip the EU cookie-consent interstitial. "SOCS=CAI" is the cookie YouTube
// sets after "Reject all". handleConsent() in youtube.js still clicks through
// the page if it appears anyway.
const CONSENT_COOKIES = ['.youtube.com', '.google.com'].map(domain => ({
  name: 'SOCS', value: 'CAI', domain, path: '/', secure: true, sameSite: 'Lax',
}));

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use, testInfo) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byte-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      // The "chromium" channel uses new headless, which supports extensions.
      // Branded Chrome ignores --load-extension, so don't use channel "chrome".
      // E2E_BROWSER_PATH runs against an installed Chromium-based browser
      // instead, e.g. Brave (which still honors --load-extension).
      ...(process.env.E2E_BROWSER_PATH
        ? { executablePath: process.env.E2E_BROWSER_PATH }
        : { channel: 'chromium' }),
      headless: !process.env.HEADED,
      args: [
        `--disable-extensions-except=${EXT_DIR}`,
        `--load-extension=${EXT_DIR}`,
        '--autoplay-policy=no-user-gesture-required',
        '--mute-audio',
      ],
      viewport: { width: 1400, height: 900 },
      locale: 'en-US',
    });
    await context.addCookies(CONSENT_COOKIES);
    await context.tracing.start({ screenshots: true, snapshots: true });

    await use(context);

    const failed = testInfo.status !== testInfo.expectedStatus;
    if (failed) {
      const tracePath = testInfo.outputPath('trace.zip');
      await context.tracing.stop({ path: tracePath });
      testInfo.attachments.push({ name: 'trace', path: tracePath, contentType: 'application/zip' });
    } else {
      await context.tracing.stop();
    }
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },

  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    await use(new URL(sw.url()).host);
  },

  extension: async ({ context, extensionId }, use) => {
    const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;

    // Runs fn(arg) in an extension page, where chrome.storage is available.
    async function inExtensionPage(fn, arg) {
      const p = await context.newPage();
      try {
        await p.goto(popupUrl);
        return await p.evaluate(fn, arg);
      } finally {
        await p.close();
      }
    }

    const helpers = {
      popupUrl,
      // getStorage/setStorage open and close a tab, which changes the active
      // tab. Use them before navigating, not during a popup flow; there, use
      // storageIn(popup).
      getStorage: () => inExtensionPage(() => chrome.storage.local.get(null)),
      setStorage: obj => inExtensionPage(o => chrome.storage.local.set(o), obj),
      storageIn: extPage => extPage.evaluate(() => chrome.storage.local.get(null)),

      // Wait until background.js has written its install defaults, so a later
      // setStorage() can't be overwritten by onInstalled.
      async waitForInstallDefaults() {
        await expect.poll(async () => (await helpers.getStorage()).byte_enabled,
          { message: 'install defaults written by background.js' }).not.toBeUndefined();
      },

      // Opens the popup as a tab, then brings targetPage back to the front.
      // popup.js messages the *active* tab, so targetPage must be active while
      // the test clicks inside the popup.
      async openPopup(targetPage) {
        const popup = await context.newPage();
        await popup.goto(popupUrl);
        // popup.js fills in the all-time count once storage has loaded.
        await expect(popup.locator('#total-count')).not.toHaveText('—');
        await targetPage.bringToFront();
        return popup;
      },
    };
    await helpers.waitForInstallDefaults();
    await use(helpers);
  },

  page: async ({ context, extensionId }, use, testInfo) => {
    const page = context.pages()[0] || await context.newPage();

    // Content scripts run in an isolated world, so page.on('pageerror') can't
    // see their errors. The CDP Runtime domain reports exceptions and
    // console.error calls from every world in the tab.
    const extensionErrors = [];
    const fromExtension = trace =>
      (trace?.callFrames || []).some(f => f.url.startsWith(`chrome-extension://${extensionId}/`));
    const cdp = await context.newCDPSession(page);
    cdp.on('Runtime.exceptionThrown', ({ exceptionDetails: d }) => {
      if (fromExtension(d.stackTrace) || (d.url || '').startsWith(`chrome-extension://${extensionId}/`)) {
        extensionErrors.push(d.exception?.description || d.text);
      }
    });
    cdp.on('Runtime.consoleAPICalled', ({ type, args, stackTrace }) => {
      if ((type === 'error' || type === 'assert') && fromExtension(stackTrace)) {
        extensionErrors.push(args.map(a => a.value ?? a.description).join(' '));
      }
    });
    await cdp.send('Runtime.enable');

    await use(page);

    if (testInfo.status !== testInfo.expectedStatus) {
      try {
        await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' });
      } catch { /* page may already be gone */ }
    }
    expect(extensionErrors, 'errors thrown by the extension in the YouTube tab').toEqual([]);
  },
});

module.exports = { test, expect, EXT_DIR };
