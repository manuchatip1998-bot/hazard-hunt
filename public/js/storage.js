/* Storage layer – IndexedDB for levels (images can be large), localStorage for leaderboard.
   Swap the internals of this file to move to Firestore later; the rest of the app only uses Store.* */
(function () {
  const DB_NAME = 'hazardHunt', DB_VER = 1, STORE = 'levels';
  const SEED_KEY = 'hh_seeded_v11'; // bump when sample levels change
  let dbPromise = null;
  const memory = new Map(); // fallback when IndexedDB is unavailable

  function ls(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val);
    } catch (e) { return null; }
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    const open = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    // Some browsers/modes block or stall IndexedDB – fall back to in-memory storage
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 4000));
    dbPromise = Promise.race([open, timeout]).then((db) => {
      if (!db) {
        Store.persistent = false;
        setTimeout(() => window.Fx && Fx.toast('⚠ เบราว์เซอร์นี้บันทึกด่านถาวรไม่ได้ – ใช้ Export เพื่อเก็บด่านที่สร้าง', 5000), 500);
      }
      return db;
    });
    return dbPromise;
  }

  function tx(mode, fn) {
    return openDB().then((db) => new Promise((resolve, reject) => {
      if (!db) { resolve(fn(null)); return; }
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      let result;
      const r = fn(store);
      if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
    }));
  }

  const uid = () => 'lv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  const Store = {
    uid,
    persistent: true,
    async listLevels() {
      await Store.seedIfNeeded();
      const all = await tx('readonly', (s) => s ? s.getAll() : null);
      const list = all || [...memory.values()];
      return list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (a.created || 0) - (b.created || 0));
    },
    async getLevel(id) {
      const lv = await tx('readonly', (s) => s ? s.get(id) : null);
      return lv || memory.get(id) || null;
    },
    async saveLevel(level) {
      level.updated = Date.now();
      if (!level.created) level.created = level.updated;
      memory.set(level.id, clone(level));
      await tx('readwrite', (s) => s ? s.put(level) : null);
      return level;
    },
    async deleteLevel(id) {
      memory.delete(id);
      await tx('readwrite', (s) => s ? s.delete(id) : null);
      Store.clearBoard(id);
    },
    async seedIfNeeded(force) {
      if (!force && ls(SEED_KEY)) {
        const db = await openDB();
        if (db || memory.size) return;
      }
      const samples = (window.SAMPLE_LEVELS || []).map(clone);
      for (const s of samples) {
        memory.set(s.id, s);
        await tx('readwrite', (st) => st ? st.put(s) : null);
      }
      ls(SEED_KEY, '1');
    },
    async restoreSamples() { await Store.seedIfNeeded(true); },

    /* ---- export / import ---- */
    download(filename, obj) {
      const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    exportLevels(levels, filename) {
      Store.download(filename || 'hazard-hunt-levels.json',
        { format: 'hazard-hunt', version: 1, exported: new Date().toISOString(), levels });
    },
    async importFile(file) {
      const text = await file.text();
      const data = JSON.parse(text);
      const levels = Array.isArray(data) ? data : (data.levels || (data.hazards ? [data] : []));
      if (!levels.length) throw new Error('ไม่พบข้อมูลด่านในไฟล์');
      const existing = new Set((await Store.listLevels()).map((l) => l.id));
      for (const lv of levels) {
        if (!lv.image || !Array.isArray(lv.hazards)) continue;
        if (existing.has(lv.id)) lv.id = uid();
        lv.order = 500;
        await Store.saveLevel(lv);
      }
      return levels.length;
    },

    /* ---- leaderboard ---- */
    getBoard(levelId) {
      try { return JSON.parse(ls('hh_lb_' + levelId) || '[]'); } catch (e) { return []; }
    },
    addScore(levelId, entry) {
      const b = Store.getBoard(levelId);
      entry.date = Date.now();
      b.push(entry);
      b.sort((x, y) => y.score - x.score);
      const top = b.slice(0, 20);
      ls('hh_lb_' + levelId, JSON.stringify(top));
      return top.indexOf(entry);
    },
    clearBoard(levelId) { ls('hh_lb_' + levelId, null); },

    /* ---- campaign progress (levels cleared with 3 stars), per team name ---- */
    progressKey(team) { return 'hh_prog_' + String(team || 'ผู้เล่น').trim().toLowerCase(); },
    getCleared(team) {
      try { return new Set(JSON.parse(ls(Store.progressKey(team)) || '[]')); } catch (e) { return new Set(); }
    },
    markCleared(team, levelId) {
      const s = Store.getCleared(team);
      s.add(levelId);
      ls(Store.progressKey(team), JSON.stringify([...s]));
    },
    resetProgress(team) { ls(Store.progressKey(team), null); },
    // index of the furthest playable level: level i is open when every level before it is cleared
    unlockedUpTo(levels, team) {
      const cleared = Store.getCleared(team);
      let i = 0;
      while (i < levels.length - 1 && cleared.has(levels[i].id)) i++;
      return i;
    },

    pref(key, val) {
      if (val === undefined) return ls('hh_pref_' + key);
      ls('hh_pref_' + key, String(val));
    }
  };

  window.Store = Store;
})();
