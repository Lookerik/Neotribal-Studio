/* Selection set, bounding boxes, move, delete. */
NT.Selection = class {
  constructor(app){ this.app = app; this.ids = new Set(); }
  set(ids){ this.ids = new Set(ids); this.app.refreshOverlay(); this.app.syncPanel(); }
  toggle(id){ this.ids.has(id) ? this.ids.delete(id) : this.ids.add(id); this.app.refreshOverlay(); this.app.syncPanel(); }
  clear(){ if (this.ids.size) this.set([]); }
  has(id){ return this.ids.has(id); }
  objects(){ return this.app.objects.filter(o => this.ids.has(o.id)); }
  bbox(o){
    const w = o.sw / 2;
    switch (o.type){
      case 'line': return { x: Math.min(o.x1, o.x2) - w, y: Math.min(o.y1, o.y2) - w, w: Math.abs(o.x2 - o.x1) + o.sw, h: Math.abs(o.y2 - o.y1) + o.sw };
      case 'rect': return { x: o.x - w, y: o.y - w, w: o.w + o.sw, h: o.h + o.sw };
      case 'ellipse': return { x: o.cx - o.rx - w, y: o.cy - o.ry - w, w: 2 * o.rx + o.sw, h: 2 * o.ry + o.sw };
      default: { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const p of o.pts){ a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y); } return { x: a - w, y: b - w, w: c - a + o.sw, h: d - b + o.sw }; }
    }
  }
  deleteSelected(){
    if (!this.ids.size) return;
    this.app.objects = this.app.objects.filter(o => !this.ids.has(o.id)); this.ids.clear();
    this.app.commit(); this.app.refreshOverlay();
  }
  nudge(dx, dy){ for (const o of this.objects()){ o.tx = (o.tx || 0) + dx; o.ty = (o.ty || 0) + dy; } this.app.redraw(); }
};
