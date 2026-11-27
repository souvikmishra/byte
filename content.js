(function () {
  'use strict';

  // Shared pure logic from lib/core.js (listed before this file in manifest.json).
  const Core = globalThis.ByteCore;

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
  const GHOST_HIDDEN    = Core.GHOST_HIDDEN;
  const STORAGE         = Core.STORAGE;

  // ── State ─────────────────────────────────────────────

  let settings         = Core.readSettings({});
  let comparing        = false; // set by the popup's compare hold (Task 4)
  let highlight        = null;  // feature id the popup is hovering, or null
  let state            = Core.effectiveState(settings, { comparing });
  let sessionBlocked   = 0;
  let observer         = null;
  let insightHTML      = '';

  // ── Shorts blocking ───────────────────────────────────

  const SELECTORS = Core.SHORTS_SELECTORS;

  const CSS_RULE = Core.buildShortsCSS();

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
    if (!state.hideShorts) return;
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
  const PROMO_SELECTORS = Core.PROMO_SELECTORS.join(',\n');

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

  function removeGridStyle() {
    const el = document.getElementById(GRID_STYLE_ID);
    if (el) el.remove();
  }

  function applyGridStyle(n) {
    let el = document.getElementById(GRID_STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = GRID_STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    const css = Core.buildGridCSS(n);
    if (el.textContent !== css) el.textContent = css;
  }

  // YouTube stamps skeleton rows at its own row size; keep its row count but use ours.
  function syncGhostCards() {
    const columns = state.gridColumns;
    document.querySelectorAll('ytd-rich-grid-renderer ytd-ghost-grid-renderer:not([is-shorts]) .ghost-grid').forEach(grid => {
      const cards  = grid.querySelectorAll(`.ghost-card:not(.${GHOST_CLONE})`);
      const clones = grid.querySelectorAll(`.${GHOST_CLONE}`);
      const perRow = Number(grid.closest('ytd-ghost-grid-renderer').getAttribute('items-per-row')) || cards.length || 1;
      // Grid off: no target, so every skeleton card is back and clones go.
      const target = columns === null ? cards.length : Math.ceil(cards.length / perRow) * columns;
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
      const css = 'a.ytLockupViewModelContentImage { display: none !important; }';
      if (el.textContent !== css) el.textContent = css;
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
    .byte-chip-loop {
      opacity: 1;
      padding: 2px 8px 2px 2px;
      border-radius: 999px;
      background: var(--byte-accent);
      color: var(--byte-on-accent);
    }
    .byte-chip-loop .byte-chip-count { color: var(--byte-on-accent); }
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

  const escapeAttr = Core.escapeAttr;

  function collectChannelData() {
    const map = new Map();
    document.querySelectorAll('ytd-rich-item-renderer').forEach(card => {
      if (card.querySelector('ytm-shorts-lockup-view-model')) return;
      if (state.hidePromos && card.closest(PROMO_SELECTORS)) return;
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
      removeInsightBar();
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
    const loop = Core.loopStat(channels.map(ch => ch.count));
    const palette = Core.paletteFor(settings.accent);

    let html = '';
    if (total > 0) {
      const chipsHTML = channels.map((ch, i) => {
        const label = escapeAttr(`${ch.name} · ${ch.count} video${ch.count !== 1 ? 's' : ''}`);
        const avatar = ch.avatarSrc
          ? `<img src="${escapeAttr(ch.avatarSrc)}" alt="${escapeAttr(ch.name)}">`
          : `<div class="byte-chip-avatar-ph">${escapeAttr((ch.name[0] || '?').toUpperCase())}</div>`;
        return `<a href="${escapeAttr(ch.href)}" class="byte-chip${loop && i < loop.loopCount ? ' byte-chip-loop' : ''}" data-byte-tip="${label}">${avatar}<span class="byte-chip-count">${ch.count}</span></a>`;
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
    // The accent is part of the cache key so a colour change re-renders.
    const key = `${palette.id}|${html}`;
    if (key === insightHTML) return;
    insightHTML = key;
    bar.style.setProperty('--byte-accent', palette.accent);
    bar.style.setProperty('--byte-on-accent', palette.onAccent);
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
      if (state.channelBar) updateInsightBar();
      syncGhostCards();
      if (state.hideThumbs) injectDurations();
    }, 120);
    observer = new MutationObserver(tick);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (!observer) return;
    observer.disconnect();
    observer = null;
  }

  // ── Mini player on browse ─────────────────────────────
  // On /watch, a search or a click to a list page (home, channel, feed, …)
  // first moves the video into YouTube's own mini player, then replays the
  // action through YouTube's in-app navigation. Timeouts replay it anyway, and
  // errors fall back to a normal page load. Spec: docs/miniplayer-on-browse.md

  const MINI = Core.MINIPLAYER_SELECTORS;
  const MINI_TIMEOUT_MS = 2500; // YouTube hasn't reacted at all: replay the action
  // YouTube has started moving to the mini player (it navigates to / first,
  // which took ~1.8s signed in). Replaying before it's on stops the video, so
  // wait this much longer.
  const MINI_SLOW_TIMEOUT_MS = 8000;
  const MINI_RETRY_MS   = 800;  // press again if YouTube ignored the first press
  const MINI_SETTLE_MS  = 1000; // mini player on and no navigation running: replay

  let miniplayerEnabled = true;
  let replaying         = false;
  let pendingAction     = null; // { kind: 'search', query } | { kind: 'link', anchor, href }
  let stopWaiting       = null; // clears the timers and listeners of the current wait

  function isMiniplayerActive() {
    return !!document.querySelector(MINI.active);
  }

  function miniplayerSkipReason() {
    // Getters keep this cheap: the checks stop at the first reason.
    return Core.miniplayerSkipReason({
      enabled: miniplayerEnabled,
      get onWatch()          { return Core.isWatchPath(location.pathname); },
      replaying,
      get miniplayerActive() { return isMiniplayerActive(); },
      get fullscreen()       { return !!document.fullscreenElement; },
      get adShowing()        { return !!document.querySelector(MINI.adShowing); },
      get hasPlayer()        { return !!document.querySelector(MINI.player); },
    });
  }

  // While an action is waiting for the mini player, newer actions replace it.
  function shouldIntercept() {
    return !replaying && (pendingAction !== null || miniplayerSkipReason() === null);
  }

  // Runs fn with `replaying` set so our listeners let the action through.
  // Dispatching click/submit is synchronous, so the flag covers it exactly.
  function replay(fn) {
    replaying = true;
    try { fn(); } finally { replaying = false; }
  }

  function actionUrl(action) {
    return action.kind === 'search'
      ? '/results?search_query=' + encodeURIComponent(action.query)
      : new URL(action.href, location.href).href;
  }

  function replaySearch(query) {
    const input  = document.querySelector(MINI.searchInput);
    const button = document.querySelector(MINI.searchButton);
    if (!input || !button) {
      location.href = actionUrl({ kind: 'search', query });
      return;
    }
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    replay(() => button.click());
  }

  function replayLink(anchor, href) {
    const url = new URL(href, location.href);
    if (url.pathname + url.search === location.pathname + location.search) return; // already there
    let target = anchor && anchor.isConnected ? anchor : null;
    if (!target) target = document.querySelector(`a[href="${CSS.escape(href)}"]`);
    if (target) replay(() => target.click());
    else location.href = url.href;
  }

  function replayAction(action) {
    try {
      if (action.kind === 'search') replaySearch(action.query);
      else replayLink(action.anchor, action.href);
    } catch (_) {
      location.href = actionUrl(action);
    }
  }

  // Current players have no mini player button; the "i" shortcut works and
  // YouTube accepts it from a script.
  function pressMiniplayer() {
    const button = document.querySelector(MINI.button);
    if (button && button.checkVisibility && button.checkVisibility()) {
      button.click();
      return;
    }
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'i', code: 'KeyI', keyCode: 73, which: 73, bubbles: true, cancelable: true,
    }));
  }

  // The user chose something else (another video): drop the waiting
  // action so it can't replace that choice later.
  function cancelPendingAction() {
    if (stopWaiting) stopWaiting();
    pendingAction = null;
  }

  // Turns the mini player on (YouTube then navigates to /) and replays
  // pendingAction once the mini player is on and that navigation is done.
  function moveToMiniplayerThen(action) {
    if (pendingAction) {
      pendingAction = action;
      return;
    }
    pendingAction = action;

    let navStarted  = false;
    let navFinished = false;
    let done        = false;
    let settleTimer = null;
    let timeoutTimer = null;
    let retryTimer   = null;
    let appObserver  = null;
    const app = document.querySelector('ytd-app');

    const stop = () => {
      done = true;
      if (stopWaiting === stop) stopWaiting = null;
      clearTimeout(timeoutTimer);
      clearTimeout(retryTimer);
      clearTimeout(settleTimer);
      if (appObserver) appObserver.disconnect();
      document.removeEventListener('yt-navigate-start', onStart, true);
      document.removeEventListener('yt-navigate-finish', onFinish, true);
    };
    stopWaiting = stop;
    const finish = () => {
      if (done) return;
      stop();
      const next = pendingAction;
      pendingAction = null;
      replayAction(next);
    };
    // While YouTube's navigation to / is still running, replaying would stop
    // the video: leave it to yt-navigate-finish (onFinish) or the slow timeout.
    const settle = () => {
      if (navStarted && !navFinished) return;
      finish();
    };
    const check = () => {
      if (!isMiniplayerActive()) return;
      if (navFinished) finish();
      else if (!settleTimer) settleTimer = setTimeout(settle, MINI_SETTLE_MS);
    };
    const onStart  = () => { navStarted = true; };
    const onFinish = () => { navFinished = true; check(); };

    document.addEventListener('yt-navigate-start', onStart, true);
    document.addEventListener('yt-navigate-finish', onFinish, true);
    if (app) {
      appObserver = new MutationObserver(check);
      appObserver.observe(app, { attributes: true, attributeFilter: ['miniplayer-is-active'] });
    }
    timeoutTimer = setTimeout(() => {
      if (navStarted && !done) timeoutTimer = setTimeout(finish, MINI_SLOW_TIMEOUT_MS);
      else finish();
    }, MINI_TIMEOUT_MS);
    // A second press while the mini player is on would close it, so only
    // retry when nothing happened at all.
    retryTimer = setTimeout(() => {
      if (!done && !navStarted && !isMiniplayerActive()) pressMiniplayer();
    }, MINI_RETRY_MS);

    try {
      pressMiniplayer();
    } catch (_) {
      finish();
    }
  }

  function intercept(e, action) {
    e.preventDefault();
    e.stopImmediatePropagation();
    try {
      moveToMiniplayerThen(action);
    } catch (_) {
      cancelPendingAction();
      location.href = actionUrl(action);
    }
  }

  function currentSearchQuery() {
    const input = document.querySelector(MINI.searchInput);
    return input ? input.value.trim() : '';
  }

  function blurSearch() {
    const el = document.activeElement;
    if (el && el.matches && el.matches(MINI.searchInput)) el.blur();
  }

  // Picks a suggestion from the search dropdown. YouTube searches on press
  // (pointerdown/mousedown), before any click, so this runs for all three;
  // repeats for the same press just replace the pending action.
  // The row a press landed in: the listbox child containing the target.
  function suggestionRow(target) {
    const list = target.closest(MINI.searchSuggestionList);
    if (!list) return null;
    let row = target;
    while (row && row.parentElement !== list) row = row.parentElement;
    return row;
  }

  function onSuggestionPress(e) {
    if (!Core.isPlainLeftClick(e) || !(e.target instanceof Element)) return false;
    const row = suggestionRow(e.target);
    if (!row) return false;
    const option = row.matches('[role="option"]') ? row : row.querySelector('[role="option"]');
    if (!option) return false;
    // Other controls in the row (e.g. "Remove" on a history entry) keep
    // their own behavior.
    const control = e.target.closest('button, a, [role="button"]');
    if (control && !option.contains(control)) return false;
    if (!shouldIntercept()) return false;
    const query = (option.getAttribute('aria-label') || option.textContent || '').trim();
    if (!query) return false;
    blurSearch();
    intercept(e, { kind: 'search', query });
    return true;
  }

  // Capture phase on document runs before YouTube's own handlers.
  document.addEventListener('pointerdown', onSuggestionPress, true);
  document.addEventListener('mousedown', onSuggestionPress, true);

  document.addEventListener('click', e => {
    if (!Core.isPlainLeftClick(e) || !(e.target instanceof Element)) return;
    if (!shouldIntercept()) return;

    if (e.target.closest(MINI.searchButton)) {
      const query = currentSearchQuery();
      if (!query) return;
      blurSearch();
      intercept(e, { kind: 'search', query });
      return;
    }

    if (onSuggestionPress(e)) return;

    const anchor = e.target.closest('a[href]');
    if (!anchor || Core.targetOpensNewContext(anchor.getAttribute('target'))) return;
    const href = anchor.getAttribute('href');
    if (Core.classifyLink(href, location.href) !== 'list') {
      // Another video etc. while an action waits: YouTube opens it, and the
      // waiting action must not navigate away from it afterwards.
      if (pendingAction && Core.cancelsPendingAction(href, location.href)) cancelPendingAction();
      return;
    }
    intercept(e, { kind: 'link', anchor, href });
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!(e.target instanceof Element) || !e.target.matches(MINI.searchInput)) return;
    if (!shouldIntercept()) return;
    const query = e.target.value.trim();
    if (!query) return;
    blurSearch();
    intercept(e, { kind: 'search', query });
  }, true);

  document.addEventListener('submit', e => {
    if (!(e.target instanceof Element) || !e.target.closest(MINI.searchbox)) return;
    if (!shouldIntercept()) return;
    const query = currentSearchQuery();
    if (!query) return;
    blurSearch();
    intercept(e, { kind: 'search', query });
  }, true);

  // ── Lifecycle ─────────────────────────────────────────

  // Applies everything from the effective state. Every step is idempotent, so
  // this is cheap to call on storage changes and on each navigation.
  function applyAll() {
    state = Core.effectiveState(settings, { comparing });
    miniplayerEnabled = state.miniplayer;

    if (state.hideShorts) injectCSS(); else removeCSS();
    applyPromoStyle(state.hidePromos);
    if (state.gridColumns === null) removeGridStyle(); else applyGridStyle(state.gridColumns);
    applyThumbStyle(state.hideThumbs);

    if (state.channelBar) {
      injectInsightCSS();
      updateInsightBar();
    } else {
      removeInsightBar();
    }

    const visualOn = state.hideShorts || state.hidePromos || state.hideThumbs
      || state.channelBar || state.gridColumns !== null;
    if (visualOn) {
      startObserver();
      countNewElements();
      syncGhostCards();
    } else {
      stopObserver();
      syncGhostCards(); // restores skeleton cards
    }
  }

  function removeInsightBar() {
    const bar = document.getElementById(INSIGHT_BAR_ID);
    if (bar) bar.remove();
    insightHTML = '';
  }

  function readAndApply() {
    chrome.storage.local.get(null, data => {
      settings = Core.readSettings(data);
      applyAll();
    });
  }

  function init() {
    readAndApply();
  }

  // byte_count changes on every count, so it must not trigger a re-apply.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (Object.keys(changes).some(k => k !== STORAGE.COUNT && k.startsWith('byte_'))) readAndApply();
  });

  // ── YouTube SPA navigation ────────────────────────────

  document.addEventListener('yt-navigate-finish', applyAll);

  // ── Messages from popup ───────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_STATUS') {
      const page = location.pathname === '/' ? 'home' : 'other';
      const channelCounts = page === 'home' ? collectChannelData().map(ch => ch.count) : [];
      sendResponse({ sessionBlocked, page, channelCounts });
      return;
    }
  });

  init();
})();
