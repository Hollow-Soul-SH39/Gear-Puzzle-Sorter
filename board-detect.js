/* Adaptive any-color / any-grid board detect. Fail-closed: no invented board. */
(function (root) {
  const Color = (typeof module !== 'undefined' && module.exports)
    ? require('./color.js')
    : root.GearColor;
  const Gate = (typeof module !== 'undefined' && module.exports)
    ? require('./board-gate.js')
    : root.GearBoardGate;

  function fail(reason, extra) {
    const out = Object.assign({
      ok: false,
      reason: reason || Gate.failReason(null),
      rows: 0,
      cols: 0,
      chipCount: 0,
      colorCount: 0,
      gridScore: 0,
      noisyCells: 0,
      pegs: null,
      cells: null
    }, extra || {});
    return out;
  }

  function pixelAt(img, x, y) {
    const i = (y * img.width + x) * 4;
    return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2], a: img.data[i + 3] };
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function globalStats(img) {
    let n = 0, sr = 0, sg = 0, sb = 0;
    const step = Math.max(1, Math.floor((img.width * img.height) / 8000));
    for (let i = 0; i < img.data.length; i += 4 * step) {
      sr += img.data[i]; sg += img.data[i + 1]; sb += img.data[i + 2];
      n++;
    }
    if (!n) return { variance: 0, mean: { r: 0, g: 0, b: 0 } };
    const mr = sr / n, mg = sg / n, mb = sb / n;
    let v = 0;
    for (let i = 0; i < img.data.length; i += 4 * step) {
      const dr = img.data[i] - mr, dg = img.data[i + 1] - mg, db = img.data[i + 2] - mb;
      v += dr * dr + dg * dg + db * db;
    }
    return { variance: v / n, mean: { r: mr, g: mg, b: mb } };
  }

  function findContentBox(img) {
    const w = img.width, h = img.height;
    let minX = w, minY = h, maxX = 0, maxY = 0, hit = 0;
    const stepX = Math.max(1, Math.floor(w / 180));
    const stepY = Math.max(1, Math.floor(h / 180));
    for (let y = 0; y < h; y += stepY) {
      for (let x = 0; x < w; x += stepX) {
        const p = pixelAt(img, x, y);
        const chroma = Color.chromaOf(p.r, p.g, p.b);
        const hsv = Color.rgbToHsv(p.r, p.g, p.b);
        if (chroma > 26 && hsv.s > 0.20 && hsv.v > 0.16 && hsv.v < 0.98) {
          hit++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (hit < 10) return null;
    const pad = 1;
    return {
      x: clamp(minX - pad, 0, w - 1),
      y: clamp(minY - pad, 0, h - 1),
      w: clamp(maxX - minX + 1 + pad * 2, 8, w - clamp(minX - pad, 0, w - 1)),
      h: clamp(maxY - minY + 1 + pad * 2, 8, h - clamp(minY - pad, 0, h - 1))
    };
  }

  function sampleRect(img, x0, y0, x1, y1) {
    x0 = clamp(Math.floor(x0), 0, img.width - 1);
    y0 = clamp(Math.floor(y0), 0, img.height - 1);
    x1 = clamp(Math.ceil(x1), x0 + 1, img.width);
    y1 = clamp(Math.ceil(y1), y0 + 1, img.height);
    let n = 0, sr = 0, sg = 0, sb = 0;
    const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 48)));
    for (let y = y0; y < y1; y += step) {
      for (let x = x0; x < x1; x += step) {
        const p = pixelAt(img, x, y);
        sr += p.r; sg += p.g; sb += p.b;
        n++;
      }
    }
    if (!n) return { mean: { r: 0, g: 0, b: 0 }, variance: 1e9, sat: 0 };
    const mean = { r: sr / n, g: sg / n, b: sb / n };
    let v = 0;
    for (let y = y0; y < y1; y += step) {
      for (let x = x0; x < x1; x += step) {
        const p = pixelAt(img, x, y);
        const dr = p.r - mean.r, dg = p.g - mean.g, db = p.b - mean.b;
        v += dr * dr + dg * dg + db * db;
      }
    }
    const hsv = Color.rgbToHsv(mean.r, mean.g, mean.b);
    return { mean, variance: v / n, sat: hsv.s, val: hsv.v, hue: hsv.h };
  }

  function gradientProfile(img, box, axis) {
    const n = axis === 'x' ? box.w : box.h;
    const m = axis === 'x' ? box.h : box.w;
    const prof = new Float64Array(n);
    const step = Math.max(1, Math.floor(m / 48));
    for (let i = 1; i < n - 1; i++) {
      let s = 0, c = 0;
      for (let j = 0; j < m; j += step) {
        const x0 = axis === 'x' ? box.x + i - 1 : box.x + j;
        const y0 = axis === 'x' ? box.y + j : box.y + i - 1;
        const x1 = axis === 'x' ? box.x + i + 1 : box.x + j;
        const y1 = axis === 'x' ? box.y + j : box.y + i + 1;
        if (x0 < 0 || y0 < 0 || x1 >= img.width || y1 >= img.height) continue;
        const a = pixelAt(img, x0, y0);
        const b = pixelAt(img, x1, y1);
        s += Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
        c++;
      }
      prof[i] = c ? s / c : 0;
    }
    return prof;
  }

  function bestPitch(profile, minP, maxP) {
    let bestLag = 0, best = 0;
    const n = profile.length;
    for (let lag = minP; lag <= maxP && lag < n / 2; lag++) {
      let s = 0, c = 0;
      for (let i = 0; i < n - lag; i++) {
        s += profile[i] * profile[i + lag];
        c++;
      }
      const sc = c ? s / c : 0;
      if (sc > best) { best = sc; bestLag = lag; }
    }
    return { pitch: bestLag, score: best };
  }

  function scoreGrid(img, box, rows, cols) {
    if (rows < 2 || cols < 2) return null;
    const cw = box.w / cols, ch = box.h / rows;
    if (cw < 4 || ch < 4) return null;
    const cells = [];
    let varSum = 0, noisy = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = box.x + c * cw + cw * 0.28;
        const y0 = box.y + r * ch + ch * 0.28;
        const x1 = box.x + (c + 1) * cw - cw * 0.28;
        const y1 = box.y + (r + 1) * ch - ch * 0.28;
        const s = sampleRect(img, x0, y0, x1, y1);
        cells.push({ r, c, mean: s.mean, variance: s.variance, sat: s.sat, val: s.val, hue: s.hue });
        varSum += s.variance;
        if (s.variance > 2800) noisy++;
      }
    }
    const means = cells.map((c) => c.mean);
    const clustered = Color.clusterColors(means, 46);
    const avgVar = varSum / cells.length;
    const consistency = 1 / (1 + avgVar / 450);
    const colorBonus = Math.min(Math.max(clustered.hexes.length - 1, 0), 8) / 8;
    const noisyPen = noisy / cells.length;
    const score = consistency * 0.78 + colorBonus * 0.22 - noisyPen * 0.40;
    return {
      rows, cols, cells, clustered, score, noisyCells: noisy, avgVar
    };
  }

  function classifyCells(scored, bg) {
    const cells = scored.cells;
    const hexes = scored.clustered.hexes;
    const ids = scored.clustered.ids;
    const bgHsv = Color.rgbToHsv(bg.r, bg.g, bg.b);
    const labeled = cells.map((cell, i) => {
      const hsv = { h: cell.hue, s: cell.sat, v: cell.val };
      const nearBg = Color.colorDist(cell.mean, bg) < 36 ||
        (hsv.s < 0.16 && Math.abs(hsv.v - bgHsv.v) < 0.14);
      const emptyish = hsv.s < 0.13 && hsv.v > 0.12 && hsv.v < 0.92;
      const pegish = hsv.v < 0.18 || (hsv.s < 0.12 && hsv.v < 0.34);
      let kind = 'chip';
      if (pegish && hsv.s < 0.22) kind = 'peg';
      else if (nearBg || emptyish) kind = 'empty';
      return {
        r: cell.r,
        c: cell.c,
        kind,
        color: kind === 'chip' ? hexes[ids[i]] : null,
        mean: cell.mean,
        variance: cell.variance
      };
    });
    return labeled;
  }

  function cellsToPegs(labeled, rows, cols) {
    const pegs = [];
    for (let c = 0; c < cols; c++) {
      const stack = [];
      for (let r = rows - 1; r >= 0; r--) {
        const cell = labeled[r * cols + c];
        if (cell.kind === 'chip' && cell.color) stack.push(cell.color);
      }
      pegs.push(stack);
    }
    return pegs;
  }

  function uniqueColors(pegs) {
    const set = Object.create(null);
    pegs.forEach((p) => p.forEach((c) => { set[c] = 1; }));
    return Object.keys(set);
  }

  function detectBoard(imageData) {
    if (!imageData || !imageData.data || !imageData.width || !imageData.height) {
      return fail('Could not read this photo. No board was created.');
    }
    const w = imageData.width, h = imageData.height;
    if (w < 16 || h < 16) {
      return fail('Photo is too small to read a board. No board was created.');
    }
    const stats = globalStats(imageData);
    if (stats.variance < 180) {
      return fail('Photo is blank or too uniform to find a grid. No board was invented.');
    }
    const box = findContentBox(imageData);
    if (!box || box.w < 16 || box.h < 16) {
      return fail('No board found in this photo. No board was invented.');
    }

    const gx = gradientProfile(imageData, box, 'x');
    const gy = gradientProfile(imageData, box, 'y');
    const px = bestPitch(gx, 6, Math.floor(box.w / 2));
    const py = bestPitch(gy, 6, Math.floor(box.h / 2));
    const guessCols = px.pitch ? Math.round(box.w / px.pitch) : 0;
    const guessRows = py.pitch ? Math.round(box.h / py.pitch) : 0;

    const candidates = [];
    function add(r, c) {
      if (r >= 2 && r <= 12 && c >= 2 && c <= 14) candidates.push(r + 'x' + c);
    }
    add(guessRows, guessCols);
    for (let d = -2; d <= 2; d++) {
      add(guessRows + d, guessCols);
      add(guessRows, guessCols + d);
      add(guessRows + d, guessCols + d);
    }
    for (let r = 2; r <= 10; r++) {
      for (let c = 2; c <= 12; c++) add(r, c);
    }
    const seen = Object.create(null);
    let best = null;
    candidates.forEach((key) => {
      if (seen[key]) return;
      seen[key] = 1;
      const parts = key.split('x');
      const scored = scoreGrid(imageData, box, Number(parts[0]), Number(parts[1]));
      if (!scored) return;
      let bonus = 0;
      if (guessRows && Math.abs(scored.rows - guessRows) <= 1) bonus += 0.04;
      if (guessCols && Math.abs(scored.cols - guessCols) <= 1) bonus += 0.04;
      scored.score += bonus;
      if (!best || scored.score > best.score) best = scored;
    });

    if (!best) {
      return fail('Could not fit a chip grid to this photo. No board was invented.');
    }

    const labeled = classifyCells(best, stats.mean);
    const pegs = cellsToPegs(labeled, best.rows, best.cols);
    const colors = uniqueColors(pegs);
    const chipCount = pegs.reduce((s, p) => s + p.length, 0);
    const uneven = (px.pitch && py.pitch)
      ? Math.abs((box.w / best.cols) - px.pitch) / Math.max(8, px.pitch)
      : 0;

    const summary = {
      ok: true,
      rows: best.rows,
      cols: best.cols,
      chipCount,
      colorCount: colors.length,
      gridScore: best.score,
      noisyCells: best.noisyCells,
      unevenPitch: uneven,
      pegs,
      cells: labeled,
      colors,
      box
    };

    if (Gate.isJunkScan(summary)) {
      return fail(Gate.failReason(summary), {
        rows: best.rows,
        cols: best.cols,
        chipCount,
        colorCount: colors.length,
        gridScore: best.score,
        noisyCells: best.noisyCells
      });
    }
    summary.trusted = Gate.scanLooksTrusted(summary);
    return summary;
  }

  const api = {
    detectBoard, fail, globalStats, findContentBox, sampleRect, scoreGrid,
    classifyCells, cellsToPegs
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GearBoardDetect = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
