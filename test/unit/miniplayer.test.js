'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../../lib/core.js');

const BASE = 'https://www.youtube.com/watch?v=abc';

test('list pages from the spec are recognised', () => {
  for (const href of [
    '/', '/results?search_query=cats', '/feed/subscriptions', '/feed/history', '/feed/trending',
    '/@BlenderOfficial', '/@BlenderOfficial/videos', '/channel/UC123', '/channel/UC123/videos',
    '/c/SomeName', '/user/someone', '/playlist?list=PL123', '/hashtag/music',
    '/gaming', '/premium',
    'https://www.youtube.com/@BlenderOfficial', '/?app=desktop',
  ]) {
    assert.equal(Core.classifyLink(href, BASE), 'list', href);
  }
});

test('videos and everything else are not list pages', () => {
  for (const href of [
    '/watch?v=xyz', '/watch?v=xyz&list=PL1', '/shorts/abc', '/live/abc', '/embed/abc',
    '/account', '/feedback', '/channels', '/playlists', '/c', '/user/', '/results/extra',
    'https://music.youtube.com/', 'https://accounts.google.com/ServiceLogin',
    'https://www.google.com/', 'javascript:void(0)', 'mailto:a@b.c', '#comments', '',
  ]) {
    assert.equal(Core.classifyLink(href, BASE), 'other', JSON.stringify(href));
  }
});

test('classifyLink tolerates junk', () => {
  assert.equal(Core.classifyLink('http://[bad', BASE), 'other');
  assert.equal(Core.classifyLink(null, BASE), 'other');
});

test('isWatchPath only matches /watch', () => {
  assert.equal(Core.isWatchPath('/watch'), true);
  for (const p of ['/', '/watchlater', '/shorts/x', '/results']) assert.equal(Core.isWatchPath(p), false, p);
});

test('isPlainLeftClick: only an unmodified primary-button click', () => {
  const base = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  assert.equal(Core.isPlainLeftClick(base), true);
  for (const k of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
    assert.equal(Core.isPlainLeftClick({ ...base, [k]: true }), false, k);
  }
  assert.equal(Core.isPlainLeftClick({ ...base, button: 1 }), false, 'middle');
  assert.equal(Core.isPlainLeftClick({ ...base, button: 2 }), false, 'right');
});

test('targetOpensNewContext: _blank and named targets do, _self and none do not', () => {
  for (const t of [null, '', '_self', '_SELF']) assert.equal(Core.targetOpensNewContext(t), false, String(t));
  for (const t of ['_blank', '_BLANK', 'other-window', '_parent', '_top']) assert.equal(Core.targetOpensNewContext(t), true, t);
});

test('miniplayerSkipReason: intercept only when everything allows it', () => {
  const ok = { enabled: true, onWatch: true, replaying: false, miniplayerActive: false, fullscreen: false, adShowing: false, hasPlayer: true };
  assert.equal(Core.miniplayerSkipReason(ok), null);
  const cases = {
    disabled: { enabled: false },
    'not-watch': { onWatch: false },
    replaying: { replaying: true },
    'miniplayer-active': { miniplayerActive: true },
    fullscreen: { fullscreen: true },
    ad: { adShowing: true },
    'no-player': { hasPlayer: false },
  };
  for (const [reason, patch] of Object.entries(cases)) {
    assert.equal(Core.miniplayerSkipReason({ ...ok, ...patch }), reason, reason);
  }
});

test('mini player setting defaults to on and only an explicit false turns it off', () => {
  assert.equal(Core.readSettings({}).miniplayer, true);
  assert.equal(Core.readSettings({ [Core.STORAGE.MINIPLAYER]: false }).miniplayer, false);
  assert.equal(Core.readSettings({ [Core.STORAGE.MINIPLAYER]: 0 }).miniplayer, true);
  assert.equal(Core.STORAGE.MINIPLAYER, 'byte_miniplayer');
});

test('mini player selectors: one named list with the parts the feature needs', () => {
  const S = Core.MINIPLAYER_SELECTORS;
  assert.ok(Object.isFrozen(S));
  for (const k of ['active', 'player', 'adShowing', 'button', 'searchbox', 'searchInput', 'searchButton', 'searchSuggestion']) {
    assert.equal(typeof S[k], 'string', k);
    assert.ok(S[k].length > 0, k);
  }
  assert.ok(!/input\b(?!\[|#)/.test(S.searchInput), 'search input must not match the hidden file input');
});
