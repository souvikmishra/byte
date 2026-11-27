const { test, expect } = require('./fixtures');
const yt = require('./youtube');

// Checklist: docs/miniplayer-on-browse.md. Each test starts on a playing video.

async function search(page, query, { via = 'enter' } = {}) {
  const input = page.locator(yt.SEL.searchInput).first();
  await input.fill(query);
  if (via === 'enter') await input.press('Enter');
  else await page.locator(yt.SEL.searchButton).first().click();
}

const resultsUrl = query => new RegExp(`/results\\?search_query=${encodeURIComponent(query).replace(/%20/g, '\\+')}`);

async function expectOnResults(page, query) {
  await page.waitForURL(resultsUrl(query));
  await expect(page.locator(yt.SEL.searchResult).first()).toBeVisible();
}

async function expectMiniplayerPlaying(page, before) {
  await expect.poll(() => yt.miniplayerActive(page), { message: 'mini player on' }).toBe(true);
  await yt.expectStillPlaying(page, before);
}

test.describe('Mini player on browse', () => {
  let before;
  test.beforeEach(async ({ page }) => {
    await yt.gotoWatch(page);
    before = await yt.playerVideo(page);
  });

  test('search from a playing video: mini player keeps playing and results load', async ({ page }) => {
    await search(page, 'lofi hip hop');
    await expectOnResults(page, 'lofi hip hop');
    expect(await yt.miniplayerActive(page)).toBe(true);
    await yt.expectStillPlaying(page, before);
  });

  test('search button: same as Enter', async ({ page }) => {
    await search(page, 'jazz piano', { via: 'button' });
    await expectOnResults(page, 'jazz piano');
    await expectMiniplayerPlaying(page, before);
  });

  test('clicking a search suggestion: same as Enter', async ({ page }) => {
    // Typed for real so YouTube opens its suggestion dropdown.
    await page.locator(yt.SEL.searchInput).first().click();
    await page.keyboard.type('never gonna give', { delay: 40 });
    const option = page.locator(yt.SEL.searchSuggestion).filter({ visible: true }).first();
    const query = await option.getAttribute('aria-label');
    await option.click();
    await expectOnResults(page, query);
    await expectMiniplayerPlaying(page, before);
  });

  test('channel name under the video: channel page with the mini player playing', async ({ page }) => {
    const link = page.locator(yt.SEL.channelLink).filter({ visible: true }).last();
    const href = await link.getAttribute('href');
    await link.click();
    await page.waitForURL(url => url.pathname === href);
    await expect(page.locator('ytd-browse[page-subtype="channels"]')).toBeVisible();
    await expectMiniplayerPlaying(page, before);
  });

  test('channel avatar under the video: same as the name', async ({ page }) => {
    const avatar = page.locator(yt.SEL.channelLink).filter({ visible: true }).first();
    const href = await avatar.getAttribute('href');
    await avatar.click();
    await page.waitForURL(url => url.pathname === href);
    await expectMiniplayerPlaying(page, before);
  });

  for (const [name, href] of [['Home', '/'], ['Subscriptions', '/feed/subscriptions']]) {
    test(`sidebar ${name}: ${href} with the mini player playing`, async ({ page }) => {
      await page.locator(yt.SEL.guideButton).first().click();
      const entry = page.locator(yt.SEL.guideDrawerLink(href)).first();
      await expect(entry).toBeVisible();
      await entry.click();
      await page.waitForURL(url => url.pathname === href);
      await expectMiniplayerPlaying(page, before);
    });
  }

  test('related video: normal watch navigation, no mini player', async ({ page }) => {
    const related = page.locator(yt.SEL.relatedVideo).filter({ visible: true }).first();
    const id = new URL(await related.getAttribute('href'), yt.ORIGIN).searchParams.get('v');
    await related.click();
    await page.waitForURL(url => url.pathname === '/watch' && url.searchParams.get('v') === id);
    expect(await yt.miniplayerActive(page)).toBe(false);
    await expect.poll(async () => (await yt.playerVideo(page)).id).toBe(id);
  });

  test('Cmd/Ctrl-click a channel link: opens a new tab, current tab unchanged', async ({ page, context }) => {
    const link = page.locator(yt.SEL.channelLink).filter({ visible: true }).last();
    const href = await link.getAttribute('href');
    const [newTab] = await Promise.all([
      context.waitForEvent('page'),
      link.click({ modifiers: ['ControlOrMeta'] }),
    ]);
    await newTab.waitForURL(url => url.pathname === href);
    expect(new URL(page.url()).pathname).toBe('/watch');
    expect(await yt.miniplayerActive(page)).toBe(false);
    await yt.expectStillPlaying(page, before);
  });

  test('mini player already on, search again: results load and the mini player stays', async ({ page }) => {
    await search(page, 'lofi hip hop');
    await expectOnResults(page, 'lofi hip hop');
    await expectMiniplayerPlaying(page, before);
    const mid = await yt.playerVideo(page);

    await search(page, 'rain sounds');
    await expectOnResults(page, 'rain sounds');
    await expectMiniplayerPlaying(page, mid);
  });

  test('during an ad (simulated): normal navigation, no errors', async ({ page }) => {
    // Real ads can't be forced, so mark the player the way YouTube does while
    // an ad plays and search in the same task, before the player can undo it.
    await page.locator(yt.SEL.searchInput).first().fill('lofi hip hop');
    await page.evaluate(sel => {
      document.querySelector('#movie_player').classList.add('ad-showing');
      document.querySelector(sel).click();
    }, yt.SEL.searchButton);
    await expectOnResults(page, 'lofi hip hop');
    await yt.expectVideoStopped(page, before);
  });

  test('in fullscreen: normal navigation', async ({ page }) => {
    // Playwright's Chromium refuses the Fullscreen API ("not granted"), headless
    // or headed, so this is a manual check. The skip rule itself is unit-tested.
    test.fixme(true, 'Fullscreen API not available under Playwright: check by hand');
    await page.locator(yt.SEL.player).hover(); // show the controls
    await page.locator('.ytp-fullscreen-button').click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement), { message: 'fullscreen on' }).toBe(true);
    const href = await page.locator(yt.SEL.channelLink).first().getAttribute('href');
    // The masthead is hidden in fullscreen; a script click is the closest stand-in.
    await page.evaluate(sel => {
      if (!document.fullscreenElement) throw new Error('left fullscreen early');
      document.querySelector(sel).click();
    }, yt.SEL.channelLink);
    await page.waitForURL(url => url.pathname === href);
    await yt.expectVideoStopped(page, before);
  });

  test('popup toggle off: the old behavior comes back', async ({ page, extension }) => {
    const popup = await extension.openPopup(page);
    await expect(popup.locator('#toggle-miniplayer')).toBeChecked();
    await popup.locator('label[for="toggle-miniplayer"]').click();
    await expect(popup.locator('#toggle-miniplayer')).not.toBeChecked();
    expect((await extension.storageIn(popup)).byte_miniplayer).toBe(false);

    await search(page, 'lofi hip hop');
    await expectOnResults(page, 'lofi hip hop');
    await yt.expectVideoStopped(page, before);
  });
});

test('setting stored as off: search from /watch stops the video like before', async ({ page, extension }) => {
  // Control for the main test: proves YouTube itself doesn't keep playing.
  await extension.setStorage({ byte_miniplayer: false });
  await yt.gotoWatch(page);
  const before = await yt.playerVideo(page);
  await search(page, 'lofi hip hop');
  await expectOnResults(page, 'lofi hip hop');
  await yt.expectVideoStopped(page, before);
});

test('works with Block Shorts off (independent switches)', async ({ page, extension }) => {
  await extension.setStorage({ byte_enabled: false });
  await yt.gotoWatch(page);
  const before = await yt.playerVideo(page);
  await search(page, 'lofi hip hop');
  await expectOnResults(page, 'lofi hip hop');
  await expectMiniplayerPlaying(page, before);
});
