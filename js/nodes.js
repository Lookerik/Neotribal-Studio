/* Node tool: convert to Bézier nodes, drag nodes/handles, add (double-click) / delete / smooth-corner. */
NT.Nodes = class {
  constructor(app){ this.app = app; this.oid = null; this.idx = null; }
  set(oid, idx){ this.oid = oid; this.idx = idx; this.app.refreshOverlay(); }
  get obj(){ return (this.oid && this.app.objects.find(o => o.id === this.oid)) || null; }
  enter(o){
    if (o.bool) return false;
    if (!o.nodes){
      let r;
      if (o.type === 'path') r = { nodes: NT.curves.fromPts(o.pts), closed: false };
      else if ((r = NT.curves.fromShape(o))){
        for (const k of ['x1', 'y1', 'x2', 'y2', 'x', 'y', 'w', 'h', 'cx', 'cy', 'rx', 'ry']) delete o[k];
        o.type = 'path'; if (!r.closed) o.fill = 'none';
      } else return false;
      o.nodes = r.nodes; o.closed = r.closed; this.sync(o); this.app.commit();
    }
    this.set(o.id, null); return true;
  }
  sync(o){ o.d = NT.curves.toD(o.nodes, o.closed); o.pts = NT.curves.sample(o.nodes, o.closed); if (o.gen) NT.tribal.apply(o); }
  local(p){ return NT.geo.invert(this.obj, p); }
  hit(p){
    const o = this.obj; if (!o || !o.nodes) return null;
    const tol = 9 / this.app.canvas.view.k, w = (x, y) => NT.geo.apply(o, x, y);
    if (this.idx != null && o.nodes[this.idx]){
      const n = o.nodes[this.idx];
      for (const h of ['i', 'o']) if ((n[h + 'x'] !== n.x || n[h + 'y'] !== n.y) && NT.geo.dist(p, w(n[h + 'x'], n[h + 'y'])) < tol) return { kind: 'handle', i: this.idx, h };
    }
    for (let i = o.nodes.length - 1; i >= 0; i--) if (NT.geo.dist(p, w(o.nodes[i].x, o.nodes[i].y)) < tol) return { kind: 'node', i };
    return null;
  }
  begin(h, p){ const n = this.obj.nodes[h.i]; this.idx = h.i; this.app.refreshOverlay(); return { kind: 'node', h, start: this.local(p), orig: { ...n }, moved: false }; }
  drag(d, p, e){
    const o = this.obj; if (!o) return;
    const n = o.nodes[d.h.i], q = this.local(p), dx = q.x - d.start.x, dy = q.y - d.start.y; d.moved = true;
    if (d.h.kind === 'node'){ for (const k of ['x', 'ix', 'ox']) n[k] = d.orig[k] + dx; for (const k of ['y', 'iy', 'oy']) n[k] = d.orig[k] + dy; }
    else {
      const h = d.h.h, op = h === 'i' ? 'o' : 'i'; n[h + 'x'] = d.orig[h + 'x'] + dx; n[h + 'y'] = d.orig[h + 'y'] + dy;
      if (e.altKey) n.s = false;
      else if (n.s){ const vx = n.x - n[h + 'x'], vy = n.y - n[h + 'y'], m = Math.hypot(vx, vy) || 1, L = Math.hypot(d.orig[op + 'x'] - d.orig.x, d.orig[op + 'y'] - d.orig.y); n[op + 'x'] = n.x + vx / m * L; n[op + 'y'] = n.y + vy / m * L; }
    }
    this.sync(o); this.app.redraw();
  }
  addAt(p){
    const o = this.obj; if (!o || !o.nodes) return false;
    const r = NT.curves.nearest(o.nodes, o.closed, this.local(p)), m = NT.geo.mat(o), sc = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
    if (!r || r.dist * sc > 8 / this.app.canvas.view.k) return false;
    this.idx = NT.curves.split(o.nodes, r.i, r.t); this.sync(o); this.app.commit(); return true;
  }
  removeSel(){
    const o = this.obj; if (!o || !o.nodes || this.idx == null) return false;
    const min = o.closed ? 3 : 2;
    if (o.nodes.length <= min){ this.app.setStatus(`A path needs at least ${min} nodes`); return true; }
    o.nodes.splice(this.idx, 1); this.idx = null; this.sync(o); this.app.commit(); return true;
  }
  toggleSmooth(){
    const o = this.obj; if (!o || !o.nodes || this.idx == null) return;
    const n = o.nodes[this.idx]; if (n.s) n.s = false; else NT.curves.smoothNode(o.nodes, this.idx, o.closed);
    this.sync(o); this.app.commit();
  }
  draw(ov, k){
    const o = this.obj; if (!o || !o.nodes) return;
    const ns = 'http://www.w3.org/2000/svg', w = (x, y) => NT.geo.apply(o, x, y), S = '#4aa3ff', r = 4.5 / k;
    const mk = (tag, at) => { const e = document.createElementNS(ns, tag); for (const a in at) e.setAttribute(a, at[a]); ov.appendChild(e); };
    if (this.idx != null && o.nodes[this.idx]){
      const n = o.nodes[this.idx], P = w(n.x, n.y);
      for (const h of ['i', 'o']){
        if (n[h + 'x'] === n.x && n[h + 'y'] === n.y) continue;
        const Q = w(n[h + 'x'], n[h + 'y']); mk('line', { x1: P.x, y1: P.y, x2: Q.x, y2: Q.y, stroke: S, 'stroke-width': 1 / k });
        mk('circle', { cx: Q.x, cy: Q.y, r: r * 0.9, fill: '#fff', stroke: S, 'stroke-width': 1.5 / k });
      }
    }
    o.nodes.forEach((n, i) => { const P = w(n.x, n.y); mk('rect', { x: P.x - r, y: P.y - r, width: 2 * r, height: 2 * r, fill: i === this.idx ? S : '#fff', stroke: S, 'stroke-width': 1.5 / k }); });
  }
};
