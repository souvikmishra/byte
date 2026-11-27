'use strict';

// Checks that the extension files agree with each other: install defaults,
// the content-script load order, and that the shipping JS loads without a
// build step.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../../lib/core.js');

const ROOT = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

// Runs background.js with a fake chrome API and returns what it stores on install.
function installDefaults(reason = 'install') {
  let listener;
  let stored = null;
  const chrome = {
    runtime: { onInstalled: { addListener: fn => { listener = fn; } } },
    storage: { local: { set: obj => { stored = obj; } } },
  };
  vm.runInNewContext(read('background.js'), { chrome }, { filename: 'background.js' });
  assert.equal(typeof listener, 'function', 'background.js registers onInstalled');
  listener({ reason });
  return stored;
}

test('background.js stores defaults on install only', () => {
  assert.ok(installDefaults('install'));
  assert.equal(installDefaults('update'), null);
});

test('install defaults use known storage keys', () => {
  const keys = new Set(Object.values(Core.STORAGE));
  for (const k of Object.keys(installDefaults())) assert.ok(keys.has(k), `unknown key ${k}`);
});

test('every setting has an install default', () => {
  const defaults = installDefaults();
  for (const key of Object.values(Core.STORAGE)) assert.ok(key in defaults, `no install default for ${key}`);
});

test('install defaults match what content.js assumes for missing keys', () => {
  // A fresh install and a profile where background.js never ran (e.g. storage
  // cleared) must behave the same.
  assert.deepEqual(Core.readSettings(installDefaults()), Core.readSettings({}));
});

test('manifest loads lib/core.js before content.js', () => {
  const [cs] = manifest.content_scripts;
  assert.deepEqual(cs.js, ['lib/core.js', 'content.js']);
  assert.equal(cs.run_at, 'document_start');
});

test('background runs in Chrome (service_worker) and Firefox (scripts)', () => {
  // Firefox MV3 has no background service workers and uses "scripts"; Chrome
  // 121+ uses "service_worker" and ignores "scripts" (with a "Warnings" note on
  // chrome://extensions in developer mode). Both must be the same file.
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.deepEqual(manifest.background.scripts, [manifest.background.service_worker]);
});

test('every file the manifest references exists', () => {
  const files = [
    ...manifest.content_scripts.flatMap(cs => cs.js),
    manifest.background.service_worker,
    ...manifest.background.scripts,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  for (const f of files) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
});

test('manifest permissions are unchanged (adding one needs sign-off)', () => {
  assert.deepEqual(manifest.permissions, ['storage', 'tabs']);
  assert.deepEqual(manifest.host_permissions, ['*://*.youtube.com/*']);
});

test('manifest version is semver', () => {
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test('lib/core.js exposes ByteCore as a plain script (no module system)', () => {
  const ctx = vm.createContext({});
  ctx.globalThis = ctx;
  vm.runInContext(read('lib/core.js'), ctx, { filename: 'lib/core.js' });
  assert.ok(ctx.ByteCore, 'global defined');
  assert.deepEqual([...ctx.ByteCore.SHORTS_SELECTORS], [...Core.SHORTS_SELECTORS]);
});

test('content.js starts with lib/core.js loaded and reads settings from storage', () => {
  const appended = [];
  let getKeys;
  const document = {
    head: { appendChild: el => appended.push(el.id) },
    documentElement: {},
    getElementById: () => null,
    createElement: () => ({ remove() {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const chrome = {
    storage: { local: { get: (keys, cb) => { getKeys = keys; cb({}); }, set: () => {} }, onChanged: { addListener: () => {} } },
    runtime: { onMessage: { addListener: () => {} } },
  };
  class MutationObserver { observe() {} disconnect() {} }
  const ctx = vm.createContext({ document, chrome, MutationObserver, setTimeout, clearTimeout });
  ctx.globalThis = ctx;
  for (const f of manifest.content_scripts[0].js) vm.runInContext(read(f), ctx, { filename: f });
  assert.equal(getKeys, null, 'reads all keys so applyAll sees every setting');
  assert.ok(appended.includes('byte-style'), 'Shorts CSS injected with default settings');
});

test('content.js reacts to storage changes, not popup SET_* messages', () => {
  const src = read('content.js');
  assert.match(src, /storage\.onChanged\.addListener/);
  assert.doesNotMatch(src, /SET_[A-Z]+/);
  assert.doesNotMatch(read('popup/popup.js'), /SET_[A-Z]+/);
});
