/* Layers panel + grouping + duplication. Hierarchy: layer -> (optional group gid) -> object. */
NT.layers = { install(app){
  const $ = id => document.getElementById(id), box = $('layers'), rid = p => p + Math.random().toString(36).slice(2, 7);
  app.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; app.activeLayer = 'L1';
  app.pruneSel = () => { app.selection.ids = new Set([...app.selection.ids].filter(id => app.objects.some(o => o.id === id && (app.layers.find(l => l.id === o.layer) || {}).visible !== false))); };
  app.renderLayers = () => {
    box.replaceChildren();
    [...app.layers].reverse().forEach(l => {
      const r = document.createElement('div'); r.className = 'lrow' + (l.id === app.activeLayer ? ' on' : '');
      r.innerHTML = `<button data-a="v" title="Show / hide">${l.visible ? '◉' : '○'}</button><button data-a="l" title="Lock / unlock">${l.locked ? '🔒' : '🔓'}</button><span class="lname"></span>`;
      const nm = r.querySelector('.lname'); nm.textContent = l.name; nm.title = 'Double-click to rename';
      r.onclick = e => {
        const a = e.target.dataset && e.target.dataset.a;
        if (a === 'v' || a === 'l'){ if (a === 'v') l.visible = !l.visible; else l.locked = !l.locked; app.layers.forEach(x => x); app.pruneLocked(); app.commit(); }
        else { app.activeLayer = l.id; app.renderLayers(); }
      };
      nm.ondblclick = () => { const n = prompt('Layer name', l.name); if (n && n.trim()){ l.name = n.trim(); app.commit(); } };
      box.appendChild(r);
    });
  };
  app.pruneLocked = () => { app.selection.ids = new Set([...app.selection.ids].filter(id => { const o = app.objects.find(x => x.id === id), l = o && app.layers.find(x => x.id === o.layer); return l && l.visible && !l.locked; })); };
  const idx = () => app.layers.findIndex(l => l.id === app.activeLayer);
  $('ladd').onclick = () => { const l = { id: rid('L'), name: 'Layer ' + (app.layers.length + 1), visible: true, locked: false }; app.layers.splice(idx() + 1, 0, l); app.activeLayer = l.id; app.commit(); };
  $('ldel').onclick = () => {
    if (app.layers.length < 2){ app.setStatus('Keep at least one layer'); return; }
    const i = idx(), id = app.activeLayer; app.objects = app.objects.filter(o => o.layer !== id); app.layers.splice(i, 1);
    app.activeLayer = app.layers[Math.max(0, i - 1)].id; app.pruneSel(); app.commit();
  };
  $('ldup').onclick = () => {
    const src = app.layers[idx()], l = { ...src, id: rid('L'), name: src.name + ' copy' }, gmap = {};
    const copies = app.objects.filter(o => o.layer === src.id).map(o => { const c = JSON.parse(JSON.stringify(o)); c.id = app.newId(); c.layer = l.id; if (c.gid) c.gid = gmap[c.gid] = gmap[c.gid] || rid('g'); return c; });
    app.layers.splice(idx() + 1, 0, l); app.objects.push(...copies); app.activeLayer = l.id; app.commit();
  };
  const move = d => { const i = idx(), j = i + d; if (j < 0 || j >= app.layers.length) return; [app.layers[i], app.layers[j]] = [app.layers[j], app.layers[i]]; app.commit(); };
  $('lup').onclick = () => move(1); $('ldn').onclick = () => move(-1);

  app.group = () => { const s = app.selection.objects(); if (s.length < 2){ app.setStatus('Select two or more objects to group'); return; } const g = rid('g'); s.forEach(o => o.gid = g); app.commit(); };
  app.ungroup = () => { const s = app.selection.objects().filter(o => o.gid); if (!s.length) return; s.forEach(o => delete o.gid); app.commit(); };
  app.duplicateSel = () => {
    const s = app.selection.objects(); if (!s.length) return; const gmap = {};
    const copies = s.map(o => { const c = JSON.parse(JSON.stringify(o)); c.id = app.newId(); c.tx = (c.tx || 0) + 20; c.ty = (c.ty || 0) + 20; if (c.gid) c.gid = gmap[c.gid] = gmap[c.gid] || rid('g'); return c; });
    app.objects.push(...copies); app.commit(); app.selection.set(copies.map(c => c.id));
  };
} };
