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

const Color = require('../color.js');
assert.ok(Color.rgbToHsv(40, 90, 220).h > 200 && Color.rgbToHsv(40, 90, 220).h < 250,
  'blue HSV hue must stay in the blue range (not collapse onto purple)');
assert.ok(Color.hsvDist(
  { r: 40, g: 90, b: 220 },
  { r: 150, g: 50, b: 190 }
) > 46, 'blue and purple must not cluster as one color');

const PURPLE = [150, 50, 190];
const WOOD = [118, 82, 48];
const METAL = [168, 170, 176];
const GOLD = [220, 180, 40];

function hueName(hex) {
  const rgb = Color.hexToRgb(hex);
  const hsv = Color.rgbToHsv(rgb.r, rgb.g, rgb.b);
  if (hsv.s < 0.18) return 'gray';
  if (hsv.h < 18 || hsv.h >= 335) return 'red';
  if (hsv.h < 48) return 'orange';
  if (hsv.h < 78) return 'yellow';
  if (hsv.h < 165) return 'green';
  if (hsv.h < 255) return 'blue';
  return 'purple';
}

function namesOf(stack) {
  return stack.map(hueName);
}

/**
 * Paint a Gear Sort-style multi-shelf board.
 * Each peg is visual top→bottom colors (same as the game screenshot).
 * Solver / detectBoard pegs are bottom→top (index 0 sits on the peg base).
 */
function paintShelves(img, shelves, opts) {
  const o = opts || {};
  const chip = o.chip || 18;
  const gap = o.gap != null ? o.gap : chip * 4;
  const pegPitch = o.pegPitch || chip * 1.55;
  const wood = o.wood || WOOD;
  fill(img, 0, 0, img.width, img.height, wood);
  if (o.banner) fill(img, 10, 8, img.width - 20, 16, GOLD);
  (o.coins || []).forEach((c) => fill(img, c[0], c[1], 8, 8, GOLD));

  let y = o.top || 36;
  shelves.forEach((pegs) => {
    const n = pegs.length;
    const totalW = (n - 1) * pegPitch;
    const x0 = o.center
      ? Math.round((img.width - totalW) / 2)
      : (o.x0 || 28);
    pegs.forEach((stack, i) => {
      const cx = x0 + i * pegPitch;
      fill(img, Math.round(cx - 2), y, 4, chip * 4 + 8, METAL);
      if (!stack || !stack.length) return;
      stack.forEach((rgb, r) => {
        fill(img, Math.round(cx - chip / 2 + 1), y + r * chip + 1, chip - 2, chip - 2, rgb);
      });
    });
    y += chip * 4 + gap;
  });
}

// Level 32: 3 pegs on the top shelf, 4 on the bottom (two empty). Uneven widths.
// Visual top→bottom from the Labor Day screenshot; detectBoard must store bottom→top.
const L32_TOP = [
  [BLUE, GREEN, BLUE, RED],
  [BLUE, YELLOW, YELLOW, BLUE],
  [GREEN, RED, YELLOW, PURPLE]
];
const L32_BOT = [
  [PURPLE, GREEN, PURPLE, BLUE],
  [PURPLE, RED, RED, YELLOW],
  null,
  null
];
const L32_EXPECTED = [
  ['red', 'blue', 'green', 'blue'],
  ['blue', 'yellow', 'yellow', 'blue'],
  ['purple', 'yellow', 'red', 'green'],
  ['blue', 'purple', 'green', 'purple'],
  ['yellow', 'red', 'red', 'purple']
];

const l32 = makeImage(220, 360, (img) => {
  paintShelves(img, [L32_TOP, L32_BOT], {
    chip: 16,
    gap: 68,
    pegPitch: 26,
    top: 48,
    center: true,
    banner: true,
    coins: [[16, 200], [190, 210], [30, 330]]
  });
});
const det32 = Detect.detectBoard(l32);
assert.ok(det32.ok, 'Level 32 multi-shelf should read: ' + det32.reason);
assert.ok(det32.pegs, 'Level 32 must not invent a null board');
assert.ok(det32.pegs.length >= 5, 'Level 32 pegs ' + det32.pegs.length);
assert.strictEqual(det32.rows, 4, 'Level 32 capacity/rows ' + det32.rows);
assert.ok(det32.chipCount >= 18, 'Level 32 chipCount ' + det32.chipCount);
assert.ok(det32.colorCount >= 4, 'Level 32 colorCount ' + det32.colorCount);
assert.strictEqual(Gate.isJunkScan(det32), false, 'Level 32 must pass the gate');

const filled32 = det32.pegs.filter((p) => p.length);
assert.ok(filled32.length >= 5, 'expected 5 filled pegs, got ' + filled32.length);
filled32.slice(0, 5).forEach((stack, i) => {
  assert.deepStrictEqual(namesOf(stack), L32_EXPECTED[i],
    'L32 peg ' + (i + 1) + ' ' + namesOf(stack).join(',') + ' vs ' + L32_EXPECTED[i].join(','));
});
if (det32.pegs.length >= 7) {
  assert.strictEqual(det32.pegs[5].length, 0, 'peg 6 empty');
  assert.strictEqual(det32.pegs[6].length, 0, 'peg 7 empty');
}

// Earlier same-class layout: two shelves of 3 pegs.
const twoByThree = makeImage(200, 300, (img) => {
  paintShelves(img, [
    [[RED, BLUE, GREEN, YELLOW], [BLUE, RED, YELLOW, GREEN], [GREEN, YELLOW, RED, BLUE]],
    [[YELLOW, GREEN, BLUE, RED], [RED, YELLOW, GREEN, BLUE], [BLUE, GREEN, YELLOW, RED]]
  ], { chip: 16, gap: 64, pegPitch: 28, top: 40, center: true });
});
const det23 = Detect.detectBoard(twoByThree);
assert.ok(det23.ok, '2x3 shelves should read: ' + det23.reason);
assert.ok(det23.pegs && det23.pegs.length >= 6, '2x3 pegs ' + (det23.pegs && det23.pegs.length));
assert.ok(det23.chipCount >= 20, '2x3 chips ' + det23.chipCount);
assert.strictEqual(Gate.isJunkScan(det23), false);

const woodOnly = makeImage(200, 320, (img) => {
  fill(img, 0, 0, 200, 320, WOOD);
  fill(img, 20, 12, 160, 14, GOLD);
  fill(img, 24, 180, 9, 9, GOLD);
  fill(img, 160, 220, 9, 9, GOLD);
});
const detWood = Detect.detectBoard(woodOnly);
assert.strictEqual(detWood.ok, false, 'wood + coins must fail closed');
assert.strictEqual(detWood.pegs, null, 'wood + coins must not invent pegs');

function downscale(img, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(16, Math.round(img.width * scale));
  const h = Math.max(16, Math.round(img.height * scale));
  return makeImage(w, h, (out) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = Math.min(img.width - 1, Math.floor(x / scale));
        const sy = Math.min(img.height - 1, Math.floor(y / scale));
        const si = (sy * img.width + sx) * 4;
        const di = (y * w + x) * 4;
        out.data[di] = img.data[si];
        out.data[di + 1] = img.data[si + 1];
        out.data[di + 2] = img.data[si + 2];
        out.data[di + 3] = 255;
      }
    }
  });
}

const l32big = makeImage(440, 720, (img) => {
  paintShelves(img, [L32_TOP, L32_BOT], {
    chip: 32,
    gap: 136,
    pegPitch: 52,
    top: 96,
    center: true,
    banner: true,
    coins: [[32, 400], [380, 420], [60, 660]]
  });
});
const det32s = Detect.detectBoard(downscale(l32big, 480));
assert.ok(det32s.ok, 'downscaled Level 32 (app scan size) should read: ' + det32s.reason);
assert.ok(det32s.pegs && det32s.pegs.filter((p) => p.length).length >= 5, 'downscaled L32 filled pegs');
assert.strictEqual(Gate.isJunkScan(det32s), false);
