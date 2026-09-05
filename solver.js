/* Chip-on-peg sort solver (browser + Node). */
(function (root) {
  function clonePegs(pegs) {
    return pegs.map((p) => p.slice());
  }

  function normalizePegs(pegs) {
    return (pegs || []).map((p) => (p || []).map((c) => String(c)));
  }

  function capacityOf(pegs, capacity) {
    const cap = Number(capacity);
    if (Number.isFinite(cap) && cap > 0) return cap;
    let m = 1;
    pegs.forEach((p) => { if (p.length > m) m = p.length; });
    return m;
  }

  function isSolved(pegs, capacity) {
    const cap = capacityOf(pegs, capacity);
    const seen = Object.create(null);
    for (let i = 0; i < pegs.length; i++) {
      const p = pegs[i];
      if (!p.length) continue;
      const c0 = p[0];
      for (let k = 1; k < p.length; k++) {
        if (p[k] !== c0) return false;
      }
      if (seen[c0]) return false;
      seen[c0] = 1;
      if (p.length > cap) return false;
    }
    return true;
  }

  function topRun(peg) {
    if (!peg.length) return 0;
    const c = peg[peg.length - 1];
    let n = 1;
    for (let i = peg.length - 2; i >= 0 && peg[i] === c; i--) n++;
    return n;
  }

  function legalMoves(pegs, capacity) {
    const cap = capacityOf(pegs, capacity);
    const moves = [];
    for (let i = 0; i < pegs.length; i++) {
      if (!pegs[i].length) continue;
      const chip = pegs[i][pegs[i].length - 1];
      const run = topRun(pegs[i]);
      for (let j = 0; j < pegs.length; j++) {
        if (i === j) continue;
        const dest = pegs[j];
        const room = cap - dest.length;
        if (room <= 0) continue;
        if (dest.length && dest[dest.length - 1] !== chip) continue;
        const n = Math.min(run, room);
        // Don't pour a whole uniform peg onto an empty peg (no progress).
        if (!dest.length && n === pegs[i].length) continue;
        moves.push({ from: i, to: j, count: n });
      }
    }
    return moves;
  }

  function applyMove(pegs, move) {
    const next = clonePegs(pegs);
    const n = move.count || 1;
    const chunk = next[move.from].splice(next[move.from].length - n, n);
    next[move.to].push.apply(next[move.to], chunk);
    return next;
  }

  function stateKey(pegs) {
    return pegs.map((p) => p.join(',')).join('|');
  }

  function heuristic(pegs, capacity) {
    const cap = capacityOf(pegs, capacity);
    let h = 0;
    const colorPegs = Object.create(null);
    for (let i = 0; i < pegs.length; i++) {
      const p = pegs[i];
      if (!p.length) continue;
      const colors = Object.create(null);
      for (let k = 0; k < p.length; k++) colors[p[k]] = 1;
      const distinct = Object.keys(colors).length;
      if (distinct > 1) h += distinct - 1;
      for (let k = 1; k < p.length; k++) {
        if (p[k] !== p[k - 1]) h += 1;
      }
      Object.keys(colors).forEach((c) => {
        colorPegs[c] = (colorPegs[c] || 0) + 1;
      });
    }
    Object.keys(colorPegs).forEach((c) => {
      if (colorPegs[c] > 1) h += colorPegs[c] - 1;
    });
    // Prefer filling toward capacity when a color is already grouped.
    pegs.forEach((p) => {
      if (p.length && p.every((c) => c === p[0]) && p.length < cap) h += 0.15;
    });
    return h;
  }

  /**
   * A* search. Returns { ok, moves, solved } or { ok:false, reason }.
   */
  function solve(pegsIn, capacity, options) {
    const pegs = normalizePegs(pegsIn);
    const cap = capacityOf(pegs, capacity);
    const opt = options || {};
    const limit = opt.limit || 220000;
    if (!pegs.length) return { ok: false, reason: 'No pegs to solve.' };
    const chips = pegs.reduce((s, p) => s + p.length, 0);
    if (chips < 2) return { ok: false, reason: 'Need at least two chips to sort.' };
    if (isSolved(pegs, cap)) return { ok: true, moves: [], solved: true, already: true };

    const startKey = stateKey(pegs);
    const open = [{ pegs, key: startKey, g: 0, f: heuristic(pegs, cap), prev: -1, move: null }];
    const bestG = Object.create(null);
    bestG[startKey] = 0;
    let head = 0;
    let expanded = 0;

    while (head < open.length && expanded < limit) {
      let bi = head;
      for (let i = head + 1; i < open.length; i++) {
        if (open[i].f < open[bi].f) bi = i;
      }
      const cur = open[bi];
      open[bi] = open[head];
      head += 1;
      expanded += 1;
      if (isSolved(cur.pegs, cap)) {
        const moves = [];
        let node = cur;
        while (node && node.move) {
          moves.push(node.move);
          node = node.prevNode;
        }
        moves.reverse();
        return { ok: true, moves, solved: true, expanded };
      }
      const moves = legalMoves(cur.pegs, cap);
      for (let m = 0; m < moves.length; m++) {
        const nxt = applyMove(cur.pegs, moves[m]);
        const key = stateKey(nxt);
        const g = cur.g + 1;
        if (bestG[key] != null && bestG[key] <= g) continue;
        bestG[key] = g;
        open.push({
          pegs: nxt,
          key,
          g,
          f: g + heuristic(nxt, cap),
          prevNode: cur,
          move: moves[m]
        });
      }
    }

    return {
      ok: false,
      reason: expanded >= limit
        ? 'Search limit reached before a sort was found. Edit the board or add an empty peg.'
        : 'No sort exists for this board (check colors, stack height, and empty pegs).',
      expanded
    };
  }

  function playTo(pegs, moves, step) {
    let cur = normalizePegs(pegs);
    const n = Math.max(0, Math.min(step, (moves || []).length));
    for (let i = 0; i < n; i++) cur = applyMove(cur, moves[i]);
    return cur;
  }

  const api = {
    clonePegs, normalizePegs, capacityOf, isSolved, legalMoves, applyMove,
    stateKey, heuristic, solve, playTo, topRun
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GearSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
