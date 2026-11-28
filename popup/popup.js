'use strict';

// The toolbar popup. Every control only writes chrome.storage.local; content.js
// applies the change to open YouTube tabs from storage.onChanged.
(() => {
  const Core = globalThis.ByteCore;
  const Mark = globalThis.ByteMark;
  const S = Core.STORAGE;
  // Missing outside the extension (e.g. the popup served on its own for a preview).
  const chrome = globalThis.chrome;
  const store = chrome?.storage?.local;
  const tabs = chrome?.tabs;

  const MARK_PX = 24;
  const WORDMARK_PX = 24; // 2px pixels: caps are 16px of it
  const BACK_TO_MIRROR_MS = 900; // after compare, "With BYTE" shows before the mirror returns
  const DENSE_BARS = 24;         // more channels than this get thinner gaps

  // [headline, sub] for the mirror when there is no stat to show.
  const COPY = {
    paused:      ['BYTE is paused', 'Your YouTube is back to normal.'],
    outside:     ['Nothing to measure here', 'Open YouTube to see what your feed is made of.'],
    notHome:     ['Nothing to measure here', 'Open your YouTube home page to see which channels fill your feed.'],
    emptyHome:   ['Nothing to measure here', 'BYTE found no videos on this page yet.'],
    unreachable: ['Nothing to measure here', 'Reload this YouTube tab so BYTE can see it.'],
    loading:     ['', ''],
  };

  // Switch rows: feature id -> storage key and settings field.
  const SWITCHES = {
    shorts:     { key: S.HIDE_SHORTS, field: 'hideShorts' },
    promos:     { key: S.HIDE_PROMOS, field: 'hidePromos' },
    thumbs:     { key: S.HIDE_THUMBS, field: 'hideThumbs' },
    miniplayer: { key: S.MINIPLAYER,  field: 'miniplayer' },
    channelBar: { key: S.CHANNEL_BAR, field: 'channelBar' },
  };

  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const rowsEl = $('rows');
  const pauseBtn = $('pause');
  const countEl = $('shorts-count');

  let data = {};                      // raw storage values
  let settings = Core.readSettings(data);
  let loaded = false;                 // the count shows — until storage has loaded

  // Only static SVG strings (lib/mark.js output, validated hex) reach the parser.
  function svgFrom(markup) {
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    return document.importNode(doc.documentElement, true);
  }

  // ── Build ─────────────────────────────────────────────

  $('wordmark').append(svgFrom(Mark.wordmarkSVG(WORDMARK_PX, '#18181B')));
  $('mark').append(svgFrom(Mark.markSVG(MARK_PX, Core.paletteFor(settings.accent).accent)));

  const switchInputs = {};
  let gridDec, gridInc, gridCount;

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.includes('-') || k === 'role') node.setAttribute(k, v);
      else node[k] = v;
    }
    node.append(...children);
    return node;
  }

  function buildRow(f) {
    const label = el('span', { className: 'label', id: `label-${f.id}`, textContent: f.label });
    if (f.id === 'grid') {
      gridDec = el('button', { type: 'button', id: 'grid-dec', textContent: '−', 'aria-label': 'Fewer videos per row' });
      gridCount = el('span', { id: 'grid-count', 'aria-live': 'polite' });
      gridInc = el('button', { type: 'button', id: 'grid-inc', textContent: '+', 'aria-label': 'More videos per row' });
      return el('div', { className: 'row', dataset: { feature: f.id } },
        [label, el('span', { className: 'stepper', role: 'group', 'aria-labelledby': label.id }, [gridDec, gridCount, gridInc])]);
    }
    const input = el('input', {
      type: 'checkbox', id: `toggle-${f.id}`, role: 'switch', 'aria-labelledby': label.id,
    });
    switchInputs[f.id] = input;
    return el('label', { className: 'row', htmlFor: input.id, dataset: { feature: f.id } },
      [label, el('span', { className: 'switch' }, [input, el('span', { className: 'track', 'aria-hidden': 'true' })])]);
  }

  rowsEl.append(...Core.FEATURES.map(buildRow));

  // Colour and Theme rows. Plain divs, not labels: a click on the text must not pick a dot.
  const dots = Core.PALETTES.map(p => {
    const dot = el('button', {
      type: 'button', className: 'accent-dot', title: p.name,
      dataset: { accent: p.id }, 'aria-label': `${p.name} colour`, 'aria-pressed': 'false',
    });
    dot.style.setProperty('--dot', p.accent);
    return dot;
  });
  const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };
  const themeSelect = el('select', { id: 'theme', 'aria-labelledby': 'label-theme' },
    Core.THEMES.map(t => el('option', { value: t, textContent: THEME_LABELS[t] })));
  $('prefs').append(
    el('div', { className: 'row' }, [
      el('span', { className: 'label', id: 'label-accent', textContent: 'Colour' }),
      el('span', { id: 'accents', className: 'accents', role: 'group', 'aria-labelledby': 'label-accent' }, dots),
    ]),
    el('div', { className: 'row' }, [
      el('span', { className: 'label', id: 'label-theme', textContent: 'Theme' }),
      themeSelect,
    ]),
  );

  // ── Render ────────────────────────────────────────────

  function render() {
    for (const [id, { field }] of Object.entries(SWITCHES)) {
      if (switchInputs[id]) switchInputs[id].checked = settings[field];
    }
    gridCount.textContent = String(settings.gridColumns);
    gridDec.disabled = settings.gridColumns <= Core.GRID_MIN;

    const paused = settings.paused;
    document.body.classList.toggle('paused', paused);
    rowsEl.inert = paused;
    const pauseLabel = paused ? 'Resume BYTE' : 'Pause BYTE';
    pauseBtn.setAttribute('aria-pressed', String(paused));
    pauseBtn.setAttribute('aria-label', pauseLabel);
    pauseBtn.title = pauseLabel;

    const palette = Core.paletteFor(settings.accent);
    root.style.setProperty('--accent', palette.accent);
    root.style.setProperty('--on-accent', palette.onAccent);
    // CSS paints the mark with var(--accent) so it re-tints with everything
    // else; the attribute keeps the markup itself in the chosen colour.
    $('mark').firstElementChild?.setAttribute('fill', palette.accent);
    for (const dot of dots) dot.setAttribute('aria-pressed', String(dot.dataset.accent === palette.id));

    // system follows the OS: no attribute, so the CSS media query decides.
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    themeSelect.value = settings.theme;

    const count = data[S.COUNT];
    if (loaded) countEl.textContent = (Number.isFinite(count) ? count : 0).toLocaleString();

    renderWindow();
  }

  function update(changes) {
    data = { ...data, ...changes };
    settings = Core.readSettings(data);
    render();
  }

  // Write to storage and show the change right away.
  // Latest value this popup wrote per key, until its echo comes back. Echoes of
  // older writes (rapid stepper clicks) must not overwrite the newer local value.
  const written = {};
  function save(changes) {
    update(changes);
    Object.assign(written, changes);
    if (store) store.set(changes);
  }

  // ── Controls ──────────────────────────────────────────

  for (const [id, { key }] of Object.entries(SWITCHES)) {
    switchInputs[id]?.addEventListener('change', e => save({ [key]: e.target.checked }));
  }
  gridDec.addEventListener('click', () => {
    if (settings.gridColumns > Core.GRID_MIN) save({ [S.GRID]: settings.gridColumns - 1 });
  });
  gridInc.addEventListener('click', () => save({ [S.GRID]: settings.gridColumns + 1 }));
  pauseBtn.addEventListener('click', () => save({ [S.PAUSED]: !settings.paused }));
  themeSelect.addEventListener('change', () => save({ [S.THEME]: themeSelect.value }));
  for (const dot of dots) dot.addEventListener('click', () => save({ [S.ACCENT]: dot.dataset.accent }));

  // ── Window: mirror, live picture, hold to compare ─────

  const winEl = $('window');
  const headlineEl = $('mirror-headline');
  const subEl = $('mirror-sub');
  const barsEl = $('mirror-bars');
  const captionEl = $('wf-caption');
  const summaryEl = $('summary');
  const compareBtn = $('compare');
  const whereEl = $('where');
  const wireframe = globalThis.ByteWireframe.create($('wf'));
  const captions = Object.fromEntries(Core.FEATURES.map(f => [f.id, f.caption]));

  let port = null;                    // to the active YouTube tab's content script
  let status = { kind: 'loading' };   // loading | outside | unreachable | page
  let homeStat = null;                // Core.loopStat of the Home feed, or null
  let hovered = null;                 // feature id of the row under the pointer
  let holding = false;
  let previewKey = '';                // effective state the running preview was built from
  let backTimer = 0;

  const stateKey = () => JSON.stringify(Core.effectiveState(settings));
  const send = msg => {
    try { port?.postMessage(msg); } catch (_) { /* the tab went away; onDisconnect clears port */ }
  };

  function setStatus(next) {
    status = next;
    const counts = next.kind === 'page' && next.page === 'home' ? next.counts : [];
    homeStat = Core.loopStat(counts);
    const sorted = counts.filter(n => n > 0).sort((a, b) => b - a);
    barsEl.replaceChildren(...sorted.map((n, i) => {
      const bar = el('i', { className: homeStat && i < homeStat.loopCount ? 'top' : '' });
      bar.style.height = `${n / sorted[0] * 100}%`;
      return bar;
    }));
    barsEl.classList.toggle('dense', sorted.length > DENSE_BARS);
    renderWindow();
  }

  function mirrorCopy(stat) {
    if (settings.paused) return COPY.paused;
    if (status.kind !== 'page') return COPY[status.kind];
    if (status.page !== 'home') return COPY.notHome;
    if (!stat) return COPY.emptyHome;
    const n = stat.loopCount;
    return [
      `${n} channel${n === 1 ? '' : 's'}`,
      `fill${n === 1 ? 's' : ''} ${Math.round(stat.share * 100)}% of the ${stat.total} videos on your home page`,
    ];
  }

  function renderWindow() {
    const stat = settings.paused ? null : homeStat;
    const [headline, sub] = mirrorCopy(stat);
    headlineEl.textContent = headline;
    subEl.textContent = sub;
    winEl.classList.toggle('fallback', !stat);
    barsEl.hidden = !stat;
    whereEl.hidden = !stat; // "your home feed" only when that is what's measured

    compareBtn.disabled = !port || settings.paused;
    if (holding && compareBtn.disabled) endCompare();
    if (settings.paused && hovered) hoverRow(null); // rows are inert while paused
    // A setting changed under the hovered row: show the preview with it.
    if (hovered && !holding && stateKey() !== previewKey) showPreview();
  }

  function showPreview() {
    clearTimeout(backTimer);
    winEl.classList.remove('returning');
    previewKey = stateKey();
    captionEl.textContent = captions[hovered] || '';
    wireframe.preview(hovered, Core.effectiveState(settings));
    winEl.classList.add('show-pic');
  }

  function showMirror() {
    clearTimeout(backTimer);
    wireframe.stop();
    winEl.classList.remove('show-pic', 'returning');
  }

  function hoverRow(id) {
    if (id === hovered) return;
    hovered = id;
    send({ type: 'HIGHLIGHT', feature: id });
    if (holding) return;
    if (id) showPreview(); else showMirror();
  }

  function startCompare() {
    if (holding || compareBtn.disabled) return;
    holding = true;
    clearTimeout(backTimer);
    winEl.classList.remove('returning');
    send({ type: 'COMPARE', on: true });
    const parts = Core.compareSummary(settings);
    summaryEl.textContent = parts.length
      ? 'BYTE changes this page: ' + parts.join(' · ')
      : "BYTE isn't changing anything on this page.";
    captionEl.textContent = 'YouTube without BYTE';
    wireframe.render(Core.effectiveState(settings, { comparing: true }));
    winEl.classList.add('show-pic', 'holding');
  }

  function endCompare() {
    if (!holding) return;
    holding = false;
    send({ type: 'COMPARE', on: false });
    winEl.classList.remove('holding');
    if (hovered) {
      showPreview();
      return;
    }
    // Show BYTE's version coming back, then return to the mirror.
    captionEl.textContent = 'With BYTE';
    wireframe.render(Core.effectiveState(settings));
    winEl.classList.add('returning'); // keep the button while "With BYTE" shows
    backTimer = setTimeout(showMirror, BACK_TO_MIRROR_MS);
  }

  for (const row of rowsEl.querySelectorAll('.row')) {
    const id = row.dataset.feature;
    row.addEventListener('mouseenter', () => hoverRow(id));
    row.addEventListener('mouseleave', () => { if (hovered === id) hoverRow(null); });
    row.addEventListener('focusin', () => hoverRow(id));
    row.addEventListener('focusout', () => { if (hovered === id) hoverRow(null); });
  }

  // Hold to compare. Every way a hold can end releases it; closing the popup
  // drops the port, and the page resets itself.
  compareBtn.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    try { compareBtn.setPointerCapture(e.pointerId); } catch (_) { /* no live pointer (synthetic event) */ }
    startCompare();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) {
    compareBtn.addEventListener(type, endCompare);
  }
  window.addEventListener('blur', endCompare);
  const isHoldKey = e => e.key === ' ' || e.key === 'Enter';
  compareBtn.addEventListener('keydown', e => { if (isHoldKey(e) && !e.repeat) startCompare(); });
  compareBtn.addEventListener('keyup', e => { if (isHoldKey(e)) endCompare(); });

  // ── Active tab ────────────────────────────────────────

  function isYouTube(url) {
    try {
      const { protocol, hostname } = new URL(url);
      return /^https?:$/.test(protocol) && (hostname === 'youtube.com' || hostname.endsWith('.youtube.com'));
    } catch (_) {
      return false;
    }
  }

  let targetSeq = 0;
  function setTarget(tab) {
    const seq = ++targetSeq;
    endCompare();
    if (port) port.disconnect();
    port = null;
    if (!tab || !isYouTube(tab.url)) {
      setStatus({ kind: 'outside' });
      return;
    }
    const p = tabs.connect(tab.id, { name: 'byte-popup' });
    port = p;
    p.onDisconnect.addListener(() => {
      void chrome.runtime.lastError; // no content script in the tab
      if (port !== p) return;
      port = null;
      renderWindow();
    });
    if (hovered) send({ type: 'HIGHLIGHT', feature: hovered });
    setStatus({ kind: 'loading' });
    tabs.sendMessage(tab.id, { type: 'GET_STATUS' }, res => {
      const failed = chrome.runtime.lastError || !res;
      if (seq !== targetSeq) return;
      setStatus(failed
        ? { kind: 'unreachable' }
        : { kind: 'page', page: res.page, counts: Array.isArray(res.channelCounts) ? res.channelCounts : [] });
    });
  }

  // As a real popup, the active tab can't change while it's open. Opened as a
  // tab (the e2e tests do this), it follows the tab brought to the front and
  // ignores its own.
  function watchActiveTab() {
    tabs.getCurrent(self => {
      tabs.query({ active: true, currentWindow: true }, found => {
        const tab = chrome.runtime.lastError ? null : found?.[0];
        setTarget(tab && tab.id !== self?.id ? tab : null);
      });
      if (!self) return;
      tabs.onActivated.addListener(({ tabId, windowId }) => {
        if (tabId === self.id || windowId !== self.windowId) return;
        tabs.get(tabId, tab => setTarget(chrome.runtime.lastError ? null : tab));
      });
    });
  }

  // ── Load ──────────────────────────────────────────────

  // Turn on the colour transition only after the stored colour is painted.
  const ready = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('ready')));

  render();
  if (tabs) watchActiveTab(); else setStatus({ kind: 'outside' });
  if (!store) {
    ready();
    return;
  }
  store.get(null, all => {
    // A failed read leaves the defaults showing; reading lastError keeps it quiet.
    const failed = chrome.runtime.lastError;
    loaded = true;
    // Keep values this popup wrote before the read returned; the read may predate them.
    const fresh = {};
    for (const [k, v] of Object.entries(failed ? {} : all || {})) {
      if (!(k in written)) fresh[k] = v;
    }
    update(fresh);
    ready();
  });
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    const values = {};
    for (const [k, { newValue }] of Object.entries(changes)) {
      if (k in written) {
        if (written[k] === newValue) delete written[k];
        continue; // our own write, already showing
      }
      values[k] = newValue;
    }
    if (Object.keys(values).length) update(values);
  });
})();
