// Pure logic shared by content.js and the unit tests. No DOM, no chrome.* calls.
//
// Loaded two ways, with no build step:
// - In the extension, manifest.json lists it before content.js, so both run in
//   the same content-script world and content.js reads `ByteCore`.
// - In Node (`npm test`), it is require()'d and returns the same object.
(function (root) {
  'use strict';

  const GRID_MIN     = 3;
  const GHOST_HIDDEN = 'byte-ghost-hidden';

  const STORAGE = {
    HIDE_SHORTS: 'byte_hide_shorts',
    PAUSED:      'byte_paused',
    CHANNEL_BAR: 'byte_channel_bar',
    ACCENT:      'byte_accent',
    COUNT:       'byte_count',
    GRID:        'byte_grid_columns',
    HIDE_THUMBS: 'byte_hide_thumbs',
    HIDE_PROMOS: 'byte_hide_promos',
    MINIPLAYER:  'byte_miniplayer',
  };

  const PALETTES = [
    { id: 'lime',      name: 'Lime',      accent: '#C6F135', onAccent: '#141414' },
    { id: 'cobalt',    name: 'Cobalt',    accent: '#3D5AFE', onAccent: '#FFFFFF' },
    { id: 'tangerine', name: 'Tangerine', accent: '#FF7A1A', onAccent: '#1A1208' },
    { id: 'violet',    name: 'Violet',    accent: '#8B5CF6', onAccent: '#FFFFFF' },
  ].map(p => Object.freeze(p));
  const DEFAULT_ACCENT = 'lime';

  function paletteFor(id) {
    return PALETTES.find(p => p.id === id) || PALETTES[0];
  }

  // Storage values -> runtime settings. Missing or corrupt values fall back to the defaults.
  function readSettings(data) {
    data = data || {};
    const grid = data[STORAGE.GRID];
    return {
      hideShorts:  data[STORAGE.HIDE_SHORTS] !== false,
      paused:      data[STORAGE.PAUSED] === true,
      channelBar:  data[STORAGE.CHANNEL_BAR] !== false,
      accent:      PALETTES.some(p => p.id === data[STORAGE.ACCENT]) ? data[STORAGE.ACCENT] : DEFAULT_ACCENT,
      gridColumns: Number.isInteger(grid) && grid >= GRID_MIN ? grid : GRID_MIN,
      hideThumbs:  data[STORAGE.HIDE_THUMBS] === true,
      hidePromos:  data[STORAGE.HIDE_PROMOS] !== false,
      miniplayer:  data[STORAGE.MINIPLAYER] !== false,
    };
  }

  // What is actually applied to the page. Pause and compare turn the visual
  // features off; only pause turns off behaviour (the mini player).
  function effectiveState(settings, { comparing = false } = {}) {
    const off = settings.paused || comparing;
    return {
      hideShorts:  !off && settings.hideShorts,
      hidePromos:  !off && settings.hidePromos,
      hideThumbs:  !off && settings.hideThumbs,
      channelBar:  !off && settings.channelBar,
      gridColumns: off ? null : settings.gridColumns,
      miniplayer:  !settings.paused && settings.miniplayer,
    };
  }

  // ── Shorts blocking ───────────────────────────────────

  // Each entry is hidden with CSS and counted as "blocked".
  const SHORTS_SELECTORS = [
    'ytd-reel-shelf-renderer',
    'ytd-rich-shelf-renderer:has(ytm-shorts-lockup-view-model)',
    'ytd-rich-section-renderer:has(ytd-reel-shelf-renderer)',
    'ytd-rich-section-renderer:has(ytm-shorts-lockup-view-model)',
    // Search-result shelves ("Shorts" header + "Show more"). The tag is generic,
    // so only hide the ones that hold Shorts cards.
    'grid-shelf-view-model:has(ytm-shorts-lockup-view-model-v2)',
    'grid-shelf-view-model:has(ytm-shorts-lockup-view-model)',
    'ytm-shorts-lockup-view-model-v2',
    'ytm-shorts-lockup-view-model',
    'ytd-guide-entry-renderer:has(a[href^="/shorts"], a[title="Shorts"])',
    'ytd-mini-guide-entry-renderer:has(a[href^="/shorts"], a[title="Shorts"])',
    'ytd-shorts',
    'ytd-rich-item-renderer:has(a[href*="/shorts/"])',
    'ytd-video-renderer:has(a[href*="/shorts/"])',
    'ytd-compact-video-renderer:has(a[href*="/shorts/"])',
    'ytd-grid-video-renderer:has(a[href*="/shorts/"])',
    'yt-chip-cloud-chip-renderer:has([title="Shorts"])',
    '[overlay-style="SHORTS"]',
  ];

  function buildShortsCSS() {
    return SHORTS_SELECTORS.join(',\n') + ' { display: none !important; }';
  }

  // ── Promo sections ────────────────────────────────────

  // Hidden via CSS only and kept out of SHORTS_SELECTORS so they don't count as blocked.
  const PROMO_SELECTORS = [
    'ytd-rich-section-renderer:has(ytd-brand-video-shelf-renderer)',
    'ytd-rich-section-renderer:has(ytd-chips-shelf-with-video-shelf-renderer)',
    'ytd-rich-section-renderer:has(ytd-brand-video-singleton-renderer)',
    'ytd-brand-video-shelf-renderer',
    'ytd-brand-video-singleton-renderer',
  ];

  // ── Grid density ──────────────────────────────────────

  function buildGridCSS(n) {
    return `
      ytd-rich-grid-renderer {
        --ytd-rich-grid-items-per-row: ${n} !important;
        --ytd-rich-grid-slim-items-per-row: ${n} !important;
        --ytd-rich-grid-item-min-width: 0px !important;
      }
      ytd-rich-grid-renderer #contents > ytd-continuation-item-renderer {
        flex-basis: 100%;
      }
      ytd-ghost-grid-renderer .${GHOST_HIDDEN} {
        display: none;
      }

      /* YouTube flags first-column items using its own row size, which zeroes the
         left margin mid-row in flush grids. Give every item the same footprint. */
      ytd-rich-grid-renderer #contents > ytd-rich-item-renderer[no-gutter-margins]:not([is-compact-grid]):not([is-shorts-grid]),
      ytd-rich-grid-renderer:has(#contents > ytd-rich-item-renderer[no-gutter-margins]) ytd-ghost-grid-renderer:not([is-shorts]) .ghost-card {
        margin-left: 0;
        margin-right: var(--ytd-rich-grid-item-margin);
      }
      ytd-rich-grid-renderer #contents > ytd-rich-item-renderer[is-in-first-column]:not([no-gutter-margins]):not([is-compact-grid]):not([is-shorts-grid]) {
        margin-left: calc(var(--ytd-rich-grid-item-margin) / 2);
      }

      #home-container-media {
        grid-template-columns: repeat(${n}, minmax(0, 1fr)) !important;
      }
      /* Hide an incomplete last row of the first-load skeleton. */
      #home-container-media > :nth-child(${n}n + ${n + 1}):nth-last-child(-n + ${n - 1}),
      #home-container-media > :nth-child(${n}n + ${n + 1}):nth-last-child(-n + ${n - 1}) ~ * {
        display: none;
      }
    `;
  }

  // ── Mini player on browse ──────────────────────────────

  const MINIPLAYER_SELECTORS = {
    // ytd-app gets this attribute while the mini player is showing.
    active:       'ytd-app[miniplayer-is-active], ytd-miniplayer[active]',
    player:       '#movie_player.html5-video-player',
    adShowing:    '.html5-video-player.ad-showing',
    // Older players had a mini player button; current ones only have the "i"
    // shortcut. The button is used when present.
    button:       '.ytp-miniplayer-button',
    searchbox:    'yt-searchbox, ytd-searchbox',
    // yt-searchbox also contains a hidden <input type=file> for image search.
    searchInput:  'yt-searchbox input[name="search_query"], ytd-searchbox input#search',
    searchButton: 'yt-searchbox button.ytSearchboxComponentSearchButton, ytd-searchbox button#search-icon-legacy',
    // The suggestion dropdown. Each row is a direct child of the listbox and
    // is much wider than its [role=option] text, whose aria-label holds the
    // full query.
    searchSuggestionList: 'yt-searchbox [role="listbox"], ytd-searchbox [role="listbox"]',
    searchSuggestion: 'yt-searchbox [role="listbox"] [role="option"], ytd-searchbox [role="listbox"] [role="option"]',
  };

  // Pages that list videos. Leaving /watch for one of these moves the video
  // into the mini player instead of stopping it.
  const LIST_PAGE_PATTERNS = [
    /^\/$/,
    /^\/results$/,
    /^\/feed\/[^/]+/,
    /^\/@[^/]+/,
    /^\/channel\/[^/]+/,
    /^\/c\/[^/]+/,
    /^\/user\/[^/]+/,
    /^\/playlist$/,
    /^\/hashtag\/[^/]+/,
    /^\/gaming(\/|$)/,
    /^\/premium(\/|$)/,
  ];

  // 'list' for a same-origin link to a list page, otherwise 'other'.
  function classifyLink(href, baseHref) {
    if (typeof href !== 'string' || href === '' || href.startsWith('#')) return 'other';
    let url;
    try {
      url = new URL(href, baseHref);
      if (url.origin !== new URL(baseHref).origin) return 'other';
    } catch (_) {
      return 'other';
    }
    return LIST_PAGE_PATTERNS.some(re => re.test(url.pathname)) ? 'list' : 'other';
  }

  // While a search or list click waits for the mini player, a click on any
  // other same-origin link (another video, a Short, …) is a newer choice that
  // YouTube navigates to by itself, so the waiting action must be dropped.
  function cancelsPendingAction(href, baseHref) {
    if (typeof href !== 'string' || href === '' || href.startsWith('#')) return false;
    let url;
    try {
      url = new URL(href, baseHref);
      if (url.origin !== new URL(baseHref).origin) return false;
    } catch (_) {
      return false;
    }
    return classifyLink(href, baseHref) !== 'list';
  }

  function isWatchPath(pathname) {
    return pathname === '/watch';
  }

  // Modified and non-primary clicks open new tabs/windows or downloads; leave them alone.
  function isPlainLeftClick(e) {
    return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
  }

  function targetOpensNewContext(target) {
    const t = (target || '').toLowerCase();
    return t !== '' && t !== '_self';
  }

  // Why an action should navigate normally, or null to move the video into
  // the mini player first.
  function miniplayerSkipReason(s) {
    if (!s.enabled) return 'disabled';
    if (!s.onWatch) return 'not-watch';
    if (s.replaying) return 'replaying';
    if (s.miniplayerActive) return 'miniplayer-active'; // YouTube keeps it playing by itself
    if (s.fullscreen) return 'fullscreen';
    if (s.adShowing) return 'ad';
    if (!s.hasPlayer) return 'no-player';
    return null;
  }

  // The fewest channels (largest first) whose videos make up at least half of
  // the loaded videos. Order of `counts` doesn't matter.
  function loopStat(counts) {
    const sorted = counts.filter(n => n > 0).sort((a, b) => b - a);
    const total = sorted.reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    let sum = 0;
    let loopCount = 0;
    while (loopCount < sorted.length && sum * 2 < total) sum += sorted[loopCount++];
    return { loopCount, share: sum / total, total };
  }

  // ── Helpers ───────────────────────────────────────────

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Popup compare and hover outlines ──────────────────

  const FEATURES = Object.freeze([
    { id: 'shorts',     label: 'Hide Shorts',     caption: 'The Shorts shelf and the Shorts tab disappear.' },
    { id: 'grid',       label: 'Videos per row',  caption: 'Fit more videos on each row.' },
    { id: 'promos',     label: 'Hide promos',     caption: 'Memberships, Premium and music banners go away.' },
    { id: 'thumbs',     label: 'Hide thumbnails', caption: 'Just titles, so clickbait images don\u2019t pull you in.' },
    { id: 'miniplayer', label: 'Keep playing',    caption: 'Search or browse, and the video keeps going in the corner.' },
    { id: 'channelBar', label: 'Channel bar',     caption: 'See which channels fill your feed, right on the page.' },
  ].map(f => Object.freeze(f)));

  // What each feature touches on the page, for the popup's hover outline.
  const HIGHLIGHT_SELECTORS = Object.freeze({
    shorts:     Object.freeze([].concat(SHORTS_SELECTORS)),
    grid:       Object.freeze(['ytd-rich-grid-renderer #contents > ytd-rich-item-renderer']),
    promos:     Object.freeze([].concat(PROMO_SELECTORS)),
    thumbs:     Object.freeze(['a.ytLockupViewModelContentImage']),
    channelBar: Object.freeze(['#byte-insight']),
    miniplayer: Object.freeze([]),
  });

  // Outline only: no display rule, so elements BYTE hides stay hidden.
  function buildHighlightCSS(featureId, accentHex) {
    const selectors = Object.prototype.hasOwnProperty.call(HIGHLIGHT_SELECTORS, featureId)
      ? HIGHLIGHT_SELECTORS[featureId] : [];
    if (!selectors.length) return '';
    return selectors.join(',\n')
      + ` { outline: 2px dashed ${accentHex} !important; outline-offset: 2px !important; }`;
  }

  const Core = Object.freeze({
    FEATURES,
    HIGHLIGHT_SELECTORS,
    buildHighlightCSS,
    GRID_MIN,
    GHOST_HIDDEN,
    STORAGE: Object.freeze(STORAGE),
    SHORTS_SELECTORS: Object.freeze(SHORTS_SELECTORS),
    PROMO_SELECTORS: Object.freeze(PROMO_SELECTORS),
    PALETTES: Object.freeze(PALETTES),
    DEFAULT_ACCENT,
    paletteFor,
    readSettings,
    effectiveState,
    buildShortsCSS,
    buildGridCSS,
    escapeAttr,
    loopStat,
    MINIPLAYER_SELECTORS: Object.freeze(MINIPLAYER_SELECTORS),
    classifyLink,
    cancelsPendingAction,
    isWatchPath,
    isPlainLeftClick,
    targetOpensNewContext,
    miniplayerSkipReason,
  });

  if (typeof module === 'object' && module.exports) module.exports = Core;
  else root.ByteCore = Core;
})(typeof globalThis !== 'undefined' ? globalThis : this);
