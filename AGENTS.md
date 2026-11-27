# BYTE

A Chrome + Firefox (MV3) extension that cleans up YouTube: it hides Shorts, sets grid density, can hide thumbnails and promo sections, and shows a channel-insight bar. It's plain JS with no build step and no dependencies at runtime.

## Layout
- `manifest.json`: MV3 manifest. The `browser_specific_settings.gecko` section is for Firefox; keep both browsers working.
- `content.js`: everything that runs on the page. One IIFE, injected at `document_start` on `*.youtube.com`, after `lib/core.js`.
- `lib/core.js`: pure logic (selector lists, settings defaults, CSS builders) shared by `content.js` and the unit tests.
- `background.js`: service worker; only sets storage defaults on install.
- `popup/`: the toolbar popup (`popup.html/.css/.js`).
- `scripts/generate-icons.py`: regenerates `icons/*.png` (stdlib only).
- `docs/`: task specs. Read the relevant one before starting a task.
- `test/unit/`, `test/e2e/`, `package.json`, `playwright.config.js`, `web-ext-config.cjs`: dev-only tooling.

## How features are wired (follow this pattern)
- Each setting has a `byte_*` key in `chrome.storage.local`, a default in `background.js` (install), a read in `content.js` `init()`, a `SET_*` message handled in `content.js`, and a toggle row in `popup/popup.html` + a handler in `popup/popup.js`.
- Visual changes go in a `<style id="byte-…">` that is added or removed (see `applyPromoStyle`). Prefer CSS over changing the DOM.
- One debounced `MutationObserver` (120ms) runs `countNewElements`, `updateInsightBar`, `syncGhostCards` and `injectDurations`. Anything that writes to the DOM from the observer **must skip writes that change nothing**, or it re-triggers itself (see the `insightHTML` check).
- YouTube is a single-page app: handle `yt-navigate-finish`, not page loads.
- Content scripts run in an isolated world. DOM events are shared with the page, so `.click()` on YouTube's own buttons works, but page JS variables can't be reached.

## YouTube is a moving target
YouTube changes its DOM and class names (`ytd-*`, `ytm-*`, `yt*ViewModel*`) without notice. Treat every selector as fragile:
- Keep selectors in one named list per feature, not scattered through the code.
- Every feature fails safe: if a selector is missing, do nothing, and never break YouTube's own behavior.
- When a selector stops matching, check the live DOM before guessing.

## Feedback loop
Setup once: `npm install && npx playwright install chromium`. Dev-only; nothing from `node_modules`, `test/` or the config files ships (`web-ext-config.cjs` lists what lint/build ignore).

- `npm test`: `node --test` unit tests in `test/unit/` (fast, offline). Covers `lib/core.js` (settings defaults, selector lists, grid CSS, escaping) and cross-file checks (install defaults in `background.js` match `readSettings({})`, manifest load order, permissions unchanged).
- `npm run lint`: `web-ext lint` (manifest/MV3/Firefox checks). Expected: 0 errors, 3 known warnings (`MISSING_DATA_COLLECTION_PERMISSIONS`, `BACKGROUND_SERVICE_WORKER_IGNORED` from the Firefox `background.scripts` fallback, `UNSAFE_VAR_ASSIGNMENT` for the escaped insight bar). Needs Node ≥ 24.15: Node 24.14.x crashes web-ext with SIGBUS (bug in Node's CJS lexer, nodejs/node#62213), and `prelint` stops with a message instead.
- `npm run e2e`: Playwright loads this folder as an unpacked extension in Playwright's Chromium (branded Chrome ignores `--load-extension`) and runs against **live youtube.com**. `HEADED=1 npm run e2e` to watch. Narrow with `npx playwright test popup` or `-g "<title>"`. `E2E_BROWSER_PATH="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" npm run e2e` runs the suite in Brave (fresh profile, Shields on). On failure, `test-results/` has a trace (`npx playwright show-trace …`) and a screenshot.

Pure logic lives in `lib/core.js`: a plain script that `manifest.json` loads before `content.js` (shared content-script world, global `ByteCore`) and that tests `require()`. Put new pure logic there, not in the IIFE.

Writing e2e tests (`test/e2e/`):
- Use the fixtures in `fixtures.js`: each test gets a fresh profile with the extension, and **fails if the extension throws or logs `console.error` in the YouTube tab** (collected via CDP, since content-script errors are invisible to `pageerror`).
- Put YouTube selectors and flows in `youtube.js`. Wait on conditions (`expect(...)`, `expect.poll`), never `waitForTimeout`.
- `extension.setStorage()`/`getStorage()` open a tab, which changes the active tab. Use them before navigating. During a popup flow, use `extension.storageIn(popup)`. `popup.js` messages the *active* tab, so `extension.openPopup(page)` brings `page` back to the front.
- Signed-out fresh profiles get an **empty home feed**; test grid/thumbnail features on a channel's `/videos` tab and Shorts on search (`cat`).
- Ads: `waitForVideoPlaying()` clicks Skip and waits out unskippable ads. Consent: a `SOCS` cookie is preset and `handleConsent()` clicks through if a consent page still appears.
- Pair "X is hidden" tests with a control that shows X with the feature off, so a test can't pass because YouTube stopped rendering X.
- Mini player: current players have **no mini player button**; the feature presses YouTube's `i` shortcut (a script-dispatched keydown works), and turning the mini player on makes YouTube navigate to `/` first. "On" is `ytd-app[miniplayer-is-active]`. `playerVideo()`/`expectStillPlaying()` read the video id and time through the player API on `#movie_player`.
- Not automatable here (check by hand): fullscreen (Playwright's Chromium refuses the Fullscreen API), real ads (`ad-showing` is simulated), Firefox.

When something works in tests but not in a real browser profile, have the user paste `scripts/diagnose-miniplayer.js` into the YouTube tab's console and send back `copy(byteReport())`: environment, where clicks land, whether the extension intercepted them, navigations and video state over time.

Manual check is still worth doing for UI changes: `chrome://extensions` → Developer mode → Load unpacked → this folder → reload after each change. The popup can be previewed by itself through `.claude/launch.json` (`npx serve . -l 7821`).

## Rules
- Plain JS, no frameworks, no bundler. Keep `content.js` fast: it runs on every YouTube page.
- Never add permissions or host permissions without asking.
- Bump `manifest.json` `version` for user-visible changes.
- Small commits on your branch, one concern each. Don't push or open PRs unless asked.
- Before saying something works: run the checks that exist, and spell out which manual checks you did and which you didn't.
