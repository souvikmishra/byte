'use strict';

// The popup's live picture: a lo-fi YouTube page drawn from the settings, not
// a screenshot. popup.css styles it; this file only builds it and toggles its
// classes.
//
//   ByteWireframe.create(el) -> { render(state), preview(featureId, state), stop() }
//
// `state` has the shape of ByteCore.effectiveState(). view/previewViews are
// pure and exported for the unit tests, the same way lib/*.js load in Node.
(function (root) {
  // The channel strip's sample shape (videos per channel); the first LOOP bars
  // are the "loop" channels, as on the real page.
  const SAMPLE = [34, 27, 22, 12, 10, 8, 7, 6, 5];
  const LOOP = 3;
  const YOUTUBE_COLS = 3;  // the picture's stand-in for YouTube's own grid
  // The grid preview starts from fewer than any BYTE setting (the minimum is
  // 3), so it always ends on the user's own number and each press shows.
  const FEWER_COLS = 2;
  // A physical limit of a ~240px drawing: past this a card is under 5px wide.
  const MAX_COLS = 40;

  // Preview loop: outline the part, then apply the change, then start over.
  const FLAG_AT = 450;
  const CHANGE_AT = 1150;
  const RESTART_AT = 3200;

  function node(tag, className, children = []) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    n.append(...children);
    return n;
  }
  const times = (count, make) => Array.from({ length: count }, (_, i) => make(i));
  const card = () => node('div', 'wf-card', [node('div', 'wf-thumb'), node('div', 'wf-l1'), node('div', 'wf-l2')]);

  function build(el) {
    el.classList.add('wf');
    const chan = node('div', 'wf-chan', times(SAMPLE.length, i => {
      const bar = node('b', i < LOOP ? 'top' : '');
      bar.style.height = `${Math.round(SAMPLE[i] / SAMPLE[0] * 100)}%`;
      return bar;
    }));
    el.replaceChildren(
      node('div', 'wf-top', [node('i', 'lg'), node('i', 'sr')]),
      node('div', 'wf-body', [
        node('div', 'wf-side', [node('i'), node('i', 'sh'), node('i'), node('i'), node('i')]),
        node('div', 'wf-main', [
          chan,
          node('div', 'wf-grid', times(3, card)),
          node('div', 'wf-shelf', times(6, () => node('i'))),
          node('div', 'wf-promo'),
          node('div', 'wf-grid', times(MAX_COLS, card)), // a full row at any count
        ]),
      ]),
      node('div', 'wf-mini', [node('i')]),
    );
  }

  // effectiveState -> what the picture shows. The mini player is a behaviour,
  // so it only appears in its own preview.
  function view(state) {
    return {
      shorts: state.hideShorts,
      promos: state.hidePromos,
      thumbs: state.hideThumbs,
      bar:    state.channelBar,
      mini:   false,
      cols:   state.gridColumns ?? YOUTUBE_COLS,
    };
  }

  // The picture before and after one feature, with everything else as it is.
  function previewViews(featureId, state) {
    const now = view(state);
    const field = { shorts: 'shorts', promos: 'promos', thumbs: 'thumbs', channelBar: 'bar', miniplayer: 'mini' }[featureId];
    if (field) return [{ ...now, [field]: false }, { ...now, [field]: true }];
    if (featureId === 'grid') return [{ ...now, cols: FEWER_COLS }, now];
    return [now, now];
  }

  const displayCols = n => Math.min(n, MAX_COLS);

  function create(el) {
    build(el);
    let timers = [];
    let flag = '';

    function setFlag(id) {
      if (flag) el.classList.remove(`flag-${flag}`);
      flag = id;
      if (flag) el.classList.add(`flag-${flag}`);
    }

    function apply(v) {
      el.classList.toggle('no-shorts', v.shorts);
      el.classList.toggle('no-promos', v.promos);
      el.classList.toggle('no-thumbs', v.thumbs);
      el.classList.toggle('plain', !v.bar);
      el.classList.toggle('mini', v.mini);
      el.style.setProperty('--cols', String(displayCols(v.cols)));
    }

    function stop() {
      timers.forEach(clearTimeout);
      timers = [];
      setFlag('');
    }

    function render(state) {
      stop();
      apply(view(state));
    }

    function preview(featureId, state) {
      stop();
      const [before, after] = previewViews(featureId, state);
      if (root.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        apply(after);
        return;
      }
      const at = (ms, fn) => timers.push(setTimeout(fn, ms));
      const loop = () => {
        timers = [];
        setFlag('');
        apply(before);
        at(FLAG_AT, () => setFlag(featureId));
        at(CHANGE_AT, () => { setFlag(''); apply(after); });
        at(RESTART_AT, loop);
      };
      loop();
    }

    return { render, preview, stop };
  }

  const Wireframe = Object.freeze({ create, view, previewViews, displayCols });
  if (typeof module === 'object' && module.exports) module.exports = Wireframe;
  else root.ByteWireframe = Wireframe;
})(globalThis);
