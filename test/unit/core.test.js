'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../../lib/core.js');

test('readSettings defaults', () => {
  assert.deepEqual(Core.readSettings({}), { hideShorts: true, paused: false, channelBar: true, accent: 'lime',
    gridColumns: 3, hideThumbs: false, hidePromos: true, miniplayer: true });
  assert.deepEqual(Core.readSettings(undefined), Core.readSettings({}));
});

test('readSettings: stored values win over defaults', () => {
  const s = Core.readSettings({
    [Core.STORAGE.HIDE_SHORTS]: false,
    [Core.STORAGE.PAUSED]: true,
    [Core.STORAGE.CHANNEL_BAR]: false,
    [Core.STORAGE.ACCENT]: 'violet',
    [Core.STORAGE.GRID]: 6,
    [Core.STORAGE.HIDE_THUMBS]: true,
    [Core.STORAGE.HIDE_PROMOS]: false,
    [Core.STORAGE.MINIPLAYER]: false,
  });
  assert.deepEqual(s, { hideShorts: false, paused: true, channelBar: false, accent: 'violet',
    gridColumns: 6, hideThumbs: true, hidePromos: false, miniplayer: false });
});

test('readSettings ignores corrupt values', () => {
  const s = Core.readSettings({ byte_accent: 'pink', byte_grid_columns: 'x', byte_enabled: false });
  assert.equal(s.accent, 'lime'); assert.equal(s.gridColumns, 3); assert.equal(s.hideShorts, true);
});

test('readSettings: only an explicit false turns default-on settings off', () => {
  for (const v of [undefined, null, 0, '', 'false', true]) {
    const s = Core.readSettings({ [Core.STORAGE.HIDE_SHORTS]: v, [Core.STORAGE.HIDE_PROMOS]: v, [Core.STORAGE.CHANNEL_BAR]: v });
    assert.equal(s.hideShorts, true, `hideShorts with ${JSON.stringify(v)}`);
    assert.equal(s.hidePromos, true, `hidePromos with ${JSON.stringify(v)}`);
    assert.equal(s.channelBar, true, `channelBar with ${JSON.stringify(v)}`);
  }
});

test('readSettings: only an explicit true turns paused on', () => {
  for (const v of [undefined, null, 1, 'true', false]) {
    assert.equal(Core.readSettings({ [Core.STORAGE.PAUSED]: v }).paused, false, JSON.stringify(v));
  }
});

test('paletteFor falls back to lime', () => assert.equal(Core.paletteFor('nope').accent, '#C6F135'));

test('PALETTES holds the four accents', () => {
  assert.deepEqual(Core.PALETTES.map(p => [p.id, p.name, p.accent, p.onAccent]), [
    ['lime', 'Lime', '#C6F135', '#141414'],
    ['cobalt', 'Cobalt', '#3D5AFE', '#FFFFFF'],
    ['tangerine', 'Tangerine', '#FF7A1A', '#1A1208'],
    ['violet', 'Violet', '#8B5CF6', '#FFFFFF'],
  ]);
  assert.equal(Core.DEFAULT_ACCENT, 'lime');
  assert.equal(Core.paletteFor('cobalt').accent, '#3D5AFE');
});

test('effectiveState: paused turns everything off, including the mini player', () => {
  const e = Core.effectiveState(Core.readSettings({ byte_paused: true }));
  assert.deepEqual(e, { hideShorts: false, hidePromos: false, hideThumbs: false, channelBar: false, gridColumns: null, miniplayer: false });
});

test('effectiveState: comparing turns visuals off but keeps the mini player', () => {
  const e = Core.effectiveState(Core.readSettings({}), { comparing: true });
  assert.equal(e.hideShorts, false); assert.equal(e.gridColumns, null); assert.equal(e.miniplayer, true);
});

test('effectiveState: switches are independent', () => {
  const e = Core.effectiveState(Core.readSettings({ byte_hide_shorts: false }));
  assert.equal(e.hideShorts, false); assert.equal(e.hidePromos, true); assert.equal(e.channelBar, true);
  assert.equal(e.gridColumns, 3);
});

test('readSettings: only an explicit true turns hide-thumbnails on', () => {
  for (const v of [undefined, null, 1, 'true', false]) {
    assert.equal(Core.readSettings({ [Core.STORAGE.HIDE_THUMBS]: v }).hideThumbs, false, JSON.stringify(v));
  }
});

test('readSettings: grid columns must be an integer >= GRID_MIN', () => {
  for (const v of [null, 0, 2, 3.5, 'x', NaN]) assert.equal(Core.readSettings({ [Core.STORAGE.GRID]: v }).gridColumns, Core.GRID_MIN, String(v));
  assert.equal(Core.readSettings({ [Core.STORAGE.GRID]: 7 }).gridColumns, 7);
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

test('loopStat: fewest channels that fill half', () => {
  assert.deepEqual(Core.loopStat([10, 9, 6, 5, 5, 5, 4, 2, 2]), { loopCount: 3, share: 25 / 48, total: 48 });
});
test('loopStat: one channel can be the whole loop', () => assert.equal(Core.loopStat([30, 2, 1]).loopCount, 1));
test('loopStat: all equal → half of them, rounded up', () => assert.equal(Core.loopStat([1, 1, 1, 1, 1]).loopCount, 3));
test('loopStat: unsorted input', () => assert.equal(Core.loopStat([2, 30, 1]).loopCount, 1));
test('loopStat: empty feed', () => assert.equal(Core.loopStat([]), null));
