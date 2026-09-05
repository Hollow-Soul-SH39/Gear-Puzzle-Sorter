'use strict';
const assert = require('assert');
const { isJunkScan, scanLooksTrusted, failReason } = require('../board-gate.js');

assert.strictEqual(isJunkScan(null), true);
assert.strictEqual(isJunkScan({}), true);
assert.strictEqual(isJunkScan({ ok: false, rows: 4, cols: 4, chipCount: 8, colorCount: 3 }), true);
assert.strictEqual(isJunkScan({ rows: 1, cols: 4, chipCount: 8, colorCount: 3, gridScore: 0.9 }), true);
assert.strictEqual(isJunkScan({ rows: 4, cols: 4, chipCount: 2, colorCount: 2, gridScore: 0.9 }), true);
assert.strictEqual(isJunkScan({ rows: 4, cols: 4, chipCount: 8, colorCount: 1, gridScore: 0.9 }), true);
assert.strictEqual(isJunkScan({ rows: 4, cols: 4, chipCount: 8, colorCount: 3, gridScore: 0.2 }), true);
assert.strictEqual(isJunkScan({
  rows: 4, cols: 4, chipCount: 8, colorCount: 3, gridScore: 0.9, noisyCells: 10
}), true);

const good = { rows: 4, cols: 6, chipCount: 16, colorCount: 4, gridScore: 0.8, noisyCells: 1 };
assert.strictEqual(isJunkScan(good), false);
assert.strictEqual(scanLooksTrusted(good), true);

const noisy = { rows: 4, cols: 6, chipCount: 16, colorCount: 4, gridScore: 0.48, noisyCells: 1 };
assert.strictEqual(isJunkScan(noisy), false);
assert.strictEqual(scanLooksTrusted(noisy), false);

const msg = failReason({ ok: false });
assert.ok(/not invent|No board|Could not read/i.test(msg), msg);
