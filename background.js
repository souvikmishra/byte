// Service worker: initialises storage on first install and keeps the toolbar
// icon in the chosen accent colour. Chrome loads the libs with importScripts;
// Firefox loads them through manifest background.scripts.
if (typeof importScripts === 'function') importScripts('lib/core.js', 'lib/mark.js');

async function syncToolbarIcon() {
  try {
    const key = ByteCore.STORAGE.ACCENT;
    const stored = await chrome.storage.local.get(key);
    const accent = ByteCore.paletteFor(stored[key]).accent;
    const image = px => new ImageData(ByteMark.markPixels(px, accent), px, px);
    await chrome.action.setIcon({ imageData: { 16: image(16), 32: image(32) } });
  } catch (e) {
    console.warn('BYTE: could not update the toolbar icon', e);
  }
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== 'install') { syncToolbarIcon(); return; }
  Promise.resolve(chrome.storage.local.set({
    byte_hide_shorts: true,
    byte_paused: false,
    byte_channel_bar: true,
    byte_accent: 'lime',
    byte_count: 0,
    byte_grid_columns: 3,
    byte_hide_thumbs: false,
    byte_hide_promos: true,
    byte_miniplayer: true,
  })).then(syncToolbarIcon);
});

chrome.runtime.onStartup.addListener(syncToolbarIcon);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ByteCore.STORAGE.ACCENT in changes) syncToolbarIcon();
});
