'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../../lib/core.js');

test('readSettings: empty storage gives the defaults', () => {
  assert.deepEqual(Core.readSettings({}), {
    enabled: true,
    gridColumns: Core.GRID_MIN,
    hideThumbs: false,
    hidePromos: true,
  });
  assert.deepEqual(Core.readSettings(undefined), Core.readSettings({}));
});

test('readSettings: stored values win over defaults', () => {
  const s = Core.readSettings({
    [Core.STORAGE.ENABLED]: false,
    [Core.STORAGE.GRID]: 6,
    [Core.STORAGE.HIDE_THUMBS]: true,
    [Core.STORAGE.HIDE_PROMOS]: false,
  });
  assert.deepEqual(s, { enabled: false, gridColumns: 6, hideThumbs: true, hidePromos: false });
});

test('readSettings: only an explicit false turns default-on settings off', () => {
  for (const v of [undefined, null, 0, '', 'false', true]) {
    const s = Core.readSettings({ [Core.STORAGE.ENABLED]: v, [Core.STORAGE.HIDE_PROMOS]: v });
    assert.equal(s.enabled, true, `enabled with ${JSON.stringify(v)}`);
    assert.equal(s.hidePromos, true, `hidePromos with ${JSON.stringify(v)}`);
  }
});

test('readSettings: only an explicit true turns hide-thumbnails on', () => {
  for (const v of [undefined, null, 1, 'true', false]) {
    assert.equal(Core.readSettings({ [Core.STORAGE.HIDE_THUMBS]: v }).hideThumbs, false, JSON.stringify(v));
  }
});

test('readSettings: grid columns keep 0 but default null/undefined', () => {
  assert.equal(Core.readSettings({ [Core.STORAGE.GRID]: null }).gridColumns, Core.GRID_MIN);
  assert.equal(Core.readSettings({ [Core.STORAGE.GRID]: 0 }).gridColumns, 0);
});

test('storage keys are unique and namespaced', () => {
  const keys = Object.values(Core.STORAGE);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.match(k, /^byte_[a-z_]+$/);
});

for (const [name, list] of [['SHORTS_SELECTORS', Core.SHORTS_SELECTORS], ['PROMO_SELECTORS', Core.PROMO_SELECTORS]]) {
  test(`${name}: non-empty, trimmed, unique`, () => {
    assert.ok(list.length > 0);
    assert.equal(new Set(list).size, list.length, 'duplicate selector');
    for (const sel of list) {
      assert.equal(typeof sel, 'string');
      assert.equal(sel, sel.trim());
      assert.ok(sel.length > 0);
    }
  });

  test(`${name}: each entry is one selector (no top-level comma)`, () => {
    // countNewElements() runs each entry on its own, and a top-level comma
    // would hide two things under one counter entry. Commas inside :has(...)
    // are fine.
    for (const sel of list) {
      let depth = 0;
      for (const ch of sel) {
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        else if (ch === ',' && depth === 0) assert.fail(`top-level comma in ${sel}`);
        assert.ok(depth >= 0, `unbalanced brackets in ${sel}`);
      }
      assert.equal(depth, 0, `unbalanced brackets in ${sel}`);
    }
  });
}

test('generic shelf containers are only hidden when they hold Shorts', () => {
  // These tags also wrap regular videos; a bare entry would hide them too.
  const generic = ['grid-shelf-view-model', 'ytd-rich-shelf-renderer', 'ytd-rich-section-renderer'];
  for (const sel of Core.SHORTS_SELECTORS) {
    const tag = sel.match(/^[a-z-]+/)?.[0];
    if (generic.includes(tag)) assert.match(sel, /^[a-z-]+:has\(/, sel);
  }
  assert.ok(Core.SHORTS_SELECTORS.some(s => s.startsWith('grid-shelf-view-model:has(')));
});

test('promo selectors stay out of the Shorts list (they are not counted as blocked)', () => {
  for (const sel of Core.PROMO_SELECTORS) assert.ok(!Core.SHORTS_SELECTORS.includes(sel), sel);
});

test('the Shorts selector list is frozen', () => {
  assert.ok(Object.isFrozen(Core.SHORTS_SELECTORS));
  assert.ok(Object.isFrozen(Core.PROMO_SELECTORS));
  assert.ok(Object.isFrozen(Core.STORAGE));
});

test('buildShortsCSS hides every Shorts selector', () => {
  const css = Core.buildShortsCSS();
  assert.ok(css.endsWith(' { display: none !important; }'));
  for (const sel of Core.SHORTS_SELECTORS) assert.ok(css.includes(sel), sel);
});

test('buildGridCSS sets the per-row variables to n', () => {
  for (const n of [3, 4, 7]) {
    const css = Core.buildGridCSS(n);
    assert.ok(css.includes(`--ytd-rich-grid-items-per-row: ${n} !important;`));
    assert.ok(css.includes(`--ytd-rich-grid-slim-items-per-row: ${n} !important;`));
    assert.ok(css.includes(`grid-template-columns: repeat(${n}, minmax(0, 1fr)) !important;`));
    assert.ok(css.includes(`.${Core.GHOST_HIDDEN}`));
  }
});

test('buildGridCSS skeleton rule targets an incomplete last row', () => {
  // With n columns, children after the first row that sit in the last
  // (n - 1) positions are an incomplete row.
  const css = Core.buildGridCSS(4);
  assert.ok(css.includes(':nth-child(4n + 5):nth-last-child(-n + 3)'));
});

test('buildGridCSS has balanced braces', () => {
  const css = Core.buildGridCSS(5);
  assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length);
});

test('escapeAttr escapes HTML-significant characters', () => {
  assert.equal(Core.escapeAttr(`<a href="x">&'`), `&lt;a href=&quot;x&quot;&gt;&amp;'`);
  assert.equal(Core.escapeAttr('&amp;'), '&amp;amp;', 'escapes & first, no double-decoding');
  assert.equal(Core.escapeAttr(42), '42');
});
