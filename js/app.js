/* Application shell: state, tool bar, panels, shortcuts. */
(function(){
  const $ = id => document.getElementById(id);
  const ICONS = {
    select: '<path d="M5 3l14 8-6 1.5L10 19z"/>', node: '<path d="M5 19L19 5"/><rect x="3" y="17" width="4" height="4"/><rect x="17" y="3" width="4" height="4"/>', pen: '<path d="M3 17c4-9 8 3 11-6 2-5 4-3 7-5"/>',
    line: '<path d="M4 20L20 4"/>', rect: '<rect x="4" y="5" width="16" height="14"/>',
    circle: '<circle cx="12" cy="12" r="8"/>', ellipse: '<ellipse cx="12" cy="12" rx="9" ry="5.5"/>',
    hand: '<path d="M8 12V6a1.5 1.5 0 013 0v5m0-6a1.5 1.5 0 013 0v6m0-4a1.5 1.5 0 013 0v7a6 6 0 01-6 6h-1a6 6 0 01-5-3l-2-4a1.5 1.5 0 012.5-1.5L8 14"/>'
  };
  const TOOLS = [['select','Select (V)'],['node','Node edit (N)'],['pen','Freehand (P)'],['line','Line (L)'],['rect','Rectangle (R)'],['circle','Circle (C)'],['ellipse','Ellipse (E)'],['hand','Pan (H or hold Space)']];
  const app = {
    objects: [], seq: 0, style: { stroke: '#000000', sw: 4, fill: '#000000', fillOn: false },
    newId(){ return 'o' + (++this.seq) + Math.random().toString(36).slice(2, 5); },
    snapshot(){ return { objects: this.objects, doc: this.canvas.doc, seq: this.seq, layers: this.layers, active: this.activeLayer }; },
    commit(){ this.history.push(this.snapshot()); this.redraw(); this.renderLayers(); this.updateButtons(); },
    restore(s){
      if (!s) return; this.objects = s.objects; this.seq = s.seq; this.layers = s.layers; this.activeLayer = s.active; this.renderLayers(); this.canvas.setDoc(s.doc); this.syncDoc();
      this.selection.ids = new Set([...this.selection.ids].filter(id => this.objects.some(o => o.id === id)));
      this.redraw(); this.syncPanel(); this.updateButtons();
    },
    redraw(){ this.canvas.layers = this.layers; this.canvas.render(this.objects); this.refreshOverlay(); },
    refreshOverlay(){
      const k = this.canvas.view.k, ov = this.canvas.overlay, ns = 'http://www.w3.org/2000/svg'; ov.replaceChildren();
      const mk = (tag, at) => { const e = document.createElementNS(ns, tag); for (const a in at) e.setAttribute(a, at[a]); ov.appendChild(e); return e; };
      const dc = this.canvas.doc, ax = (x1, y1, x2, y2) => mk('line', { x1, y1, x2, y2, stroke: '#ff4d8d', 'stroke-width': 1.5 / k, 'stroke-dasharray': `${8 / k} ${5 / k}` });
      if (dc.sym === 'v' || dc.sym === 'vh') ax(dc.ax, 0, dc.ax, dc.h);
      if (dc.sym === 'h' || dc.sym === 'vh') ax(0, dc.ay, dc.w, dc.ay);
      for (const o of this.selection.objects()){
        const pts = this.selection.corners(o).map(q => `${q.x},${q.y}`).join(' ');
        for (const t of [null, ...this.canvas.mats(o.m)]){
          const e = mk('polygon', { points: pts, fill: 'none', stroke: '#4aa3ff', 'stroke-width': 1.5 / k, 'stroke-dasharray': `${5 / k} ${4 / k}` });
          if (t){ e.setAttribute('transform', t); e.setAttribute('opacity', 0.5); }
        }
      }
      const box = this.drawing && this.drawing.tool === 'select' ? this.selection.unionBox() : null;
      if (box){
        const r = 4.5 / k, S = '#4aa3ff', cx = box.x + box.w / 2;
        mk('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: 'none', stroke: S, 'stroke-width': 1 / k });
        mk('line', { x1: cx, y1: box.y, x2: cx, y2: box.y - 26 / k, stroke: S, 'stroke-width': 1 / k });
        mk('circle', { cx, cy: box.y - 26 / k, r, fill: '#fff', stroke: S, 'stroke-width': 1.5 / k });
        for (const [x, y] of [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]]) mk('rect', { x: x - r, y: y - r, width: 2 * r, height: 2 * r, fill: '#fff', stroke: S, 'stroke-width': 1.5 / k });
      }
      if (this.nodes) this.nodes.draw(ov, k);
    },
    setStatus(t){ $('status').textContent = t; },
    /* Turn mirrored copies (of the selection, or of everything) into real objects. */
    releaseMirrors(){
      const d = this.canvas.doc, src = (this.selection.ids.size ? this.selection.objects() : this.objects).filter(o => o.m), out = [];
      for (const o of src){ for (const t of NT.geo.mirrorKinds(o.m)) out.push(NT.geo.mirror(o, t, d.ax, d.ay, this.newId())); o.m = ''; }
      if (!out.length){ this.setStatus('No mirrored objects to release'); return; }
      this.objects.push(...out); this.commit();
    },
    updateButtons(){ $('undo').disabled = !this.history.canUndo; $('redo').disabled = !this.history.canRedo; },
    refreshTools(){ document.querySelectorAll('#tools button').forEach(b => b.classList.toggle('on', b.dataset.tool === this.drawing.tool)); },
    syncDoc(){ const d = this.canvas.doc; $('bg').value = d.bg; $('dw').value = d.w; $('dh').value = d.h;
      document.querySelectorAll('#symseg button').forEach(b => b.classList.toggle('on', b.dataset.m === d.sym)); },
    /* Show the first selected object's style in the panel (or the defaults if nothing is selected). */
    syncPanel(){
      const s = this.selection.objects()[0];
      const st = s ? { stroke: s.stroke, sw: s.sw, fill: s.fill === 'none' ? this.style.fill : s.fill, fillOn: s.fill !== 'none' } : this.style;
      $('stroke').value = st.stroke; $('sw').value = st.sw; $('swo').textContent = st.sw; $('fill').value = st.fill; $('fillon').checked = st.fillOn; if (this.syncGen) this.syncGen();
    },
    applyStyle(style, objFn){
      Object.assign(this.style, style);
      const sel = this.selection.objects(); if (!sel.length) return;
      for (const o of sel){ Object.assign(o, objFn(o)); if (o.gen) NT.tribal.apply(o); } this.redraw();
    }
  };

  function init(){
    app.stage = $('stage'); app.canvas = new NT.Canvas(); app.history = new NT.History();
    app.selection = new NT.Selection(app); NT.layers.install(app); app.nodes = new NT.Nodes(app);
    app.overlay2 = document.createElementNS('http://www.w3.org/2000/svg', 'g'); app.overlay2.setAttribute('pointer-events', 'none');
    app.canvas.world.insertBefore(app.overlay2, app.canvas.overlay);
    app.drawing = new NT.Drawing(app);
    const nav = $('tools');
    for (const [id, label] of TOOLS){
      const b = document.createElement('button'); b.dataset.tool = id; b.title = label; b.setAttribute('aria-label', label);
      b.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[id]}</svg>`; b.onclick = () => app.drawing.setTool(id); nav.appendChild(b);
    }
    app.canvas.onView = v => { $('zlabel').textContent = Math.round(v.k * 100) + '%'; app.refreshOverlay(); };
    app.canvas.setDoc({}); app.syncDoc(); app.canvas.fit(); app.history.reset(app.snapshot()); app.drawing.setTool('pen'); app.redraw(); app.updateButtons();

    $('undo').onclick = () => app.restore(app.history.undo());
    $('redo').onclick = () => app.restore(app.history.redo());
    $('zin').onclick = () => app.canvas.zoomCenter(1.25); $('zout').onclick = () => app.canvas.zoomCenter(0.8);
    $('zfit').onclick = () => app.canvas.fit(); $('z100').onclick = () => app.canvas.actual();
    $('grid').onclick = e => { const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on); app.canvas.showGrid(on); };

    $('stroke').oninput = e => { const v = e.target.value; app.applyStyle({ stroke: v }, () => ({ stroke: v })); };
    $('sw').oninput = e => { const v = +e.target.value; $('swo').textContent = v; app.applyStyle({ sw: v }, () => ({ sw: v })); };
    const fillChange = () => { const on = $('fillon').checked, c = $('fill').value;
      app.applyStyle({ fill: c, fillOn: on }, o => ({ fill: (o.type === 'path' || o.type === 'line') ? o.fill : (on ? c : 'none') })); };
    $('fill').oninput = fillChange; $('fillon').onchange = fillChange;
    for (const id of ['stroke', 'sw', 'fill', 'fillon']) $(id).addEventListener('change', () => { if (app.selection.ids.size) app.commit(); });

    $('bg').onchange = e => { app.canvas.setDoc({ bg: e.target.value }); app.commit(); };
    const size = () => { const w = Math.min(8000, Math.max(100, +$('dw').value || 1200)), h = Math.min(8000, Math.max(100, +$('dh').value || 800)); app.canvas.setDoc({ w, h, ax: w / 2, ay: h / 2 }); app.syncDoc(); app.canvas.fit(); app.commit(); };
    $('dw').onchange = size; $('dh').onchange = size;
    document.querySelectorAll('#symseg button').forEach(b => b.onclick = () => { app.canvas.setDoc({ sym: b.dataset.m }); app.syncDoc(); app.commit(); });
    $('symc').onclick = () => { const d = app.canvas.doc; app.canvas.setDoc({ ax: d.w / 2, ay: d.h / 2 }); app.commit(); };
    $('symr').onclick = () => app.releaseMirrors();

    /* Neo-Tribal generator panel */
    const KEYS = ['fs', 'te', 'tp', 'sm', 'dd', 'oi', 'oo', 'sp', 'cv', 'rn'], D = NT.tribal.DEFAULTS; app.tp = { ...D };
    const genable = () => app.selection.objects().filter(o => o.type === 'path' || o.type === 'line');
    const makeGen = o => {
      if (o.type === 'line'){ o.pts = [{ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }]; o.d = NT.geo.smoothPath(o.pts); o.type = 'path'; for (const k of ['x1', 'y1', 'x2', 'y2']) delete o[k]; o.fill = 'none'; }
      o.gen = { ...app.tp }; NT.tribal.apply(o);
    };
    app.syncGen = () => {
      const sel = genable(), g = sel.find(o => o.gen);
      for (const id of KEYS) $(id).disabled = !sel.length;
      $('tgen').disabled = !sel.length; $('trst').disabled = !sel.length; $('tre').disabled = !sel.length; $('trev').disabled = !g;
      if (g) app.tp = { ...g.gen };
      for (const id of KEYS){ $(id).value = app.tp[id]; $(id + 'o').textContent = app.tp[id]; }
    };
    let raf = 0, dirty = {};
    for (const id of KEYS){
      $(id).oninput = () => {
        app.tp[id] = +$(id).value; $(id + 'o').textContent = $(id).value; dirty[id] = app.tp[id];
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0; const ch = dirty; dirty = {};
          for (const o of genable()){ if (!o.gen) makeGen(o); else { Object.assign(o.gen, ch); NT.tribal.apply(o); } }
          app.redraw(); $('trev').disabled = false;
        });
      };
      $(id).onchange = () => { if (genable().length) app.commit(); };
    }
    $('tgen').onclick = () => { for (const o of genable()) if (!o.gen) makeGen(o); app.commit(); app.syncGen(); };
    $('tre').onclick = () => { const sd = 1 + Math.floor(Math.random() * 1e6); app.tp.seed = sd; for (const o of genable()){ if (!o.gen) makeGen(o); o.gen.seed = sd; NT.tribal.apply(o); } app.commit(); app.syncGen(); };
    $('trev').onclick = () => { for (const o of genable()){ delete o.gen; delete o.gd; delete o.gb; } app.commit(); app.syncGen(); };
    $('trst').onclick = () => { app.tp = { ...D }; for (const o of genable()){ if (!o.gen) makeGen(o); else { o.gen = { ...D }; NT.tribal.apply(o); } } app.commit(); app.syncGen(); };

    window.addEventListener('keydown', e => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (mod && k === 'z'){ e.preventDefault(); app.restore(e.shiftKey ? app.history.redo() : app.history.undo()); return; }
      if (mod && k === 'y'){ e.preventDefault(); app.restore(app.history.redo()); return; }
      if (e.key === ' '){ e.preventDefault(); app.drawing.space = true; app.stage.dataset.tool = 'hand'; return; }
      if (e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); if (app.drawing.tool === 'node' && app.nodes.removeSel()) return; app.selection.deleteSelected(); return; }
      if (mod && k === 'g'){ e.preventDefault(); e.shiftKey ? app.ungroup() : app.group(); return; }
      if (mod && k === 'd'){ e.preventDefault(); app.duplicateSel(); return; }
      if (e.key === 'Escape'){ app.selection.clear(); app.nodes.set(null, null); return; }
      if (mod && k === 'a' && app.drawing.tool === 'select'){ e.preventDefault(); app.selection.set(app.objects.map(o => o.id)); return; }
      if (e.key.startsWith('Arrow') && app.selection.ids.size){
        e.preventDefault(); const s = e.shiftKey ? 10 : 1;
        app.selection.nudge(e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0);
        clearTimeout(app._nt); app._nt = setTimeout(() => app.commit(), 300); return;
      }
      const map = { v: 'select', p: 'pen', l: 'line', r: 'rect', c: 'circle', e: 'ellipse', h: 'hand', n: 'node' };
      if (!mod && map[k]) app.drawing.setTool(map[k]);
    });
    window.addEventListener('keyup', e => { if (e.key === ' '){ app.drawing.space = false; app.stage.dataset.tool = app.drawing.tool; } });
    $('egrp').onclick = () => app.group(); $('eugrp').onclick = () => app.ungroup(); $('edup').onclick = () => app.duplicateSel();
    $('endel').onclick = () => app.nodes.removeSel(); $('esm').onclick = () => app.nodes.toggleSmooth();
    app.renderLayers();
    NT.app = app;
  }
  init();
})();
