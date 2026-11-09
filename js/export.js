/* Import/export: JSON (editable project), SVG (clean vector), PNG (rasterised from the SVG). */
NT.io = {
  TYPES: ['path', 'line', 'rect', 'ellipse'],
  closeDlg(dlg){ if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); },
  blank(){ return { objects: [], doc: { w: 1200, h: 800, bg: '#ffffff', sym: 'off', ax: 600, ay: 400 }, seq: 0, layers: [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }], active: 'L1' }; },
  /* Validate and complete a project from disk. Throws on files that are not projects. */
  normalize(d){
    if (!d || typeof d !== 'object' || !Array.isArray(d.objects) || !d.doc || typeof d.doc !== 'object') throw new Error('this is not a Neotribal Studio project');
    const num = (v, lo, hi, dflt) => Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : dflt, b = NT.io.blank();
    const layers = (Array.isArray(d.layers) ? d.layers : []).filter(l => l && typeof l.id === 'string').map(l => ({ id: l.id, name: String(l.name || 'Layer'), visible: l.visible !== false, locked: !!l.locked }));
    if (!layers.length) layers.push(b.layers[0]);
    const doc = { ...b.doc, ...d.doc }; doc.w = num(doc.w, 100, 8000, 1200); doc.h = num(doc.h, 100, 8000, 800);
    doc.ax = num(doc.ax, -1e5, 1e5, doc.w / 2); doc.ay = num(doc.ay, -1e5, 1e5, doc.h / 2); if (!['off', 'v', 'h', 'vh'].includes(doc.sym)) doc.sym = 'off'; doc.bg = String(doc.bg || '#ffffff');
    const seen = new Set(), objects = d.objects.filter(o => o && NT.io.TYPES.includes(o.type) && typeof o.id === 'string' && !seen.has(o.id) && seen.add(o.id) && (o.type !== 'path' || Array.isArray(o.pts)));
    objects.forEach(o => { if (!layers.some(l => l.id === o.layer)) o.layer = layers[0].id; o.sw = num(o.sw, 0.1, 500, 4); o.stroke = String(o.stroke || '#000'); o.fill = String(o.fill || 'none'); });
    return { objects, doc, seq: Math.max(num(d.seq, 0, 1e9, 0), objects.length), layers, active: layers.some(l => l.id === d.active) ? d.active : layers[0].id };
  },
  toJSON(app){ return JSON.stringify({ app: 'neotribal-studio', version: 1, name: app.projectName, exported: new Date().toISOString(), ...app.snapshot() }, null, 1); },
  /* bg: 'transparent' | 'canvas' | any CSS colour. Dimensions default to the document size. */
  toSVG(app, { bg = 'canvas', width, height } = {}){
    const ns = 'http://www.w3.org/2000/svg', d = app.canvas.doc, svg = document.createElementNS(ns, 'svg');
    const set = (el, at) => { for (const k in at) el.setAttribute(k, at[k]); return el; };
    set(svg, { width: width || d.w, height: height || d.h, viewBox: `0 0 ${d.w} ${d.h}` });
    const fill = bg === 'canvas' ? (d.bg === 'transparent' ? null : d.bg) : bg === 'transparent' ? null : bg;
    if (fill) svg.appendChild(set(document.createElementNS(ns, 'rect'), { width: d.w, height: d.h, fill }));
    app.layers.forEach((l, i) => {
      if (!l.visible) return;
      const g = set(document.createElementNS(ns, 'g'), { id: (l.name.replace(/[^\w-]/g, '_') || 'layer') + '_' + (i + 1) });
      for (const o of app.objects) if ((app.layers.some(x => x.id === o.layer) ? o.layer : app.layers[0].id) === l.id)
        for (const t of [null, ...app.canvas.mats(o.m)]){ const el = NT.Canvas.build(o); if (t){ const w = set(document.createElementNS(ns, 'g'), { transform: t }); w.appendChild(el); g.appendChild(w); } else g.appendChild(el); }
      if (g.childNodes.length) svg.appendChild(g);
    });
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg);
  },
  pngSize(app, width){ const d = app.canvas.doc, w = Math.round(Math.min(8000, Math.max(16, +width || d.w))); return { w, h: Math.round(w * d.h / d.w) }; },
  toPNG(app, { bg = 'transparent', width } = {}){
    const { w, h } = NT.io.pngSize(app, width);
    if (w * h > 16e6 || h > 8000) return Promise.reject(new Error('that size is too large for most browsers; try a smaller width'));
    const url = URL.createObjectURL(new Blob([NT.io.toSVG(app, { bg, width: w, height: h })], { type: 'image/svg+xml' }));
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url); c.toBlob(b => b ? res(b) : rej(new Error('the browser could not create the PNG')), 'image/png'); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('the drawing could not be rendered')); };
      img.src = url;
    });
  },
  download(blob, name){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); },
  openDialog(app){
    const dlg = document.getElementById('dlg'), $ = id => dlg.querySelector(id), d = app.canvas.doc;
    dlg.innerHTML = `<h2>Export</h2>
      <label class="dlgrow">Format <select id="xf"><option value="svg">SVG (vector)</option><option value="png">PNG (image)</option><option value="json">JSON (editable project)</option></select></label>
      <label class="dlgrow" id="xbgr">Background <select id="xbg"><option value="canvas">Canvas colour</option><option value="transparent">Transparent</option><option value="#ffffff">White</option><option value="#000000">Black</option></select></label>
      <label class="dlgrow" id="xwr">Width (px) <input type="number" id="xw" min="16" max="8000" value="${d.w}"></label>
      <p class="note" id="xnote"></p><div class="dlgbtns"><button id="xcancel">Cancel</button><button id="xgo" class="primary">Download</button></div>`;
    const upd = () => { const f = $('#xf').value; $('#xbgr').style.display = f === 'json' ? 'none' : ''; $('#xwr').style.display = f === 'png' ? '' : 'none';
      const s = NT.io.pngSize(app, $('#xw').value); $('#xnote').textContent = f === 'png' ? `Output: ${s.w} × ${s.h} px` : f === 'svg' ? `Output: ${d.w} × ${d.h}, vector paths preserved` : 'Contains strokes, generator settings, layers, symmetry and canvas.'; };
    $('#xf').onchange = $('#xw').oninput = upd; upd();
    $('#xcancel').onclick = () => NT.io.closeDlg(dlg);
    $('#xgo').onclick = async () => {
      const f = $('#xf').value, bg = $('#xbg').value, base = (app.projectName || 'neotribal').replace(/[^\w-]+/g, '_');
      try {
        if (f === 'json') NT.io.download(new Blob([NT.io.toJSON(app)], { type: 'application/json' }), base + '.json');
        else if (f === 'svg') NT.io.download(new Blob([NT.io.toSVG(app, { bg })], { type: 'image/svg+xml' }), base + '.svg');
        else NT.io.download(await NT.io.toPNG(app, { bg, width: $('#xw').value }), base + '.png');
        NT.io.closeDlg(dlg);
      } catch (e){ $('#xnote').textContent = 'Export failed: ' + e.message; }
    };
    dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
  }
};
