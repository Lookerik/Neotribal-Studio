/* Geometry helpers. Every object carries an optional linear part M=[a,b,c,d] plus translation tx,ty
   (SVG matrix(a b c d tx ty)), so scale/rotate/mirror never touch the stored geometry. */
window.NT = window.NT || {};
NT.geo = {
  dist(a, b){ return Math.hypot(a.x - b.x, a.y - b.y); },
  thin(pts, min){
    if (pts.length < 3) return pts.slice();
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) if (NT.geo.dist(out[out.length - 1], pts[i]) >= min) out.push(pts[i]);
    out.push(pts[pts.length - 1]);
    return out;
  },
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
  },
  mat(o){ const M = o.M || [1, 0, 0, 1]; return [M[0], M[1], M[2], M[3], o.tx || 0, o.ty || 0]; },
  apply(o, x, y){ const m = NT.geo.mat(o); return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }; },
  invert(o, p){
    const m = NT.geo.mat(o), det = (m[0] * m[3] - m[1] * m[2]) || 1e-9, x = p.x - m[4], y = p.y - m[5];
    return { x: (m[3] * x - m[2] * y) / det, y: (-m[1] * x + m[0] * y) / det };
  },
  /* Apply a world affine W=[a,b,c,d,e,f] after the object's own transform. */
  compose(o, W){
    const m = NT.geo.mat(o);
    o.M = [W[0] * m[0] + W[2] * m[1], W[1] * m[0] + W[3] * m[1], W[0] * m[2] + W[2] * m[3], W[1] * m[2] + W[3] * m[3]];
    o.tx = W[0] * m[4] + W[2] * m[5] + W[4]; o.ty = W[1] * m[4] + W[3] * m[5] + W[5];
  },
  mirrorKinds(m){ return m === 'v' ? ['v'] : m === 'h' ? ['h'] : m === 'vh' ? ['v', 'h', 'vh'] : []; },
  /* Real mirrored copy about x=ax / y=ay: same geometry, mirrored transform (generated outlines stay exact). */
  mirror(o, kind, ax, ay, id){
    const c = JSON.parse(JSON.stringify(o)); c.id = id; c.m = ''; delete c.gid;
    const v = kind.includes('v'), h = kind.includes('h');
    NT.geo.compose(c, [v ? -1 : 1, 0, 0, h ? -1 : 1, v ? 2 * ax : 0, h ? 2 * ay : 0]);
    return c;
  }
};
