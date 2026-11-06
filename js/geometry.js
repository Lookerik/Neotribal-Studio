/* Geometry helpers shared by all modules. */
window.NT = window.NT || {};
NT.geo = {
  mirrorKinds(m){ return m === 'v' ? ['v'] : m === 'h' ? ['h'] : m === 'vh' ? ['v', 'h', 'vh'] : []; },
  /* Real (baked) mirrored copy of an object about the axes x=ax / y=ay. */
  mirror(o, kind, ax, ay, id){
    const fx = kind.includes('v') ? x => 2 * ax - x : x => x, fy = kind.includes('h') ? y => 2 * ay - y : y => y;
    const tx = o.tx || 0, ty = o.ty || 0, c = { ...o, id, m: '', tx: 0, ty: 0 };
    if (o.type === 'path'){ c.pts = o.pts.map(p => ({ x: fx(p.x + tx), y: fy(p.y + ty) })); c.d = NT.geo.smoothPath(c.pts); }
    else if (o.type === 'line'){ c.x1 = fx(o.x1 + tx); c.y1 = fy(o.y1 + ty); c.x2 = fx(o.x2 + tx); c.y2 = fy(o.y2 + ty); }
    else if (o.type === 'rect'){ const xa = fx(o.x + tx), xb = fx(o.x + o.w + tx), ya = fy(o.y + ty), yb = fy(o.y + o.h + ty);
      c.x = Math.min(xa, xb); c.y = Math.min(ya, yb); c.w = Math.abs(xb - xa); c.h = Math.abs(yb - ya); }
    else { c.cx = fx(o.cx + tx); c.cy = fy(o.cy + ty); }
    return c;
  },
  dist(a, b){ return Math.hypot(a.x - b.x, a.y - b.y); },
  /* Drop points closer than `min` to the previous kept point (keeps first and last). */
  thin(pts, min){
    if (pts.length < 3) return pts.slice();
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) if (NT.geo.dist(out[out.length - 1], pts[i]) >= min) out.push(pts[i]);
    out.push(pts[pts.length - 1]);
    return out;
  },
  /* Smooth open path through points using quadratic midpoints. */
  smoothPath(pts){
    if (!pts.length) return '';
    const f = n => +n.toFixed(2);
    if (pts.length === 1) return `M${f(pts[0].x)} ${f(pts[0].y)}l0.01 0`;
    if (pts.length === 2) return `M${f(pts[0].x)} ${f(pts[0].y)}L${f(pts[1].x)} ${f(pts[1].y)}`;
    let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
    for (let i = 1; i < pts.length - 1; i++){
      const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      d += `Q${f(pts[i].x)} ${f(pts[i].y)} ${f(mx)} ${f(my)}`;
    }
    const l = pts[pts.length - 1];
    return d + `L${f(l.x)} ${f(l.y)}`;
  }
};
