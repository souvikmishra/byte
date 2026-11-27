const { test, expect } = require('./fixtures');
const yt = require('./youtube');

const GRID_PAGE = '/@YouTube/videos';

test.describe('Grid columns', () => {
  for (const n of [3, 5]) {
    test(`stored setting of ${n} columns applies on page load`, async ({ page, extension }) => {
      await extension.setStorage({ byte_grid_columns: n });
      await yt.gotoYouTube(page, GRID_PAGE);
      expect(await yt.gridItemsPerRow(page, n * 3)).toBe(n);
    });
  }
});

test.describe('Watch page', () => {
  test('a video plays with the extension loaded', async ({ page }) => {
    await yt.gotoWatch(page);
    const s = await yt.playerState(page);
    expect(s.ad).toBe(false);
    expect(s.paused).toBe(false);
  });
});

test.describe('Channel bar', () => {
  test('channel bar: loop chip in the accent, switch removes it', async ({ page, extension }) => {
    await yt.gotoYouTube(page, yt.CHANNEL_GRID_PAGE);
    await expect(page.locator('#byte-insight .byte-chip-loop').first()).toBeAttached({ timeout: 30_000 });

    await extension.setStorage({ byte_channel_bar: false });
    await yt.gotoYouTube(page, yt.CHANNEL_GRID_PAGE);
    await expect(page.locator('ytd-rich-grid-renderer #contents').first()).toBeAttached();
    await expect(page.locator('#byte-insight')).not.toBeAttached();

    await extension.setStorage({ byte_channel_bar: true });
    await yt.gotoYouTube(page, yt.CHANNEL_GRID_PAGE);
    await expect(page.locator('#byte-insight')).toBeAttached({ timeout: 30_000 });
  });
});
