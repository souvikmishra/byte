const { test, expect } = require('./fixtures');
const yt = require('./youtube');
const Core = require('../../lib/core.js');

// Signed-out, fresh profiles get an empty home feed ("Try searching to get
// started"), so on home only the sidebar entry can be checked. Search results
// reliably contain Shorts shelves.
const SEARCH_WITH_SHORTS = 'cat';

function visibleCount(locator) {
  return locator.evaluateAll(els => els.filter(el => el.checkVisibility()).length);
}

async function loadMoreResults(page) {
  const before = await page.locator(yt.SEL.searchResult).count();
  await expect.poll(async () => {
    await page.mouse.wheel(0, 4000);
    return page.locator(yt.SEL.searchResult).count();
  }, { message: 'more search results loaded after scrolling' }).toBeGreaterThan(before);
}

test.describe('Shorts hidden', () => {
  test('search: Shorts are on the page but none are visible, including lazily loaded ones', async ({ page }) => {
    await yt.gotoSearch(page, SEARCH_WITH_SHORTS);
    await expect(page.locator(yt.SEL.shortsLockup).first()).toBeAttached();
    expect(await yt.visibleShortsLinkCount(page)).toBe(0);

    await loadMoreResults(page);
    expect(await yt.visibleShortsLinkCount(page)).toBe(0);
  });

  test('control: with Block Shorts off, the same search shows Shorts', async ({ page, extension }) => {
    // Proves the test above can fail: the page really has visible Shorts.
    await extension.setStorage({ byte_enabled: false });
    await yt.gotoSearch(page, SEARCH_WITH_SHORTS);
    await expect.poll(() => yt.visibleShortsLinkCount(page)).toBeGreaterThan(0);
  });

  test('home: the Shorts sidebar entry is hidden', async ({ page }) => {
    await yt.gotoYouTube(page, '/');
    await expect(page.locator('ytd-guide-entry-renderer').nth(2)).toBeVisible();
    await expect(page.locator(yt.SEL.guideShortsEntry).first()).toBeAttached();
    await expect(page.locator(yt.SEL.guideShortsEntry).first()).toBeHidden();
  });

  test('control: with Block Shorts off, the Shorts sidebar entry is visible', async ({ page, extension }) => {
    await extension.setStorage({ byte_enabled: false });
    await yt.gotoYouTube(page, '/');
    await expect(page.locator(yt.SEL.guideShortsEntry).first()).toBeVisible();
  });

  test('every Shorts and promo selector is valid CSS in Chromium', async ({ page }) => {
    await yt.gotoYouTube(page, '/');
    const invalid = await page.evaluate(selectors => selectors.filter(sel => {
      try { document.querySelectorAll(sel); return false; } catch { return true; }
    }), [...Core.SHORTS_SELECTORS, ...Core.PROMO_SELECTORS]);
    expect(invalid).toEqual([]);

    // One bad selector drops the whole joined rule, so check that the browser
    // actually parsed the injected style sheets.
    const ruleCounts = await page.evaluate(() => ['byte-style', 'byte-promo-style']
      .map(id => document.getElementById(id)?.sheet?.cssRules.length ?? null));
    expect(ruleCounts).toEqual([1, 1]);
  });

  test('search: Shorts shelves are on the page but hidden, regular results around them are not', async ({ page }) => {
    await yt.gotoSearch(page, SEARCH_WITH_SHORTS);
    const shelves = page.locator(yt.SEL.shortsShelf);
    await expect(shelves.first()).toBeAttached();
    expect(await visibleCount(shelves)).toBe(0);

    // Guards against an over-broad selector (e.g. hiding the section that
    // wraps the shelf): videos next to a hidden shelf must still show.
    const regular = page.locator(yt.SEL.regularVideoResult);
    await expect(regular.first()).toBeVisible();
    const hiddenRegular = await regular.evaluateAll(els => els.filter(el => !el.checkVisibility()).length);
    expect(hiddenRegular).toBe(0);
    const besideShelves = await shelves.evaluateAll((els, card) => new Set(els.flatMap(shelf =>
      [...shelf.parentElement.children].filter(el => el.matches(card) && el.checkVisibility()))).size,
    yt.SEL.videoResultCard);
    expect(besideShelves).toBeGreaterThan(0);
  });

  test('control: with Block Shorts off, the Shorts shelves on search are visible', async ({ page, extension }) => {
    await extension.setStorage({ byte_enabled: false });
    await yt.gotoSearch(page, SEARCH_WITH_SHORTS);
    await expect(page.locator(yt.SEL.shortsShelf).first()).toBeVisible();
  });
});
