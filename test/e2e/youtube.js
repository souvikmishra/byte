// Helpers for driving live youtube.com. YouTube's DOM changes without notice:
// keep selectors here, wait on conditions (never fixed sleeps), and treat
// consent pages and ads as normal states rather than errors.

const { expect } = require('@playwright/test');

const ORIGIN = 'https://www.youtube.com';

// A long, stable public video (Big Buck Bunny, Blender Foundation).
const TEST_VIDEO_ID = 'aqz-KE-bpKQ';

const SEL = {
  app: 'ytd-app',
  searchInput: 'yt-searchbox input, ytd-searchbox input#search',
  searchButton: 'yt-searchbox button.ytSearchboxComponentSearchButton, ytd-searchbox button#search-icon-legacy',
  searchResult: 'ytd-search ytd-video-renderer, ytd-search yt-lockup-view-model',
  shortsLockup: 'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2',
  shortsLink: 'a[href*="/shorts/"]',
  guideShortsEntry: 'ytd-guide-entry-renderer:has(a[title="Shorts"]), ytd-guide-entry-renderer:has(a[href^="/shorts"])',
  gridItem: 'ytd-rich-grid-renderer #contents > ytd-rich-item-renderer',
  player: '#movie_player',
  skipAd: '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern',
};

// Clicks through a cookie-consent page or dialog if YouTube shows one
// (EU/UK regions). Does nothing elsewhere.
async function handleConsent(page) {
  const url = new URL(page.url());
  if (/^consent\.(youtube|google)\./.test(url.hostname)) {
    await page.getByRole('button', { name: /reject all|accept all/i }).first().click();
    await page.waitForURL(u => u.hostname === 'www.youtube.com');
  }
  const dialog = page.locator('ytd-consent-bump-v2-lightbox');
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: /reject all|accept all/i }).first().click();
    await expect(dialog).toBeHidden();
  }
}

async function gotoYouTube(page, pathAndQuery) {
  await page.goto(ORIGIN + pathAndQuery, { waitUntil: 'domcontentloaded' });
  await handleConsent(page);
  await expect(page.locator(SEL.app)).toBeAttached();
}

async function gotoSearch(page, query) {
  await gotoYouTube(page, `/results?search_query=${encodeURIComponent(query)}`);
  await expect(page.locator(SEL.searchResult).first()).toBeVisible();
}

// Number of Shorts links a user could see right now.
function visibleShortsLinkCount(page) {
  return page.locator(SEL.shortsLink).evaluateAll(els => els.filter(el => el.checkVisibility()).length);
}

// Waits until the rich grid has at least `minItems` laid-out items and returns
// how many sit in the first row.
async function gridItemsPerRow(page, minItems = 12) {
  await expect.poll(() => page.locator(SEL.gridItem).count(), { message: 'grid items loaded' })
    .toBeGreaterThanOrEqual(minItems);
  return page.locator(SEL.gridItem).evaluateAll(items => {
    const shown = items.filter(el => el.checkVisibility());
    const top = shown[0].getBoundingClientRect().top;
    return shown.filter(el => Math.abs(el.getBoundingClientRect().top - top) < 2).length;
  });
}

async function playerState(page) {
  return page.evaluate(() => {
    const player = document.querySelector('#movie_player');
    const video = player && player.querySelector('video');
    return {
      hasPlayer: !!player,
      ad: !!player && player.classList.contains('ad-showing'),
      paused: video ? video.paused : null,
      time: video ? video.currentTime : null,
    };
  });
}

// Waits until the main video (not an ad) is playing. Clicks "Skip" on
// skippable ads and waits out the rest.
async function waitForVideoPlaying(page, { timeout = 90_000 } = {}) {
  let lastTime = null;
  await expect.poll(async () => {
    const skip = page.locator(SEL.skipAd).first();
    if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {});
    const s = await playerState(page);
    if (!s.hasPlayer || s.ad || s.paused !== false) { lastTime = null; return 'waiting'; }
    const advancing = lastTime !== null && s.time > lastTime;
    lastTime = s.time;
    return advancing ? 'playing' : 'waiting';
  }, { timeout, intervals: [250, 500, 1000], message: 'main video playing (ads skipped or finished)' })
    .toBe('playing');
}

async function gotoWatch(page, videoId = TEST_VIDEO_ID) {
  await gotoYouTube(page, `/watch?v=${videoId}`);
  await waitForVideoPlaying(page);
}

module.exports = {
  ORIGIN, TEST_VIDEO_ID, SEL,
  handleConsent, gotoYouTube, gotoSearch, gotoWatch,
  visibleShortsLinkCount, gridItemsPerRow, playerState, waitForVideoPlaying,
};
