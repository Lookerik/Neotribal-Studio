/* Snapshot history. Objects are small JSON records, so snapshots stay cheap; identical states are skipped. */
NT.History = class {
  constructor(limit = 200){ this.limit = limit; this.past = []; this.future = []; this.cur = null; }
  reset(state){ this.past = []; this.future = []; this.cur = JSON.stringify(state); }
  push(state){
    const s = JSON.stringify(state);
    if (s === this.cur) return false;
    this.past.push(this.cur); if (this.past.length > this.limit) this.past.shift();
    this.cur = s; this.future = []; return true;
  }
  undo(){ if (!this.past.length) return null; this.future.push(this.cur); this.cur = this.past.pop(); return JSON.parse(this.cur); }
  redo(){ if (!this.future.length) return null; this.past.push(this.cur); this.cur = this.future.pop(); return JSON.parse(this.cur); }
  get canUndo(){ return this.past.length > 0; }
  get canRedo(){ return this.future.length > 0; }
};
