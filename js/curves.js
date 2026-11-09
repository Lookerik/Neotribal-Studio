/* Editable Bézier nodes: {x,y, ix,iy (in-handle), ox,oy (out-handle), s (smooth)}, all in object-local space. */
NT.curves = (() => {
  const f = n => Math.round(n * 100) / 100, lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const segD = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
  function rdp(P, tol){
    if (P.length < 3) return P.slice();
    let md = 0, mi = 0;
    for (let i = 1; i < P.length - 1; i++){ const d = segD(P[i], P[0], P[P.length - 1]); if (d > md){ md = d; mi = i; } }
    if (md <= tol) return [P[0], P[P.length - 1]];
    return rdp(P.slice(0, mi + 1), tol).slice(0, -1).concat(rdp(P.slice(mi), tol));
  }
  const mk = (x, y, s = false) => ({ x, y, ix: x, iy: y, ox: x, oy: y, s });
  /* Make node i smooth: collinear handles along the neighbours' direction, thirds of the chord lengths. */
  function smoothNode(N, i, closed){
    const n = N[i], c = N.length, a = (closed || i > 0) ? N[(i - 1 + c) % c] : n, b = (closed || i < c - 1) ? N[(i + 1) % c] : n;
    const dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy); n.s = true;
    if (!m) return;
    const ux = dx / m, uy = dy / m, lo = Math.hypot(b.x - n.x, b.y - n.y) / 3, li = Math.hypot(n.x - a.x, n.y - a.y) / 3;
    n.ox = n.x + ux * lo; n.oy = n.y + uy * lo; n.ix = n.x - ux * li; n.iy = n.y - uy * li;
  }
  function fromPts(pts, tol = 2.5){
    const N = rdp(NT.geo.thin(pts, 0.5), tol).map(p => mk(p.x, p.y, true));
    N.forEach((_, i) => smoothNode(N, i, false)); return N;
  }
  function fromShape(o){
    if (o.type === 'line') return { nodes: [mk(o.x1, o.y1), mk(o.x2, o.y2)], closed: false };
    if (o.type === 'rect') return { nodes: [mk(o.x, o.y), mk(o.x + o.w, o.y), mk(o.x + o.w, o.y + o.h), mk(o.x, o.y + o.h)], closed: true };
    if (o.type === 'ellipse'){
      const { cx, cy, rx, ry } = o, K = 0.5523, e = (x, y, ix, iy, ox, oy) => ({ x, y, ix, iy, ox, oy, s: true });
      return { closed: true, nodes: [e(cx + rx, cy, cx + rx, cy - K * ry, cx + rx, cy + K * ry), e(cx, cy + ry, cx + K * rx, cy + ry, cx - K * rx, cy + ry),
        e(cx - rx, cy, cx - rx, cy + K * ry, cx - rx, cy - K * ry), e(cx, cy - ry, cx - K * rx, cy - ry, cx + K * rx, cy - ry)] };
    }
    return null;
  }
  const seg = (a, b) => `C${f(a.ox)} ${f(a.oy)} ${f(b.ix)} ${f(b.iy)} ${f(b.x)} ${f(b.y)}`;
  function toD(N, closed){
    if (!N.length) return '';
    let d = `M${f(N[0].x)} ${f(N[0].y)}`;
    for (let i = 0; i < N.length - 1; i++) d += seg(N[i], N[i + 1]);
    return closed && N.length > 1 ? d + seg(N[N.length - 1], N[0]) + 'Z' : d;
  }
  const bez = (a, b, t) => { const u = 1 - t, p = [a, { x: a.ox, y: a.oy }, { x: b.ix, y: b.iy }, b];
    return { x: u * u * u * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t * t * t * p[3].x, y: u * u * u * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t * t * t * p[3].y }; };
  function sample(N, closed, per = 12){
    const out = [], c = N.length, segs = closed ? c : c - 1;
    for (let i = 0; i < segs; i++) for (let j = 0; j < per; j++) out.push(bez(N[i], N[(i + 1) % c], j / per));
    out.push({ x: N[closed ? 0 : c - 1].x, y: N[closed ? 0 : c - 1].y }); return out;
  }
  function nearest(N, closed, p){
    const c = N.length, segs = closed ? c : c - 1; let best = null;
    for (let i = 0; i < segs; i++) for (let j = 0; j <= 24; j++){ const q = bez(N[i], N[(i + 1) % c], j / 24), d = Math.hypot(q.x - p.x, q.y - p.y); if (!best || d < best.dist) best = { i, t: j / 24, dist: d }; }
    return best;
  }
  /* de Casteljau split: inserts a node after index i, shape unchanged. Returns the new index. */
  function split(N, i, t){
    const a = N[i], b = N[(i + 1) % N.length], p1 = { x: a.ox, y: a.oy }, p2 = { x: b.ix, y: b.iy };
    const q0 = lerp(a, p1, t), q1 = lerp(p1, p2, t), q2 = lerp(p2, b, t), r0 = lerp(q0, q1, t), r1 = lerp(q1, q2, t), m = lerp(r0, r1, t);
    a.ox = q0.x; a.oy = q0.y; b.ix = q2.x; b.iy = q2.y;
    N.splice(i + 1, 0, { x: m.x, y: m.y, ix: r0.x, iy: r0.y, ox: r1.x, oy: r1.y, s: true }); return i + 1;
  }
  return { fromPts, fromShape, toD, sample, nearest, split, smoothNode };
})();
