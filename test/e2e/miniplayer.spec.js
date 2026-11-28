const { test, expect } = require('./fixtures');
const yt = require('./youtube');

// Checklist: docs/miniplayer-on-browse.md. Each test starts on a playing video.

// Compares the decoded query, so any spelling of it (spaces as + or %20,
// parentheses in a suggestion) matches.
const resultsUrl = query => url => url.pathname === '/results' && url.searchParams.get('search_query') === query;

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
    await yt.search(page, 'lofi hip hop');
    await expectOnResults(page, 'lofi hip hop');
    expect(await yt.miniplayerActive(page)).toBe(true);
    await yt.expectStillPlaying(page, before);
  });

  test('search button: same as Enter', async ({ page }) => {
    await yt.search(page, 'jazz piano', { via: 'button' });
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

  test('clicking the empty right side of a suggestion row: same as Enter', async ({ page }) => {
    // The row is much wider than its text; people often click the blank part.
    await page.locator(yt.SEL.searchInput).first().click();
    await page.keyboard.type('never gonna give', { delay: 40 });
    const option = page.locator(yt.SEL.searchSuggestion).filter({ visible: true }).first();
    await expect(option).toBeVisible();
    // Measure in one step: the dropdown re-renders while suggestions update.
    const spot = await option.evaluate(o => {
      const row = o.parentElement.getBoundingClientRect();
      const text = o.getBoundingClientRect();
      return { x: row.right - 30, y: row.top + row.height / 2, gap: row.right - text.right, query: o.getAttribute('aria-label') };
    });
    expect(spot.gap, 'row has blank space beside the text').toBeGreaterThan(100);
    await page.mouse.click(spot.x, spot.y);
    await expectOnResults(page, spot.query);
    await expectMiniplayerPlaying(page, before);
  });

  test('keyboard only: Tab to the search button and press Enter', async ({ page }) => {
    await page.locator(yt.SEL.searchInput).first().click();
    await page.keyboard.type('jazz piano', { delay: 40 });
    // Tab goes input -> "Clear search query" -> search button.
    const searchButton = page.locator(yt.SEL.searchButton).first();
    for (let i = 0; i < 4 && !(await searchButton.evaluate(b => b === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(searchButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expectOnResults(page, 'jazz piano');
    await expectMiniplayerPlaying(page, before);
  });

  test('channel name under the video: channel page with the mini player playing', async ({ page }) => {
    const link = page.locator(yt.SEL.channelLink).filter({ visible: true }).last();
    const href = await link.getAttribute('href');
    await link.click();
    await page.waitForURL(url => url.pathname === href);
    await expect(page.locator(yt.SEL.channelPage)).toBeVisible();
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

  test('related video picked while a search waits for the mini player: the video wins', async ({ page }) => {
    const related = page.locator(yt.SEL.relatedVideo).filter({ visible: true }).first();
    const id = new URL(await related.getAttribute('href'), yt.ORIGIN).searchParams.get('v');
    // Search with Enter, then pick the video in the same task, so the click
    // lands while the search is still waiting. Record every URL shown after.
    await yt.recordUrls(page);
    await page.evaluate(({ inputSel, relatedSel }) => {
      const input = document.querySelector(inputSel);
      input.value = 'lofi hip hop';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
      [...document.querySelectorAll(relatedSel)].find(a => a.checkVisibility()).click();
    }, { inputSel: yt.SEL.searchInput, relatedSel: yt.SEL.relatedVideo });
    await page.waitForURL(url => url.pathname === '/watch' && url.searchParams.get('v') === id);
    await expect.poll(async () => (await yt.playerVideo(page)).id).toBe(id);
    // The longest wait for the mini player is 2.5s + 8s; past that, a search
    // that was still pending would have run.
    const start = Date.now();
    await expect.poll(() => Date.now() - start > 12_000, { timeout: 20_000, intervals: [1000] }).toBe(true);
    const urls = await yt.recordedUrls(page);
    expect(urls.some(u => u.startsWith('/results')), `URLs shown: ${urls.join(' ')}`).toBe(false);
    expect(new URL(page.url()).searchParams.get('v')).toBe(id);
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
    await yt.search(page, 'lofi hip hop');
    await expectOnResults(page, 'lofi hip hop');
    await expectMiniplayerPlaying(page, before);
    const mid = await yt.playerVideo(page);

    await yt.search(page, 'rain sounds');
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
    await page.locator(yt.SEL.fullscreenButton).click();
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

    await yt.search(page, 'lofi hip hop');
    await expectOnResults(page, 'lofi hip hop');
    await yt.expectVideoStopped(page, before);
  });
});

test('video opened from a search list: never goes through Home', async ({ page }) => {
  // YouTube's mini player returns to the page the video was opened from. Only
  // a watch page opened directly (new tab, reload, link) falls back to Home.
  await yt.gotoSearch(page, 'big buck bunny');
  await page.locator(yt.SEL.searchResultVideoLink).filter({ visible: true }).first().click();
  await page.waitForURL(/\/watch/);
  await yt.waitForVideoPlaying(page);
  const before = await yt.playerVideo(page);
  // Going back to the list restores it from YouTube's cache without a
  // yt-navigate event, so record every URL the tab shows instead.
  await yt.recordUrls(page);

  await yt.search(page, 'lofi hip hop');
  await expectOnResults(page, 'lofi hip hop');
  await expectMiniplayerPlaying(page, before);
  const urls = await yt.recordedUrls(page);
  expect(urls, 'URLs shown after the search').not.toContain('/');
  expect(urls[urls.length - 1]).toBe('/results?search_query=lofi+hip+hop');
});

test('slow machine (CPU throttled 6x): picking a suggestion still keeps the mini player', async ({ page, context }) => {
  // YouTube's detour through Home before the mini player is on can take
  // seconds on a busy machine; the extension must wait for it.
  await yt.gotoWatch(page);
  const before = await yt.playerVideo(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.locator(yt.SEL.searchInput).first().click();
  await page.keyboard.type('never gonna give', { delay: 40 });
  const option = page.locator(yt.SEL.searchSuggestion).filter({ visible: true }).first();
  const query = await option.getAttribute('aria-label');
  await option.click();
  await page.waitForURL(resultsUrl(query), { timeout: 60_000 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await expectMiniplayerPlaying(page, before);
});

test('setting stored as off: search from /watch stops the video like before', async ({ page, extension }) => {
  // Control for the main test: proves YouTube itself doesn't keep playing.
  await extension.setStorage({ byte_miniplayer: false });
  await yt.gotoWatch(page);
  const before = await yt.playerVideo(page);
  await yt.search(page, 'lofi hip hop');
  await expectOnResults(page, 'lofi hip hop');
  await yt.expectVideoStopped(page, before);
});

test('BYTE paused: search from /watch stops the video like before', async ({ page, extension }) => {
  // Paused means YouTube is back to normal: the mini player must stay off.
  await extension.setStorage({ byte_paused: true });
  await yt.gotoWatch(page);
  const before = await yt.playerVideo(page);
  await yt.search(page, 'lofi hip hop');
  await expectOnResults(page, 'lofi hip hop');
  await yt.expectVideoStopped(page, before);
  expect(await yt.miniplayerActive(page)).toBe(false);
});

test('works with Hide Shorts off (independent switches)', async ({ page, extension }) => {
  await extension.setStorage({ byte_hide_shorts: false });
  await yt.gotoWatch(page);
  const before = await yt.playerVideo(page);
  await yt.search(page, 'lofi hip hop');
  await expectOnResults(page, 'lofi hip hop');
  await expectMiniplayerPlaying(page, before);
});
