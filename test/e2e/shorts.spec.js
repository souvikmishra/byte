const { test, expect } = require('./fixtures');
const yt = require('./youtube');
const Core = require('../../lib/core.js');

// Signed-out, fresh profiles get an empty home feed ("Try searching to get
// started"), so on home only the sidebar entry can be checked. Search results
// reliably contain Shorts shelves.
const SEARCH_WITH_SHORTS = 'cat';

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

  test('known gap: emptied Shorts shelves on search still show their header', async ({ page }) => {
    // YouTube's newer search shelves (grid-shelf-view-model) aren't in
    // SHORTS_SELECTORS: the cards inside are hidden but the "Shorts" title and
    // "Show more" strip stay. Marked expected-to-fail so the suite goes red
    // (unexpected pass) once this is fixed or YouTube changes.
    test.fail();
    await yt.gotoSearch(page, SEARCH_WITH_SHORTS);
    const shelves = page.locator('grid-shelf-view-model:has(ytm-shorts-lockup-view-model-v2)');
    await expect(shelves.first()).toBeAttached();
    const visible = await shelves.evaluateAll(els => els.filter(el => el.checkVisibility()).length);
    expect(visible).toBe(0);
  });
});
