'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ByteMark = require('../../lib/mark.js');

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
test('SVG output is crisp, scriptless, and validates the colour', () => {
  for (const svg of [ByteMark.markSVG(32, '#3D5AFE'), ByteMark.wordmarkSVG(24, '#3D5AFE')]) {
    assert.match(svg, /^<svg [^>]*shape-rendering="crispEdges"/);
    assert.match(svg, /viewBox="/);
    assert.match(svg, /fill="#3D5AFE"/);
    assert.doesNotMatch(svg, /script/i);
  }
  const bad = ByteMark.markSVG(16, '"><script>alert(1)</script>');
  assert.match(bad, /fill="#C6F135"/);
  assert.doesNotMatch(bad, /script/i);
  assert.match(ByteMark.wordmarkSVG(24, '#abc'), /fill="#aabbcc"/);
});
