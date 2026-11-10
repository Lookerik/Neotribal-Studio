/* Reference image: shown behind the artwork for tracing. Not part of undo history and never exported to SVG/PNG. */
NT.reference = { valid(r){
  return r && typeof r.src === 'string' && /^data:image\//.test(r.src) && ['w', 'h', 's', 'x', 'y', 'op'].every(k => Number.isFinite(+r[k])) ? { src: r.src, w: +r.w, h: +r.h, s: Math.min(10, Math.max(0.02, +r.s)), x: +r.x, y: +r.y, op: Math.min(1, Math.max(0, +r.op)) } : null;
}, install(app){
  const $ = id => document.getElementById(id), img = $('refimg'), ctl = ['rop', 'rsc', 'rmv', 'rrm'];
  app.ref = null; app.refEdit = false;
  app.applyRef = () => {
    const r = app.ref; img.setAttribute('display', r ? 'inline' : 'none'); ctl.forEach(i => $(i).disabled = !r);
    if (r){ img.setAttribute('href', r.src); img.setAttribute('x', r.x); img.setAttribute('y', r.y); img.setAttribute('width', r.w * r.s); img.setAttribute('height', r.h * r.s); img.setAttribute('opacity', r.op);
      $('rop').value = Math.round(r.op * 100); $('ropo').textContent = Math.round(r.op * 100); $('rsc').value = Math.round(r.s * 100); $('rsco').textContent = Math.round(r.s * 100); }
    else { $('rmv').checked = false; app.refEdit = false; img.removeAttribute('href'); }
  };
  $('rfile').onchange = e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return; const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const sc = Math.min(1, 1600 / Math.max(im.width, im.height)), w = Math.round(im.width * sc), h = Math.round(im.height * sc), c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
        const d = app.canvas.doc, s = Math.min(d.w / w, d.h / h);
        app.ref = { src: c.toDataURL('image/jpeg', 0.85), w, h, s, x: (d.w - w * s) / 2, y: (d.h - h * s) / 2, op: 0.5 }; app.applyRef(); app.storage.touch();
      };
      im.onerror = () => app.setStatus('Could not read that image'); im.src = fr.result;
    };
    fr.readAsDataURL(f);
  };
  $('rop').oninput = () => { if (app.ref){ app.ref.op = +$('rop').value / 100; app.applyRef(); } };
  $('rsc').oninput = () => { const r = app.ref; if (!r) return; const cx = r.x + r.w * r.s / 2, cy = r.y + r.h * r.s / 2; r.s = +$('rsc').value / 100; r.x = cx - r.w * r.s / 2; r.y = cy - r.h * r.s / 2; app.applyRef(); };
  $('rop').onchange = $('rsc').onchange = () => app.storage.touch();
  $('rmv').onchange = () => { app.refEdit = $('rmv').checked; };
  $('rrm').onclick = () => { app.ref = null; app.applyRef(); app.storage.touch(); };
} };
