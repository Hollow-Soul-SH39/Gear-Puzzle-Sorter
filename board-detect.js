/* Adaptive board detect: rectangular grids + multi-shelf pegs. Fail-closed. */
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

  function median(arr) {
    if (!arr || !arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function medianGaps(sorted) {
    if (!sorted || sorted.length < 2) return 0;
    const g = [];
    for (let i = 1; i < sorted.length; i++) g.push(sorted[i] - sorted[i - 1]);
    return median(g);
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

  /** Ignore Labor Day / mobile chrome on tall screenshots. */
  function playfieldBounds(img) {
    const w = img.width, h = img.height;
    if (h > w * 1.15) {
      return {
        x: Math.floor(w * 0.03),
        y: Math.floor(h * 0.11),
        w: Math.floor(w * 0.94),
        h: Math.floor(h * 0.80)
      };
    }
    return { x: 0, y: 0, w: w, h: h };
  }

  function isChipLike(p) {
    const chroma = Color.chromaOf(p.r, p.g, p.b);
    const hsv = Color.rgbToHsv(p.r, p.g, p.b);
    if (chroma < 32 || hsv.s < 0.32 || hsv.v < 0.22 || hsv.v > 0.98) return false;
    const brownHue = hsv.h >= 15 && hsv.h <= 45;
    if (brownHue && hsv.v < 0.62 && hsv.s < 0.72) return false;
    return true;
  }

  function isMetalLike(p) {
    const chroma = Color.chromaOf(p.r, p.g, p.b);
    const hsv = Color.rgbToHsv(p.r, p.g, p.b);
    return chroma < 40 && hsv.s < 0.22 && hsv.v > 0.32 && hsv.v < 0.93;
  }

  function findContentBox(img, region) {
    const w = img.width, h = img.height;
    const x0 = region ? region.x : 0;
    const y0 = region ? region.y : 0;
    const x1 = region ? region.x + region.w : w;
    const y1 = region ? region.y + region.h : h;
    let minX = w, minY = h, maxX = 0, maxY = 0, hit = 0;
    const stepX = Math.max(1, Math.floor(w / 180));
    const stepY = Math.max(1, Math.floor(h / 180));
    for (let y = y0; y < y1; y += stepY) {
      for (let x = x0; x < x1; x += stepX) {
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
      else if (!isChipLike(cell.mean)) kind = 'empty';
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

  function scoreFromCells(cells) {
    if (!cells.length) return { score: 0, noisyCells: 0, clustered: { hexes: [], ids: [] }, avgVar: 1e9 };
    let varSum = 0, noisy = 0;
    cells.forEach((c) => {
      varSum += c.variance;
      if (c.variance > 2800) noisy++;
    });
    const clustered = Color.clusterColors(cells.map((c) => c.mean), 46);
    const avgVar = varSum / cells.length;
    const consistency = 1 / (1 + avgVar / 450);
    const colorBonus = Math.min(Math.max(clustered.hexes.length - 1, 0), 8) / 8;
    const noisyPen = noisy / cells.length;
    return {
      score: consistency * 0.78 + colorBonus * 0.22 - noisyPen * 0.40,
      noisyCells: noisy,
      clustered,
      avgVar
    };
  }

  function summarizeRead(labeled, rows, cols, extra) {
    const pegs = cellsToPegs(labeled, rows, cols);
    const colors = uniqueColors(pegs);
    const chipCount = pegs.reduce((s, p) => s + p.length, 0);
    return Object.assign({
      ok: true,
      rows,
      cols,
      chipCount,
      colorCount: colors.length,
      pegs,
      cells: labeled,
      colors
    }, extra || {});
  }

  function acceptOrJunk(summary) {
    if (!summary || !summary.ok) return summary;
    if (Gate.isJunkScan(summary)) {
      return fail(Gate.failReason(summary), {
        rows: summary.rows,
        cols: summary.cols,
        chipCount: summary.chipCount,
        colorCount: summary.colorCount,
        gridScore: summary.gridScore,
        noisyCells: summary.noisyCells
      });
    }
    summary.trusted = Gate.scanLooksTrusted(summary);
    return summary;
  }

  function detectRectGrid(img, stats) {
    const region = playfieldBounds(img);
    const box = findContentBox(img, region);
    if (!box || box.w < 16 || box.h < 16) return null;

    const gx = gradientProfile(img, box, 'x');
    const gy = gradientProfile(img, box, 'y');
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
      const scored = scoreGrid(img, box, Number(parts[0]), Number(parts[1]));
      if (!scored) return;
      let bonus = 0;
      if (guessRows && Math.abs(scored.rows - guessRows) <= 1) bonus += 0.04;
      if (guessCols && Math.abs(scored.cols - guessCols) <= 1) bonus += 0.04;
      scored.score += bonus;
      if (!best || scored.score > best.score) best = scored;
    });
    if (!best) return null;

    const labeled = classifyCells(best, stats.mean);
    const uneven = (px.pitch && py.pitch)
      ? Math.abs((box.w / best.cols) - px.pitch) / Math.max(8, px.pitch)
      : 0;
    const summary = summarizeRead(labeled, best.rows, best.cols, {
      gridScore: best.score,
      noisyCells: best.noisyCells,
      unevenPitch: uneven,
      box,
      layout: 'grid'
    });
    return summary;
  }

  function hist1D(values, lo, hi, bins) {
    const h = new Float64Array(bins);
    const span = Math.max(1e-6, hi - lo);
    for (let i = 0; i < values.length; i++) {
      let b = Math.floor(((values[i] - lo) / span) * bins);
      if (b < 0) b = 0;
      if (b >= bins) b = bins - 1;
      h[b] += 1;
    }
    return h;
  }

  function smooth3(arr) {
    const o = new Float64Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const a = i ? arr[i - 1] : arr[i];
      const c = i + 1 < arr.length ? arr[i + 1] : arr[i];
      o[i] = a * 0.25 + arr[i] * 0.5 + c * 0.25;
    }
    return o;
  }

  function runsAbove(arr, thresh) {
    const runs = [];
    let start = -1;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] >= thresh) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        runs.push({ i0: start, i1: i });
        start = -1;
      }
    }
    if (start >= 0) runs.push({ i0: start, i1: arr.length });
    return runs;
  }

  function mergeRuns(runs, maxGapBins) {
    if (!runs.length) return [];
    const out = [{ i0: runs[0].i0, i1: runs[0].i1 }];
    for (let i = 1; i < runs.length; i++) {
      const prev = out[out.length - 1];
      if (runs[i].i0 - prev.i1 <= maxGapBins) prev.i1 = runs[i].i1;
      else out.push({ i0: runs[i].i0, i1: runs[i].i1 });
    }
    return out;
  }

  function bandsFromCoords(coords, lo, hi, maxMergePx) {
    if (!coords.length) return [];
    const span = Math.max(1, hi - lo);
    const bins = Math.min(140, Math.max(36, Math.round(span / 2)));
    const hist = smooth3(smooth3(hist1D(coords, lo, hi, bins)));
    let maxV = 0;
    for (let i = 0; i < hist.length; i++) if (hist[i] > maxV) maxV = hist[i];
    if (maxV < 3) return [];
    const thresh = Math.max(1.15, maxV * 0.16);
    const pxPerBin = span / bins;
    const maxGapBins = Math.max(1, Math.round(maxMergePx / pxPerBin));
    const merged = mergeRuns(runsAbove(hist, thresh), maxGapBins);
    return merged.map((r) => {
      let mass = 0;
      for (let i = r.i0; i < r.i1; i++) mass += hist[i];
      return {
        lo: lo + r.i0 * pxPerBin,
        hi: lo + r.i1 * pxPerBin,
        mass
      };
    }).filter((b) => b.hi - b.lo >= pxPerBin * 2 && b.mass >= 3);
  }

  function peakCenters(coords, lo, hi, minSepPx) {
    if (!coords.length) return [];
    const span = Math.max(1, hi - lo);
    const bins = Math.min(160, Math.max(40, Math.round(span)));
    const hist = smooth3(smooth3(hist1D(coords, lo, hi, bins)));
    let maxV = 0;
    for (let i = 0; i < hist.length; i++) if (hist[i] > maxV) maxV = hist[i];
    if (maxV < 2) return [];
    const thresh = Math.max(1.1, maxV * 0.20);
    const pxPerBin = span / bins;
    const minSep = Math.max(2, Math.round(minSepPx / pxPerBin));
    const cand = [];
    for (let i = 1; i < hist.length - 1; i++) {
      if (hist[i] >= hist[i - 1] && hist[i] >= hist[i + 1] && hist[i] >= thresh) {
        cand.push({ i, v: hist[i] });
      }
    }
    cand.sort((a, b) => b.v - a.v);
    const kept = [];
    cand.forEach((p) => {
      if (kept.every((k) => Math.abs(k.i - p.i) >= minSep)) kept.push(p);
    });
    kept.sort((a, b) => a.i - b.i);
    return kept.map((p) => lo + (p.i + 0.5) * pxPerBin);
  }

  function collectChipHits(img, region) {
    const hits = [];
    const x0 = region.x, y0 = region.y;
    const x1 = region.x + region.w, y1 = region.y + region.h;
    const stepX = Math.max(1, Math.floor(img.width / 170));
    const stepY = Math.max(1, Math.floor(img.height / 170));
    for (let y = y0; y < y1; y += stepY) {
      for (let x = x0; x < x1; x += stepX) {
        if (isChipLike(pixelAt(img, x, y))) hits.push({ x, y });
      }
    }
    if (hits.length < 8) return hits;
    const rad = Math.max(stepX, stepY) * 2.4;
    const rad2 = rad * rad;
    const dense = [];
    for (let i = 0; i < hits.length; i++) {
      let n = 0;
      for (let j = 0; j < hits.length; j++) {
        if (i === j) continue;
        const dx = hits[i].x - hits[j].x;
        const dy = hits[i].y - hits[j].y;
        if (dx * dx + dy * dy <= rad2) n++;
        if (n >= 2) break;
      }
      if (n >= 2) dense.push(hits[i]);
    }
    return dense.length >= 8 ? dense : hits;
  }

  function metalProfile(img, y0, y1) {
    y0 = clamp(Math.floor(y0), 0, img.height - 1);
    y1 = clamp(Math.ceil(y1), y0 + 1, img.height);
    const prof = new Float64Array(img.width);
    const stepY = Math.max(1, Math.floor((y1 - y0) / 40));
    for (let x = 0; x < img.width; x++) {
      let n = 0, t = 0;
      for (let y = y0; y < y1; y += stepY) {
        t++;
        if (isMetalLike(pixelAt(img, x, y))) n++;
      }
      prof[x] = t ? n / t : 0;
    }
    return smooth3(smooth3(prof));
  }

  function metalPeakXs(prof, minSep, minVal) {
    const cand = [];
    for (let i = 1; i < prof.length - 1; i++) {
      if (prof[i] >= prof[i - 1] && prof[i] >= prof[i + 1] && prof[i] >= minVal) {
        cand.push({ i, v: prof[i] });
      }
    }
    cand.sort((a, b) => b.v - a.v);
    const kept = [];
    cand.forEach((p) => {
      if (kept.every((k) => Math.abs(k.i - p.i) >= minSep)) kept.push(p);
    });
    kept.sort((a, b) => a.i - b.i);
    return kept.map((p) => p.i + 0.5);
  }

  function mergeCenters(primary, extra, pitch) {
    const out = primary.slice();
    const tol = Math.max(6, pitch * 0.38);
    extra.forEach((x) => {
      if (out.every((p) => Math.abs(p - x) > tol)) out.push(x);
    });
    out.sort((a, b) => a - b);
    return out;
  }

  function fillPitchGaps(xs, pitch) {
    if (xs.length < 2 || pitch < 6) return xs;
    const out = [xs[0]];
    for (let i = 1; i < xs.length; i++) {
      const gap = xs[i] - xs[i - 1];
      const n = Math.round(gap / pitch);
      if (n >= 2 && n <= 5 && Math.abs(gap / n - pitch) / pitch < 0.28) {
        for (let k = 1; k < n; k++) out.push(xs[i - 1] + (gap * k) / n);
      }
      out.push(xs[i]);
    }
    return out;
  }

  function metalFracAt(img, x, y0, y1, halfW) {
    let n = 0, t = 0;
    const xx0 = clamp(Math.floor(x - halfW), 0, img.width - 1);
    const xx1 = clamp(Math.ceil(x + halfW), xx0 + 1, img.width);
    y0 = clamp(Math.floor(y0), 0, img.height - 1);
    y1 = clamp(Math.ceil(y1), y0 + 1, img.height);
    const step = 2;
    for (let y = y0; y < y1; y += step) {
      for (let xx = xx0; xx < xx1; xx++) {
        t++;
        if (isMetalLike(pixelAt(img, xx, y))) n++;
      }
    }
    return t ? n / t : 0;
  }

  function extendWithMetal(img, xs, pitch, y0, y1) {
    if (!xs.length || pitch < 6) return xs;
    const halfW = Math.max(2, pitch * 0.12);
    const out = xs.slice();
    for (let dir = -1; dir <= 1; dir += 2) {
      let x = dir < 0 ? xs[0] : xs[xs.length - 1];
      for (let n = 0; n < 5; n++) {
        x += dir * pitch;
        if (x < 4 || x > img.width - 4) break;
        if (metalFracAt(img, x, y0, y1, halfW) >= 0.10) out.push(x);
        else break;
      }
    }
    out.sort((a, b) => a - b);
    return out;
  }

  function statsOfPixels(pixels) {
    if (!pixels.length) return { mean: { r: 0, g: 0, b: 0 }, variance: 1e9, sat: 0, val: 0, hue: 0 };
    let sr = 0, sg = 0, sb = 0;
    for (let i = 0; i < pixels.length; i++) {
      sr += pixels[i].r; sg += pixels[i].g; sb += pixels[i].b;
    }
    const n = pixels.length;
    const mean = { r: sr / n, g: sg / n, b: sb / n };
    let v = 0;
    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i];
      const dr = p.r - mean.r, dg = p.g - mean.g, db = p.b - mean.b;
      v += dr * dr + dg * dg + db * db;
    }
    const hsv = Color.rgbToHsv(mean.r, mean.g, mean.b);
    return { mean, variance: v / n, sat: hsv.s, val: hsv.v, hue: hsv.h };
  }

  function samplePegSlot(img, x0, y0, x1, y1) {
    x0 = clamp(Math.floor(x0), 0, img.width - 1);
    y0 = clamp(Math.floor(y0), 0, img.height - 1);
    x1 = clamp(Math.ceil(x1), x0 + 1, img.width);
    y1 = clamp(Math.ceil(y1), y0 + 1, img.height);
    const chips = [];
    const metal = [];
    const all = [];
    const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 64)));
    for (let y = y0; y < y1; y += step) {
      for (let x = x0; x < x1; x += step) {
        const p = pixelAt(img, x, y);
        all.push(p);
        if (isChipLike(p)) chips.push(p);
        else if (isMetalLike(p)) metal.push(p);
      }
    }
    if (chips.length >= 3) return statsOfPixels(chips);
    if (metal.length >= 3) return statsOfPixels(metal);
    return statsOfPixels(all);
  }

  function samplePegCells(img, pegs, cap) {
    const cols = pegs.length;
    const cells = [];
    for (let r = 0; r < cap; r++) {
      for (let c = 0; c < cols; c++) {
        const peg = pegs[c];
        const ch = (peg.y1 - peg.y0) / cap;
        const cw = Math.max(6, Math.min(ch * 0.9, (peg.pitch || ch) * 0.55));
        const x0 = peg.x - cw * 0.36;
        const x1 = peg.x + cw * 0.36;
        const y0 = peg.y0 + r * ch + ch * 0.32;
        const y1 = peg.y0 + (r + 1) * ch - ch * 0.32;
        const s = samplePegSlot(img, x0, y0, x1, y1);
        cells.push({ r, c, mean: s.mean, variance: s.variance, sat: s.sat, val: s.val, hue: s.hue });
      }
    }
    return cells;
  }

  function detectShelfBoard(img, stats) {
    const region = playfieldBounds(img);
    const hits = collectChipHits(img, region);
    if (hits.length < 12) return null;

    const ys = hits.map((h) => h.y);
    const yLo = Math.min.apply(null, ys);
    const yHi = Math.max.apply(null, ys) + 1;
    const mergeY = Math.max(6, (yHi - yLo) * 0.03);
    let shelves = bandsFromCoords(ys, yLo, yHi, mergeY);
    if (!shelves.length) return null;
    if (shelves.length > 1) {
      const masses = shelves.map((s) => s.mass);
      const medM = median(masses);
      const medH = median(shelves.map((s) => s.hi - s.lo));
      shelves = shelves.filter((s) => s.mass >= medM * 0.28 && (s.hi - s.lo) >= Math.max(8, medH * 0.45));
    }
    if (!shelves.length) return null;
    shelves.sort((a, b) => a.lo - b.lo);

    const allPegs = [];
    let pitchVar = [];
    shelves.forEach((sh) => {
      const shHits = hits.filter((h) => h.y >= sh.lo && h.y < sh.hi);
      if (shHits.length < 4) return;
      const xs = shHits.map((h) => h.x);
      const xLo = Math.min.apply(null, xs);
      const xHi = Math.max.apply(null, xs) + 1;
      const chipG = Math.max(8, (sh.hi - sh.lo) / 4.2);
      let centers = peakCenters(xs, xLo - chipG, xHi + chipG, chipG * 0.68);
      if (centers.length < 1) return;

      const hitLo = Math.min.apply(null, shHits.map((h) => h.y));
      const hitHi = Math.max.apply(null, shHits.map((h) => h.y)) + 1;
      const y0 = hitLo - 1;
      const y1 = hitHi + 1;
      const pitch0 = medianGaps(centers) || chipG * 1.32;
      const prof = metalProfile(img, y0, y1);
      let maxM = 0, sumM = 0;
      for (let i = 0; i < prof.length; i++) {
        sumM += prof[i];
        if (prof[i] > maxM) maxM = prof[i];
      }
      const meanM = sumM / prof.length;
      const metalXs = metalPeakXs(
        prof,
        Math.max(6, pitch0 * 0.55),
        Math.max(0.10, meanM * 2.4, maxM * 0.35)
      );
      centers = mergeCenters(centers, metalXs, pitch0);
      const pitch = medianGaps(centers) || pitch0;
      centers = fillPitchGaps(centers, pitch);
      centers = extendWithMetal(img, centers, pitch, y0, y1);
      if (centers.length >= 2) {
        const g = [];
        for (let i = 1; i < centers.length; i++) g.push(Math.abs((centers[i] - centers[i - 1]) - pitch) / Math.max(8, pitch));
        pitchVar.push(median(g));
      }
      centers.forEach((x) => {
        allPegs.push({ x, y0, y1, pitch, shelfY: sh.lo });
      });
    });

    if (allPegs.length < 2) return null;

    const layerGuesses = [];
    allPegs.forEach((p) => {
      const win = Math.max(8, (p.pitch || 16) * 0.38);
      const colHits = hits.filter((h) => (
        h.y >= p.y0 && h.y <= p.y1 && Math.abs(h.x - p.x) < win
      ));
      if (colHits.length < 4) return;
      const xs = colHits.map((h) => h.x);
      const ys = colHits.map((h) => h.y);
      const xSpan = Math.max.apply(null, xs) - Math.min.apply(null, xs) + 1;
      const ySpan = Math.max.apply(null, ys) - Math.min.apply(null, ys) + 1;
      if (xSpan >= 4) layerGuesses.push(ySpan / xSpan);
    });
    const shelfHeights = allPegs.map((p) => p.y1 - p.y0);
    const chipW = median(allPegs.map((p) => p.pitch || 16)) / 1.32;
    const rawCap = layerGuesses.length
      ? median(layerGuesses)
      : median(shelfHeights.map((h) => h / Math.max(6, chipW)));
    const guessed = clamp(rawCap - Math.floor(rawCap) < 0.58 ? Math.floor(rawCap) : Math.ceil(rawCap), 2, 8);

    const shelfIds = {};
    allPegs.forEach((p) => { shelfIds[Math.round(p.shelfY)] = 1; });
    const nShelves = Object.keys(shelfIds).length;
    const capTries = [];
    function addCap(n) {
      if (n >= 2 && n <= 8 && capTries.indexOf(n) < 0) capTries.push(n);
    }
    addCap(guessed);
    addCap(guessed - 1);
    addCap(guessed + 1);
    if (nShelves >= 2) addCap(4);

    let best = null;
    capTries.forEach((cap) => {
      const cells = samplePegCells(img, allPegs, cap);
      const scored = scoreFromCells(cells);
      const labeled = classifyCells({ cells, clustered: scored.clustered }, stats.mean);
      const summary = summarizeRead(labeled, cap, allPegs.length, {
        gridScore: scored.score + (nShelves >= 2 ? 0.03 : 0),
        noisyCells: scored.noisyCells,
        unevenPitch: pitchVar.length ? median(pitchVar) : 0,
        box: region,
        layout: nShelves >= 2 ? 'shelves' : 'pegs',
        shelfCount: nShelves
      });
      if (!best || summary.gridScore > best.gridScore) best = summary;
    });
    return best;
  }

  function pickRead(a, b) {
    function usable(s) { return s && s.ok && !Gate.isJunkScan(s); }
    const ua = usable(a), ub = usable(b);
    if (ua && a.shelfCount >= 2) return a;
    if (ub && b.shelfCount >= 2) return b;
    if (ua && ub) return a.gridScore >= b.gridScore ? a : b;
    if (ua) return a;
    if (ub) return b;
    if (a && b) return (a.gridScore || 0) >= (b.gridScore || 0) ? a : b;
    return a || b || null;
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

    const rect = detectRectGrid(imageData, stats);
    const shelf = detectShelfBoard(imageData, stats);
    const best = pickRead(shelf, rect);

    if (!best) {
      const box = findContentBox(imageData, playfieldBounds(imageData));
      if (!box || box.w < 16 || box.h < 16) {
        return fail('No board found in this photo. No board was invented.');
      }
      return fail('Could not fit a chip grid to this photo. No board was invented.');
    }
    return acceptOrJunk(best);
  }

  const api = {
    detectBoard, fail, globalStats, findContentBox, sampleRect, scoreGrid,
    classifyCells, cellsToPegs, detectShelfBoard, playfieldBounds, collectChipHits
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GearBoardDetect = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
