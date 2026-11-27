const { test, expect } = require('./fixtures');
const yt = require('./youtube');

// Opens an extension page, connects a 'byte-popup' port to the YouTube tab and
// keeps it on window.__p, the way the popup does.
async function connect(extension, context) {
  const extPage = await context.newPage();
  await extPage.goto(extension.popupUrl);
  await extPage.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
    window.__p = chrome.tabs.connect(tab.id, { name: 'byte-popup' });
  });
  return extPage;
}

const send = (extPage, msg) => extPage.evaluate(m => window.__p.postMessage(m), msg);

test.describe('popup port', () => {
  test('compare shows YouTube without BYTE, release restores', async ({ page, context, extension }) => {
    await yt.gotoSearch(page, 'cat');
    await expect.poll(() => page.locator(yt.SEL.shortsLockup).count()).toBeGreaterThan(0);
    expect(await yt.visibleShortsLinkCount(page)).toBe(0);

    const ext = await connect(extension, context);
    await send(ext, { type: 'COMPARE', on: true });
    await expect.poll(() => yt.visibleShortsLinkCount(page)).toBeGreaterThan(0);

    await send(ext, { type: 'COMPARE', on: false });
    await expect.poll(() => yt.visibleShortsLinkCount(page)).toBe(0);
  });

  test('closing the port mid-compare restores the page', async ({ page, context, extension }) => {
    await yt.gotoSearch(page, 'cat');
    const ext = await connect(extension, context);
    await send(ext, { type: 'COMPARE', on: true });
    await expect.poll(() => yt.visibleShortsLinkCount(page)).toBeGreaterThan(0);

    await ext.close();
    await expect.poll(() => yt.visibleShortsLinkCount(page)).toBe(0);
  });

  test('highlight outlines visible thumbnails only', async ({ page, context, extension }) => {
    await yt.gotoYouTube(page, '/@YouTube/videos');
    const thumb = page.locator('a.ytLockupViewModelContentImage').first();
    await expect(thumb).toBeVisible();

    const ext = await connect(extension, context);
    await send(ext, { type: 'HIGHLIGHT', feature: 'thumbs' });
    await expect.poll(() => thumb.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('dashed');

    await send(ext, { type: 'HIGHLIGHT', feature: null });
    await expect(page.locator('style#byte-highlight')).not.toBeAttached();
  });
});
