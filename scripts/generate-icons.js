'use strict';
// Regenerates icons/*.png and the brand SVGs in design/brand/ from lib/mark.js
// (Node stdlib only). Usage: node scripts/generate-icons.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const Mark = require('../lib/mark.js');
const Core = require('../lib/core.js');

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([head, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height); // filter byte 0 per row
  for (let y = 0; y < height; y++) {
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ROOT = path.join(__dirname, '..');

// design/brand/: the mark in every accent, and the wordmark in ink and white.
// `require`d by test/unit/icons.test.js to check the committed files.
function brandAssets() {
  const files = {};
  for (const p of Core.PALETTES) files[`mark-${p.id}.svg`] = Mark.markSVG(128, p.accent) + '\n';
  files['wordmark-ink.svg'] = Mark.wordmarkSVG(48, '#141414') + '\n';
  files['wordmark-white.svg'] = Mark.wordmarkSVG(48, '#FFFFFF') + '\n';
  return files;
}

function main() {
  const accent = Core.paletteFor('lime').accent;
  for (const size of [16, 32, 48, 128]) {
    const rgba = size === 128 ? Mark.storeIconPixels(accent) : Mark.markPixels(size, accent);
    fs.writeFileSync(path.join(ROOT, 'icons', `icon${size}.png`), encodePng(size, size, rgba));
  }
  const brandDir = path.join(ROOT, 'design', 'brand');
  fs.mkdirSync(brandDir, { recursive: true });
  for (const [name, svg] of Object.entries(brandAssets())) fs.writeFileSync(path.join(brandDir, name), svg);
}

if (require.main === module) main();
module.exports = { brandAssets };
