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
  setTool(t){ if (this.app.nodes) this.app.nodes.set(null, null); this.tool = t; this.app.stage.dataset.tool = t; this.app.selection.clear(); this.app.refreshTools(); }
  down(e){
    if (e.button === 2) return;
    this.cv.svg.setPointerCapture(e.pointerId);
    const p = this.cv.toWorld(e.clientX, e.clientY);
    if (e.button === 1 || this.space || this.tool === 'hand'){
      this.drag = { kind: 'pan', cx: e.clientX, cy: e.clientY }; this.app.stage.classList.add('pan'); return;
    }
    if (this.app.refEdit && this.app.ref){ this.drag = { kind: 'ref', last: p, moved: false }; return; }
    const axis = this.axisAt(p, e.altKey);
    if (axis){ this.drag = { kind: 'axis', which: axis }; return; }
    if (this.tool === 'select'){
      const hh = this.handleAt(p);
      if (hh){ this.drag = { kind: 'xform', hh, box: this.app.selection.unionBox(), start: p, moved: false, init: this.app.selection.objects().map(o => ({ o, M: o.M && [...o.M], tx: o.tx || 0, ty: o.ty || 0 })) }; return; }
      const g = e.target.closest('#art > [data-id]'), id = g && g.dataset.id, S = this.app.selection;
      if (id){
        const ids = S.groupOf(id);
        if (e.shiftKey){ const all = ids.every(i => S.has(i)); S.set([...S.ids].filter(i => !(all && ids.includes(i))).concat(all ? [] : ids)); }
        else if (!S.has(id)) S.set(ids);
        if (S.has(id)) this.drag = { kind: 'move', last: p, moved: false };
      } else if (!e.shiftKey) S.clear();
      return;
    }
    if (this.tool === 'node'){
      const nd = this.app.nodes, now = performance.now(), dbl = this._lt && now - this._lt < 350; this._lt = now;
      const h = nd.hit(p); if (h){ this.drag = nd.begin(h, p); return; }
      const g = e.target.closest('#art > [data-id]'), id = g && g.dataset.id;
      if (id){
        if (nd.oid === id){ if (dbl && nd.addAt(p)) return; nd.set(id, null); return; }
        const o = this.app.objects.find(x => x.id === id); this.app.selection.set([id]);
        if (!nd.enter(o)) this.app.setStatus("This object can't be edited as nodes");
      } else { nd.set(null, null); this.app.selection.clear(); }
      return;
    }
    const a = this.app, ly = a.layers.find(l => l.id === a.activeLayer);
    if (!ly || ly.locked || !ly.visible){ a.setStatus('The active layer is hidden or locked'); return; }
    const base = { layer: a.activeLayer, id: a.newId(), stroke: a.style.stroke, sw: a.style.sw, fill: a.style.fillOn ? a.style.fill : 'none', tx: 0, ty: 0, m: a.canvas.doc.sym === 'off' ? '' : a.canvas.doc.sym };
    let o;
    switch (this.tool){
      case 'pen': o = { ...base, type: 'path', pts: [this.snapPt(p) || p], d: '', fill: 'none' }; break;
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
    if (d.kind === 'ref'){ const r = this.app.ref; r.x += p.x - d.last.x; r.y += p.y - d.last.y; d.last = p; d.moved = true; this.app.applyRef(); return; }
    if (d.kind === 'xform'){ this.xform(d, p, e); return; }
    if (d.kind === 'node'){ this.app.nodes.drag(d, p, e); return; }
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
    if (d.kind === 'move' || d.kind === 'axis' || d.kind === 'xform' || d.kind === 'node' || d.kind === 'ref'){ if (d.moved) this.app.commit(); return; }
    if (d.kind !== 'draw') return;
    const o = d.o; this.app.overlay2.replaceChildren();
    if (o.type === 'path'){ o.pts = NT.geo.thin(o.pts, 1 / this.cv.view.k); o.d = NT.geo.smoothPath(o.pts); }
    const empty = (o.type === 'line' && Math.abs(o.x2 - o.x1) + Math.abs(o.y2 - o.y1) <= 1) || (o.type === 'rect' && (o.w < 1 || o.h < 1)) || (o.type === 'ellipse' && (o.rx < 1 || o.ry < 1));
    if (empty) return;
    if (this.app.autoGen && this.app.makeGen && (o.type === 'path' || o.type === 'line')) this.app.makeGen(o);
    this.app.objects.push(o); this.app.commit(); this.app.selection.set([o.id]);
  }
  /* Nearest point on any visible, unlocked stroke centreline (world space), for branching. */
  snapPt(p){
    if (!this.app.snapOn) return null; const tol = 12 / this.cv.view.k; let best = null, bd = tol;
    for (const o of this.app.objects){
      if (o.type !== 'path' || o.bool || !o.pts) continue; const l = this.app.layers.find(x => x.id === o.layer); if (!l || !l.visible || l.locked) continue;
      for (const q of o.pts){ const w = NT.geo.apply(o, q.x, q.y), dd = NT.geo.dist(p, w); if (dd < bd){ bd = dd; best = w; } }
    }
    return best;
  }
  handleAt(p){
    const b = this.app.selection.unionBox(); if (!b || this.tool !== 'select') return null;
    const k = this.cv.view.k, tol = 9 / k, c = [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
    if (NT.geo.dist(p, { x: b.x + b.w / 2, y: b.y - 26 / k }) < tol) return { type: 'rotate' };
    for (let i = 0; i < 4; i++) if (NT.geo.dist(p, c[i]) < tol) return { type: 'scale', x: c[i].x, y: c[i].y, opp: c[(i + 2) % 4] };
    return null;
  }
  xform(d, p, e){
    const b = d.box, hh = d.hh; let W;
    if (hh.type === 'rotate'){
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2; let a = Math.atan2(p.y - cy, p.x - cx) - Math.atan2(d.start.y - cy, d.start.x - cx);
      if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * Math.PI / 12;
      const c = Math.cos(a), s = Math.sin(a); W = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
    } else {
      const v = hh.opp, hx = hh.x - v.x, hy = hh.y - v.y, fix = t => Math.abs(t) < 0.02 ? (t < 0 ? -0.02 : 0.02) : t;
      let sx = (p.x - v.x) / (hx || 1e-6), sy = (p.y - v.y) / (hy || 1e-6);
      if (e.shiftKey) sx = sy = ((p.x - v.x) * hx + (p.y - v.y) * hy) / (hx * hx + hy * hy || 1);
      sx = fix(sx); sy = fix(sy); W = [sx, 0, 0, sy, v.x * (1 - sx), v.y * (1 - sy)];
    }
    for (const it of d.init){ if (it.M) it.o.M = [...it.M]; else delete it.o.M; it.o.tx = it.tx; it.o.ty = it.ty; NT.geo.compose(it.o, W); }
    d.moved = true; this.app.redraw();
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
