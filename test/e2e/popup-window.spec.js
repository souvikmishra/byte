const { test, expect } = require('./fixtures');
const yt = require('./youtube');

// A channel's Videos tab: a rich grid with thumbnails for signed-out users.
const GRID_PAGE = '/@YouTube/videos';

// Samples the visible Shorts links on every animation frame for `ms` and
// returns the most it saw, so a single-frame reveal can't slip through.
// Same check as yt.visibleShortsLinkCount.
function maxVisibleShorts(page, ms = 1500) {
  return page.evaluate(({ sel, ms }) => new Promise(resolve => {
    let max = 0;
    const end = performance.now() + ms;
    const tick = () => {
      const n = [...document.querySelectorAll(sel)].filter(el => el.checkVisibility()).length;
      if (n > max) max = n;
      if (performance.now() < end) requestAnimationFrame(tick);
      else resolve(max);
    };
    requestAnimationFrame(tick);
  }), { sel: yt.SEL.shortsLink, ms });
}

// Opens the popup for `page` and waits until it has connected to the tab.
async function openConnected(extension, page) {
  const popup = await extension.openPopup(page);
  await expect(popup.locator('#compare')).toBeEnabled();
  return popup;
}

test.describe('Popup window', () => {
  test('fallback outside YouTube', async ({ context, extension }) => {
    const blank = await context.newPage();
    const popup = await extension.openPopup(blank);
    await expect(popup.locator('#mirror-headline')).toHaveText('Nothing to measure here');
    await expect(popup.locator('#mirror-sub')).toHaveText('Open YouTube to see what your feed is made of.');
    await expect(popup.locator('#compare')).toBeDisabled();

    await popup.locator('#toggle-promos').click();
    await expect.poll(async () => (await extension.storageIn(popup)).byte_hide_promos).toBe(false);
  });

  test('fallback on a YouTube page that isn’t Home', async ({ page, extension }) => {
    await yt.gotoYouTube(page, GRID_PAGE);
    const popup = await openConnected(extension, page);
    await expect(popup.locator('#mirror-headline')).toHaveText('Nothing to measure here');
    await expect(popup.locator('#mirror-sub'))
      .toHaveText('Open your YouTube home page to see which channels fill your feed.');
  });

  test('hold to compare shows Shorts and the summary; release hides them', async ({ page, extension }) => {
    await yt.gotoSearch(page, 'cat');
    await expect.poll(() => page.locator(yt.SEL.shortsLockup).count()).toBeGreaterThan(0);
    expect(await yt.visibleShortsLinkCount(page)).toBe(0);

    const popup = await openConnected(extension, page);
    const compare = popup.locator('#compare');
    await compare.dispatchEvent('pointerdown');
    await expect.poll(() => yt.visibleShortsLinkCount(page)).toBeGreaterThan(0);
    await expect(popup.locator('#summary')).toContainText('BYTE changes this page: hides Shorts');

    await compare.dispatchEvent('pointerup');
    await expect.poll(() => yt.visibleShortsLinkCount(page)).toBe(0);
  });

  test('closing the popup while holding restores the page', async ({ page, extension }) => {
    await yt.gotoSearch(page, 'cat');
    await expect.poll(() => page.locator(yt.SEL.shortsLockup).count()).toBeGreaterThan(0);

    const popup = await openConnected(extension, page);
    await popup.locator('#compare').dispatchEvent('pointerdown');
    await expect.poll(() => yt.visibleShortsLinkCount(page)).toBeGreaterThan(0);

    await popup.close();
    await expect.poll(() => yt.visibleShortsLinkCount(page)).toBe(0);
  });

  test('hovering Hide Shorts never reveals hidden Shorts', async ({ page, extension }) => {
    await yt.gotoSearch(page, 'cat');
    await expect.poll(() => page.locator(yt.SEL.shortsLockup).count()).toBeGreaterThan(0);

    const popup = await openConnected(extension, page);
    const row = popup.locator('.row[data-feature=shorts]');
    await row.hover();
    await expect(page.locator('style#byte-highlight')).toBeAttached();
    expect(await maxVisibleShorts(page)).toBe(0);

    // Control: with Hide Shorts off, the same sampler sees Shorts.
    await popup.locator('#toggle-shorts').click();
    await expect.poll(() => yt.visibleShortsLinkCount(page)).toBeGreaterThan(0);
    await row.hover();
    expect(await maxVisibleShorts(page)).toBeGreaterThan(0);
  });

  test('hovering Hide thumbnails outlines thumbnails on the page', async ({ page, extension }) => {
    await yt.gotoYouTube(page, GRID_PAGE);
    const thumb = page.locator(yt.SEL.lockupThumbnail).first();
    await expect(thumb).toBeVisible();
    const outline = () => thumb.evaluate(el => getComputedStyle(el).outlineStyle);

    const popup = await openConnected(extension, page);
    await popup.locator('.row[data-feature=thumbs]').hover();
    await expect.poll(outline).toBe('dashed');

    await popup.locator('#mark').hover();
    await expect.poll(outline).toBe('none');
  });
});
