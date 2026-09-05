/* Adaptive color helpers (browser + Node). */
(function (root) {
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (b - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: max ? d / max : 0, v: max };
  }

  function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  function rgbToHex(r, g, b) {
    const h = (n) => ('0' + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2);
    return '#' + h(r) + h(g) + h(b);
  }

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return { r: 128, g: 128, b: 128 };
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function chromaOf(r, g, b) {
    return Math.max(r, g, b) - Math.min(r, g, b);
  }

  function colorDist(a, b) {
    const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function hsvDist(a, b) {
    const ha = rgbToHsv(a.r, a.g, a.b);
    const hb = rgbToHsv(b.r, b.g, b.b);
    let dh = Math.abs(ha.h - hb.h);
    if (dh > 180) dh = 360 - dh;
    const ds = (ha.s - hb.s) * 180;
    const dv = (ha.v - hb.v) * 140;
    return Math.sqrt(dh * dh + ds * ds + dv * dv);
  }

  /**
   * Greedy clustering of RGB means. Any-color: no fixed palette required.
   * Returns cluster ids + representative hex.
   */
  function clusterColors(rgbs, maxDist) {
    const dist = maxDist == null ? 48 : maxDist;
    const clusters = [];
    const ids = [];
    rgbs.forEach((rgb, i) => {
      let best = -1, bestD = Infinity;
      for (let c = 0; c < clusters.length; c++) {
        const d = hsvDist(rgb, clusters[c].mean);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best < 0 || bestD > dist) {
        clusters.push({
          mean: { r: rgb.r, g: rgb.g, b: rgb.b },
          sum: { r: rgb.r, g: rgb.g, b: rgb.b },
          n: 1
        });
        ids[i] = clusters.length - 1;
      } else {
        const cl = clusters[best];
        cl.n += 1;
        cl.sum.r += rgb.r; cl.sum.g += rgb.g; cl.sum.b += rgb.b;
        cl.mean = {
          r: cl.sum.r / cl.n,
          g: cl.sum.g / cl.n,
          b: cl.sum.b / cl.n
        };
        ids[i] = best;
      }
    });
    const hexes = clusters.map((cl) => rgbToHex(cl.mean.r, cl.mean.g, cl.mean.b));
    return { ids, clusters, hexes };
  }

  function namedSwatches() {
    return [
      '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
      '#3498db', '#9b59b6', '#e84393', '#8d6e63', '#ecf0f1',
      '#7f8c8d', '#f5d0a6'
    ];
  }

  const api = {
    rgbToHsv, hsvToRgb, rgbToHex, hexToRgb, chromaOf, colorDist, hsvDist,
    clusterColors, namedSwatches
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GearColor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
