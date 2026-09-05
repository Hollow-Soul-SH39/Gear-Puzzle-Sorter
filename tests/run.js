'use strict';
const tests = [
  './board-gate.test.js',
  './solver.test.js',
  './board-detect.test.js'
];
for (const t of tests) {
  require(t);
  console.log('ok', t);
}
console.log('all tests passed');
