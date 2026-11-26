(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────

  const STYLE_ID        = 'byte-style';
  const GRID_STYLE_ID   = 'byte-grid-style';
  const THUMB_STYLE_ID  = 'byte-thumb-style';
  const PROMO_STYLE_ID  = 'byte-promo-style';
  const INSIGHT_CSS_ID  = 'byte-insight-css';
  const INSIGHT_BAR_ID  = 'byte-insight';
  const PROCESSED_ATTR  = 'data-byte-seen';
  const DURATION_ATTR   = 'data-byte-dur';
  const GHOST_CLONE     = 'byte-ghost-clone';
  const GHOST_HIDDEN    = 'byte-ghost-hidden';
  const GRID_MIN        = 3;

  const STORAGE = {
    ENABLED:     'byte_enabled',
    COUNT:       'byte_count',
    GRID:        'byte_grid_columns',
    HIDE_THUMBS: 'byte_hide_thumbs',
    HIDE_PROMOS: 'byte_hide_promos',
  };

  // ── State ─────────────────────────────────────────────

  let isEnabled        = true;
  let gridColumns      = GRID_MIN;
  let hideThumbsEnabled = false;
  let hidePromosEnabled = true;
  let sessionBlocked   = 0;
  let observer         = null;
  let insightHTML      = '';

  // ── Shorts blocking ───────────────────────────────────

  const SELECTORS = [
    'ytd-reel-shelf-renderer',
    'ytd-rich-shelf-renderer:has(ytm-shorts-lockup-view-model)',
    'ytd-rich-section-renderer:has(ytd-reel-shelf-renderer)',
    'ytd-rich-section-renderer:has(ytm-shorts-lockup-view-model)',
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

  const CSS_RULE = SELECTORS.join(',\n') + ' { display: none !important; }';

  function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS_RULE;
    (document.head || document.documentElement).appendChild(el);
  }

  function removeCSS() {
    const el = document.getElementById(STYLE_ID);
    if (el) el.remove();
  }

  function countNewElements() {
    if (!isEnabled) return;
    let newCount = 0;
    for (const sel of SELECTORS) {
      try {
        document.querySelectorAll(`${sel}:not([${PROCESSED_ATTR}])`).forEach(el => {
          el.setAttribute(PROCESSED_ATTR, '1');
          newCount++;
        });
      } catch (_) {}
    }
    if (newCount === 0) return;
    sessionBlocked += newCount;
    chrome.storage.local.get(STORAGE.COUNT, data => {
      chrome.storage.local.set({ [STORAGE.COUNT]: (data[STORAGE.COUNT] || 0) + newCount });
    });
  }

  // ── Promo sections ────────────────────────────────────

  // Hidden via CSS only and kept out of SELECTORS so they don't count as blocked.
  const PROMO_SELECTORS = [
    'ytd-rich-section-renderer:has(ytd-brand-video-shelf-renderer)',
    'ytd-rich-section-renderer:has(ytd-chips-shelf-with-video-shelf-renderer)',
    'ytd-rich-section-renderer:has(ytd-brand-video-singleton-renderer)',
    'ytd-brand-video-shelf-renderer',
    'ytd-brand-video-singleton-renderer',
  ].join(',\n');

  function applyPromoStyle(enabled) {
    let el = document.getElementById(PROMO_STYLE_ID);
    if (!enabled) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('style');
      el.id = PROMO_STYLE_ID;
      el.textContent = PROMO_SELECTORS + ' { display: none !important; }';
      (document.head || document.documentElement).appendChild(el);
    }
  }

  // ── Grid density ──────────────────────────────────────

  function applyGridStyle(n) {
    let el = document.getElementById(GRID_STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = GRID_STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = `
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

  // YouTube stamps skeleton rows at its own row size; keep its row count but use ours.
  function syncGhostCards() {
    document.querySelectorAll('ytd-rich-grid-renderer ytd-ghost-grid-renderer:not([is-shorts]) .ghost-grid').forEach(grid => {
      const cards  = grid.querySelectorAll(`.ghost-card:not(.${GHOST_CLONE})`);
      const clones = grid.querySelectorAll(`.${GHOST_CLONE}`);
      const perRow = Number(grid.closest('ytd-ghost-grid-renderer').getAttribute('items-per-row')) || cards.length || 1;
      const target = Math.ceil(cards.length / perRow) * gridColumns;
      const extra  = Math.max(0, target - cards.length);
      cards.forEach((card, i) => card.classList.toggle(GHOST_HIDDEN, i >= target));
      for (let i = clones.length; i < extra; i++) {
        const clone = cards[0].cloneNode(true);
        clone.classList.add(GHOST_CLONE);
        grid.appendChild(clone);
      }
      for (let i = extra; i < clones.length; i++) clones[i].remove();
    });
  }

  // ── Thumbnail hide + duration injection ───────────────

  function applyThumbStyle(enabled) {
    let el = document.getElementById(THUMB_STYLE_ID);
    if (enabled) {
      if (!el) {
        el = document.createElement('style');
        el.id = THUMB_STYLE_ID;
        (document.head || document.documentElement).appendChild(el);
      }
      el.textContent = `a.ytLockupViewModelContentImage { display: none !important; }`;
      injectDurations();
    } else {
      if (el) el.remove();
      removeDurations();
    }
  }

  function injectDurations() {
    document.querySelectorAll(`ytd-rich-item-renderer:not([${DURATION_ATTR}])`).forEach(card => {
      // Skip Shorts cards
      if (card.querySelector('ytm-shorts-lockup-view-model')) return;

      const durationEl = card.querySelector('.ytBadgeShapeText');
      if (!durationEl) return;
      const duration = durationEl.textContent.trim();
      if (!duration) return;

      // Last metadata row is always views • time ago
      const rows = card.querySelectorAll('.ytContentMetadataViewModelMetadataRow');
      if (!rows.length) return;
      const viewsRow = rows[rows.length - 1];

      const sep = document.createElement('span');
      sep.setAttribute('aria-hidden', 'true');
      sep.className = 'ytContentMetadataViewModelDelimiter byte-injected';
      sep.textContent = ' • ';

      const durSpan = document.createElement('span');
      durSpan.className = 'ytContentMetadataViewModelMetadataText byte-injected';
      durSpan.setAttribute('role', 'text');
      durSpan.textContent = duration;

      viewsRow.appendChild(sep);
      viewsRow.appendChild(durSpan);
      card.setAttribute(DURATION_ATTR, '1');
    });
  }

  function removeDurations() {
    document.querySelectorAll('.byte-injected').forEach(el => el.remove());
    document.querySelectorAll(`[${DURATION_ATTR}]`).forEach(el => el.removeAttribute(DURATION_ATTR));
  }

  // ── Channel insight bar ───────────────────────────────

  const INSIGHT_CSS = `
    #byte-insight {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px var(--ytd-rich-grid-gutter-margin, 24px);
      font-family: -apple-system, BlinkMacSystemFont, 'Roboto', sans-serif;
      font-size: 12px;
      color: #aaaaaa;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      margin-bottom: 4px;
      box-sizing: border-box;
      flex-wrap: wrap;
      row-gap: 8px;
    }
    .byte-insight-summary { white-space: nowrap; flex-shrink: 0; }
    .byte-insight-summary strong { color: #ffffff; font-weight: 600; }
    .byte-insight-sep { margin: 0 5px; opacity: 0.35; }
    .byte-insight-chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      min-width: 0;
    }
    .byte-chip {
      position: relative;
      display: flex;
      align-items: center;
      gap: 4px;
      text-decoration: none;
      color: inherit;
      opacity: 0.7;
      transition: opacity 120ms ease;
    }
    .byte-chip:hover { opacity: 1; }
    .byte-chip img,
    .byte-chip-avatar-ph {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }
    .byte-chip-avatar-ph {
      background: #2e2e2e;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      color: #fff;
      font-weight: 600;
    }
    .byte-chip-count {
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
      line-height: 1;
    }
    .byte-chip::after {
      content: attr(data-byte-tip);
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: #1f1f1f;
      color: #fff;
      font-size: 11px;
      padding: 5px 9px;
      border-radius: 6px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 120ms ease;
      border: 1px solid rgba(255,255,255,0.1);
      z-index: 2000;
      box-shadow: 0 4px 16px rgba(0,0,0,0.65);
    }
    .byte-chip:hover::after { opacity: 1; }
  `;

  function injectInsightCSS() {
    if (document.getElementById(INSIGHT_CSS_ID)) return;
    const el = document.createElement('style');
    el.id = INSIGHT_CSS_ID;
    el.textContent = INSIGHT_CSS;
    (document.head || document.documentElement).appendChild(el);
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function collectChannelData() {
    const map = new Map();
    document.querySelectorAll('ytd-rich-item-renderer').forEach(card => {
      if (card.querySelector('ytm-shorts-lockup-view-model')) return;
      if (hidePromosEnabled && card.closest(PROMO_SELECTORS)) return;
      const channelLink = card.querySelector('a[href^="/@"]');
      if (!channelLink) return;
      const href = channelLink.getAttribute('href').split('?')[0];
      const name = channelLink.textContent.trim();
      const avatarImg = card.querySelector('yt-avatar-shape img');
      const avatarSrc = avatarImg?.src || '';
      if (!map.has(href)) map.set(href, { name, href, avatarSrc, count: 0 });
      map.get(href).count++;
    });
    return [...map.values()].sort((a, b) => b.count - a.count);
  }

  function updateInsightBar() {
    // Only show on pages that have the rich grid (homepage, subscriptions).
    const contentsEl = document.querySelector('ytd-rich-grid-renderer #contents');
    if (!contentsEl) {
      const existing = document.getElementById(INSIGHT_BAR_ID);
      if (existing) existing.remove();
      return;
    }

    let bar = document.getElementById(INSIGHT_BAR_ID);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = INSIGHT_BAR_ID;
      contentsEl.parentNode.insertBefore(bar, contentsEl);
      insightHTML = '';
    }

    const channels = collectChannelData();
    const total = channels.reduce((sum, ch) => sum + ch.count, 0);

    let html = '';
    if (total > 0) {
      const chipsHTML = channels.map(ch => {
        const label = escapeAttr(`${ch.name} · ${ch.count} video${ch.count !== 1 ? 's' : ''}`);
        const avatar = ch.avatarSrc
          ? `<img src="${escapeAttr(ch.avatarSrc)}" alt="${escapeAttr(ch.name)}">`
          : `<div class="byte-chip-avatar-ph">${escapeAttr((ch.name[0] || '?').toUpperCase())}</div>`;
        return `<a href="${escapeAttr(ch.href)}" class="byte-chip" data-byte-tip="${label}">${avatar}<span class="byte-chip-count">${ch.count}</span></a>`;
      }).join('');

      html = `
        <div class="byte-insight-summary">
          <strong>${channels.length}</strong> channel${channels.length !== 1 ? 's' : ''}
          <span class="byte-insight-sep">·</span>
          ${total} video${total !== 1 ? 's' : ''} loaded
        </div>
        <div class="byte-insight-chips">${chipsHTML}</div>
      `;
    }

    // Writing the bar re-triggers our own MutationObserver. Skip no-op writes or
    // it rebuilds every tick and keeps resetting YouTube's hover previews.
    if (html === insightHTML) return;
    insightHTML = html;
    bar.innerHTML = html;
  }

  // ── Helpers ───────────────────────────────────────────

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function startObserver() {
    if (observer) return;
    const tick = debounce(() => {
      countNewElements();
      updateInsightBar();
      syncGhostCards();
      if (hideThumbsEnabled) injectDurations();
    }, 120);
    observer = new MutationObserver(tick);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (!observer) return;
    observer.disconnect();
    observer = null;
  }

  // ── Lifecycle ─────────────────────────────────────────

  function enable() {
    injectCSS();
    applyGridStyle(gridColumns);
    injectInsightCSS();
    countNewElements();
    applyPromoStyle(hidePromosEnabled);
    updateInsightBar();
    applyThumbStyle(hideThumbsEnabled);
    startObserver();
  }

  function disable() {
    removeCSS();
    stopObserver();
    applyThumbStyle(false);
    applyPromoStyle(false);
    const bar = document.getElementById(INSIGHT_BAR_ID);
    if (bar) bar.remove();
  }

  function init() {
    chrome.storage.local.get([STORAGE.ENABLED, STORAGE.GRID, STORAGE.HIDE_THUMBS, STORAGE.HIDE_PROMOS], data => {
      isEnabled        = data[STORAGE.ENABLED] !== false;
      gridColumns      = data[STORAGE.GRID] ?? GRID_MIN;
      hideThumbsEnabled = data[STORAGE.HIDE_THUMBS] === true;
      hidePromosEnabled = data[STORAGE.HIDE_PROMOS] !== false;
      if (isEnabled) enable();
    });
  }

  // ── YouTube SPA navigation ────────────────────────────

  document.addEventListener('yt-navigate-finish', () => {
    if (!isEnabled) return;
    injectCSS();
    applyGridStyle(gridColumns);
    countNewElements();
    updateInsightBar();
    if (hideThumbsEnabled) injectDurations();
  });

  // ── Messages from popup ───────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_STATUS') {
      sendResponse({ sessionBlocked, isEnabled });
      return;
    }
    if (msg.type === 'SET_SETTINGS') {
      isEnabled = msg.enabled;
      isEnabled ? enable() : disable();
      sendResponse({ ok: true });
    }
    if (msg.type === 'SET_GRID') {
      gridColumns = msg.columns;
      applyGridStyle(gridColumns);
      syncGhostCards();
      sendResponse({ ok: true });
    }
    if (msg.type === 'SET_THUMB') {
      hideThumbsEnabled = msg.enabled;
      applyThumbStyle(hideThumbsEnabled);
      sendResponse({ ok: true });
    }
    if (msg.type === 'SET_PROMOS') {
      hidePromosEnabled = msg.enabled;
      if (isEnabled) {
        applyPromoStyle(hidePromosEnabled);
        updateInsightBar();
      }
      sendResponse({ ok: true });
    }
  });

  init();
})();
