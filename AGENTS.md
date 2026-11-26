# BYTE

A Chrome + Firefox (MV3) extension that cleans up YouTube: it hides Shorts, sets grid density, can hide thumbnails and promo sections, and shows a channel-insight bar. It's plain JS with no build step and no dependencies at runtime.

## Layout
- `manifest.json`: MV3 manifest. The `browser_specific_settings.gecko` section is for Firefox; keep both browsers working.
- `content.js`: everything that runs on the page. One IIFE, injected at `document_start` on `*.youtube.com`.
- `background.js`: service worker; only sets storage defaults on install.
- `popup/`: the toolbar popup (`popup.html/.css/.js`).
- `scripts/generate-icons.py`: regenerates `icons/*.png` (stdlib only).
- `docs/`: task specs. Read the relevant one before starting a task.

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
There is no automated testing yet. **Building one is the first priority** (see the kickoff task). Target setup:
- `npm run lint`: `web-ext lint` (manifest/MV3/Firefox checks).
- `npm test`: `node --test` unit tests for pure logic (URL classification, selector lists, settings defaults). Pull pure functions out of the IIFE into small modules where needed, but keep the extension working without a build step.
- `npm run e2e`: Playwright loads the unpacked extension in Chromium against live youtube.com and runs smoke checks (Shorts hidden, popup toggles apply, feature flows).
- Dev-only `package.json`. Nothing from `node_modules` ships in the extension.

Until that exists, check by hand: `chrome://extensions` → Developer mode → Load unpacked → this folder → reload after each change. The popup can be previewed by itself through `.claude/launch.json` (`npx serve . -l 7821`).

Update this section with the real commands once they exist.

## Rules
- Plain JS, no frameworks, no bundler. Keep `content.js` fast: it runs on every YouTube page.
- Never add permissions or host permissions without asking.
- Bump `manifest.json` `version` for user-visible changes.
- Small commits on your branch, one concern each. Don't push or open PRs unless asked.
- Before saying something works: run the checks that exist, and spell out which manual checks you did and which you didn't.
