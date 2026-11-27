# BYTE: identity and popup redesign

Status: draft for approval · 2026-11-28 · branch `rebrand-byte`

## Why

BYTE stands for **B**etter **Y**ou**T**ube **E**xperience. It started because the owner's YouTube feed had turned into a loop: the same channels kept coming back, nothing new got through, and Shorts pulled them into doom-scrolling. YouTube's algorithm can't be changed, but what the browser shows can. Every feature comes from a real annoyance:
- **Shorts removal** breaks the scroll loop.
- **The channel bar** shows the loop, and the cap on how many videos the home page loads.
- **Mini player on browse** keeps the video playing until you actually pick another.

The model is **Refined GitHub, but for YouTube**: users fixing in the open what the platform won't. Settings are real off-switches ("I don't want Shorts, so I don't see Shorts"), not "show me less".

**Who it's for:** non-technical friends who want Shorts gone and some control over their feed, and who will never read the code. Developers are a secondary audience, reached through a "Suggest a feature" link.

**Identity:** *the mirror*. BYTE cleans up your YouTube **and** shows you what your feed is doing to you.

## Goals

1. A recognisable identity: a monogram, a wordmark and colours that work at 16px and on the store.
2. A redesigned popup that shows rather than tells: little text, previews of what each setting does, and a before/after comparison with the user's real page.
3. Ship this redesign **before** the first store launch, because the store screenshots should show it. The store listing itself is a separate, later piece of work.

## Non-goals

- The store listing: copy, screenshots, the promo tile, the single-purpose statement and privacy answers. That's a separate spec, written after this one ships.
- New per-feature options (e.g. "hide Shorts only in search"). The popup gets room for them, but which ones exist is decided later, one feature at a time.
- README, licence and contributing guide. Proposed (MIT), not decided; they belong to the launch spec.

## Anti-goals (failure even if it "works")

- **Looking like Enhancer for YouTube:** many options, dense text, a dated UI.
- **Looking affiliated with YouTube:** no YouTube red as the brand colour, no play-button shapes, and no "YouTube" in the product name.
- **Making YouTube slower or broken.** `content.js` runs on every YouTube page, so every feature fails safe.
- **Adding permissions.** The project rule is to never add a permission or host permission without asking.

## Constraints (from the project)

- MV3, Chrome and Firefox, plain JS with no build step or bundler, and no runtime dependencies (see AGENTS.md).
- Existing wiring pattern: each setting has a `byte_*` storage key, an install default in `background.js`, a read in `content.js`, a `SET_*` message, and a popup row.
- YouTube's DOM changes without notice. Selectors live in named lists, and features fail safe.
- `npm test`, `npm run lint` and `npm run e2e` must pass. Change e2e popup tests that rely on today's popup markup together with the popup.

## Approaches considered

**Popup structure** (black-and-white mockups, chosen interactively):
- **A, Quiet list:** plain rows, and hovering a row unfolds a preview under it. Felt premium and leaves room per feature, but on its own it never shows the current state.
- **B, Live picture:** an always-visible lo-fi picture of the user's YouTube that reflects their settings. Liked, but it makes the popup tall.
- **C, Mirror first:** opens with the feed stat ("3 channels fill 60% of the 48 videos on your home page") and a bar chart. The stat and the chart were loved.
- **Hybrids:** (1) the mirror inside the picture; (2) a mirror card, with rows that unfold their own pictures; (3) **one window** that is the mirror at rest and turns into the live picture on hover, with rows that unfold. **Chosen: 3.**

**Comparing with and without BYTE:**
- A slider over the picture (compares only the drawing).
- Side-by-side pictures with a summary (both are tiny).
- **Hold to compare on the real tab, plus a summary line. Chosen.** The user sees their actual page change, and no permission is needed.

**Icon:** pixel B, mirror ◐, feed bars, bite → pixel B with a bite → monogram + wordmark → **no B: the bite is the whole mark**, tuned by the owner in an interactive tuner.

## Decisions (the owner's, as made)

### Brand

- **Name:** BYTE (Better YouTube Experience). The tagline is still open; "A better YouTube experience" is a placeholder.
- **Monogram:** a lime rounded square with a large bite out of its top-right corner and crumbs. No letter. Exact parameters (the owner tuned these and **declined** a separate 16px drawing, so the same parameters apply at every size):
  - `look=pixel` (drawn on a pixel grid, no anti-aliasing)
  - `size=13.2`, the bite radius in a 16×16 tile space
  - `pos=0.52`, the position along the path top edge (0) → corner (0.5) → right edge (1)
  - `teeth=5`, `tooth=0.18`, `smooth=0`
  - `crumbs=2`, `csize=2.5`
  - `round=2.6`, the tile corner radius
  - `grid=32`, the pixel grid for sizes of 32px and up; 16px uses a 16 grid
  - The geometry is the tuner's, in `.superpowers/brainstorm/36398-1795804041/content/monogram-tuner-v5.html` (local, git-ignored): `biteGeom`, `biteDist` and the `icon()` rasteriser. **It's the reference; the shipped icons must match its renders.**
- **Wordmark:** "BYTE" in chunky 6×8 pixel caps with 2-pixel stems (glyphs in that file's `FONT`). The **E gets bitten** with the same bite parameters, scaled to the letter. The owner saw that at size 13.2 this eats most of the E ("BYT" plus crumbs) and chose to keep it.
- **Channel bar on the page (owner's decision):** it becomes a setting (`Channel bar`, on by default), and its look is restyled to match. The "loop" channels (same rule as the popup) show in the chosen accent; the rest stay neutral.
- **The 128px store icon (my call, from the review):** it follows Chrome's guideline of a 96px mark centred with 16px of transparent padding per side. 16, 32 and 48 are drawn edge to edge as in the tuner.
- **Colours:** four accents. **Lime on ink is the default** for every install and for the store.

  | id | accent | on-accent |
  |---|---|---|
  | lime | `#C6F135` | `#141414` |
  | cobalt | `#3D5AFE` | `#FFFFFF` |
  | tangerine | `#FF7A1A` | `#1A1208` |
  | violet | `#8B5CF6` | `#FFFFFF` |

  Neutrals are near-black ink and greys. Colour is used sparingly: the "loop" channels in the chart, switches that are on, the summary strip, and the icon.
- **The toolbar icon follows the chosen colour** (`chrome.action.setIcon`, no new permission). The owner called this "genius". The store and fresh installs always show lime.

### Popup

- **Header:** monogram + wordmark, and "your home feed".
- **Pause BYTE (owner's decision):** "Hide Shorts" stops being the hidden master switch. Every feature becomes independent, and a separate **Pause BYTE** control turns everything off until it's resumed. A suggested place is clicking the logo in the popup header; the exact control is the builder's call, but it must be discoverable and clearly show a paused state.
  - Today `byte_enabled` (labelled "Block Shorts") gates Shorts, promos, thumbnails, the channel bar and the observer in `content.js` `enable()`/`disable()`. This splits into a Shorts-only setting plus a pause flag.
  - Update the e2e tests that use `byte_enabled: false` to mean "BYTE off" accordingly.
- **The window:** a fixed-size area at the top, so nothing below it moves.
  - **At rest:** the mirror stat, e.g. "**3 channels** fill 60% of the 48 videos on your home page", with a bar chart of videos per channel.
    - **The loop rule (owner's decision):** N is the **fewest channels that together fill at least half of the loaded videos**. Those N bars are in the accent and the rest are grey.
    - **Which page:** the stat counts **only the Home feed** (my call). On Subscriptions or a channel page, "1 channel fills 100%" would be meaningless, so those pages, non-YouTube tabs and an empty feed all get the honest fallback state.
  - **Hovering a setting:** the window crossfades into a lo-fi wireframe of a YouTube page and loops that setting's change. The affected part gets a dashed outline, then animates away (or changes) and the page moves up. The caption says what happens in one plain sentence.
  - **Hold to compare:** a "◐ Hold to compare" button inside the window. While it's held, BYTE turns itself off **in the real YouTube tab**, and the window shows the un-BYTE'd wireframe. A dark strip slides up with a summary, e.g. "BYTE changes this page: **2 things** hidden · **+1** video per row · channel bar added". On release everything returns.
- **Setting rows:** Hide Shorts, Videos per row (stepper), Hide promos, Hide thumbnails, Keep playing (mini player), **Channel bar** (new switch, on by default). Each is an **independent** real off-switch.
  - **Unfolding (owner's decision):** a row gets a chevron and unfolds **only once that feature has real options**. At launch no row has options, so rows are plain. The unfold design from the mockups is kept for later, so the UI never promises what isn't there.
- **Footer:** the Shorts-hidden count, four colour dots (the colour picker; the popup re-tints smoothly), and "Suggest a feature ↗" linking to GitHub issues.
- **Light and dark** follow the system.

### Proposals the owner didn't object to (treat as decided unless they say otherwise)

- **Outlines on the page:** hovering a setting also outlines, on the real page, the part it controls.
  - **Never reveal hidden things (my call, from the review):** if the part is already hidden (e.g. Shorts with Hide Shorts on), hovering does **not** bring it back, not even briefly. Only visible parts get outlined; the window's preview covers the rest. Hold to compare is the only way to see hidden things, and only on purpose.
- **Mini player:** it's a behaviour, so comparing can't show it. Its hover preview is only an animation (a small player sliding into the corner).
- **Motion:** used where it explains a change (Family's "motion is architecture"). Delight goes to rare moments, like changing colour. Frequent actions such as switches stay snappy.

## Data and behaviour notes

- **Mirror stat:** the content script already counts channels and videos on rich-grid pages (`collectChannelData()` in `content.js`). The popup asks the active tab for it, the same way `GET_STATUS` works today.
  - When the active tab isn't YouTube, or the page has no feed, the window needs a fallback state. Its content is left to the builder; it should be honest, with no fake numbers.
- **Hold to compare:** BYTE's visual changes are `<style>` elements plus the insight bar, so "off" means removing or disabling them and "on" means restoring them.
  - **Hard requirement:** the page must never stay in "off" if the popup closes mid-hold, for example from a click outside. That probably means a long-lived port, where a disconnect restores the page.
- **The wireframe** is a schematic driven by the settings, not a screenshot. A screenshot would need extra permission.
- **Summary line:** computed from the current settings against YouTube's defaults.

## Left to the builder

- Generating the icons: extend `scripts/generate-icons.py` (stdlib only) to rasterise the bite, or generate them at runtime for `setIcon`. Either way, the pixels must match the tuner.
- Exact animation timings, easing and wireframe proportions. The mockups in `.superpowers/brainstorm/…/content/` (`popup-decided.html`, `colour-icon.html`, `monogram-tuner-v5.html`) are the visual reference, not production code.
- Storage keys for the colour choice and any new state, following the `byte_*` pattern with install defaults.
- How e2e tests cover hold-to-compare and the colour switch. They need a control that proves each change happened.
- Whether to use the draw-icons skill (`ronykax/skills`, Apache-2.0) for the popup's small UI icons in a pixel style that matches the mark. **Ask the owner before installing it.**
- Version bump: user-visible, so `manifest.json` goes to 1.2.0 (or higher if split into several releases).
