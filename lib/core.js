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
    ENABLED:     'byte_enabled',
    COUNT:       'byte_count',
    GRID:        'byte_grid_columns',
    HIDE_THUMBS: 'byte_hide_thumbs',
    HIDE_PROMOS: 'byte_hide_promos',
    MINIPLAYER:  'byte_miniplayer',
  };

  // Storage values -> runtime settings. Missing keys fall back to the defaults.
  function readSettings(data) {
    data = data || {};
    return {
      enabled:     data[STORAGE.ENABLED] !== false,
      gridColumns: data[STORAGE.GRID] ?? GRID_MIN,
      hideThumbs:  data[STORAGE.HIDE_THUMBS] === true,
      hidePromos:  data[STORAGE.HIDE_PROMOS] !== false,
      miniplayer:  data[STORAGE.MINIPLAYER] !== false,
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

  // ── Helpers ───────────────────────────────────────────

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  const Core = Object.freeze({
    GRID_MIN,
    GHOST_HIDDEN,
    STORAGE: Object.freeze(STORAGE),
    SHORTS_SELECTORS: Object.freeze(SHORTS_SELECTORS),
    PROMO_SELECTORS: Object.freeze(PROMO_SELECTORS),
    readSettings,
    buildShortsCSS,
    buildGridCSS,
    escapeAttr,
    MINIPLAYER_SELECTORS: Object.freeze(MINIPLAYER_SELECTORS),
    classifyLink,
    isWatchPath,
    isPlainLeftClick,
    targetOpensNewContext,
    miniplayerSkipReason,
  });

  if (typeof module === 'object' && module.exports) module.exports = Core;
  else root.ByteCore = Core;
})(typeof globalThis !== 'undefined' ? globalThis : this);
