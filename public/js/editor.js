/* Level editor: upload photo, draw hazard zones, edit details, import/export */
(function () {
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const E = {
    list: $('ed-level-list'), name: $('ed-name'), time: $('ed-time'), tools: $('ed-tools'),
    wrap: $('ed-canvas-wrap'), stage: $('ed-stage'), img: $('ed-img'), svg: $('ed-svg'), empty: $('ed-empty'),
    hzList: $('ed-hz-list'), count: $('ed-count'), form: $('ed-form'), noSel: $('ed-noselect'),
    fTitle: $('f-title'), fDesc: $('f-desc'), fFix: $('f-fix'), fPoints: $('f-points'),
    upload: $('ed-upload-file'), importFile: $('ed-import-file')
  };

  let level = null;      // working copy
  let selId = null;
  let tool = 'select';
  let dirty = false;
  let NW = 1600, NH = 900;
  let drag = null;

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mark = () => { dirty = true; };

  async function refreshList() {
    const levels = await Store.listLevels();
    E.list.innerHTML = '';
    levels.forEach((lv) => {
      const li = document.createElement('li');
      li.className = level && level.id === lv.id ? 'active' : '';
      li.innerHTML = `<span>${esc(lv.name)}</span><small>${lv.hazards.length} จุด</small>`;
      li.onclick = () => select(lv.id);
      E.list.appendChild(li);
    });
    return levels;
  }

  function confirmDiscard() { return !dirty || confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการทิ้งการแก้ไขหรือไม่?'); }

  async function select(id) {
    if (level && level.id === id) return;
    if (!confirmDiscard()) return;
    const lv = await Store.getLevel(id);
    if (!lv) return;
    load(clone(lv));
  }

  function load(lv) {
    level = lv; selId = null; dirty = false;
    E.name.value = level.name || '';
    E.time.value = level.timeLimit || 90;
    if (level.image) {
      E.img.onload = () => { NW = E.img.naturalWidth || 1600; NH = E.img.naturalHeight || 900; fit(); render(); };
      E.img.src = level.image;
      E.stage.classList.add('on'); E.empty.style.display = 'none';
    } else {
      E.stage.classList.remove('on'); E.empty.style.display = '';
      E.empty.textContent = 'กด “🖼 เปลี่ยนรูป” เพื่ออัปโหลดรูปพื้นที่ทำงานของด่านนี้';
    }
    render(); refreshList();
  }

  function fit() { if (level && level.image) Game.fitStage(E.stage, E.wrap, E.img, 16); }

  /* ---------- rendering ---------- */
  function render() {
    const svg = E.svg;
    svg.setAttribute('viewBox', `0 0 ${NW} ${NH}`);
    svg.className.baseVal = 'ed-svg tool-' + tool;
    svg.innerHTML = '';
    if (!level) return;
    const fs = Math.round(NW / 32);
    level.hazards.forEach((hz, i) => {
      const t = hz.type === 'UA' ? 'ua' : 'uc';
      let el;
      if (hz.shape === 'circle') {
        el = document.createElementNS(NS, 'circle');
        el.setAttribute('cx', hz.x * NW); el.setAttribute('cy', hz.y * NH); el.setAttribute('r', hz.r * NW);
      } else {
        el = document.createElementNS(NS, 'rect');
        el.setAttribute('x', hz.x * NW); el.setAttribute('y', hz.y * NH);
        el.setAttribute('width', hz.w * NW); el.setAttribute('height', hz.h * NH);
      }
      el.setAttribute('class', `z ${t}${hz.id === selId ? ' sel' : ''}`);
      el.dataset.id = hz.id;
      svg.appendChild(el);
      const g = Game.zoneGeom(hz, NW / NH);
      const lbl = document.createElementNS(NS, 'text');
      lbl.setAttribute('x', g.cx * NW); lbl.setAttribute('y', g.cy * NH + fs / 3);
      lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('font-size', fs);
      lbl.setAttribute('class', 'lbl'); lbl.textContent = i + 1;
      svg.appendChild(lbl);
      if (hz.id === selId) {
        const h = document.createElementNS(NS, 'rect');
        const hs = NW / 70;
        const hx = hz.shape === 'circle' ? (hz.x + hz.r) * NW : (hz.x + hz.w) * NW;
        const hy = hz.shape === 'circle' ? hz.y * NH : (hz.y + hz.h) * NH;
        h.setAttribute('x', hx - hs / 2); h.setAttribute('y', hy - hs / 2);
        h.setAttribute('width', hs); h.setAttribute('height', hs);
        h.setAttribute('class', 'handle'); h.dataset.handle = hz.id;
        svg.appendChild(h);
      }
    });
    renderHzList(); renderForm();
  }

  function renderHzList() {
    E.hzList.innerHTML = '';
    E.count.textContent = level ? `(${level.hazards.length})` : '';
    if (!level) return;
    level.hazards.forEach((hz, i) => {
      const li = document.createElement('li');
      li.className = hz.id === selId ? 'active' : '';
      li.innerHTML = `<b>${i + 1}.</b> <i class="tag ${hz.type === 'UA' ? 'ua' : 'uc'}">${hz.type}</i> <span>${esc(hz.title || '(ยังไม่ตั้งชื่อ)')}</span>`;
      li.onclick = () => { selId = hz.id; render(); };
      E.hzList.appendChild(li);
    });
  }

  function current() { return level && level.hazards.find((h) => h.id === selId); }

  function renderForm() {
    const hz = current();
    E.form.style.display = hz ? '' : 'none';
    E.noSel.style.display = hz ? 'none' : '';
    if (!hz) return;
    if (document.activeElement !== E.fTitle) E.fTitle.value = hz.title || '';
    if (document.activeElement !== E.fDesc) E.fDesc.value = hz.desc || '';
    if (document.activeElement !== E.fFix) E.fFix.value = hz.fix || '';
    if (document.activeElement !== E.fPoints) E.fPoints.value = hz.points || 100;
    E.form.querySelectorAll('input[name=f-type]').forEach((r) => { r.checked = r.value === hz.type; });
  }

  /* ---------- form binding ---------- */
  const bind = (el, key, num) => el.addEventListener('input', () => {
    const hz = current(); if (!hz) return;
    hz[key] = num ? Math.max(0, Number(el.value) || 0) : el.value;
    mark(); renderHzList();
  });
  bind(E.fTitle, 'title'); bind(E.fDesc, 'desc'); bind(E.fFix, 'fix'); bind(E.fPoints, 'points', true);
  E.form.querySelectorAll('input[name=f-type]').forEach((r) => r.addEventListener('change', () => {
    const hz = current(); if (!hz) return; hz.type = r.value; mark(); render();
  }));
  $('f-delete').onclick = () => deleteSelected();
  E.name.addEventListener('input', () => { if (level) { level.name = E.name.value; mark(); } });
  E.time.addEventListener('input', () => { if (level) { level.timeLimit = Math.max(15, Number(E.time.value) || 90); mark(); } });

  function deleteSelected() {
    if (!level || !selId) return;
    level.hazards = level.hazards.filter((h) => h.id !== selId);
    selId = null; mark(); render();
  }

  /* ---------- tools ---------- */
  E.tools.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]'); if (!b) return;
    tool = b.dataset.tool;
    E.tools.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === b));
    render();
  });

  function svgPoint(e) {
    const r = E.svg.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  }

  E.svg.addEventListener('pointerdown', (e) => {
    if (!level || !level.image) return;
    const p = svgPoint(e);
    E.svg.setPointerCapture(e.pointerId);
    if (tool === 'circle' || tool === 'rect') {
      const hz = { id: 'hz' + Date.now().toString(36), shape: tool, type: 'UC', title: '', desc: '', fix: '', points: 100 };
      if (tool === 'circle') Object.assign(hz, { x: p.x, y: p.y, r: 0 });
      else Object.assign(hz, { x: p.x, y: p.y, w: 0, h: 0 });
      level.hazards.push(hz); selId = hz.id;
      drag = { mode: 'create', hz, start: p };
      render(); return;
    }
    const hId = e.target.dataset && e.target.dataset.handle;
    const zId = e.target.dataset && e.target.dataset.id;
    if (hId) { selId = hId; drag = { mode: 'resize', hz: current() }; return; }
    if (zId) {
      selId = zId; const hz = current();
      drag = { mode: 'move', hz, dx: p.x - hz.x, dy: p.y - hz.y };
      render(); return;
    }
    selId = null; render();
  });

  E.svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = svgPoint(e), hz = drag.hz, ar = NW / NH;
    if (drag.mode === 'create') {
      if (hz.shape === 'circle') hz.r = Math.hypot(p.x - drag.start.x, (p.y - drag.start.y) / ar);
      else {
        hz.x = Math.min(p.x, drag.start.x); hz.y = Math.min(p.y, drag.start.y);
        hz.w = Math.abs(p.x - drag.start.x); hz.h = Math.abs(p.y - drag.start.y);
      }
    } else if (drag.mode === 'move') {
      hz.x = p.x - drag.dx; hz.y = p.y - drag.dy;
    } else if (drag.mode === 'resize') {
      if (hz.shape === 'circle') hz.r = Math.max(0.008, Math.hypot(p.x - hz.x, (p.y - hz.y) / ar));
      else { hz.w = Math.max(0.01, p.x - hz.x); hz.h = Math.max(0.01, p.y - hz.y); }
    }
    mark(); render();
  });

  const endDrag = () => {
    if (!drag) return;
    const hz = drag.hz;
    if (drag.mode === 'create') {
      const tiny = hz.shape === 'circle' ? hz.r < 0.008 : (hz.w < 0.01 || hz.h < 0.01);
      if (tiny) {
        // a click without drag → default-sized zone
        if (hz.shape === 'circle') hz.r = 0.04; else { hz.x -= 0.04; hz.y -= 0.05; hz.w = 0.08; hz.h = 0.1; }
      }
      setTimeout(() => E.fTitle.focus(), 50);
    }
    drag = null; mark(); render();
  };
  E.svg.addEventListener('pointerup', endDrag);
  E.svg.addEventListener('pointercancel', endDrag);

  document.addEventListener('keydown', (e) => {
    if (!$('scr-editor').classList.contains('active')) return;
    const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) { e.preventDefault(); deleteSelected(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  });

  /* ---------- image upload ---------- */
  function resizeImage(file, max = 1920) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('อ่านไฟล์รูปไม่ได้')); };
      im.src = url;
    });
  }

  $('ed-upload').onclick = () => { if (!level) return Fx.toast('สร้างหรือเลือกด่านก่อน'); E.upload.click(); };
  E.upload.onchange = async () => {
    const f = E.upload.files[0]; E.upload.value = '';
    if (!f) return;
    try {
      level.image = await resizeImage(f);
      if (level.hazards.length && !confirm('เปลี่ยนรูปแล้ว ต้องการเก็บจุดอันตรายเดิมไว้หรือไม่? (กด Cancel เพื่อลบจุดเดิมทั้งหมด)')) level.hazards = [];
      mark();
      const keep = level; dirty = true;
      E.img.onload = () => { NW = E.img.naturalWidth; NH = E.img.naturalHeight; fit(); render(); };
      E.img.src = keep.image;
      E.stage.classList.add('on'); E.empty.style.display = 'none';
      Fx.toast('อัปโหลดรูปแล้ว – เลือกเครื่องมือวงกลม/สี่เหลี่ยมแล้วลากบนภาพ');
    } catch (err) { Fx.toast(err.message); }
  };

  /* ---------- level actions ---------- */
  async function save() {
    if (!level) return false;
    if (!level.image) { Fx.toast('ต้องอัปโหลดรูปก่อนบันทึก'); return false; }
    level.name = (E.name.value || 'ด่านไม่มีชื่อ').trim();
    level.timeLimit = Math.max(15, Number(E.time.value) || 90);
    const untitled = level.hazards.filter((h) => !h.title).length;
    await Store.saveLevel(clone(level));
    dirty = false;
    Fx.toast(untitled ? `บันทึกแล้ว (มี ${untitled} จุดที่ยังไม่ตั้งชื่อ)` : 'บันทึกแล้ว ✔');
    refreshList();
    return true;
  }
  $('ed-save').onclick = save;

  $('ed-new').onclick = () => {
    if (!confirmDiscard()) return;
    load({ id: Store.uid(), name: 'ด่านใหม่', timeLimit: 90, image: null, hazards: [], order: 100 });
    dirty = true;
    E.name.focus(); E.name.select();
    setTimeout(() => E.upload.click(), 100);
  };

  $('ed-delete-level').onclick = async () => {
    if (!level) return;
    if (!confirm(`ลบด่าน “${level.name}” ถาวร?`)) return;
    await Store.deleteLevel(level.id);
    level = null; selId = null; dirty = false;
    E.stage.classList.remove('on'); E.empty.style.display = ''; E.name.value = '';
    render(); refreshList();
  };

  $('ed-export').onclick = () => {
    if (!level || !level.image) return Fx.toast('ยังไม่มีด่านให้ export');
    Store.exportLevels([clone(level)], (level.name || 'level').replace(/[\\/:*?"<>|]/g, '_') + '.json');
  };
  $('ed-export-all').onclick = async () => Store.exportLevels(await Store.listLevels());
  $('ed-import').onclick = () => E.importFile.click();
  E.importFile.onchange = async () => {
    const f = E.importFile.files[0]; E.importFile.value = '';
    if (!f) return;
    try { const n = await Store.importFile(f); Fx.toast(`นำเข้า ${n} ด่านแล้ว`); refreshList(); }
    catch (err) { Fx.toast('นำเข้าไม่สำเร็จ: ' + err.message); }
  };
  $('ed-restore').onclick = async () => {
    if (!confirm('คืนค่าด่านตัวอย่าง (โรงงาน / คลังสินค้า) ให้เป็นค่าเริ่มต้น?')) return;
    await Store.restoreSamples(); Fx.toast('คืนค่าด่านตัวอย่างแล้ว'); refreshList();
    if (level && level.sample) { dirty = false; const id = level.id; level = null; select(id); }
  };
  $('ed-test').onclick = async () => {
    if (!level) return;
    if (!level.hazards.length) return Fx.toast('ยังไม่มีจุดอันตราย');
    if (!(await save())) return;
    window.App && App.play(clone(level), { fromEditor: true });
  };

  window.addEventListener('resize', () => { if ($('scr-editor').classList.contains('active')) fit(); });

  window.Editor = {
    async open() {
      const levels = await refreshList();
      if (!level && levels.length) await select(levels[0].id);
      else fit();
    }
  };
})();
