'use strict';

// The toolbar popup. Every control only writes chrome.storage.local; content.js
// applies the change to open YouTube tabs from storage.onChanged.
(() => {
  const Core = globalThis.ByteCore;
  const Mark = globalThis.ByteMark;
  const S = Core.STORAGE;
  // Missing outside the extension (e.g. the popup served on its own for a preview).
  const store = globalThis.chrome?.storage?.local;

  const MARK_PX = 24;
  const WORDMARK_PX = 24; // 2px pixels: caps are 16px of it

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

  const dots = Core.PALETTES.map(p => {
    const dot = el('button', {
      type: 'button', className: 'accent-dot', title: p.name,
      dataset: { accent: p.id }, 'aria-label': `${p.name} colour`, 'aria-pressed': 'false',
    });
    dot.style.setProperty('--dot', p.accent);
    return dot;
  });
  $('accents').append(...dots);

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

    const count = data[S.COUNT];
    if (loaded) countEl.textContent = (Number.isFinite(count) ? count : 0).toLocaleString();
  }

  function update(changes) {
    data = { ...data, ...changes };
    settings = Core.readSettings(data);
    render();
  }

  // Write to storage and show the change right away.
  function save(changes) {
    update(changes);
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
  for (const dot of dots) dot.addEventListener('click', () => save({ [S.ACCENT]: dot.dataset.accent }));

  // ── Load ──────────────────────────────────────────────

  // Turn on the colour transition only after the stored colour is painted.
  const ready = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('ready')));

  render();
  if (!store) {
    ready();
    return;
  }
  store.get(null, all => {
    loaded = true;
    update(all || {});
    ready();
  });
  globalThis.chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    const values = {};
    for (const [k, { newValue }] of Object.entries(changes)) values[k] = newValue;
    update(values);
  });
})();
