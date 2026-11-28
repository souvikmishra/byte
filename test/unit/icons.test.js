'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const Mark = require('../../lib/mark.js');
const Core = require('../../lib/core.js');

const ACCENT = Core.paletteFor('lime').accent;
const ICONS = path.join(__dirname, '..', '..', 'icons');

function readPng(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  let pos = 8, ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') ihdr = data;
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  assert.equal(idat.length, 1, 'one IDAT');
  assert.equal(ihdr[8], 8, 'bit depth 8');
  assert.equal(ihdr[9], 6, 'color type RGBA');
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  const raw = zlib.inflateSync(idat[0]);
  const stride = width * 4 + 1;
  assert.equal(raw.length, stride * height);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    assert.equal(raw[y * stride], 0, 'filter type 0');
    rgba.set(raw.subarray(y * stride + 1, (y + 1) * stride), y * width * 4);
  }
  return { width, height, rgba };
}

test('committed icons match lib/mark.js', () => {
  for (const size of [16, 32, 48, 128]) {
    const png = readPng(path.join(ICONS, `icon${size}.png`));
    assert.equal(png.width, size);
    assert.equal(png.height, size);
    const want = size === 128 ? Mark.storeIconPixels(ACCENT) : Mark.markPixels(size, ACCENT);
    assert.deepEqual(Array.from(png.rgba), Array.from(want), `icon${size}.png`);
  }
});

test('committed brand SVGs match lib/mark.js', () => {
  const { brandAssets } = require('../../scripts/generate-icons.js');
  const dir = path.join(__dirname, '..', '..', 'design', 'brand');
  const expected = brandAssets();
  assert.deepEqual(fs.readdirSync(dir).filter(f => f.endsWith('.svg')).sort(), Object.keys(expected).sort());
  for (const [name, svg] of Object.entries(expected)) assert.equal(fs.readFileSync(path.join(dir, name), 'utf8'), svg, name);
});
