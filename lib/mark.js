// Pure geometry for the BYTE bite mark (the app icon) and the bitten-E wordmark.
// No DOM, no chrome.* calls, so it runs in a content script, the popup, the
// MV3 service worker and Node. Ported from the owner's tuner; the algorithm
// (biteGeom, biteDist, inRound) is deliberately unchanged.
//
// Loaded two ways, like lib/core.js: `globalThis.ByteMark` in the extension,
// `module.exports` when require()'d by the unit tests.
(function (root) {
  'use strict';

  const MARK_PARAMS = Object.freeze({
    size: 13.2, pos: 0.52, teeth: 5, tooth: 0.18, smooth: 0,
    crumbs: 2, csize: 2.5, round: 2.6, grid: 32,
  });
  const DEFAULT_HEX = '#C6F135';

  // 6x8 pixel caps with 2-pixel stems.
  const FONT = {
    B: ['111110', '110011', '110011', '111110', '110011', '110011', '110011', '111110'],
    Y: ['110011', '110011', '110011', '011110', '001100', '001100', '001100', '001100'],
    T: ['111111', '111111', '001100', '001100', '001100', '001100', '001100', '001100'],
    E: ['111111', '110000', '110000', '111110', '110000', '110000', '110000', '111111'],
  };
  const WORD = 'BYTE';
  const ADVANCE = 7;

  // The bite: a jaw circle with `teeth` bumps on its rim, plus crumbs.
  function biteGeom(W, H, scale, P) {
    const t = P.pos;
    const a = [W * 0.6, -scale], c = [W + scale * 0.2, -scale * 0.2], b = [W + scale, H * 0.4];
    const lerp = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
    const ctr = t < 0.5 ? lerp(a, c, t * 2) : lerp(c, b, (t - 0.5) * 2);
    const r = Math.max(0, P.size * scale);
    const dx = ctr[0] - W / 2, dy = ctr[1] - H / 2, L = Math.hypot(dx, dy) || 1;
    const d = [dx / L, dy / L];
    const n = Math.max(1, Math.round(P.teeth));
    const circles = [];
    if (n === 1) circles.push([ctr[0], ctr[1], r]);
    else {
      const rt = Math.max(0.01, r * P.tooth), R = Math.max(0, r - rt * 0.45);
      circles.push([ctr[0], ctr[1], R]);
      const base = Math.atan2(-d[1], -d[0]);
      const step = R > 0 ? 2 * Math.asin(Math.min(1, rt / R)) * 0.95 : 0;
      for (let i = 0; i < n; i++) {
        const th = base + (i - (n - 1) / 2) * step;
        circles.push([ctr[0] + Math.cos(th) * R, ctr[1] + Math.sin(th) * R, rt]);
      }
    }
    const crumbs = [];
    for (let i = 0; i < Math.max(0, Math.round(P.crumbs)); i++) {
      const ang = (i - (P.crumbs - 1) / 2) * 0.62, ca = Math.cos(ang), sa = Math.sin(ang);
      const dir = [-(d[0] * ca - d[1] * sa), -(d[0] * sa + d[1] * ca)];
      const dist = r * (i % 2 ? 0.5 : 0.7);
      crumbs.push([ctr[0] + dir[0] * dist, ctr[1] + dir[1] * dist]);
    }
    return { circles, crumbs, k: Math.max(0, P.smooth) * scale };
  }

  // Smooth union of the teeth (signed distance; < 0 means bitten).
  function biteDist(x, y, g) {
    let d = Infinity;
    for (const c of g.circles) {
      const e = Math.hypot(x - c[0], y - c[1]) - c[2];
      if (d === Infinity || g.k <= 0) { d = Math.min(d, e); continue; }
      const h = Math.max(g.k - Math.abs(d - e), 0) / g.k;
      d = Math.min(d, e) - h * h * g.k / 4;
    }
    return d;
  }

  function inRound(x, y, r) {
    r = Math.min(Math.max(r, 0), 8);
    const cx = Math.min(Math.max(x, r), 16 - r), cy = Math.min(Math.max(y, r), 16 - r);
    return Math.hypot(x - cx, y - cy) <= r;
  }

  function gridSizeFor(px, params = MARK_PARAMS) {
    return px <= 16 ? 16 : Math.min(params.grid, Math.max(1, Math.round(px)));
  }

  // N rows of '#' (lit) and '.' (clear), on a 16-unit tile sampled at N cells.
  function markGrid(N, params = MARK_PARAMS) {
    const g = biteGeom(16, 16, 1, params), s = 16 / N;
    const cs = Math.max(params.csize, s);
    const crumbCells = g.crumbs.map(([cx, cy]) => [
      Math.round((cx - cs / 2) / s), Math.round((cy - cs / 2) / s), Math.max(1, Math.round(cs / s)),
    ]);
    const rows = [];
    for (let y = 0; y < N; y++) {
      let row = '';
      for (let x = 0; x < N; x++) {
        const px = (x + 0.5) * s, py = (y + 0.5) * s;
        let on = inRound(px, py, params.round) && biteDist(px, py, g) >= 0;
        if (!on) {
          for (const [x0, y0, n] of crumbCells) {
            if (x >= x0 && x < x0 + n && y >= y0 && y < y0 + n) { on = true; break; }
          }
        }
        row += on ? '#' : '.';
      }
      rows.push(row);
    }
    return rows;
  }

  // Only #RGB / #RRGGBB reach markup or pixel data; anything else is lime.
  function normalizeHex(hex) {
    if (typeof hex !== 'string') return DEFAULT_HEX;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
    if (/^#[0-9a-fA-F]{3}$/.test(hex)) return '#' + [...hex.slice(1)].map(c => c + c).join('');
    return DEFAULT_HEX;
  }

  function rgbOf(hex) {
    const h = normalizeHex(hex);
    return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  }

  function markPixels(px, hex, params = MARK_PARAMS) {
    const size = Math.max(1, Math.round(px));
    const grid = markGrid(gridSizeFor(size, params), params), N = grid.length;
    const [R, G, B] = rgbOf(hex);
    const out = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      const row = grid[Math.min(N - 1, Math.floor(y * N / size))];
      for (let x = 0; x < size; x++) {
        if (row[Math.min(N - 1, Math.floor(x * N / size))] !== '#') continue;
        const i = (y * size + x) * 4;
        out[i] = R; out[i + 1] = G; out[i + 2] = B; out[i + 3] = 255;
      }
    }
    return out;
  }

  // 128x128 store icon: the 96px mark centred, 16px transparent padding.
  function storeIconPixels(hex) {
    const out = new Uint8ClampedArray(128 * 128 * 4);
    const mark = markPixels(96, hex);
    for (let y = 0; y < 96; y++) {
      out.set(mark.subarray(y * 96 * 4, (y + 1) * 96 * 4), ((y + 16) * 128 + 16) * 4);
    }
    return out;
  }

  function wordmarkRects(params = MARK_PARAMS) {
    const scale = 0.5, g = biteGeom(6, 8, scale, params);
    const rects = [];
    let x0 = 0;
    [...WORD].forEach((letter, i) => {
      FONT[letter].forEach((row, y) => [...row].forEach((c, x) => {
        if (c !== '1') return;
        if (i === WORD.length - 1 && biteDist(x + 0.5, y + 0.5, g) < 0) return;
        rects.push({ x: x0 + x, y, w: 1, h: 1 });
      }));
      if (i === WORD.length - 1) {
        const s = Math.max(0.6, params.csize * scale);
        g.crumbs.forEach(([cx, cy]) => rects.push({ x: x0 + cx - s / 2, y: cy - s / 2, w: s, h: s }));
      }
      x0 += ADVANCE;
    });
    return { width: 27, height: 8, rects };
  }

  const num = n => String(+n.toFixed(3));

  function markSVG(px, hex, params = MARK_PARAMS) {
    const size = Math.max(1, Math.round(px));
    const grid = markGrid(gridSizeFor(size, params), params), N = grid.length;
    const fill = normalizeHex(hex);
    let d = '';
    grid.forEach((row, y) => {
      for (const m of row.matchAll(/#+/g)) d += `<rect x="${m.index}" y="${y}" width="${m[0].length}" height="1"/>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges" fill="${fill}">${d}</svg>`;
  }

  function wordmarkSVG(heightPx, hex, params = MARK_PARAMS) {
    const { width, height, rects } = wordmarkRects(params);
    const fill = normalizeHex(hex);
    const h = Math.max(1, +heightPx || height);
    // Leave room above/below for the crumbs, which can sit outside the 27x8 box.
    const pad = 2, vbH = height + pad * 2;
    const body = rects.map(r => `<rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(r.h)}"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${num(h * width / vbH)}" height="${num(h)}" viewBox="0 ${-pad} ${width} ${vbH}" shape-rendering="crispEdges" fill="${fill}">${body}</svg>`;
  }

  const Mark = Object.freeze({
    MARK_PARAMS,
    markGrid,
    gridSizeFor,
    markPixels,
    storeIconPixels,
    wordmarkRects,
    markSVG,
    wordmarkSVG,
  });

  if (typeof module === 'object' && module.exports) module.exports = Mark;
  else root.ByteMark = Mark;
})(typeof globalThis !== 'undefined' ? globalThis : this);
