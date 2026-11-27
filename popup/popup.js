'use strict';

const toggleEnabled = document.getElementById('toggle-enabled');
const toggleThumbs  = document.getElementById('toggle-thumbs');
const togglePromos  = document.getElementById('toggle-promos');
const toggleMiniplayer = document.getElementById('toggle-miniplayer');
const sessionCountEl = document.getElementById('session-count');
const totalCountEl   = document.getElementById('total-count');
const gridCountEl    = document.getElementById('grid-count');
const gridDec        = document.getElementById('grid-dec');
const gridInc        = document.getElementById('grid-inc');

const GRID_MIN = 3;

function fmt(n) {
  return typeof n === 'number' ? n.toLocaleString() : '—';
}

function renderStepper(n) {
  gridCountEl.textContent = n;
  gridDec.disabled = n <= GRID_MIN;
}

// ── Load persisted settings ───────────────────────────

chrome.storage.local.get(
  ['byte_hide_shorts', 'byte_count', 'byte_grid_columns', 'byte_hide_thumbs', 'byte_hide_promos', 'byte_miniplayer'],
  (data) => {
    const enabled = data.byte_hide_shorts !== false;
    const cols    = data.byte_grid_columns ?? GRID_MIN;
    const thumbs  = data.byte_hide_thumbs === true;
    const promos  = data.byte_hide_promos !== false;
    const miniplayer = data.byte_miniplayer !== false;

    toggleEnabled.checked = enabled;
    toggleThumbs.checked  = thumbs;
    togglePromos.checked  = promos;
    toggleMiniplayer.checked = miniplayer;
    totalCountEl.textContent = fmt(data.byte_count || 0);
    renderStepper(cols);
  }
);

// ── Pull session count from the active tab ────────────

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
    sessionCountEl.textContent = '—';
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' }, (res) => {
    if (chrome.runtime.lastError || !res) { sessionCountEl.textContent = '0'; return; }
    sessionCountEl.textContent = fmt(res.sessionBlocked);
  });
});

// ── Block Shorts toggle ───────────────────────────────

toggleEnabled.addEventListener('change', () => {
  const enabled = toggleEnabled.checked;
  chrome.storage.local.set({ byte_hide_shorts: enabled });
});

// ── Hide thumbnails toggle ────────────────────────────

toggleThumbs.addEventListener('change', () => {
  const enabled = toggleThumbs.checked;
  chrome.storage.local.set({ byte_hide_thumbs: enabled });
});

// ── Hide promo sections toggle ────────────────────────

togglePromos.addEventListener('change', () => {
  const enabled = togglePromos.checked;
  chrome.storage.local.set({ byte_hide_promos: enabled });
});

// ── Mini player on browse toggle ──────────────────────

toggleMiniplayer.addEventListener('change', () => {
  const enabled = toggleMiniplayer.checked;
  chrome.storage.local.set({ byte_miniplayer: enabled });
});

// ── Grid column stepper ───────────────────────────────

function setGridColumns(n) {
  renderStepper(n);
  chrome.storage.local.set({ byte_grid_columns: n });
}

gridDec.addEventListener('click', () => {
  const current = parseInt(gridCountEl.textContent, 10);
  if (current > GRID_MIN) setGridColumns(current - 1);
});

gridInc.addEventListener('click', () => {
  setGridColumns(parseInt(gridCountEl.textContent, 10) + 1);
});
