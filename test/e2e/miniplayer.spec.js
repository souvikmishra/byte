const { test, expect } = require('./fixtures');
const yt = require('./youtube');

test.describe('Mini player on browse', () => {
  test('search from a playing video: mini player keeps playing and results load', async ({ page }) => {
    await yt.gotoWatch(page);
    const before = await yt.playerVideo(page);

    const input = page.locator(yt.SEL.searchInput).first();
    await input.fill('lofi hip hop');
    await input.press('Enter');

    await page.waitForURL(/\/results\?search_query=lofi\+hip\+hop/);
    await expect(page.locator(yt.SEL.searchResult).first()).toBeVisible();
    expect(await yt.miniplayerActive(page)).toBe(true);
    await yt.expectStillPlaying(page, before);
  });
});
