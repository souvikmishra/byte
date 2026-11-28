const { test, expect } = require('./fixtures');
const yt = require('./youtube');

// A channel's Videos tab uses the same rich grid as home and Subscriptions,
// and has content for signed-out users. The channel bar is attached on any
// rich-grid page, even when its cards have no channel links.
const GRID_PAGE = '/@YouTube/videos';

// Marks the main world so a test can prove the tab was never reloaded.
async function markNoReload(page) {
  await page.evaluate(() => { window.__byteNoReload = true; });
  return async () => expect(await page.evaluate(() => window.__byteNoReload)).toBe(true);
}

const rootAccent = popup =>
  popup.evaluate(() => document.documentElement.style.getPropertyValue('--accent'));

test.describe('Popup', () => {
  test('shows the install defaults', async ({ page, extension }) => {
    await page.goto(extension.popupUrl);
    await expect(page.locator('#shorts-count')).toHaveText('0');
    await expect(page.locator('#toggle-shorts')).toBeChecked();
    await expect(page.locator('#toggle-promos')).toBeChecked();
    await expect(page.locator('#toggle-miniplayer')).toBeChecked();
    await expect(page.locator('#toggle-channelBar')).toBeChecked();
    await expect(page.locator('#toggle-thumbs')).not.toBeChecked();
    await expect(page.locator('#grid-count')).toHaveText('3');
    await expect(page.locator('#grid-dec')).toBeDisabled();
    await expect(page.locator('[data-accent="lime"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-accent="cobalt"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#theme')).toHaveValue('system');
    await expect(page.locator('#pause')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#pause')).toHaveAttribute('aria-label', 'Pause BYTE');
    await expect(page.locator('body')).not.toHaveClass(/\bpaused\b/);
  });

  test('Hide Shorts only controls Shorts', async ({ page, extension }) => {
    await yt.gotoSearch(page, 'cat');
    await expect(page.locator(yt.SEL.shortsLockup).first()).toBeAttached();
    expect(await yt.visibleShortsLinkCount(page)).toBe(0);
    const promoStyle = page.locator('style#byte-promo-style');
    await expect(promoStyle).toBeAttached();
    const assertNoReload = await markNoReload(page);

    const popup = await extension.openPopup(page);
    await popup.locator('#toggle-shorts').click();
    await expect.poll(() => yt.visibleShortsLinkCount(page)).toBeGreaterThan(0);
    await expect(promoStyle).toBeAttached();
    expect((await extension.storageIn(popup)).byte_hide_shorts).toBe(false);

    await popup.locator('#toggle-shorts').click();
    await expect.poll(() => yt.visibleShortsLinkCount(page)).toBe(0);
    expect((await extension.storageIn(popup)).byte_hide_shorts).toBe(true);
    await assertNoReload();
  });

  test('Pause turns everything off and Resume brings it back', async ({ page, extension }) => {
    await yt.gotoYouTube(page, GRID_PAGE);
    const changes = ['style#byte-grid-style', 'style#byte-promo-style', '#byte-insight']
      .map(sel => page.locator(sel));
    for (const el of changes) await expect(el).toBeAttached({ timeout: 30_000 });

    const popup = await extension.openPopup(page);
    const pause = popup.locator('#pause');
    await pause.click();
    for (const el of changes) await expect(el).not.toBeAttached();
    await expect(popup.locator('body')).toHaveClass(/\bpaused\b/);
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await expect(pause).toHaveAttribute('aria-label', 'Resume BYTE');
    await expect(popup.locator('#rows')).toHaveAttribute('inert', '');
    expect((await extension.storageIn(popup)).byte_paused).toBe(true);

    await pause.click();
    for (const el of changes) await expect(el).toBeAttached({ timeout: 30_000 });
    await expect(popup.locator('body')).not.toHaveClass(/\bpaused\b/);
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await expect(pause).toHaveAttribute('aria-label', 'Pause BYTE');
    await expect(popup.locator('#rows')).not.toHaveAttribute('inert');
    expect((await extension.storageIn(popup)).byte_paused).toBe(false);
  });

  test('choosing a colour saves it and re-tints the popup', async ({ page, extension }) => {
    await page.goto(extension.popupUrl);
    await expect(page.locator('#shorts-count')).not.toHaveText('—');
    expect(await rootAccent(page)).toBe('#C6F135');

    await page.locator('[data-accent="cobalt"]').click();
    await expect.poll(async () => (await extension.storageIn(page)).byte_accent).toBe('cobalt');
    expect(await rootAccent(page)).toBe('#3D5AFE');
    await expect(page.locator('[data-accent="cobalt"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-accent="lime"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#mark svg')).toHaveAttribute('fill', '#3D5AFE');

    // Reopening the popup keeps the colour.
    await page.reload();
    await expect(page.locator('[data-accent="cobalt"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await rootAccent(page)).toBe('#3D5AFE');
  });

  test('theme select saves and applies', async ({ page, extension }) => {
    await page.goto(extension.popupUrl);
    await expect(page.locator('#shorts-count')).not.toHaveText('—');
    const root = page.locator('html');
    await expect(root).not.toHaveAttribute('data-theme', /.*/);

    await page.locator('#theme').selectOption('dark');
    await expect.poll(async () => (await extension.storageIn(page)).byte_theme).toBe('dark');
    await expect(root).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(page.locator('#theme')).toHaveValue('dark');
    await expect(root).toHaveAttribute('data-theme', 'dark');

    await page.locator('#theme').selectOption('system');
    await expect.poll(async () => (await extension.storageIn(page)).byte_theme).toBe('system');
    await expect(root).not.toHaveAttribute('data-theme', /.*/);
  });

  test('Hide thumbnails switch hides thumbnails and adds durations', async ({ page, extension }) => {
    await yt.gotoYouTube(page, GRID_PAGE);
    const thumbs = page.locator(`${yt.SEL.gridItem} ${yt.SEL.lockupThumbnail}`);
    await expect(thumbs.first()).toBeVisible();

    const popup = await extension.openPopup(page);
    await popup.locator('#toggle-thumbs').click();
    await expect(thumbs.first()).toBeHidden();
    await expect(page.locator(`${yt.SEL.gridItem} .byte-injected`).first()).toBeVisible();
    expect((await extension.storageIn(popup)).byte_hide_thumbs).toBe(true);

    await popup.locator('#toggle-thumbs').click();
    await expect(thumbs.first()).toBeVisible();
    await expect(page.locator('.byte-injected')).toHaveCount(0);
    expect((await extension.storageIn(popup)).byte_hide_thumbs).toBe(false);
  });

  test('Hide promos switch adds and removes the promo style', async ({ page, extension }) => {
    // Signed-out pages don't reliably have promo sections, so this checks that
    // the style is toggled, not that a real promo disappears.
    await yt.gotoYouTube(page, GRID_PAGE);
    const style = page.locator('style#byte-promo-style');
    await expect(style).toBeAttached();

    const popup = await extension.openPopup(page);
    await popup.locator('#toggle-promos').click();
    await expect(style).not.toBeAttached();
    expect((await extension.storageIn(popup)).byte_hide_promos).toBe(false);

    await popup.locator('#toggle-promos').click();
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

  test('Channel bar switch removes the bar', async ({ page, extension }) => {
    await yt.gotoYouTube(page, GRID_PAGE);
    const bar = page.locator('#byte-insight');
    await expect(bar).toBeAttached({ timeout: 30_000 });

    const popup = await extension.openPopup(page);
    await popup.locator('#toggle-channelBar').click();
    await expect(bar).not.toBeAttached();
    expect((await extension.storageIn(popup)).byte_channel_bar).toBe(false);

    await popup.locator('#toggle-channelBar').click();
    await expect(bar).toBeAttached({ timeout: 30_000 });
    expect((await extension.storageIn(popup)).byte_channel_bar).toBe(true);
  });
});
