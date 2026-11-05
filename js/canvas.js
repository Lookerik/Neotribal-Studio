/* Viewport: zoom/pan, coordinate conversion, grid, document size, and object rendering. */
NT.Canvas = class {
  constructor(){
    this.svg = document.getElementById('svg'); this.world = document.getElementById('world');
    this.art = document.getElementById('art'); this.overlay = document.getElementById('overlay');
    this.paper = document.getElementById('paper'); this.gridr = document.getElementById('gridr');
    this.view = { x: 0, y: 0, k: 1 }; this.doc = { w: 1200, h: 800, bg: '#ffffff' };
    this.onView = () => {};
    this.svg.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) this.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      else if (e.deltaMode === 0 && Math.abs(e.deltaY) < 50 && !e.shiftKey) this.panBy(-e.deltaX, -e.deltaY);
      else this.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    new ResizeObserver(() => this.apply()).observe(this.svg);
  }
  toWorld(cx, cy){ const r = this.svg.getBoundingClientRect(); return { x: (cx - r.left - this.view.x) / this.view.k, y: (cy - r.top - this.view.y) / this.view.k }; }
  apply(){
    const v = this.view; this.world.setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.k})`);
    this.onView(v);
  }
  zoomAt(cx, cy, f){
    const r = this.svg.getBoundingClientRect(), v = this.view, k = Math.min(32, Math.max(0.05, v.k * f)), px = cx - r.left, py = cy - r.top;
    v.x = px - (px - v.x) * (k / v.k); v.y = py - (py - v.y) * (k / v.k); v.k = k; this.apply();
  }
  zoomCenter(f){ const r = this.svg.getBoundingClientRect(); this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, f); }
  panBy(dx, dy){ this.view.x += dx; this.view.y += dy; this.apply(); }
  fit(scale = 0.9){
    const r = this.svg.getBoundingClientRect(), k = Math.min(r.width / this.doc.w, r.height / this.doc.h) * scale;
    this.view = { k, x: (r.width - this.doc.w * k) / 2, y: (r.height - this.doc.h * k) / 2 }; this.apply();
  }
  actual(){ const r = this.svg.getBoundingClientRect(); this.view = { k: 1, x: (r.width - this.doc.w) / 2, y: (r.height - this.doc.h) / 2 }; this.apply(); }
  setDoc(d){
    Object.assign(this.doc, d);
    for (const el of [this.paper, this.gridr]){ el.setAttribute('width', this.doc.w); el.setAttribute('height', this.doc.h); }
    this.ensureChecker();
    this.paper.setAttribute('fill', this.doc.bg === 'transparent' ? 'url(#checker)' : this.doc.bg);
  }
  ensureChecker(){
    if (document.getElementById('checker')) return;
    const p = document.createElementNS(this.svg.namespaceURI, 'pattern');
    p.id = 'checker'; p.setAttribute('width', 20); p.setAttribute('height', 20); p.setAttribute('patternUnits', 'userSpaceOnUse');
    p.innerHTML = '<rect width="20" height="20" fill="#fff"/><rect width="10" height="10" fill="#ddd"/><rect x="10" y="10" width="10" height="10" fill="#ddd"/>';
    this.svg.querySelector('defs').appendChild(p);
  }
  showGrid(on){ this.gridr.setAttribute('display', on ? 'inline' : 'none'); }
  /* Build the DOM element for one object record (also used while previewing). */
  static build(o){
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `translate(${o.tx || 0} ${o.ty || 0})`);
    let el;
    switch (o.type){
      case 'path': el = document.createElementNS(ns, 'path'); el.setAttribute('d', o.d); break;
      case 'line': el = document.createElementNS(ns, 'line'); for (const k of ['x1','y1','x2','y2']) el.setAttribute(k, o[k]); break;
      case 'rect': el = document.createElementNS(ns, 'rect'); el.setAttribute('x', o.x); el.setAttribute('y', o.y); el.setAttribute('width', o.w); el.setAttribute('height', o.h); break;
      case 'ellipse': el = document.createElementNS(ns, 'ellipse'); for (const k of ['cx','cy','rx','ry']) el.setAttribute(k, o[k]); break;
    }
    const filled = o.fill && o.fill !== 'none' && o.type !== 'line';
    el.setAttribute('fill', filled ? o.fill : 'none'); el.setAttribute('stroke', o.stroke); el.setAttribute('stroke-width', o.sw);
    el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round');
    g.appendChild(el); return g;
  }
  /* Invisible fat copy so thin strokes are easy to click. */
  static hit(o, k){
    const g = NT.Canvas.build(o), el = g.firstChild, filled = o.fill && o.fill !== 'none' && o.type !== 'line';
    el.setAttribute('stroke', 'transparent'); el.setAttribute('stroke-width', Math.max(o.sw, 12 / k));
    el.setAttribute('fill', filled ? 'transparent' : 'none'); el.setAttribute('pointer-events', 'all'); return g;
  }
  render(objects){
    const frag = document.createDocumentFragment();
    for (const o of objects){
      const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g'); wrap.dataset.id = o.id;
      const vis = NT.Canvas.build(o); vis.setAttribute('pointer-events', 'none');
      wrap.appendChild(vis); wrap.appendChild(NT.Canvas.hit(o, this.view.k));
      frag.appendChild(wrap);
    }
    this.art.replaceChildren(frag);
  }
};
