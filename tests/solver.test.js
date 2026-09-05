'use strict';
const assert = require('assert');
const S = require('../solver.js');

const R = '#e74c3c', B = '#3498db', G = '#2ecc71', Y = '#f1c40f';

assert.strictEqual(S.isSolved([[R, R], [B, B], []], 2), true);
assert.strictEqual(S.isSolved([[R, B], [B, R], []], 2), false);
assert.strictEqual(S.isSolved([[R, R], [R], []], 2), false, 'same color on two pegs is not sorted');

const easy = [[R, B], [B, R], [], []];
const easySol = S.solve(easy, 2);
assert.ok(easySol.ok, easySol.reason);
assert.ok(easySol.moves.length >= 1);
const easyEnd = S.playTo(easy, easySol.moves, easySol.moves.length);
assert.ok(S.isSolved(easyEnd, 2), 'easy puzzle must finish sorted');

const sample = [
  [R, R, B, B],
  [B, B, R, R],
  [G, Y, G, Y],
  [Y, G, Y, G],
  [],
  []
];
const sampleSol = S.solve(sample, 4);
assert.ok(sampleSol.ok, sampleSol.reason);
const sampleEnd = S.playTo(sample, sampleSol.moves, sampleSol.moves.length);
assert.ok(S.isSolved(sampleEnd, 4), 'sample must sort');
assert.ok(sampleSol.moves.length < 80, 'sample should not need a huge path');

const already = [[R, R, R, R], [B, B, B, B], [], []];
const alreadySol = S.solve(already, 4);
assert.ok(alreadySol.ok && alreadySol.already);
assert.deepStrictEqual(alreadySol.moves, []);

const empty = S.solve([[], []], 4);
assert.strictEqual(empty.ok, false);

const moves = S.legalMoves([[R, B], [R], []], 2);
assert.ok(moves.some((m) => m.from === 0 && m.to === 2), 'can pour a mixed peg onto empty');
assert.ok(!moves.some((m) => m.from === 1 && m.to === 2), 'do not move a whole uniform peg onto empty');
