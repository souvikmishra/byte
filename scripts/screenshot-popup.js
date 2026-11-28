'use strict';
// Screenshots of the popup in each state, for design/screenshots/popup/.
// The popup page is loaded on its own with a stubbed `chrome` (sample Home
// feed, no YouTube needed), so the numbers in the shots are sample data.
// Usage: npm run screenshots   (dev-only; needs `npx playwright install chromium`)
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const POPUP = pathToFileURL(path.join(ROOT, 'popup', 'popup.html')).href;
const OUT = path.join(ROOT, 'design', 'screenshots', 'popup');
const SAMPLE_COUNTS = [9, 8, 6, 5, 4, 4, 3, 2, 2, 1, 1, 1, 1, 1];

// A stand-in for the extension APIs popup.js uses, injected before it runs.
function installChromeStub({ data, url, page, counts }) {
  const mem = { ...data };
  const listeners = [];
  const port = () => ({ postMessage() {}, disconnect() {}, onMessage: { addListener() {} }, onDisconnect: { addListener() {} } });
  window.chrome = {
    runtime: { lastError: undefined },
    storage: {
      local: {
        get(keys, cb) { cb({ ...mem }); },
        set(values, cb) {
          const changes = {};
          for (const [k, v] of Object.entries(values)) { changes[k] = { oldValue: mem[k], newValue: v }; mem[k] = v; }
          setTimeout(() => listeners.forEach(l => l(changes, 'local')));
          if (cb) cb();
        },
      },
      onChanged: { addListener(l) { listeners.push(l); } },
    },
    tabs: {
      getCurrent(cb) { cb(undefined); },
      query(q, cb) { cb(url ? [{ id: 1, url }] : []); },
      connect: port,
      sendMessage(id, msg, cb) { setTimeout(() => cb({ sessionBlocked: 3, page, channelCounts: counts }), 10); },
      get(id, cb) { cb({ id, url }); },
      onActivated: { addListener() {} },
    },
  };
}

const hover = selector => async p => { await p.hover(selector); await p.waitForTimeout(1500); }; // mid-preview
const holdCompare = async p => { await p.hover('#compare'); await p.mouse.down(); await p.waitForTimeout(700); };

// [file name, options, action]. `scheme` is the OS colour scheme.
const SHOTS = [
  ['rest-light', {}],
  ['rest-dark', { scheme: 'dark' }],
  ['hover-shorts', {}, hover('.row[data-feature=shorts]')],
  ['hover-grid', {}, hover('.row[data-feature=grid]')],
  ['hover-promos', {}, hover('.row[data-feature=promos]')],
  ['hover-thumbs', {}, hover('.row[data-feature=thumbs]')],
  ['hover-miniplayer', {}, hover('.row[data-feature=miniplayer]')],
  ['hover-channel-bar', {}, hover('.row[data-feature=channelBar]')],
  ['compare-held-light', {}, holdCompare],
  ['compare-held-dark', { scheme: 'dark' }, holdCompare],
  ['paused-light', { data: { byte_paused: true } }],
  ['paused-dark', { scheme: 'dark', data: { byte_paused: true } }],
  ['accent-cobalt', { data: { byte_accent: 'cobalt' } }],
  ['accent-tangerine-dark', { scheme: 'dark', data: { byte_accent: 'tangerine' } }],
  ['accent-violet', { data: { byte_accent: 'violet' } }],
  ['theme-dark-on-light-system', { data: { byte_theme: 'dark' } }],
  ['theme-light-on-dark-system', { scheme: 'dark', data: { byte_theme: 'light' } }],
  ['fallback-outside-youtube', { url: 'https://example.com/' }],
  ['fallback-youtube-not-home', { page: 'other', counts: [] }],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  let failed = false;
  for (const [name, opts, act] of SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 200 }, deviceScaleFactor: 2, colorScheme: opts.scheme || 'light' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(installChromeStub, {
      data: { byte_count: 1234, ...opts.data },
      url: opts.url === undefined ? 'https://www.youtube.com/' : opts.url,
      page: opts.page || 'home',
      counts: opts.counts || SAMPLE_COUNTS,
    });
    await page.goto(POPUP);
    await page.waitForTimeout(500);
    if (act) await act(page);
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
    if (errors.length) { failed = true; console.error(`${name}: ${errors.join('; ')}`); }
    await ctx.close();
  }
  await browser.close();
  console.log(`${SHOTS.length} screenshots in ${path.relative(ROOT, OUT)}/`);
  if (failed) process.exitCode = 1;
})();
