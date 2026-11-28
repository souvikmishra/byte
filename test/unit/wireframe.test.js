'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../../lib/core.js');
const Wireframe = require('../../popup/wireframe.js');

const stateWith = data => Core.effectiveState(Core.readSettings(data));

test('grid preview ends on the user’s own number, from fewer', () => {
  const [before, after] = Wireframe.previewViews('grid', stateWith({}));
  assert.equal(after.cols, Core.GRID_MIN, 'the default, not a made-up count');
  assert.ok(before.cols < after.cols, 'the change shows at the default');
});

test('every stepper press changes the grid preview by one column', () => {
  let last = null;
  for (let n = Core.GRID_MIN; n <= 12; n++) {
    const [before, after] = Wireframe.previewViews('grid', stateWith({ byte_grid_columns: n }));
    assert.equal(after.cols, n);
    assert.ok(before.cols < after.cols);
    if (last !== null) assert.equal(after.cols - last, 1);
    last = after.cols;
  }
});

test('grid preview ends where the at-rest picture is', () => {
  const state = stateWith({ byte_grid_columns: 5 });
  assert.deepEqual(Wireframe.previewViews('grid', state)[1], Wireframe.view(state));
});

test('switch previews go from off to on and keep everything else', () => {
  const state = stateWith({});
  const [before, after] = Wireframe.previewViews('thumbs', state);
  assert.equal(before.thumbs, false);
  assert.equal(after.thumbs, true);
  assert.deepEqual({ ...after, thumbs: false }, before);
  assert.equal(before.cols, Wireframe.view(state).cols);
});

test('the picture draws large column counts without hitting a limit early', () => {
  assert.equal(Wireframe.displayCols(3), 3);
  assert.equal(Wireframe.displayCols(20), 20);
});
