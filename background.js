// Service worker — initialises storage on first install.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== 'install') return;
  chrome.storage.local.set({
    byte_enabled: true,
    byte_count: 0,
    byte_grid_columns: 3,
    byte_hide_thumbs: false,
    byte_hide_promos: true,
  });
});
