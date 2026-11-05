/* Geometry helpers shared by all modules. */
window.NT = window.NT || {};
NT.geo = {
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
