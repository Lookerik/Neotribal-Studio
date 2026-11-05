/* Application shell: state, tool bar, panels, shortcuts. */
(function(){
  const $ = id => document.getElementById(id);
  const ICONS = {
    select: '<path d="M5 3l14 8-6 1.5L10 19z"/>', pen: '<path d="M3 17c4-9 8 3 11-6 2-5 4-3 7-5"/>',
    line: '<path d="M4 20L20 4"/>', rect: '<rect x="4" y="5" width="16" height="14"/>',
    circle: '<circle cx="12" cy="12" r="8"/>', ellipse: '<ellipse cx="12" cy="12" rx="9" ry="5.5"/>',
    hand: '<path d="M8 12V6a1.5 1.5 0 013 0v5m0-6a1.5 1.5 0 013 0v6m0-4a1.5 1.5 0 013 0v7a6 6 0 01-6 6h-1a6 6 0 01-5-3l-2-4a1.5 1.5 0 012.5-1.5L8 14"/>'
  };
  const TOOLS = [['select','Select (V)'],['pen','Freehand (P)'],['line','Line (L)'],['rect','Rectangle (R)'],['circle','Circle (C)'],['ellipse','Ellipse (E)'],['hand','Pan (H or hold Space)']];
  const app = {
    objects: [], seq: 0, style: { stroke: '#000000', sw: 4, fill: '#000000', fillOn: false },
    newId(){ return 'o' + (++this.seq) + Math.random().toString(36).slice(2, 5); },
    snapshot(){ return { objects: this.objects, doc: this.canvas.doc, seq: this.seq }; },
    commit(){ this.history.push(this.snapshot()); this.redraw(); this.updateButtons(); },
    restore(s){
      if (!s) return; this.objects = s.objects; this.seq = s.seq; this.canvas.setDoc(s.doc); this.syncDoc();
      this.selection.ids = new Set([...this.selection.ids].filter(id => this.objects.some(o => o.id === id)));
      this.redraw(); this.syncPanel(); this.updateButtons();
    },
    redraw(){ this.canvas.render(this.objects); this.refreshOverlay(); },
    refreshOverlay(){
      const k = this.canvas.view.k, ov = this.canvas.overlay, ns = 'http://www.w3.org/2000/svg'; ov.replaceChildren();
      for (const o of this.selection.objects()){
        const b = this.selection.bbox(o), r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', b.x + (o.tx || 0)); r.setAttribute('y', b.y + (o.ty || 0)); r.setAttribute('width', b.w); r.setAttribute('height', b.h);
        r.setAttribute('fill', 'none'); r.setAttribute('stroke', '#4aa3ff'); r.setAttribute('stroke-width', 1.5 / k); r.setAttribute('stroke-dasharray', `${5 / k} ${4 / k}`);
        ov.appendChild(r);
      }
    },
    setStatus(t){ $('status').textContent = t; },
    updateButtons(){ $('undo').disabled = !this.history.canUndo; $('redo').disabled = !this.history.canRedo; },
    refreshTools(){ document.querySelectorAll('#tools button').forEach(b => b.classList.toggle('on', b.dataset.tool === this.drawing.tool)); },
    syncDoc(){ const d = this.canvas.doc; $('bg').value = d.bg; $('dw').value = d.w; $('dh').value = d.h; },
    /* Show the first selected object's style in the panel (or the defaults if nothing is selected). */
    syncPanel(){
      const s = this.selection.objects()[0];
      const st = s ? { stroke: s.stroke, sw: s.sw, fill: s.fill === 'none' ? this.style.fill : s.fill, fillOn: s.fill !== 'none' } : this.style;
      $('stroke').value = st.stroke; $('sw').value = st.sw; $('swo').textContent = st.sw; $('fill').value = st.fill; $('fillon').checked = st.fillOn;
    },
    applyStyle(style, objFn){
      Object.assign(this.style, style);
      const sel = this.selection.objects(); if (!sel.length) return;
      for (const o of sel) Object.assign(o, objFn(o)); this.redraw();
    }
  };

  function init(){
    app.stage = $('stage'); app.canvas = new NT.Canvas(); app.history = new NT.History();
    app.selection = new NT.Selection(app);
    app.overlay2 = document.createElementNS('http://www.w3.org/2000/svg', 'g'); app.overlay2.setAttribute('pointer-events', 'none');
    app.canvas.world.insertBefore(app.overlay2, app.canvas.overlay);
    app.drawing = new NT.Drawing(app);
    const nav = $('tools');
    for (const [id, label] of TOOLS){
      const b = document.createElement('button'); b.dataset.tool = id; b.title = label; b.setAttribute('aria-label', label);
      b.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[id]}</svg>`; b.onclick = () => app.drawing.setTool(id); nav.appendChild(b);
    }
    app.canvas.onView = v => { $('zlabel').textContent = Math.round(v.k * 100) + '%'; app.refreshOverlay(); };
    app.canvas.setDoc({}); app.canvas.fit(); app.history.reset(app.snapshot()); app.drawing.setTool('pen'); app.redraw(); app.updateButtons();

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
    const size = () => { const w = Math.min(8000, Math.max(100, +$('dw').value || 1200)), h = Math.min(8000, Math.max(100, +$('dh').value || 800)); app.canvas.setDoc({ w, h }); app.syncDoc(); app.canvas.fit(); app.commit(); };
    $('dw').onchange = size; $('dh').onchange = size;

    window.addEventListener('keydown', e => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (mod && k === 'z'){ e.preventDefault(); app.restore(e.shiftKey ? app.history.redo() : app.history.undo()); return; }
      if (mod && k === 'y'){ e.preventDefault(); app.restore(app.history.redo()); return; }
      if (e.key === ' '){ e.preventDefault(); app.drawing.space = true; app.stage.dataset.tool = 'hand'; return; }
      if (e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); app.selection.deleteSelected(); return; }
      if (e.key === 'Escape'){ app.selection.clear(); return; }
      if (mod && k === 'a' && app.drawing.tool === 'select'){ e.preventDefault(); app.selection.set(app.objects.map(o => o.id)); return; }
      if (e.key.startsWith('Arrow') && app.selection.ids.size){
        e.preventDefault(); const s = e.shiftKey ? 10 : 1;
        app.selection.nudge(e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0);
        clearTimeout(app._nt); app._nt = setTimeout(() => app.commit(), 300); return;
      }
      const map = { v: 'select', p: 'pen', l: 'line', r: 'rect', c: 'circle', e: 'ellipse', h: 'hand' };
      if (!mod && map[k]) app.drawing.setTool(map[k]);
    });
    window.addEventListener('keyup', e => { if (e.key === ' '){ app.drawing.space = false; app.stage.dataset.tool = app.drawing.tool; } });
    NT.app = app;
  }
  init();
})();
