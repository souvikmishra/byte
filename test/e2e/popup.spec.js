const { test, expect } = require('./fixtures');
const yt = require('./youtube');

// A channel's Videos tab uses the same rich grid as home and Subscriptions,
// and has content for signed-out users.
const GRID_PAGE = '/@YouTube/videos';

const toggle = (popup, id) => popup.locator(`label[for="${id}"]`);

// Marks the main world so a test can prove the tab was never reloaded.
async function markNoReload(page) {
  await page.evaluate(() => { window.__byteNoReload = true; });
  return async () => expect(await page.evaluate(() => window.__byteNoReload)).toBe(true);
}

test.describe('Popup', () => {
  test('shows the install defaults', async ({ page, extension }) => {
    await page.goto(extension.popupUrl);
    await expect(page.locator('#toggle-enabled')).toBeChecked();
    await expect(page.locator('#toggle-thumbs')).not.toBeChecked();
    await expect(page.locator('#toggle-promos')).toBeChecked();
    await expect(page.locator('#grid-count')).toHaveText('3');
    await expect(page.locator('#grid-dec')).toBeDisabled();
  });

  test('Block Shorts toggle applies to the open tab without a reload', async ({ page, extension }) => {
    await yt.gotoSearch(page, 'cat');
    await expect(page.locator(yt.SEL.shortsLockup).first()).toBeAttached();
    expect(await yt.visibleShortsLinkCount(page)).toBe(0);
    const assertNoReload = await markNoReload(page);

    const popup = await extension.openPopup(page);
    await toggle(popup, 'toggle-enabled').click();
    await expect.poll(() => yt.visibleShortsLinkCount(page)).toBeGreaterThan(0);
    expect((await extension.storageIn(popup)).byte_hide_shorts).toBe(false);

    await toggle(popup, 'toggle-enabled').click();
    await expect.poll(() => yt.visibleShortsLinkCount(page)).toBe(0);
    expect((await extension.storageIn(popup)).byte_hide_shorts).toBe(true);
    await assertNoReload();
  });

  test('Hide thumbnails toggle hides thumbnails and adds durations', async ({ page, extension }) => {
    await yt.gotoYouTube(page, GRID_PAGE);
    const thumbs = page.locator(`${yt.SEL.gridItem} ${yt.SEL.lockupThumbnail}`);
    await expect(thumbs.first()).toBeVisible();

    const popup = await extension.openPopup(page);
    await toggle(popup, 'toggle-thumbs').click();
    await expect(thumbs.first()).toBeHidden();
    await expect(page.locator(`${yt.SEL.gridItem} .byte-injected`).first()).toBeVisible();
    expect((await extension.storageIn(popup)).byte_hide_thumbs).toBe(true);

    await toggle(popup, 'toggle-thumbs').click();
    await expect(thumbs.first()).toBeVisible();
    await expect(page.locator('.byte-injected')).toHaveCount(0);
    expect((await extension.storageIn(popup)).byte_hide_thumbs).toBe(false);
  });

  test('Hide promo sections toggle adds and removes the promo style', async ({ page, extension }) => {
    // Signed-out pages don't reliably have promo sections, so this checks that
    // the style is toggled, not that a real promo disappears.
    await yt.gotoYouTube(page, GRID_PAGE);
    const style = page.locator('style#byte-promo-style');
    await expect(style).toBeAttached();

    const popup = await extension.openPopup(page);
    await toggle(popup, 'toggle-promos').click();
    await expect(style).not.toBeAttached();
    expect((await extension.storageIn(popup)).byte_hide_promos).toBe(false);

    await toggle(popup, 'toggle-promos').click();
    await expect(style).toBeAttached();
    expect((await extension.storageIn(popup)).byte_hide_promos).toBe(true);
  });

  test('Videos-per-row stepper changes the grid live', async ({ page, extension }) => {
    await yt.gotoYouTube(page, GRID_PAGE);
    expect(await yt.gridItemsPerRow(page)).toBe(3);
    const assertNoReload = await markNoReload(page);

    const popup = await extension.openPopup(page);
    await popup.locator('#grid-inc').click();
    await expect(popup.locator('#grid-count')).toHaveText('4');
    await expect.poll(() => yt.gridItemsPerRow(page)).toBe(4);
    expect((await extension.storageIn(popup)).byte_grid_columns).toBe(4);

    await popup.locator('#grid-dec').click();
    await expect(popup.locator('#grid-count')).toHaveText('3');
    await expect.poll(() => yt.gridItemsPerRow(page)).toBe(3);
    await expect(popup.locator('#grid-dec')).toBeDisabled();
    await assertNoReload();
  });
});
