/* Selection set, bounding boxes, move, delete. */
NT.Selection = class {
  constructor(app){ this.app = app; this.ids = new Set(); }
  set(ids){ this.ids = new Set(ids); this.app.refreshOverlay(); this.app.syncPanel(); }
  toggle(id){ this.ids.has(id) ? this.ids.delete(id) : this.ids.add(id); this.app.refreshOverlay(); this.app.syncPanel(); }
  clear(){ if (this.ids.size) this.set([]); }
  has(id){ return this.ids.has(id); }
  objects(){ return this.app.objects.filter(o => this.ids.has(o.id)); }
  bbox(o){
    if (o.gen && o.gb) return o.gb;
    const w = o.sw / 2;
    switch (o.type){
      case 'line': return { x: Math.min(o.x1, o.x2) - w, y: Math.min(o.y1, o.y2) - w, w: Math.abs(o.x2 - o.x1) + o.sw, h: Math.abs(o.y2 - o.y1) + o.sw };
      case 'rect': return { x: o.x - w, y: o.y - w, w: o.w + o.sw, h: o.h + o.sw };
      case 'ellipse': return { x: o.cx - o.rx - w, y: o.cy - o.ry - w, w: 2 * o.rx + o.sw, h: 2 * o.ry + o.sw };
      default: { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const p of o.pts){ a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y); } return { x: a - w, y: b - w, w: c - a + o.sw, h: d - b + o.sw }; }
    }
  }
  groupOf(id){ const o = this.app.objects.find(x => x.id === id); return o && o.gid ? this.app.objects.filter(x => x.gid === o.gid).map(x => x.id) : [id]; }
  corners(o){ const b = this.bbox(o); return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([x, y]) => NT.geo.apply(o, x, y)); }
  unionBox(){
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const o of this.objects()) for (const q of this.corners(o)){ x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    return x0 > 1e8 ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  deleteSelected(){
    if (!this.ids.size) return;
    this.app.objects = this.app.objects.filter(o => !this.ids.has(o.id)); this.ids.clear();
    this.app.commit(); this.app.refreshOverlay();
  }
  nudge(dx, dy){ for (const o of this.objects()){ o.tx = (o.tx || 0) + dx; o.ty = (o.ty || 0) + dy; } this.app.redraw(); }
};
