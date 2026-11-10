/* Neo-Tribal engine.
   Body: thin -> smooth -> resample by arc length (cosine spacing, dense at tips) -> tangents/normals -> curvature
         -> width profile (swell + taper + tip caps) -> offset left/right -> Catmull-Rom Béziers.
   Ornaments (all real geometry in the SAME path, nonzero fill):
         outer thorns = curved blades wound like the body (union); inner cuts = lens slits wound opposite (negative space).
   Everything is deterministic for a given seed, so sliders never reshuffle the layout. */
NT.tribal = (() => {
  const f = n => Math.round(n * 10) / 10, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const DEFAULTS = { fs: 50, te: 45, tp: 40, sm: 50, dd: 30, oi: 50, oo: 50, sp: 40, cv: 35, rn: 25, th: 35, sv: 35, br: 0, ih: 25, seed: 7 };
  const rngOf = seed => { let a = (seed | 0) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const area = P => { let s = 0; for (let i = 0; i < P.length; i++){ const a = P[i], b = P[(i + 1) % P.length]; s += a.x * b.y - b.x * a.y; } return s / 2; };
  const quad = (p0, c, p1, m = 6) => { const o = []; for (let i = 0; i <= m; i++){ const t = i / m, u = 1 - t; o.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y }); } return o; };

  function smoothPts(p, passes){
    let a = p;
    for (let k = 0; k < passes; k++){
      const b = [a[0]];
      for (let i = 1; i < a.length - 1; i++) b.push({ x: (a[i - 1].x + 2 * a[i].x + a[i + 1].x) / 4, y: (a[i - 1].y + 2 * a[i].y + a[i + 1].y) / 4 });
      b.push(a[a.length - 1]); a = b;
    }
    return a;
  }
  function resample(p, n){
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + NT.geo.dist(p[i - 1], p[i]));
    const L = cum[cum.length - 1], out = []; let j = 0;
    for (let i = 0; i < n; i++){
      const s = L * (0.5 - 0.5 * Math.cos(Math.PI * i / (n - 1)));
      while (j < p.length - 2 && cum[j + 1] < s) j++;
      const t = clamp((s - cum[j]) / ((cum[j + 1] - cum[j]) || 1), 0, 1);
      out.push({ x: p[j].x + (p[j + 1].x - p[j].x) * t, y: p[j].y + (p[j + 1].y - p[j].y) * t, s });
    }
    return { pts: out, L };
  }
  /* Open Catmull-Rom spline as cubic Béziers; the pen must already be at P[0]. */
  function cr(P){
    let s = '';
    for (let i = 0; i < P.length - 1; i++){
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      s += `C${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)} ${f(p2.y)}`;
    }
    return s;
  }
  /* Closed shape from arcs A (start..corner) and B (corner..end); reversed if needed so its winding has `sign`. */
  function shape(A, B, sign, pool){
    if (Math.sign(area(A.concat(B))) !== sign){ const A2 = B.slice().reverse(), B2 = A.slice().reverse(); A = A2; B = B2; }
    for (const q of A.concat(B)) pool.push(q);
    return `M${f(A[0].x)} ${f(A[0].y)}${cr(A)}${cr(B)}Z`;
  }
  function dot(p, sw){
    const r = Math.max(0.5, sw / 2);
    return { d: `M${f(p.x - r)} ${f(p.y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`, bbox: { x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r } };
  }

  function outline(src, sw, g){
    g = { ...DEFAULTS, ...g };
    let p = NT.geo.thin(src, 0.8);
    if (p.length < 2) return dot(src[0] || { x: 0, y: 0 }, sw);
    p = smoothPts(p, Math.round(g.sm * 0.5));
    let len = 0; for (let i = 1; i < p.length; i++) len += NT.geo.dist(p[i - 1], p[i]);
    if (len < 2) return dot(p[0], sw);
    const n = clamp(Math.round(len / 5), 24, 90), { pts, L } = resample(p, n);
    const T = pts.map((q, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy) || 1; return { x: dx / m, y: dy / m }; });
    const K = T.map((t, i) => {
      if (i === 0 || i === n - 1) return 0;
      let d = Math.atan2(T[i + 1].y, T[i + 1].x) - Math.atan2(T[i - 1].y, T[i - 1].x);
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      return Math.abs(d) / ((pts[i + 1].s - pts[i - 1].s) || 1);
    });
    const fs = g.fs / 100, k = g.te / 100, tp = g.tp / 100;
    const wmax = sw / 2 + Math.min(70, 0.1 * L + 6), hpk = sw / 2 + (wmax - sw / 2) * fs;
    const Z = Math.min(L / 2, hpk * (1 + 9 * Math.pow(k, 1.3))), bb = clamp(k / 0.35, 0, 1), ex = 1 + 1.5 * k;
    const cap = u => { u = clamp(u, 0, 1); return (1 - bb) * Math.sqrt(1 - (1 - u) * (1 - u)) + bb * Math.pow(u, ex); };
    let H = pts.map((q, i) => {
      const t = q.s / L, body = (0.7 + 0.3 * Math.sin(Math.PI * t)) * (1 - 0.9 * tp * t);
      const h = (sw / 2 + (wmax - sw / 2) * fs * body) * cap(q.s / Z) * cap((L - q.s) / Z);
      return Math.max(0.4 * h, Math.min(h, 0.8 / Math.max(K[i], 1e-4)));
    });
    H[0] = H[n - 1] = 0;
    for (let pass = 0; pass < 3; pass++) H = H.map((h, i) => (i === 0 || i === n - 1) ? 0 : (H[i - 1] + 2 * h + H[i + 1]) / 4);
    const Lp = [], Rp = [];
    pts.forEach((q, i) => { const nx = -T[i].y, ny = T[i].x; Lp.push({ x: q.x + nx * H[i], y: q.y + ny * H[i] }); Rp.push({ x: q.x - nx * H[i], y: q.y - ny * H[i] }); });
    Rp.reverse();
    const sign = Math.sign(area(Lp.concat(Rp))) || 1, pool = Lp.concat(Rp);
    let d = `M${f(Lp[0].x)} ${f(Lp[0].y)}${cr(Lp)}${cr(Rp)}Z`;

    /* ---- ornaments ---- */
    const dd = g.dd / 100, R = g.rn / 100, cv = g.cv / 100, rng = rngOf(g.seed);
    const near = s => { let lo = 0, hi = n - 1; while (hi - lo > 1){ const m = (lo + hi) >> 1; if (pts[m].s < s) lo = m; else hi = m; } return (s - pts[lo].s < pts[hi].s - s) ? lo : hi; };
    const fin = g.th / 100, sv = g.sv / 100, rd = g.ih / 100;
    const spike = (i, side, tl, su, bf, m = 6) => {          /* curved thorn rooted on the contour at sample i */
      const h = H[i], t = T[i], nx = -t.y * side, ny = t.x * side, b = Math.max(1.1, tl * bf), vb = -Math.min(0.3 * b, h * 0.8);
      const loc = (u, v) => ({ x: pts[i].x + nx * (h + v) + t.x * u, y: pts[i].y + ny * (h + v) + t.y * u }), tip = loc(su, tl);
      return shape(quad(loc(-b, vb), loc(-b * 0.3, tl * 0.55), tip, m), quad(tip, loc(b + (su - b) * 0.15, tl * 0.4), loc(b, vb), m), sign, pool);
    };
    if (dd > 0 && g.oo > 0){            /* main thorns: count = DENSITY x OUTER; FINESSE = needle-thin; VARIETY = mixed sizes */
      const gap = 12 + g.sp * 1.1, pr = clamp(dd * g.oo / 50, 0, 1), amt = (0.6 + 0.8 * g.oo / 100) * (1 + 0.5 * fin), sweep = 0.15 + 1.1 * cv, bf = 0.28 - 0.2 * fin;
      let j = 0;
      for (let s = Z * 0.5 + gap * 0.5; s < L - Z * 0.5 - gap * 0.3; s += gap, j++){
        const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng();     /* fixed draws per slot keep the layout stable */
        if (((j * 0.618034 + 0.13) % 1) >= pr) continue;
        const i = near(clamp(s + (r1 - 0.5) * gap * 0.6 * R, 0, L)), h = H[i]; if (h < 2.5) continue;
        const side = r4 < 0.5 + (j % 2 ? 0.5 : -0.5) * (1 - 0.7 * R) ? 1 : -1;
        const tl = (h * 0.9 + hpk * 0.4 + 8) * amt * (1 - sv + sv * (0.25 + 1.5 * r2 * r2)) * (1 + (r2 - 0.5) * 0.6 * R);
        d += spike(i, side, tl, sweep * tl + (r3 - 0.5) * tl * 0.3 * R, bf);
      }
    }
    if (g.br > 0){                      /* barbs: dense tiny hooked thorns along both edges */
      const gap = 4 + (100 - g.br) * 0.12; let j = 0;
      for (let s = Z * 0.35; s < L - Z * 0.35; s += gap, j++){
        const r1 = rng(), r2 = rng(), r3 = rng();
        const i = near(clamp(s + (r1 - 0.5) * gap * 0.8 * R, 0, L)); if (H[i] < 2) continue;
        const tl = (1.8 + hpk * 0.2) * (0.5 + r2) * (1 + 0.5 * fin);
        d += spike(i, (j % 2 ? 1 : -1) * (r3 < 0.25 * R ? -1 : 1), tl, tl * (0.5 + cv), 0.38 - 0.22 * fin, 3);
      }
    }
    if (dd > 0 && g.oi > 0){            /* inner cuts, wound opposite = negative space; HOLE SHAPE slit -> round */
      const gap = 24 + g.sp * 1.5, pr = clamp(dd * g.oi / 50, 0, 1), amt = (0.18 + 0.22 * g.oi / 100) * (1 + 0.9 * rd), lanes = [0, 0.5, -0.5], e = 1 - 0.5 * rd;
      let j = 0;
      for (let s = Z * 0.4; s < L - Z * 0.4 - gap * 0.4; s += gap, j++){
        const r1 = rng(), r2 = rng();
        if (((j * 0.754877 + 0.31) % 1) >= pr) continue;
        const a = clamp(s + (r2 - 0.5) * gap * 0.4 * R, 0, L), i0 = near(a), i1 = near(Math.min(L, a + gap * 0.7 * (1 - 0.4 * rd) * (1 + (r1 - 0.5) * 0.8 * R)));
        if (i1 - i0 < 3) continue;
        let hmin = 1e9; for (let q = i0; q <= i1; q++) hmin = Math.min(hmin, H[q]);
        if (hmin < 4) continue;
        const lane = lanes[j % 3], A = [], B = [];
        const m = Math.max(i1 - i0, 24), S = []; let fc = 1;   /* finer than the body; shrink the whole hole if it would leave the body */
        for (let k = 0; k <= m; k++){
          const uu = (1 - Math.cos(Math.PI * k / m)) / 2, fq = i0 + (i1 - i0) * uu, q = Math.min(n - 2, Math.floor(fq)), u = fq - q, lp = (a, b) => a + (b - a) * u;
          const px = lp(pts[q].x, pts[q + 1].x), py = lp(pts[q].y, pts[q + 1].y), Hq = lp(H[q], H[q + 1]), tx = lp(T[q].x, T[q + 1].x), ty = lp(T[q].y, T[q + 1].y), tm = Math.hypot(tx, ty) || 1;
          const c = lane * Hq, wr = amt * Hq * Math.pow(Math.sin(Math.PI * uu), e);
          if (wr > 1e-6) fc = Math.min(fc, (0.85 * Hq - Math.abs(c)) / wr);
          S.push([px, py, -ty / tm, tx / tm, c, wr]);
        }
        if (fc < 0.35) continue;
        for (const [px, py, nx, ny, c, wr] of S){ const w = wr * fc; A.push({ x: px + nx * (c + w), y: py + ny * (c + w) }); B.push({ x: px + nx * (c - w), y: py + ny * (c - w) }); }
        d += shape(A, B.reverse(), -sign, pool);
      }
    }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const q of pool){ x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    return { d, bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
  }
  function apply(o){ const r = outline(o.pts, o.sw, o.gen); o.gd = r.d; o.gb = r.bbox; }
  return { DEFAULTS, outline, apply };
})();
