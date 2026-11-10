/* Local persistence. Projects live in IndexedDB (falls back to localStorage if IndexedDB is unavailable);
   the id of the open project lives in localStorage so the last session is restored on load. */
NT.Storage = class {
  constructor(app){ this.app = app; this.db = null; this.ls = false; this.timer = 0; }
  uid(){ return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  open(){
    return new Promise(res => {
      try {
        const rq = indexedDB.open('neotribal-studio', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('projects', { keyPath: 'id' });
        rq.onsuccess = () => { this.db = rq.result; res(); };
        rq.onerror = rq.onblocked = () => { this.ls = true; res(); };
      } catch (e){ this.ls = true; res(); }
    });
  }
  tx(mode, fn){ return new Promise((res, rej) => { const t = this.db.transaction('projects', mode), r = fn(t.objectStore('projects')); t.oncomplete = () => res(r && r.result); t.onerror = t.onabort = () => rej(t.error); }); }
  lsRead(){ try { return JSON.parse(localStorage.getItem('nt.projects') || '[]'); } catch (e){ return []; } }
  lsWrite(a){ try { localStorage.setItem('nt.projects', JSON.stringify(a)); return Promise.resolve(); } catch (e){ return Promise.reject(e); } }
  all(){ return this.ls ? Promise.resolve(this.lsRead()) : this.tx('readonly', s => s.getAll()); }
  get(id){ return this.ls ? Promise.resolve(this.lsRead().find(p => p.id === id)) : this.tx('readonly', s => s.get(id)); }
  put(rec){ return this.ls ? this.lsWrite(this.lsRead().filter(p => p.id !== rec.id).concat([rec])) : this.tx('readwrite', s => s.put(rec)); }
  del(id){ return this.ls ? this.lsWrite(this.lsRead().filter(p => p.id !== id)) : this.tx('readwrite', s => s.delete(id)); }

  /* Debounced autosave, called after every history change. */
  touch(){ clearTimeout(this.timer); this.app.setSaved('Saving…'); this.timer = setTimeout(() => this.save(), 700); }
  async flush(){ if (this.timer){ clearTimeout(this.timer); this.timer = 0; await this.save(); } }
  async save(force){
    const a = this.app; this.timer = 0;
    if (!force && !a.objects.length && !a.projectId){ a.setSaved(''); return; }
    try {
      if (!a.projectId) a.projectId = this.uid();
      await this.put({ id: a.projectId, name: a.projectName, updated: Date.now(), data: a.snapshot(), ref: a.ref || null });
      try { localStorage.setItem('nt.current', a.projectId); } catch (e) {}
      a.setSaved('Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e){ a.setSaved('Autosave failed'); a.setStatus('Could not save locally — export a JSON backup'); }
  }
  async init(){
    await this.open();
    let id = null; try { id = localStorage.getItem('nt.current'); } catch (e) {}
    if (!id) return;
    try { const p = await this.get(id); if (p) this.app.loadProject(p.data, p.name, p.id, p.ref); } catch (e) { this.app.setStatus('Could not restore the last session'); }
  }
  async openDialog(){
    const dlg = document.getElementById('dlg'), a = this.app; await this.flush();
    const render = async () => {
      const list = (await this.all()).sort((x, y) => y.updated - x.updated);
      dlg.innerHTML = '<h2>Projects</h2><div class="plist"></div><div class="dlgbtns"><label class="filebtn">Import JSON…<input type="file" id="pimp" accept=".json,application/json" hidden></label><button id="pclose">Close</button></div>';
      const box = dlg.querySelector('.plist'); if (!list.length) box.textContent = 'No saved projects yet.';
      for (const p of list){
        const r = document.createElement('div'); r.className = 'prow' + (p.id === a.projectId ? ' cur' : '');
        r.innerHTML = '<span class="pn"></span><small></small><button data-a="open">Open</button><button data-a="ren">Rename</button><button data-a="dup">Copy</button><button data-a="del">Delete</button>';
        r.querySelector('.pn').textContent = p.name; r.querySelector('small').textContent = new Date(p.updated).toLocaleDateString();
        r.onclick = async e => {
          const act = e.target.dataset && e.target.dataset.a; if (!act) return;
          if (act === 'open'){ a.loadProject(p.data, p.name, p.id, p.ref); try { localStorage.setItem('nt.current', p.id); } catch (er) {} NT.io.closeDlg(dlg); }
          else if (act === 'ren'){ const n = prompt('Project name', p.name); if (n && n.trim()){ p.name = n.trim(); await this.put(p); if (p.id === a.projectId){ a.projectName = p.name; a.syncName(); } render(); } }
          else if (act === 'dup'){ await this.put({ ...p, id: this.uid(), name: p.name + ' copy', updated: Date.now() }); render(); }
          else if (act === 'del' && confirm(`Delete "${p.name}"? This cannot be undone.`)){ await this.del(p.id); if (p.id === a.projectId){ try { localStorage.removeItem('nt.current'); } catch (er) {} a.loadProject(null, 'Untitled', null); } render(); }
        };
        box.appendChild(r);
      }
      dlg.querySelector('#pclose').onclick = () => NT.io.closeDlg(dlg);
      dlg.querySelector('#pimp').onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        try { const data = JSON.parse(await f.text()); a.loadProject(data, data.name || f.name.replace(/\.json$/i, ''), null); await this.save(true); NT.io.closeDlg(dlg); }
        catch (err){ alert('Could not open that file: ' + err.message); }
      };
    };
    await render(); dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
  }
};
