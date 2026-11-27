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
