/* Boolean operations (union / subtract / intersect) on filled shapes, using the bundled polygon-clipping library.
   Shapes are flattened to polygons in world space; generated outlines are split into body+thorns (positive winding)
   and cuts (negative winding) so the negative-space holes survive. The result is one plain filled path. */
NT.bool = (() => {
  const pc = () => window.polygonClipping, f = n => Math.round(n * 100) / 100;
  const area = r => { let s = 0; for (let i = 0; i < r.length; i++){ const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  /* Flatten an absolute M/L/C/Z path into rings of [x,y]. */
  function flatten(d, n = 8){
    const rings = []; let cur = null, p = null;
    for (const t of d.match(/[MLCZ][^MLCZ]*/g) || []){
      const v = (t.slice(1).match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number);
      if (t[0] === 'M'){ if (cur && cur.length > 2) rings.push(cur); cur = [[v[0], v[1]]]; p = [v[0], v[1]]; }
      else if (t[0] === 'L'){ for (let i = 0; i + 1 < v.length; i += 2) cur.push([v[i], v[i + 1]]); p = [v[v.length - 2], v[v.length - 1]]; }
      else if (t[0] === 'C') for (let i = 0; i + 5 < v.length; i += 6){
        for (let k = 1; k <= n; k++){ const s = k / n, u = 1 - s;
          cur.push([u * u * u * p[0] + 3 * u * u * s * v[i] + 3 * u * s * s * v[i + 2] + s * s * s * v[i + 4], u * u * u * p[1] + 3 * u * u * s * v[i + 1] + 3 * u * s * s * v[i + 3] + s * s * s * v[i + 5]]); }
        p = [v[i + 4], v[i + 5]];
      } else { if (cur && cur.length > 2) rings.push(cur); cur = null; }
    }
    if (cur && cur.length > 2) rings.push(cur); return rings;
  }
  const filled = o => o.fill && o.fill !== 'none';
  function rings(o){
    let R, gen = false;
    if (o.type === 'rect' && filled(o)) R = [[[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]]];
    else if (o.type === 'ellipse' && filled(o)) R = [Array.from({ length: 72 }, (_, i) => { const a = i / 72 * 2 * Math.PI; return [o.cx + o.rx * Math.cos(a), o.cy + o.ry * Math.sin(a)]; })];
    else if (o.type === 'path' && o.gen && o.gd && !o.gd.includes('a')){ R = flatten(o.gd); gen = true; }
    else if (o.type === 'path' && o.nodes && o.closed && filled(o)) R = flatten(o.d);
    else if (o.type === 'path' && o.bool){ R = flatten(o.d, 1); gen = true; }   /* holes have opposite winding: keep them as holes */
    if (!R || !R.length) return null;
    return { R: R.map(r => r.map(([x, y]) => { const q = NT.geo.apply(o, x, y); return [q.x, q.y]; })), gen };
  }
  function multi(o){
    const s = rings(o); if (!s) return null;
    if (!s.gen) return pc().union(...s.R.map(r => [[r]]));
    const sg = Math.sign(area(s.R[0])), pos = [], neg = [];
    s.R.forEach(r => (Math.sign(area(r)) === sg ? pos : neg).push([[r]]));
    const U = pc().union(...pos); return neg.length ? pc().difference(U, ...neg) : U;
  }
  const polyArea = m => m.reduce((t, poly) => t + poly.reduce((s, r, i) => s + (i ? -1 : 1) * Math.abs(area(r)), 0), 0);
  function install(app){
    app.boolean = op => {
      const sel = app.selection.objects(), z = o => app.layers.findIndex(l => l.id === o.layer) * 1e6 + app.objects.indexOf(o);
      if (sel.length < 2) return app.setStatus('Select two or more shapes first');
      if (sel.some(o => o.m)) return app.setStatus('Release mirrors first (Symmetry → Release mirrors)');
      const ops = [...sel].sort((a, b) => z(a) - z(b)); let ms, r;
      try { ms = ops.map(multi); } catch (e){ return app.setStatus('Boolean failed: ' + e.message); }
      if (ms.some(m => !m)) return app.setStatus('Boolean operations need filled shapes: generate strokes first, or give rectangles and ellipses a fill');
      try { r = op === 'union' ? pc().union(...ms) : op === 'subtract' ? pc().difference(ms[0], ...ms.slice(1)) : pc().intersection(...ms); } catch (e){ return app.setStatus('Boolean failed: ' + e.message); }
      if (!r.length) return app.setStatus('The result is empty');
      const b = ops[0], col = b.gen || b.bool ? b.stroke : (filled(b) ? b.fill : b.stroke), pts = [];
      const d = r.map(poly => poly.map(ring => { ring.forEach(q => pts.push({ x: q[0], y: q[1] })); return 'M' + ring.map(q => f(q[0]) + ' ' + f(q[1])).join('L') + 'Z'; }).join('')).join('');
      const res = { id: app.newId(), type: 'path', bool: true, pts, d, stroke: col, fill: col, sw: 0, tx: 0, ty: 0, layer: b.layer };
      const at = app.objects.slice(0, app.objects.indexOf(b)).filter(o => !ops.includes(o)).length;
      app.objects = app.objects.filter(o => !ops.includes(o)); app.objects.splice(at, 0, res);
      app.selection.ids = new Set([res.id]); app.commit(); app.syncPanel();
    };
  }
  return { install, flatten, multi, polyArea };
})();
