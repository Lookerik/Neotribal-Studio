/* Pointer interaction for every tool. Objects are plain records; the DOM is rebuilt from them. */
NT.Drawing = class {
  constructor(app){
    this.app = app; this.cv = app.canvas; this.tool = 'pen'; this.drag = null; this.space = false;
    const s = this.cv.svg;
    s.addEventListener('pointerdown', e => this.down(e));
    s.addEventListener('pointermove', e => this.move(e));
    s.addEventListener('pointerup', e => this.up(e));
    s.addEventListener('pointercancel', e => this.up(e));
  }
  setTool(t){ this.tool = t; this.app.stage.dataset.tool = t; this.app.selection.clear(); this.app.refreshTools(); }
  down(e){
    if (e.button === 2) return;
    this.cv.svg.setPointerCapture(e.pointerId);
    const p = this.cv.toWorld(e.clientX, e.clientY);
    if (e.button === 1 || this.space || this.tool === 'hand'){
      this.drag = { kind: 'pan', cx: e.clientX, cy: e.clientY }; this.app.stage.classList.add('pan'); return;
    }
    const axis = this.axisAt(p, e.altKey);
    if (axis){ this.drag = { kind: 'axis', which: axis }; return; }
    if (this.tool === 'select'){
      const g = e.target.closest('#art > [data-id]'), id = g && g.dataset.id;
      if (id){
        if (e.shiftKey) this.app.selection.toggle(id);
        else if (!this.app.selection.has(id)) this.app.selection.set([id]);
        if (this.app.selection.has(id)) this.drag = { kind: 'move', last: p, moved: false };
      } else if (!e.shiftKey) this.app.selection.clear();
      return;
    }
    const a = this.app, base = { id: a.newId(), stroke: a.style.stroke, sw: a.style.sw, fill: a.style.fillOn ? a.style.fill : 'none', tx: 0, ty: 0, m: a.canvas.doc.sym === 'off' ? '' : a.canvas.doc.sym };
    let o;
    switch (this.tool){
      case 'pen': o = { ...base, type: 'path', pts: [p], d: '', fill: 'none' }; break;
      case 'line': o = { ...base, type: 'line', x1: p.x, y1: p.y, x2: p.x, y2: p.y }; break;
      case 'rect': o = { ...base, type: 'rect', x: p.x, y: p.y, w: 0, h: 0 }; break;
      default: o = { ...base, type: 'ellipse', cx: p.x, cy: p.y, rx: 0, ry: 0 };
    }
    this.drag = { kind: 'draw', o, start: p }; this.preview();
  }
  move(e){
    const d = this.drag, p = this.cv.toWorld(e.clientX, e.clientY);
    this.app.setStatus(`${Math.round(p.x)}, ${Math.round(p.y)}`);
    if (!d){ this.hover(p, e.altKey); return; }
    if (d.kind === 'pan'){ this.cv.panBy(e.clientX - d.cx, e.clientY - d.cy); d.cx = e.clientX; d.cy = e.clientY; return; }
    if (d.kind === 'axis'){ const dc = this.cv.doc; if (d.which === 'x') dc.ax = p.x; else dc.ay = p.y; d.moved = true; this.app.redraw(); return; }
    if (d.kind === 'move'){
      const dx = p.x - d.last.x, dy = p.y - d.last.y; d.last = p; d.moved = true;
      this.app.selection.nudge(dx, dy); return;
    }
    const o = d.o, s = d.start;
    if (this.tool === 'pen'){
      const l = o.pts[o.pts.length - 1]; if (NT.geo.dist(l, p) < 1.5 / this.cv.view.k) return;
      o.pts.push(p); o.d = NT.geo.smoothPath(o.pts);
    } else {
      let w = p.x - s.x, h = p.y - s.y;
      if (e.shiftKey && this.tool !== 'line'){ const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
      if (this.tool === 'line'){
        if (e.shiftKey){ const ang = Math.round(Math.atan2(h, w) / (Math.PI / 4)) * Math.PI / 4, L = Math.hypot(w, h); w = Math.cos(ang) * L; h = Math.sin(ang) * L; }
        o.x2 = s.x + w; o.y2 = s.y + h;
      } else if (this.tool === 'rect'){ o.x = Math.min(s.x, s.x + w); o.y = Math.min(s.y, s.y + h); o.w = Math.abs(w); o.h = Math.abs(h); }
      else if (this.tool === 'circle'){ o.cx = s.x; o.cy = s.y; o.rx = o.ry = Math.hypot(w, h); }
      else { o.cx = s.x + w / 2; o.cy = s.y + h / 2; o.rx = Math.abs(w) / 2; o.ry = Math.abs(h) / 2; }
    }
    this.preview();
  }
  up(){
    const d = this.drag; if (!d) return; this.drag = null; this.app.stage.classList.remove('pan');
    if (d.kind === 'move' || d.kind === 'axis'){ if (d.moved) this.app.commit(); return; }
    if (d.kind !== 'draw') return;
    const o = d.o; this.app.overlay2.replaceChildren();
    if (o.type === 'path'){ o.pts = NT.geo.thin(o.pts, 1 / this.cv.view.k); o.d = NT.geo.smoothPath(o.pts); }
    const empty = (o.type === 'line' && Math.abs(o.x2 - o.x1) + Math.abs(o.y2 - o.y1) <= 1) || (o.type === 'rect' && (o.w < 1 || o.h < 1)) || (o.type === 'ellipse' && (o.rx < 1 || o.ry < 1));
    if (empty) return;
    this.app.objects.push(o); this.app.commit(); this.app.selection.set([o.id]);
  }
  /* Axes are grabbable with the Select tool, or with Alt held for any other tool. */
  axisAt(p, alt){
    const d = this.cv.doc, t = 8 / this.cv.view.k;
    if (d.sym === 'off' || this.space || this.tool === 'hand' || !(this.tool === 'select' || alt)) return null;
    if ((d.sym === 'v' || d.sym === 'vh') && Math.abs(p.x - d.ax) < t) return 'x';
    if ((d.sym === 'h' || d.sym === 'vh') && Math.abs(p.y - d.ay) < t) return 'y';
    return null;
  }
  hover(p, alt){ const a = this.axisAt(p, alt); this.app.stage.style.cursor = a === 'x' ? 'ew-resize' : a === 'y' ? 'ns-resize' : ''; }
  preview(){
    const o = this.drag.o, f = document.createDocumentFragment();
    for (const t of [null, ...this.cv.mats(o.m)]){ const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); if (t) g.setAttribute('transform', t); g.appendChild(NT.Canvas.build(o)); f.appendChild(g); }
    this.app.overlay2.replaceChildren(f);
  }
};
