# Task: Mini player on browse

## Problem
On a `/watch` page, searching (or clicking a link to a page that lists videos) makes YouTube navigate away and the video stops. YouTube already has a mini player. We want to use it instead of building our own.

## Goal
On `/watch` pages, when the user:
- submits a search (Enter in the search box, or the search button), or
- clicks a link to a **list page**: `/results`, `/` (home), `/feed/*`, `/@handle…`, `/channel/*`, `/c/*`, `/user/*`, `/playlist`, `/hashtag/*`, `/gaming`, `/premium`

…then the current video moves into YouTube's mini player and keeps playing, and the user lands on the page they asked for.

These keep their normal behavior:
- Links to another video (`/watch`, `/shorts`): opening it replaces the current video, as usual.
- Cmd/Ctrl/Shift-click, middle click, and `target="_blank"` links (they open a new tab or window).

## Approach (all in `content.js`, which runs at `document_start`)
1. **Capture-phase listeners** on `document`, active only on `/watch`:
   - `submit` on the masthead search form (`ytd-searchbox` / `yt-searchbox`), `keydown` Enter in its input, and `click` on its search button. YouTube doesn't always fire a native submit.
   - `click` on `a[href]` whose pathname matches the list-page patterns above.
2. **Skip** (let it navigate normally) when:
   - the feature switch is off,
   - the mini player is already on (`ytd-app[miniplayer-is-active]` / `ytd-miniplayer[active]`), since YouTube keeps it playing by itself,
   - the page is fullscreen (`document.fullscreenElement`),
   - an ad is playing (`.html5-video-player.ad-showing`), because the mini player button is hidden then,
   - `.ytp-miniplayer-button` isn't on the page or is hidden.
3. **Intercept**: `preventDefault()` + `stopImmediatePropagation()`, then remember the action (the search text, or the anchor element + href). Click `.ytp-miniplayer-button`.
4. **Wait** for the mini player to be on and `yt-navigate-finish` to fire, with about a 1.5s timeout.
5. **Replay** through YouTube's own in-app navigation:
   - Search: put the remembered text back in the search input (fire an `input` event), then click the search button.
   - Link: `.click()` the original anchor if it's still on the page. If not, find a fresh `a[href="…"]`. As a last resort, set `location.href`.
   - Set a short-lived `replaying` flag so the listeners don't catch the replayed action.
6. **Fallback**: on timeout or any error, do the original navigation (worst case is today's behavior).

DOM events work between the content script and the page, so `.click()` from the content script reaches YouTube's handlers. Nothing has to be injected into the page.

## Toggle: "Mini player on browse" (on by default)
Copy the existing `hide_promos` pattern:
- `content.js`: `STORAGE.MINIPLAYER = 'byte_miniplayer'`, `let miniplayerEnabled = true`, read it through `Core.readSettings` (`!== false`); `applyAll()` re-runs on `storage.onChanged`. There are no `SET_*` messages.
- `background.js`: set `byte_miniplayer: true` on install.
- `popup/popup.html`: a new toggle row with title "Mini player on browse", subtitle "Keep the video playing when you search or open a channel", `#toggle-miniplayer`.
- `popup/popup.js`: read the setting through `Core.readSettings` and write it to storage; the popup only writes storage and never messages the page.
- Works independently of the other toggles (there is no master switch since 1.2.0).

Bump `manifest.json` to `1.1.0`.

## Manual test checklist
Load unpacked (`chrome://extensions` → Reload), play a video, then:
- [ ] Type a search and press Enter: the video moves to the mini player and keeps playing, and the results load.
- [ ] Same, but click the search button.
- [ ] Click the channel name or avatar under the video: you land on the channel page with the mini player playing.
- [ ] Click Home or Subscriptions in the sidebar: same result.
- [ ] Click a related video: normal watch-page navigation, no mini player.
- [ ] Cmd-click a channel link: it opens in a new tab and nothing changes in the current one.
- [ ] Mini player already on, search again: results load and the mini player stays as it is.
- [ ] During an ad: normal navigation, no errors.
- [ ] In fullscreen: normal behavior.
- [ ] Popup toggle off: the old behavior comes back.
- [ ] Firefox (`about:debugging` → Load Temporary Add-on): same checks.
- [ ] DevTools console: no errors from `content.js`.
