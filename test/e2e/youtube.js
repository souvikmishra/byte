// Helpers for driving live youtube.com. YouTube's DOM changes without notice:
// keep selectors here, wait on conditions (never fixed sleeps), and treat
// consent pages and ads as normal states rather than errors.

const { expect } = require('@playwright/test');

const ORIGIN = 'https://www.youtube.com';

// A long, stable public video (Big Buck Bunny, Blender Foundation).
const TEST_VIDEO_ID = 'aqz-KE-bpKQ';

const SEL = {
  app: 'ytd-app',
  // yt-searchbox also contains a hidden <input type=file> for image search.
  searchInput: 'yt-searchbox input[name="search_query"], ytd-searchbox input#search',
  searchButton: 'yt-searchbox button.ytSearchboxComponentSearchButton, ytd-searchbox button#search-icon-legacy',
  searchSuggestion: 'yt-searchbox [role="listbox"] [role="option"], ytd-searchbox [role="listbox"] [role="option"]',
  searchResult: 'ytd-search ytd-video-renderer, ytd-search yt-lockup-view-model',
  searchResultVideoLink: 'ytd-search a#video-title[href^="/watch"], ytd-search yt-lockup-view-model a[href^="/watch"]',
  shortsLockup: 'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2',
  // Search shelves with a "Shorts" header; the same tag can hold other content.
  shortsShelf: 'grid-shelf-view-model:has(ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2)',
  // A search result card. YouTube serves either the older ytd-video-renderer or
  // the newer yt-lockup-view-model, sometimes switching between runs.
  videoResultCard: 'ytd-video-renderer, yt-lockup-view-model',
  regularVideoResult: 'ytd-search :is(ytd-video-renderer, yt-lockup-view-model):not(:has(a[href*="/shorts/"]))',
  shortsLink: 'a[href*="/shorts/"]',
  guideShortsEntry: 'ytd-guide-entry-renderer:has(a[title="Shorts"]), ytd-guide-entry-renderer:has(a[href^="/shorts"])',
  gridItem: 'ytd-rich-grid-renderer #contents > ytd-rich-item-renderer',
  // The thumbnail link inside a yt-lockup-view-model card.
  lockupThumbnail: 'a.ytLockupViewModelContentImage',
  channelPage: 'ytd-browse[page-subtype="channels"]',
  player: '#movie_player',
  fullscreenButton: '.ytp-fullscreen-button',
  channelLink: 'ytd-watch-metadata #owner a[href^="/@"]',
  relatedVideo: '#related a[href^="/watch"]',
  guideEntry: 'ytd-guide-entry-renderer',
  guideButton: 'ytd-masthead #guide-button button, ytd-masthead button#guide-button, ytd-masthead yt-icon-button#guide-button',
  guideDrawerLink: href => `tp-yt-app-drawer#guide ytd-guide-entry-renderer a[href="${href}"]`,
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

// Google answers too many automated requests from one network with an
// "unusual traffic" CAPTCHA page instead of YouTube. Fail clearly: nothing in
// the extension is wrong, and retrying right away makes it worse.
async function failIfRateLimited(page) {
  const blocked = /\/sorry\//.test(page.url()) ||
    await page.getByText(/unusual traffic from your computer network/i).count() > 0;
  if (blocked) {
    throw new Error('Google is rate-limiting this network ("unusual traffic" CAPTCHA). ' +
      'Not an extension bug: stop running e2e for 30-60 minutes, then retry.');
  }
}

async function gotoYouTube(page, pathAndQuery) {
  await page.goto(ORIGIN + pathAndQuery, { waitUntil: 'domcontentloaded' });
  await failIfRateLimited(page);
  await handleConsent(page);
  await expect(page.locator(SEL.app)).toBeAttached();
}

// Types a query into the masthead search box and submits it with Enter or
// the search button.
async function search(page, query, { via = 'enter' } = {}) {
  const input = page.locator(SEL.searchInput).first();
  await input.fill(query);
  if (via === 'enter') await input.press('Enter');
  else await page.locator(SEL.searchButton).first().click();
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

// The player's current video id and time, read through YouTube's player API
// on #movie_player (main world). Works for the mini player too: it's the same element.
async function playerVideo(page) {
  return page.evaluate(() => {
    const p = document.querySelector('#movie_player');
    const v = p && p.querySelector('video');
    return {
      id: p && typeof p.getVideoData === 'function' ? p.getVideoData().video_id : null,
      time: v ? v.currentTime : null,
      paused: v ? v.paused : null,
      hasSrc: !!(v && v.src),
    };
  });
}

// Asserts the same video keeps playing: time moves forward and never resets.
async function expectStillPlaying(page, before) {
  await expect.poll(async () => {
    const now = await playerVideo(page);
    return now.id === before.id && now.paused === false && now.time > before.time + 0.5;
  }, { timeout: 15_000, message: `video ${before.id} still playing past ${before.time.toFixed(1)}s` }).toBe(true);
}

// Starts recording every URL the tab shows (path + query), starting with the
// current one. The Navigation API reports each change as it happens
// (pushState, replaceState, back/forward), including YouTube restoring a page
// from its cache without a yt-navigate-* event, so even a brief detour is
// recorded. Read the list with recordedUrls().
async function recordUrls(page) {
  await page.evaluate(() => {
    const path = href => { const u = new URL(href); return u.pathname + u.search; };
    const urls = window.__byteUrls = [path(location.href)];
    navigation.addEventListener('currententrychange', () => {
      const u = path(navigation.currentEntry.url);
      if (urls[urls.length - 1] !== u) urls.push(u);
    });
  });
}

function recordedUrls(page) {
  return page.evaluate(() => window.__byteUrls);
}

function miniplayerActive(page) {
  return page.locator('ytd-app').evaluate(app => app.hasAttribute('miniplayer-is-active'));
}

// Asserts the old behavior: no mini player, and the video that was playing
// stopped (unloaded, paused, or replaced by another video).
async function expectVideoStopped(page, before) {
  await expect.poll(async () => {
    const now = await playerVideo(page);
    const stillPlaying = now.id === before.id && now.paused === false && now.hasSrc;
    return !(await miniplayerActive(page)) && !stillPlaying;
  }, { timeout: 15_000, message: `no mini player, and video ${before.id} no longer playing` }).toBe(true);
}

async function gotoWatch(page, videoId = TEST_VIDEO_ID) {
  await gotoYouTube(page, `/watch?v=${videoId}`);
  await waitForVideoPlaying(page);
}

module.exports = {
  ORIGIN, TEST_VIDEO_ID, SEL,
  handleConsent, failIfRateLimited, gotoYouTube, gotoSearch, gotoWatch, search,
  visibleShortsLinkCount, gridItemsPerRow, playerState, waitForVideoPlaying,
  playerVideo, expectStillPlaying, expectVideoStopped, miniplayerActive,
  recordUrls, recordedUrls,
};
