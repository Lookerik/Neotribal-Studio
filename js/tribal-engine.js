/* Neo-Tribal engine: turns a stroke (point list) into a closed, filled, tapered outline.
   Pipeline: thin -> smooth -> resample by arc length (cosine spacing, dense at tips) -> tangents/normals
   -> curvature -> width profile (body swell + taper + tip caps) -> offset left/right -> Catmull-Rom Béziers. */
NT.tribal = (() => {
  const f = n => Math.round(n * 10) / 10, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const DEFAULTS = { fs: 50, te: 45, tp: 40, sm: 50 };

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
  function dot(p, sw){
    const r = Math.max(0.5, sw / 2);
    return { d: `M${f(p.x - r)} ${f(p.y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`, bbox: { x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r } };
  }
  /* src: [{x,y}...], sw: base stroke width, g: {fs, te, tp, sm} each 0..100 */
  function outline(src, sw, g){
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
    const Z = Math.min(L / 2, hpk * (1 + 9 * Math.pow(k, 1.3))), b = clamp(k / 0.35, 0, 1), ex = 1 + 1.5 * k;
    const cap = u => { u = clamp(u, 0, 1); return (1 - b) * Math.sqrt(1 - (1 - u) * (1 - u)) + b * Math.pow(u, ex); };
    let H = pts.map((q, i) => {
      const t = q.s / L, body = (0.7 + 0.3 * Math.sin(Math.PI * t)) * (1 - 0.9 * tp * t);
      const h = (sw / 2 + (wmax - sw / 2) * fs * body) * cap(q.s / Z) * cap((L - q.s) / Z);
      return Math.max(0.4 * h, Math.min(h, 0.8 / Math.max(K[i], 1e-4)));  /* keep offset inside the curve's radius */
    });
    H[0] = H[n - 1] = 0;
    for (let pass = 0; pass < 3; pass++) H = H.map((h, i) => (i === 0 || i === n - 1) ? 0 : (H[i - 1] + 2 * h + H[i + 1]) / 4);
    const Lp = [], Rp = [];
    pts.forEach((q, i) => { const nx = -T[i].y, ny = T[i].x; Lp.push({ x: q.x + nx * H[i], y: q.y + ny * H[i] }); Rp.push({ x: q.x - nx * H[i], y: q.y - ny * H[i] }); });
    Rp.reverse();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const q of Lp.concat(Rp)){ x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    return { d: `M${f(Lp[0].x)} ${f(Lp[0].y)}${cr(Lp)}${cr(Rp)}Z`, bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
  }
  /* Regenerate an object's outline from its preserved stroke (o.pts) and parameters (o.gen). */
  function apply(o){ const r = outline(o.pts, o.sw, o.gen); o.gd = r.d; o.gb = r.bbox; }
  return { DEFAULTS, outline, apply };
})();
