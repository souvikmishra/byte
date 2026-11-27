# BYTE identity and popup redesign: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship BYTE's new identity (the bite mark, the bitten-E wordmark, four accent colours) and the redesigned popup:
- the one-window mirror and live picture
- hold to compare on the real tab
- independent switches with Pause BYTE

**Architecture:**
- **Settings** stay in `chrome.storage.local`. `content.js` reacts to `chrome.storage.onChanged` (replacing the per-setting `SET_*` messages) and applies one derived state, `Core.effectiveState`.
- **Pure logic** (settings, loop stat, summary, highlight selectors) goes in `lib/core.js`. The mark and wordmark geometry goes in a new pure `lib/mark.js`, shared by the popup, `background.js` (the toolbar icon in the chosen colour) and a Node icon generator.
- **Live popup ↔ tab interaction** (compare, hover outlines) uses one long-lived port, so closing the popup always restores the page.

**Tech stack:** plain JS, MV3 (Chrome + Firefox), no build step, `node --test`, Playwright e2e against live YouTube, `web-ext lint`.

**Spec:** `docs/superpowers/specs/2026-11-28-byte-identity-and-popup-design.md`. Read it first. The visual reference is `.superpowers/brainstorm/36398-1795804041/content/` (`popup-decided.html`, `colour-icon.html`, `monogram-tuner-v5.html`). Those files are local and git-ignored; treat them as reference, not production code.

## Global constraints

- No new `permissions` or `host_permissions` (still `['storage', 'tabs']` and `['*://*.youtube.com/*']`).
- No build step, no runtime dependencies, nothing from `node_modules` ships. Dev-only files go in `web-ext-config.cjs` `ignoreFiles`.
- Keep `content.js` fast: it runs on every YouTube page. DOM writes from the observer must skip no-op writes.
- Selectors live in named lists. Features fail safe and never break YouTube's own behaviour.
- **Mark parameters (exact):** `size=13.2 pos=0.52 teeth=5 tooth=0.18 smooth=0 crumbs=2 csize=2.5 round=2.6 grid=32`, pixel look. The same parameters apply at every size (the owner declined a separate 16px drawing). The 128px store icon is the mark at 96px, centred, with 16px of transparent padding per side.
- **Wordmark:** "BYTE" in 6×8 pixel caps with 2-pixel stems. The E gets the same bite, scaled by 0.5.
- **Palettes:**
  - lime `#C6F135` / `#141414` (the default)
  - cobalt `#3D5AFE` / `#FFFFFF`
  - tangerine `#FF7A1A` / `#1A1208`
  - violet `#8B5CF6` / `#FFFFFF`
- **Loop rule:** the fewest channels (largest first) whose videos add up to at least 50% of the loaded videos. Home feed only (`location.pathname === '/'`).
- **Hovering never reveals hidden content.** Outlines only appear on elements that are visible.
- **Rows have no chevron or unfold at launch.**
- Run `npm test` and `npm run lint` in every task. Run e2e **as single specs** (`npx playwright test <spec> -g "<title>"`), not repeated full runs, because of Google's rate limits. Run the full suite once, in Task 11.
- Commits are small and signed (git is configured). Never push.

## Review focus

1. **The popup closes while compare is held** (a click outside, or Esc). The YouTube page must return to BYTE's state. Tested in Task 4 (port disconnect) and Task 10 (closing the popup page mid-hold).
2. **The popup opens on a non-YouTube tab, or on a YouTube page that isn't Home.** The window shows the honest fallback text, the switches still save, and nothing throws. Tested in Task 10.
3. **Storage holds unknown or corrupt values** (`byte_accent: 'pink'`, `byte_grid_columns: 'x'`, a leftover `byte_enabled`). Defaults apply. Tested in Task 1.
4. **Pause survives navigation.** It holds after a YouTube in-app navigation and after a full reload, and the mini player stays inactive while paused. Tested in Task 2 (e2e and unit).
5. **Hovering "Hide Shorts" while Shorts are hidden** never makes them visible, not even for a frame. Tested in Task 10.

---

### Task 1: Settings model (independent switches, pause, channel bar, accent)

**Files:**
- Modify: `lib/core.js` (STORAGE, `readSettings`, new exports), `background.js` (install defaults), `test/e2e/fixtures.js:98` (poll key), `test/e2e/shorts.spec.js:34,47,85`, `test/e2e/miniplayer.spec.js:258`
- Test: `test/unit/core.test.js`, `test/unit/extension-files.test.js`

**Interfaces:**
- Produces:
  - `Core.STORAGE`:
    - `HIDE_SHORTS: 'byte_hide_shorts'`, replacing `ENABLED`. **Remove** `ENABLED`.
    - New: `PAUSED: 'byte_paused'`, `CHANNEL_BAR: 'byte_channel_bar'`, `ACCENT: 'byte_accent'`.
    - Unchanged: `COUNT`, `GRID`, `HIDE_THUMBS`, `HIDE_PROMOS`, `MINIPLAYER`.
  - `Core.PALETTES`: a frozen array of `{ id, name, accent, onAccent }` with ids `lime`, `cobalt`, `tangerine`, `violet` (names `Lime`, `Cobalt`, `Tangerine`, `Violet`), using the exact values from Global constraints.
  - `Core.DEFAULT_ACCENT = 'lime'`.
  - `Core.paletteFor(id) → palette`. An unknown id returns lime.
  - `Core.readSettings(data) → { hideShorts, paused, channelBar, accent, gridColumns, hideThumbs, hidePromos, miniplayer }`. The defaults are `true, false, true, 'lime', 3, false, true, true`.
  - `Core.effectiveState(settings, { comparing = false } = {}) → { hideShorts, hidePromos, hideThumbs, channelBar, gridColumns, miniplayer }`. Here `off = paused || comparing`: every visual field is `false` and `gridColumns` is `null` when off, while `miniplayer = !paused && settings.miniplayer` (compare doesn't affect behaviour).

- [ ] **Step 1: Write the failing unit tests** in `test/unit/core.test.js`:

```js
test('readSettings defaults', () => {
  assert.deepEqual(Core.readSettings({}), { hideShorts: true, paused: false, channelBar: true, accent: 'lime',
    gridColumns: 3, hideThumbs: false, hidePromos: true, miniplayer: true });
});
test('readSettings ignores corrupt values', () => {
  const s = Core.readSettings({ byte_accent: 'pink', byte_grid_columns: 'x', byte_enabled: false });
  assert.equal(s.accent, 'lime'); assert.equal(s.gridColumns, 3); assert.equal(s.hideShorts, true);
});
test('paletteFor falls back to lime', () => assert.equal(Core.paletteFor('nope').accent, '#C6F135'));
test('effectiveState: paused turns everything off, including the mini player', () => {
  const e = Core.effectiveState(Core.readSettings({ byte_paused: true }));
  assert.deepEqual(e, { hideShorts: false, hidePromos: false, hideThumbs: false, channelBar: false, gridColumns: null, miniplayer: false });
});
test('effectiveState: comparing turns visuals off but keeps the mini player', () => {
  const e = Core.effectiveState(Core.readSettings({}), { comparing: true });
  assert.equal(e.hideShorts, false); assert.equal(e.gridColumns, null); assert.equal(e.miniplayer, true);
});
test('effectiveState: switches are independent', () => {
  const e = Core.effectiveState(Core.readSettings({ byte_hide_shorts: false }));
  assert.equal(e.hideShorts, false); assert.equal(e.hidePromos, true); assert.equal(e.channelBar, true);
});
```

Also change `extension-files.test.js`. The existing "every setting has an install default" and "install defaults match readSettings({})" tests now cover the new keys. Update the `content.js` boot test so it accepts `getKeys === null` (`content.js` will read everything in Task 2).

- [ ] **Step 2: Run `npm test`.** Expected: the new tests FAIL (`effectiveState is not a function`, `paletteFor` missing).
- [ ] **Step 3: Implement** the Interfaces above in `lib/core.js`. Make `gridColumns` a valid integer ≥ `GRID_MIN`, or fall back to `GRID_MIN`. Add install defaults for the 4 new keys in `background.js`: `byte_hide_shorts: true, byte_paused: false, byte_channel_bar: true, byte_accent: 'lime'`. Remove `byte_enabled`.
- [ ] **Step 4: Update the e2e references.**
  - `fixtures.js` `waitForInstallDefaults` polls `byte_hide_shorts`.
  - `shorts.spec.js` controls use `{ byte_hide_shorts: false }`.
  - `miniplayer.spec.js:258` uses `{ byte_hide_shorts: false }`, with the title "works with Hide Shorts off (independent switches)".
- [ ] **Step 5: Run `npm test` and `npm run lint`.** Expected: all pass, 0 errors, 3 known warnings. (`content.js` and `popup.js` still compile; Task 2 rewires them.)
- [ ] **Step 6: Commit** `git commit -m "Settings model: independent switches, pause, channel bar, accent"`

### Task 2: content.js applies one effective state, reacts to storage changes

**Files:**
- Modify: `content.js` (state, `enable`/`disable` → `applyAll`, `init`, message listener, `yt-navigate-finish`, `countNewElements`), `popup/popup.js` (write the new keys, stop sending `SET_*`). The popup is fully rebuilt in Task 9; this only keeps it working.
- Test: `test/e2e/shorts.spec.js` (a new pause test), `test/unit/extension-files.test.js`

**Interfaces:**
- Consumes: `Core.readSettings`, `Core.effectiveState` (Task 1).
- Produces:
  - `content.js` keeps `settings`, `comparing` (bool) and `highlight` (feature id or null) in module state.
  - `applyAll()` re-applies everything from `Core.effectiveState(settings, { comparing })`:
    - Shorts CSS on or off.
    - The promo, thumbnail and grid styles. Add a `removeGridStyle()`: with BYTE off, the grid is YouTube's own.
    - The insight bar.
    - The observer runs only while some visual is on.
    - `miniplayerEnabled`.
  - The `GET_STATUS` response stays `{ sessionBlocked }`. Task 3 extends it.

- [ ] **Step 1: Write the failing e2e test** in `shorts.spec.js`:

```js
test('pause: Shorts come back, and stay back after navigating and reloading', async ({ page, extension }) => {
  await extension.setStorage({ byte_paused: true });
  await yt.gotoSearch(page, SEARCH_WITH_SHORTS);
  await expect.poll(() => yt.visibleShortsLinkCount(page)).toBeGreaterThan(0);
  await expect(page.locator('style#byte-grid-style')).not.toBeAttached();
  await yt.gotoSearch(page, 'dog');                    // in-app navigation
  await expect.poll(() => yt.visibleShortsLinkCount(page)).toBeGreaterThan(0);
  await page.reload();
  await expect.poll(() => yt.visibleShortsLinkCount(page)).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run** `npx playwright test shorts -g "pause"`. Expected: FAIL, because Shorts stay hidden (`byte_paused` is ignored).
- [ ] **Step 3: Implement.**
  - `init()` uses `chrome.storage.local.get(null, …)`, then `settings = Core.readSettings(data)` and `applyAll()`.
  - Add `chrome.storage.onChanged.addListener((changes, area) => …)`. If `area === 'local'` and any changed key other than `byte_count` starts with `byte_`, re-read and `applyAll()`. Skipping `byte_count` matters, because it changes on every count.
  - Delete the `SET_SETTINGS/SET_GRID/SET_THUMB/SET_PROMOS/SET_MINIPLAYER` handlers.
  - `countNewElements` counts only while Shorts are hidden.
  - The `yt-navigate-finish` handler calls `applyAll()`. That's cheap, because every `apply*` is idempotent.
  - In `popup.js`, every control only writes storage, and the Block Shorts switch writes `byte_hide_shorts`.
- [ ] **Step 4: Run** `npx playwright test shorts` and `npx playwright test popup -g "Block Shorts"`. Expected: PASS. The popup test's `byte_enabled` assertions become `byte_hide_shorts`, and its badge assertions are deleted.
- [ ] **Step 5: Update AGENTS.md "How features are wired".** It now says: a `byte_*` key, an install default, a field in `Core.readSettings`/`effectiveState`, applied in `content.js` `applyAll()` via `storage.onChanged`, and a popup control that writes storage.
- [ ] **Step 6: Commit** `git commit -m "content.js: apply one effective state and react to storage changes"`

### Task 3: Loop stat, channel bar setting, accent on the page

**Files:**
- Modify: `lib/core.js`, `content.js` (`updateInsightBar`, `INSIGHT_CSS`, `GET_STATUS`)
- Test: `test/unit/core.test.js`, `test/e2e/grid-and-watch.spec.js`

**Interfaces:**
- Consumes: Task 1 settings (`channelBar`, `accent`), Task 2 `applyAll`.
- Produces:
  - `Core.loopStat(counts: number[]) → null | { loopCount, share, total }`. It returns `null` when the total is 0. `share` is between 0 and 1. The order of `counts` doesn't matter.
  - The `GET_STATUS` response is `{ sessionBlocked, page: 'home' | 'other', channelCounts: number[] }`. `channelCounts` is `[]` unless the page is `'home'`.
  - On the page, the insight bar's loop chips get class `byte-chip-loop` and are coloured with `--byte-accent` / `--byte-on-accent`, which are set on `#byte-insight` from `Core.paletteFor(settings.accent)`.

- [ ] **Step 1: Write the failing unit tests:**

```js
test('loopStat: fewest channels that fill half', () => {
  assert.deepEqual(Core.loopStat([10, 9, 6, 5, 5, 5, 4, 2, 2]), { loopCount: 3, share: 25 / 48, total: 48 });
});
test('loopStat: one channel can be the whole loop', () => assert.equal(Core.loopStat([30, 2, 1]).loopCount, 1));
test('loopStat: all equal → half of them, rounded up', () => assert.equal(Core.loopStat([1, 1, 1, 1, 1]).loopCount, 3));
test('loopStat: unsorted input', () => assert.equal(Core.loopStat([2, 30, 1]).loopCount, 1));
test('loopStat: empty feed', () => assert.equal(Core.loopStat([]), null));
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL (`loopStat is not a function`).
- [ ] **Step 3: Implement `loopStat`.** Then in `content.js`:
  - `updateInsightBar` removes the bar when `effectiveState.channelBar` is false.
  - It marks the top `loopCount` chips (by count) with `byte-chip-loop` and sets the accent variables on the bar.
  - `GET_STATUS` adds `page` and `channelCounts`, from `collectChannelData()`.
  - Keep the `insightHTML` no-op check, and include the accent in the cached HTML so a colour change re-renders.
- [ ] **Step 4: Write and run the e2e test** in `grid-and-watch.spec.js` (title `channel bar: loop chip in the accent, switch removes it`):
  - On `/@YouTube/videos`, `#byte-insight .byte-chip-loop` has count ≥ 1.
  - `setStorage({ byte_channel_bar: false })` → `#byte-insight` is not attached.
  - **Control:** with `true`, it's attached again.
  - Run `npx playwright test grid-and-watch -g "channel bar"`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Channel bar: loop stat, its own switch, accent on the page"`

### Task 4: Popup port: hold to compare and hover outlines (page side)

**Files:**
- Modify: `lib/core.js`, `content.js`
- Create: `test/e2e/compare.spec.js`
- Test: `test/unit/core.test.js`

**Interfaces:**
- Consumes: Task 2 `applyAll`, `comparing`, `highlight`.
- Produces:
  - `Core.FEATURES`, a frozen array of `{ id, label, caption }`, in this order. Show the copy exactly:

    | id | label | caption |
    |---|---|---|
    | `shorts` | Hide Shorts | The Shorts shelf and the Shorts tab disappear. |
    | `grid` | Videos per row | Fit more videos on each row. |
    | `promos` | Hide promos | Memberships, Premium and music banners go away. |
    | `thumbs` | Hide thumbnails | Just titles, so clickbait images don’t pull you in. |
    | `miniplayer` | Keep playing | Search or browse, and the video keeps going in the corner. |
    | `channelBar` | Channel bar | See which channels fill your feed, right on the page. |

  - `Core.HIGHLIGHT_SELECTORS`:
    - `shorts`: `SHORTS_SELECTORS`
    - `grid`: `'ytd-rich-grid-renderer #contents > ytd-rich-item-renderer'`
    - `promos`: `PROMO_SELECTORS`
    - `thumbs`: `'a.ytLockupViewModelContentImage'`
    - `channelBar`: `'#byte-insight'`
    - `miniplayer`: `[]`

    All values are arrays.
  - `Core.buildHighlightCSS(featureId, accentHex) → string`. It returns `''` for an unknown feature or no selectors. Otherwise every selector gets `{ outline: 2px dashed <accent> !important; outline-offset: 2px !important; }`. **There is no `display` rule**, so hidden elements stay hidden.
  - **Port protocol:** the name is `'byte-popup'`. Messages are `{ type: 'COMPARE', on: boolean }` and `{ type: 'HIGHLIGHT', feature: string | null }`. On disconnect, set `comparing = false` and `highlight = null`, then `applyAll()`. The highlight is a `<style id="byte-highlight">` that is added or removed.

- [ ] **Step 1: Write the failing unit tests.**
  - `buildHighlightCSS('thumbs', '#C6F135')` contains `a.ytLockupViewModelContentImage` and `2px dashed #C6F135`, and has no `display`.
  - `buildHighlightCSS('miniplayer', …)` and `buildHighlightCSS('nope', …)` both return `''`.
  - `FEATURES.map(f => f.id)` equals `['shorts', 'grid', 'promos', 'thumbs', 'miniplayer', 'channelBar']`.
- [ ] **Step 2: Write the failing e2e tests** in `compare.spec.js`. Add a helper `connect(extPage)` that, inside an extension page, finds the YouTube tab with `chrome.tabs.query({ url: '*://*.youtube.com/*' })` and stores `chrome.tabs.connect(id, { name: 'byte-popup' })` on `window.__p`.
  - `compare shows YouTube without BYTE, release restores`: on search `cat`, with `{ type: 'COMPARE', on: true }`, visible Shorts > 0. With `on: false`, they're back to 0.
  - `closing the port mid-compare restores the page`: send compare on, close the extension page, then poll until visible Shorts are 0.
  - `highlight outlines visible thumbnails only`: on `/@YouTube/videos`, with `HIGHLIGHT 'thumbs'`, the first thumbnail's computed `outline-style` is `dashed`. With `null`, `style#byte-highlight` is not attached.
- [ ] **Step 3: Run** `npm test` and `npx playwright test compare`. Expected: FAIL.
- [ ] **Step 4: Implement** the Interfaces above (`chrome.runtime.onConnect` in `content.js`).
- [ ] **Step 5: Run** the same commands. Expected: PASS.
- [ ] **Step 6: Commit** `git commit -m "Popup port: hold to compare and hover outlines on the page"`

### Task 5: `lib/mark.js`: the bite mark and the wordmark

**Files:**
- Create: `lib/mark.js` (a pure plain script, using the same dual-export pattern as `lib/core.js`: `globalThis.ByteMark` / `module.exports`), `test/unit/mark.test.js`

**Interfaces:**
- Produces:
  - `ByteMark.MARK_PARAMS`, frozen: `{ size: 13.2, pos: 0.52, teeth: 5, tooth: 0.18, smooth: 0, crumbs: 2, csize: 2.5, round: 2.6, grid: 32 }`.
  - `markGrid(N, params = MARK_PARAMS) → string[]`: N rows of `'#'` and `'.'`.
  - `gridSizeFor(px, params) → number`: `px <= 16 ? 16 : Math.min(params.grid, px)`.
  - `markPixels(px, hex, params) → Uint8ClampedArray` of length `px*px*4`. It nearest-neighbour scales `markGrid(gridSizeFor(px))`, with lit pixels in `hex` at alpha 255 and the rest at alpha 0.
  - `storeIconPixels(hex) → Uint8ClampedArray` (128×128): `markPixels(96)` at offset (16, 16).
  - `wordmarkRects(params) → { width: 27, height: 8, rects: [{ x, y, w, h }] }`. Letters advance by 7. The E is bitten, and the crumbs may lie outside the box.
  - `markSVG(px, hex, params) → string` and `wordmarkSVG(heightPx, hex, params) → string`. Both return `<svg>` markup with `shape-rendering="crispEdges"` and no scripts.
- **Algorithm (port it exactly; don't redesign it):** `biteGeom`, `biteDist`, `inRound` and the pixel-mode branch of `icon()` in `monogram-tuner-v5.html`.
  - Pixel centres are `(x + .5) * 16/N`.
  - A pixel is lit if it's inside the rounded tile (`round`) and `biteDist >= 0`.
  - A crumb is a square of `max(csize, 16/N)`, snapped to pixel cells with `Math.round`.
  - The E uses `biteGeom(6, 8, 0.5)` on glyph cells `(x + .5, y + .5)`. Its crumbs are rects of side `max(0.6, csize * 0.5)`, centred on the crumb points.

- [ ] **Step 1: Write the failing tests.** These are golden values from the owner's tuner settings:

```js
const GOLDEN_16 = [".#..............","##..............","###......###....","###......###....","###......###....",
  "###.............","###.............","#####......###..","#####......###..","#####......###..","######..........",
  "#########.......","#########.......","##############..","###############.",".##############."];
test('16px mark matches the tuner', () => assert.deepEqual(ByteMark.markGrid(16), GOLDEN_16));
test('32px mark matches the tuner', () => {
  const sha = crypto.createHash('sha256').update(ByteMark.markGrid(32).join('\n')).digest('hex');
  assert.equal(sha.slice(0, 16), 'aa97d0f7e33116c2');
});
test('bitten E keeps only its bottom-left', () => {
  // E glyph cells that survive the bite, from the tuner:
  // rows 0-3 empty; row4 "#....."; row5 "#....."; row6 "##...."; row7 "######"
  const eCells = ByteMark.wordmarkRects().rects.filter(r => r.x >= 21 && r.w === 1 && r.h === 1);
  assert.equal(eCells.length, 1 + 1 + 2 + 6);
});
test('store icon has 16px transparent padding', () => {
  const px = ByteMark.storeIconPixels('#C6F135');
  for (const [x, y] of [[0, 0], [15, 64], [64, 15], [112, 64], [64, 112]]) assert.equal(px[(y * 128 + x) * 4 + 3], 0);
});
test('markPixels(16) alpha equals the 16 grid', () => {
  const px = ByteMark.markPixels(16, '#C6F135');
  GOLDEN_16.forEach((row, y) => [...row].forEach((c, x) => assert.equal(px[(y * 16 + x) * 4 + 3], c === '#' ? 255 : 0)));
});
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL (cannot find `lib/mark.js`).
- [ ] **Step 3: Implement** `lib/mark.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. (`lib/mark.js` ships, so it stays out of `ignoreFiles`.)
- [ ] **Step 5: Commit** `git commit -m "Add lib/mark.js: the bite mark and the bitten-E wordmark"`

### Task 6: Extension icons generated from `lib/mark.js`

**Files:**
- Create: `scripts/generate-icons.js` (Node stdlib only: `zlib`, `fs`), `test/unit/icons.test.js`
- Delete: `scripts/generate-icons.py`
- Modify: `icons/icon16.png`, `icon32.png`, `icon48.png`, `icon128.png` (regenerated); `AGENTS.md` (Layout line)

**Interfaces:**
- Consumes: `ByteMark.markPixels`, `ByteMark.storeIconPixels`, `Core.paletteFor('lime')`.
- Produces: `node scripts/generate-icons.js` writes the four PNGs in lime: 16, 32 and 48 come from `markPixels`, and 128 from `storeIconPixels`. Each PNG is 8-bit RGBA, with one IDAT and filter type 0 on every row.

- [ ] **Step 1: Write the failing test** `committed icons match lib/mark.js`. For each size, read the PNG, check its IHDR width and height, `zlib.inflateSync` the IDAT, strip the filter byte from each row, and `assert.deepEqual` the RGBA bytes with what `ByteMark` produces.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL (the old red ⊘ icons).
- [ ] **Step 3: Implement** the generator (a small PNG encoder: signature, IHDR, IDAT, IEND, CRC via `zlib.crc32`), delete the `.py`, then run `node scripts/generate-icons.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. Look at `icons/icon128.png` yourself (open it with the Read tool): it must show the bitten lime tile with padding.
- [ ] **Step 5: Commit** `git commit -m "Generate the bite icons from lib/mark.js"`

### Task 7: The toolbar icon follows the chosen colour

**Files:**
- Modify: `background.js`, `manifest.json` (`background.scripts`), `test/unit/extension-files.test.js`

**Interfaces:**
- Consumes: `Core.paletteFor`, `Core.STORAGE.ACCENT`, `ByteMark.markPixels`.
- Produces:
  - `background.js` begins with `if (typeof importScripts === 'function') importScripts('lib/core.js', 'lib/mark.js');`. That covers the Chrome service worker.
  - The manifest's `background.scripts` becomes `['lib/core.js', 'lib/mark.js', 'background.js']`. That covers Firefox.
  - `syncToolbarIcon()` reads `byte_accent`, then calls `chrome.action.setIcon({ imageData: { 16: new ImageData(markPixels(16, accent), 16, 16), 32: new ImageData(markPixels(32, accent), 32, 32) } })`.
  - It's called from `onInstalled` (after the defaults), from `runtime.onStartup`, and from `storage.onChanged` when `byte_accent` changes.

- [ ] **Step 1: Write the failing tests.**
  - Update the "background runs in Chrome and Firefox" test: `scripts` equals `['lib/core.js', 'lib/mark.js', service_worker]`.
  - New test `toolbar icon uses the chosen accent`: run `lib/core.js`, `lib/mark.js` and `background.js` in a vm with a fake `chrome`.
    - The fake has `storage.local.get` returning `{ byte_accent: 'cobalt' }`, `action.setIcon` recording its argument, `runtime.onStartup` and `storage.onChanged`, plus a fake `ImageData` class that stores `(data, w, h)`.
    - Fire `onStartup`. Assert `setIcon` got sizes 16 and 32, and the first lit pixel's RGB is `61, 90, 254`.
  - Keep the install-defaults tests passing with the extra listeners.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces above.
- [ ] **Step 4: Run** `npm test` and `npm run lint`. Expected: PASS, and no new lint errors. (`BACKGROUND_SERVICE_WORKER_IGNORED` stays one of the 3 known warnings.)
- [ ] **Step 5: Commit** `git commit -m "Toolbar icon follows the chosen colour"`

### Task 8: UI icons with the draw-icons skill

**Files:**
- Create: `icons.yaml` (repo root), `design/ui-icons/source/*.svg`, `design/ui-icons/*.svg` (built)
- Modify: `web-ext-config.cjs` (ignore `icons.yaml` and `design`)

**Interfaces:**
- Produces four built SVGs drawn in `currentColor`, which the popup will inline in Task 9: `compare` (a half-filled circle, as in "Hold to compare"), `external` (an arrow out of a box, for "Suggest a feature ↗"), `pause` and `play`.

- [ ] **Step 1: Invoke the `draw-icons` skill** and follow its setup.
  - **Product line:** "BYTE, a browser-extension popup that cleans up YouTube; its mark is a pixel-art bitten tile".
  - **Recommended DNA:** the `pixel` style on a 16 grid, `sizes: [16]`, so the icons match the mark.
  - The `preview` candidates go **to the owner to pick**. Don't pick for them.
- [ ] **Step 2: Draw** the four icons, then run `lint`, `render` (look at each PNG), `sheet`, and `build`, as the skill requires.
- [ ] **Step 3: Add** `'icons.yaml'` and `'design'` to `web-ext-config.cjs`. Run `npm run lint`. Expected: 0 errors, and the icons are not shipped.
- [ ] **Step 4: Commit** `git commit -m "Draw the popup's UI icons (pixel set)"`

### Task 9: Popup rebuild: shell, rows, pause, colours, footer

**Files:**
- Rewrite: `popup/popup.html`, `popup/popup.css`, `popup/popup.js`
- Modify: `test/e2e/fixtures.js` (`openPopup` waits for `#shorts-count`), `test/e2e/popup.spec.js` (rewrite)

**Interfaces:**
- Consumes: `Core.FEATURES`, `Core.STORAGE`, `Core.readSettings`, `Core.PALETTES`, `Core.paletteFor`, `ByteMark.markSVG`, `ByteMark.wordmarkSVG`, and the Task 8 SVGs (inlined).
- Produces the popup DOM. Task 10 and the tests rely on these ids:
  - `#mark`, `#wordmark`
  - `#pause`: a `<button>` with `aria-pressed`. Its `aria-label` is "Pause BYTE", or "Resume BYTE" when paused.
  - `#window` (an empty placeholder until Task 10)
  - `.row[data-feature=<id>]` for every `Core.FEATURES` id, in order. Each has `.label#label-<id>`.
  - Switches are `<input type="checkbox" role="switch" id="toggle-<id>" aria-labelledby="label-<id>">`, for `shorts`, `promos`, `thumbs`, `miniplayer` and `channelBar`.
  - The grid stepper is `#grid-dec`, `#grid-count` and `#grid-inc`. Its minimum is `Core.GRID_MIN`, with **no maximum**, as today.
  - `#shorts-count` shows the all-time `byte_count`, formatted, with the label "Shorts hidden".
  - `.accent-dot[data-accent=<id>]` buttons have `aria-label="<Name> colour"` and `aria-pressed`.
  - `#suggest` is `<a href="https://github.com/souvikmishra/byte/issues/new" target="_blank" rel="noopener">`.
  - `body.paused` is set when paused.
  - `:root` has `--accent` and `--on-accent`, plus the light and dark tokens. Take them from `colour-icon.html`, and switch them with `prefers-color-scheme`.
- **Behaviour:**
  - Every control only writes storage (Task 2 does the rest).
  - Choosing a colour re-tints with a 350ms transition and updates the inline mark.
  - While paused, the rows are dimmed and inert, and the pause button shows the Task 8 `play` icon.
  - No row has a chevron.
  - Use DOM APIs rather than `innerHTML` for anything built from storage. The only markup strings are the static SVGs from `lib/mark.js` and Task 8.

- [ ] **Step 1: Rewrite the e2e tests in `popup.spec.js`.** Keep the existing `markNoReload` pattern and `GRID_PAGE`.
  - `shows the install defaults`: Shorts, promos, Keep playing and Channel bar are checked; thumbnails is unchecked; `#grid-count` is `3` and `#grid-dec` is disabled; `lime` is pressed; `#pause` has `aria-pressed="false"`.
  - `Hide Shorts only controls Shorts`: on search `cat`, uncheck it. Shorts become visible, `style#byte-promo-style` is still attached, and storage has `byte_hide_shorts === false`. Re-check it, and Shorts are hidden again. The tab is never reloaded.
  - `Pause turns everything off and Resume brings it back`: on `GRID_PAGE`, click `#pause`. `style#byte-grid-style`, `style#byte-promo-style` and `#byte-insight` all detach, and `body.paused` is set. Click again and they're all attached.
  - `choosing a colour saves it and re-tints the popup`: click `[data-accent="cobalt"]`. Storage has `byte_accent === 'cobalt'`, and `--accent` on `:root` reads `#3D5AFE`.
  - Carry over the thumbnails, promos and stepper tests (renamed ids), plus `Channel bar switch removes the bar`.
- [ ] **Step 2: Run** `npx playwright test popup`. Expected: FAIL (the old markup).
- [ ] **Step 3: Implement** the popup shell. Follow the visual reference `popup-decided.html` and `colour-icon.html` for the header, rows, footer and dots, at a width of 320px.
- [ ] **Step 4: Run** `npx playwright test popup`. Expected: PASS. Then `npm test` and `npm run lint`.
- [ ] **Step 5: Look at it.** Serve the popup by itself (`npx serve . -l 7821`, see `.claude/launch.json`), screenshot it in light and dark, and compare with the mockups.
- [ ] **Step 6: Commit** `git commit -m "Popup: new shell, independent rows, pause and colours"`

### Task 10: Popup window: mirror, live picture, hover outlines, hold to compare

**Files:**
- Create: `popup/wireframe.js` (loaded by `popup.html` before `popup.js`), `test/e2e/popup-window.spec.js`
- Modify: `popup/popup.html`, `popup/popup.css`, `popup/popup.js`, `lib/core.js`
- Test: `test/unit/core.test.js`

**Interfaces:**
- Consumes: `Core.loopStat`, `Core.effectiveState`, `Core.FEATURES`, the Task 3 `GET_STATUS`, the Task 4 port protocol, and the Task 8 `compare` icon.
- Produces:
  - `Core.compareSummary(settings) → string[]`, computed from `effectiveState(settings)`:
    - The hidden names, in the order Shorts, promos, thumbnails, joined with `', '` and a final `' and '` and prefixed with `'hides '`. For example: `'hides Shorts'`, `'hides Shorts and promos'`, `'hides Shorts, promos and thumbnails'`.
    - Then `` `${gridColumns} videos per row` `` when the grid is on.
    - Then `'adds the channel bar'` when the bar is on.
    - It returns `[]` when paused.
    - YouTube's own per-row count depends on the window width, so the summary states BYTE's number rather than a delta. This is the builder's call the spec allows.
  - `ByteWireframe.create(el) → { render(state), preview(featureId, state), stop() }`. `state` has the shape of `effectiveState`.
    - The lo-fi page (top bar, sidebar with a Shorts entry, channel strip, cards, Shorts shelf, promo banner, mini player) is ported from `popup-decided.html`.
    - `preview` loops: outline the affected part (450ms), apply the change (at 1150ms), restart (at 3200ms).
  - Window DOM:
    - `#window` holds `.face-mirror` (`#mirror-headline`, `#mirror-sub`, `#mirror-bars`) and `.face-picture` (`#wf`, `#wf-caption`).
    - `#compare` is a `<button>` showing the `compare` icon and the text "Hold to compare".
    - `#summary` is the strip that slides up.
- **Copy (exact):**
  - **Mirror:** headline `` `${n} channel${n === 1 ? '' : 's'}` `` and sub `` `fill${n === 1 ? 's' : ''} ${Math.round(share * 100)}% of the ${total} videos on your home page` ``.
  - **Fallback on YouTube but not Home:** "Nothing to measure here" / "Open your YouTube home page to see which channels fill your feed."
  - **Fallback outside YouTube:** "Nothing to measure here" / "Open YouTube to see what your feed is made of."
  - **Paused:** "BYTE is paused" / "Your YouTube is back to normal."
  - **Summary strip:** `'BYTE changes this page: ' + parts.join(' · ')`, or "BYTE isn't changing anything on this page." when there are no parts.
- **Behaviour:**
  - On open, if the active tab is YouTube, connect the `'byte-popup'` port and send `GET_STATUS`.
  - **Mirror bars:** the counts sorted from largest to smallest. The first `loopCount` bars are in the accent.
  - **Hovering a row** (`mouseenter` on `.row`): show the picture face, play `preview(id, effectiveState)`, set the caption to the feature's caption, and send `HIGHLIGHT id`.
  - **Leaving a row:** return to the mirror and send `HIGHLIGHT null`.
  - **`#compare`:**
    - `pointerdown` sends `COMPARE on`, renders the picture with all features off and the grid as YouTube's own, and shows the summary.
    - `pointerup`, `pointercancel`, `lostpointercapture` and window `blur` send `COMPARE off`.
    - It's disabled when there's no port (not YouTube) or while paused.

- [ ] **Step 1: Write the failing unit tests** for `compareSummary`:
  - The defaults give `['hides Shorts and promos', '3 videos per row', 'adds the channel bar']`.
  - Paused gives `[]`.
  - With all three hidden, the first part is `'hides Shorts, promos and thumbnails'`.
- [ ] **Step 2: Write the failing e2e tests** in `popup-window.spec.js`:
  - `fallback outside YouTube`: `openPopup` on a new `about:blank` page. The headline is "Nothing to measure here" and `#compare` is disabled. Toggling `#toggle-promos` still writes storage.
  - `fallback on a YouTube page that isn't Home`: on `/@YouTube/videos`, the sub text is the not-Home fallback.
  - `hold to compare shows Shorts and the summary; release hides them`: on search `cat`, `dispatchEvent('pointerdown')` on `#compare` makes visible Shorts > 0, and `#summary` contains "BYTE changes this page: hides Shorts". `pointerup` brings them back to 0.
  - `closing the popup while holding restores the page`: pointerdown, `popup.close()`, then poll until visible Shorts are 0.
  - `hovering Hide Shorts never reveals hidden Shorts`: on search `cat`, hover `.row[data-feature=shorts]`. Then in the YouTube page, `page.evaluate` runs the same check as `yt.visibleShortsLinkCount` on every `requestAnimationFrame` for 1500ms and returns the **maximum** it saw. Assert the maximum is 0. (`expect.poll` would stop at its first success, and AGENTS.md forbids `waitForTimeout`.) **Control:** with Hide Shorts off, the same sampler sees more than 0.
  - `hovering Hide thumbnails outlines thumbnails on the page`: on `GRID_PAGE`, the thumbnail's `outline-style` is `dashed`. After moving away, it's `none`.
- [ ] **Step 3: Run** `npm test` and `npx playwright test popup-window`. Expected: FAIL.
- [ ] **Step 4: Implement** `compareSummary`, `wireframe.js` and the window behaviour.
- [ ] **Step 5: Run** the same commands. Expected: PASS. Then `npx playwright test popup` (no regressions), `npm test`, and `npm run lint`.
- [ ] **Step 6: Look at it.** Take screenshots of the window at rest (with the fallback), while hovering each row, and while holding compare. Compare them with `popup-decided.html`.
- [ ] **Step 7: Commit** `git commit -m "Popup window: mirror, live picture, hover outlines, hold to compare"`

### Task 11: Release wrap-up

**Files:**
- Modify: `manifest.json` (`version` → `1.2.0`), `AGENTS.md`, `docs/miniplayer-on-browse.md` if any references are stale

- [ ] **Step 1: Bump** the version to `1.2.0`.
- [ ] **Step 2: Update AGENTS.md.**
  - **Layout:** add `lib/mark.js`, `scripts/generate-icons.js`, `design/ui-icons` + `icons.yaml` (dev-only), and `popup/wireframe.js`.
  - **Wiring:** from Task 2.
  - **Lint warnings:** the expected count, if it changed. Re-check it.
  - **Manual checks:** the mirror stat with a real signed-in Home feed, the toolbar icon colour, and Firefox.
- [ ] **Step 3: Run the full checks once:** `npm test`, `npm run lint`, `npm run e2e`. Expected: all pass. Record the counts.
- [ ] **Step 4: Commit** `git commit -m "Release 1.2.0: new identity and popup"`
- [ ] **Step 5: Hand over** a manual checklist for the owner's signed-in Brave:
  - the mirror stat on their real Home feed
  - the toolbar icon in each colour
  - light and dark popups
  - hold to compare, plus a click outside mid-hold
  - pause across tabs
  - Firefox `about:debugging` load

  Then open the PR only when asked.
