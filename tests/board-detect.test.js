'use strict';
const assert = require('assert');
const Detect = require('../board-detect.js');
const Gate = require('../board-gate.js');

function makeImage(w, h, paint) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data[i + 3] = 255;
  const img = { width: w, height: h, data };
  paint(img);
  return img;
}

function fill(img, x, y, w, h, rgb) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) continue;
      const i = (yy * img.width + xx) * 4;
      img.data[i] = rgb[0];
      img.data[i + 1] = rgb[1];
      img.data[i + 2] = rgb[2];
      img.data[i + 3] = 255;
    }
  }
}

const RED = [220, 40, 40];
const BLUE = [40, 90, 220];
const GREEN = [40, 190, 90];
const YELLOW = [230, 200, 30];
const BG = [28, 24, 18];

function gridBoard(rows, cols, colors, cell) {
  const pad = 16;
  const cw = cell || 28;
  const w = pad * 2 + cols * cw;
  const h = pad * 2 + rows * cw;
  return makeImage(w, h, (img) => {
    fill(img, 0, 0, w, h, BG);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const rgb = colors[r][c];
        if (!rgb) continue;
        fill(img, pad + c * cw + 2, pad + r * cw + 2, cw - 4, cw - 4, rgb);
      }
    }
  });
}

const colors4 = [
  [RED, RED, BLUE, BLUE],
  [BLUE, BLUE, RED, RED],
  [GREEN, YELLOW, GREEN, YELLOW],
  [YELLOW, GREEN, YELLOW, GREEN]
];
const img4 = gridBoard(4, 4, colors4);
const det4 = Detect.detectBoard(img4);
assert.ok(det4.ok, '4x4 grid should read: ' + det4.reason);
assert.strictEqual(det4.rows, 4, 'rows ' + det4.rows);
assert.strictEqual(det4.cols, 4, 'cols ' + det4.cols);
assert.ok(det4.chipCount >= 16, 'chipCount ' + det4.chipCount);
assert.ok(det4.colorCount >= 4, 'colorCount ' + det4.colorCount);
assert.strictEqual(Gate.isJunkScan(det4), false);

const colors3x5 = [
  [RED, BLUE, GREEN, YELLOW, RED],
  [BLUE, GREEN, YELLOW, RED, BLUE],
  [GREEN, YELLOW, RED, BLUE, GREEN]
];
const img35 = gridBoard(3, 5, colors3x5, 24);
const det35 = Detect.detectBoard(img35);
assert.ok(det35.ok, '3x5 should read: ' + det35.reason);
assert.strictEqual(det35.rows, 3, '3x5 rows ' + det35.rows);
assert.strictEqual(det35.cols, 5, '3x5 cols ' + det35.cols);

const blank = makeImage(80, 80, (img) => fill(img, 0, 0, 80, 80, [40, 40, 40]));
const detBlank = Detect.detectBoard(blank);
assert.strictEqual(detBlank.ok, false);
assert.ok(/invent|blank|uniform|No board/i.test(detBlank.reason), detBlank.reason);
assert.strictEqual(detBlank.pegs, null, 'blank photo must not invent pegs');

const tiny = makeImage(8, 8, (img) => fill(img, 0, 0, 8, 8, RED));
const detTiny = Detect.detectBoard(tiny);
assert.strictEqual(detTiny.ok, false);
assert.strictEqual(detTiny.pegs, null);

const noise = makeImage(120, 90, (img) => {
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = (i * 17) % 256;
    img.data[i + 1] = (i * 31) % 256;
    img.data[i + 2] = (i * 53) % 256;
    img.data[i + 3] = 255;
  }
});
const detNoise = Detect.detectBoard(noise);
assert.strictEqual(detNoise.ok, false, 'noise must fail closed, got ' + JSON.stringify({
  ok: detNoise.ok, rows: detNoise.rows, cols: detNoise.cols, chips: detNoise.chipCount
}));
assert.strictEqual(detNoise.pegs, null, 'noise must not invent a board');

assert.strictEqual(Detect.detectBoard(null).ok, false);
