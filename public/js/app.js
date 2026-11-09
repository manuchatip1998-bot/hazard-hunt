/* App shell: screens, setup, debrief, leaderboard, keyboard shortcuts */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let screen = 'menu';
  let current = null;           // { level, opts }
  let selectedLevel = Store.pref('level') || null;
  let timeChoice = Store.pref('time') || 'level';
  let boardLevel = null;

  /* ---------- navigation ---------- */
  function show(name) {
    if (screen === 'game' && name !== 'game') { Game.stop(); if (autoTimer) cancelAutoNext(); }
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'scr-' + name));
    screen = name;
    if (name === 'setup') renderSetup();
    if (name === 'editor') Editor.open();
    if (name === 'board') renderBoard();
    if (name === 'debrief') renderDebrief();
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) { Sfx.unlock(); Sfx.click(); show(b.dataset.go); }
  });

  /* ---------- menu decoration ---------- */
  (function floaties() {
    const bg = document.querySelector('.menu-bg');
    const icons = ['⚠️', '⛑️', '🔥', '⚡', '🧯', '🦺', '☢️', '🚧', '💣'];
    for (let i = 0; i < 16; i++) {
      const s = document.createElement('span');
      s.className = 'floaty';
      s.textContent = icons[i % icons.length];
      s.style.left = (Math.random() * 100) + '%';
      s.style.fontSize = (1.6 + Math.random() * 2.4) + 'rem';
      s.style.animationDuration = (14 + Math.random() * 16) + 's';
      s.style.animationDelay = (-Math.random() * 30) + 's';
      bg.appendChild(s);
    }
  })();

  /* ---------- setup ---------- */
  // campaign: levels are played in order; a level opens once the previous one is cleared with 3 stars
  const playableLevels = async () => (await Store.listLevels()).filter((l) => l.hazards.length);
  const teamName = () => $('inp-team').value.trim() || 'ผู้เล่น';

  async function renderSetup() {
    $('inp-team').value = $('inp-team').value || Store.pref('team') || '';
    const levels = await playableLevels();
    const team = teamName();
    const cleared = Store.getCleared(team);
    const openTo = Store.unlockedUpTo(levels, team);
    const grid = $('level-grid');
    grid.innerHTML = '';
    if (!levels.length) grid.innerHTML = '<p>ยังไม่มีด่าน – ไปที่ “สร้าง / แก้ไขด่าน” เพื่อเพิ่ม</p>';
    const selIdx = levels.findIndex((l) => l.id === selectedLevel);
    if (selIdx === -1 || selIdx > openTo) selectedLevel = levels[openTo] && levels[openTo].id;
    const doneCount = levels.filter((l) => cleared.has(l.id)).length;
    $('progress-info').innerHTML = levels.length
      ? `<b>${esc(team)}</b> ผ่านแล้ว <b>${doneCount}/${levels.length}</b> ด่าน · ต้องได้ ⭐⭐⭐ เพื่อปลดล็อกด่านถัดไป`
      : '';
    $('btn-reset-progress').hidden = !doneCount;
    levels.forEach((lv, i) => {
      const ua = lv.hazards.filter((h) => h.type === 'UA').length;
      const locked = i > openTo, done = cleared.has(lv.id);
      const c = document.createElement('div');
      c.className = 'level-card' + (lv.id === selectedLevel ? ' active' : '') + (locked ? ' locked' : '') + (done ? ' done' : '');
      c.style.animation = `listIn .4s ${i * 0.06}s both`;
      c.innerHTML = `<div class="thumb"><span class="lv-num">ด่าน ${i + 1}</span>${locked ? '<span class="lv-lock">🔒</span>' : ''}${done ? '<span class="lv-done">⭐⭐⭐</span>' : ''}</div><div class="meta"><b>${esc(lv.name)}</b>
        <small>${lv.hazards.length} จุด · <i class="tag ua">UA ${ua}</i> <i class="tag uc">UC ${lv.hazards.length - ua}</i> · ${lv.timeLimit || 90} วิ</small></div>`;
      c.querySelector('.thumb').style.backgroundImage = `url("${lv.image}")`;
      c.onclick = () => {
        if (locked) {
          Sfx.wrong(); Fx.shake(c);
          Fx.toast(`🔒 ต้องเล่นตามลำดับ · ให้ได้ ⭐⭐⭐ ในด่าน ${openTo + 1}: ${levels[openTo].name} ก่อน`);
          return;
        }
        selectedLevel = lv.id; Store.pref('level', lv.id); Sfx.click(); renderSetup();
      };
      grid.appendChild(c);
    });
    document.querySelectorAll('#time-chips .chip').forEach((ch) => ch.classList.toggle('active', ch.dataset.time === String(timeChoice)));
    if (!document.querySelector('#time-chips .chip.active')) $('inp-time').value = timeChoice;
  }
  // progress is per team: re-render the lock state as the team name is typed
  let teamTimer = 0;
  $('inp-team').addEventListener('input', () => { clearTimeout(teamTimer); teamTimer = setTimeout(renderSetup, 250); });
  $('btn-reset-progress').onclick = () => {
    const team = teamName();
    if (!confirm(`รีเซ็ตความคืบหน้าของ “${team}” ให้เริ่มที่ด่าน 1 ใหม่?`)) return;
    Store.resetProgress(team); selectedLevel = null; renderSetup();
  };
  $('time-chips').addEventListener('click', (e) => {
    const ch = e.target.closest('.chip'); if (!ch) return;
    timeChoice = ch.dataset.time; Store.pref('time', timeChoice); $('inp-time').value = '';
    document.querySelectorAll('#time-chips .chip').forEach((c) => c.classList.toggle('active', c === ch));
  });
  $('inp-time').addEventListener('input', () => {
    const v = Number($('inp-time').value);
    if (v >= 15) { timeChoice = String(v); Store.pref('time', timeChoice); document.querySelectorAll('#time-chips .chip').forEach((c) => c.classList.remove('active')); }
  });
  $('btn-start').onclick = async () => {
    Sfx.unlock();
    const lv = selectedLevel && await Store.getLevel(selectedLevel);
    if (!lv) return Fx.toast('เลือกด่านก่อน');
    if (!lv.hazards.length) return Fx.toast('ด่านนี้ยังไม่มีจุดอันตราย');
    const team = teamName();
    const levels = await playableLevels();
    if (levels.findIndex((l) => l.id === lv.id) > Store.unlockedUpTo(levels, team)) {
      renderSetup(); return Fx.toast('🔒 ด่านนี้ยังล็อกอยู่สำหรับทีมนี้');
    }
    Store.pref('team', team);
    const time = timeChoice === 'level' ? (lv.timeLimit || 90) : Number(timeChoice) || 90;
    play(lv, { team, time, levelTime: timeChoice === 'level' });
  };

  function play(level, opts = {}) {
    Sfx.unlock();
    cancelAutoNext();
    opts.team = opts.team || (opts.fromEditor ? 'ทดลองเล่น' : 'ผู้เล่น');
    opts.time = opts.time || level.timeLimit || 90;
    current = { level, opts };
    show('game');
    requestAnimationFrame(() => Game.start(level, opts));
  }
  const again = () => current && play(current.level, current.opts);
  $('btn-again').onclick = again;
  $('btn-deb-again').onclick = again;
  $('btn-debrief').onclick = () => show('debrief');

  /* ---------- 3 stars → next level ---------- */
  const AUTO_NEXT_SEC = 10;
  let nextLevel = null, autoTimer = 0;
  const btnNext = $('btn-next'), nextInfo = $('res-next'), btnDebrief = $('btn-debrief');

  function cancelAutoNext() {
    clearInterval(autoTimer); autoTimer = 0;
    if (nextLevel) nextInfo.textContent = 'ด่านต่อไป: ' + nextLevel.name;
  }
  function goNext() {
    if (!nextLevel || !current) return;
    const o = current.opts;
    const time = o.levelTime ? (nextLevel.timeLimit || 90) : o.time;
    play(nextLevel, { team: o.team, time, levelTime: o.levelTime });
  }
  btnNext.onclick = goNext;
  // any other button on the result card cancels the auto-advance
  $('result-overlay').addEventListener('click', (e) => { if (e.target.closest('button') !== btnNext) cancelAutoNext(); }, true);

  Game.onFinish = async (res) => {
    cancelAutoNext();
    nextLevel = null;
    btnNext.hidden = true; nextInfo.textContent = ''; nextInfo.className = 'res-next';
    btnDebrief.classList.add('btn-primary');
    if (res.stars < 3 || !current || current.opts.fromEditor) return;
    Store.markCleared(current.opts.team, res.levelId);
    const levels = await playableLevels();
    const idx = levels.findIndex((l) => l.id === res.levelId);
    if (Game.lastResult !== res) return; // a new game already started
    if (idx === -1 || idx === levels.length - 1) {
      nextInfo.className = 'res-next done';
      nextInfo.textContent = '🏆 ผ่านครบทุกด่านแล้ว! ยอดเยี่ยมมาก';
      setTimeout(() => { Fx.fireworksShow(3000); }, 1500);
      return;
    }
    nextLevel = levels[idx + 1];
    selectedLevel = nextLevel.id; Store.pref('level', nextLevel.id); // setup screen opens on the newly unlocked level
    btnNext.textContent = '▶ ด่านต่อไป: ' + nextLevel.name;
    btnNext.hidden = false;
    btnDebrief.classList.remove('btn-primary');
    let left = AUTO_NEXT_SEC;
    const tick = () => { nextInfo.textContent = `⭐⭐⭐ ผ่านด่าน! ไปด่านต่อไปอัตโนมัติใน ${left} วินาที · กดปุ่มอื่นเพื่อยกเลิก`; };
    tick();
    autoTimer = setInterval(() => {
      left--;
      if (left <= 0) { cancelAutoNext(); goNext(); } else { tick(); Sfx.count(); }
    }, 1000);
  };

  function quitGame() {
    const s = Game.state;
    if (s && s.running && !s.over && !confirm('ออกจากเกมนี้?')) return;
    show(current && current.opts.fromEditor ? 'editor' : 'setup');
  }
  $('btn-quit').onclick = quitGame;
  $('btn-quit2').onclick = () => show(current && current.opts.fromEditor ? 'editor' : 'setup');
  $('btn-pause').onclick = () => Game.togglePause();
  $('btn-resume').onclick = () => Game.togglePause(false);
  $('btn-hint').onclick = () => Game.hint();
  $('btn-reveal').onclick = () => Game.revealAll();

  /* ---------- debrief ---------- */
  function renderDebrief() {
    if (!current) return show('menu');
    const lv = current.level, res = Game.lastResult || { foundIds: [], found: 0, total: lv.hazards.length, score: 0 };
    const found = new Set(res.foundIds);
    $('deb-title').textContent = `สรุปจุดเสี่ยง · ${lv.name} · ${current.opts.team}`;
    const dn = $('btn-deb-next');
    dn.hidden = !nextLevel;
    if (nextLevel) { dn.textContent = '▶ ด่านต่อไป: ' + nextLevel.name; dn.onclick = goNext; }
    const img = $('deb-img'), stage = $('deb-stage'), wrap = $('deb-stage-wrap'), mk = $('deb-markers');
    stage.style.transform = '';
    mk.innerHTML = '';
    const draw = () => {
      const ar = Game.fitStage(stage, wrap, img, 0);
      mk.innerHTML = '';
      lv.hazards.forEach((hz, i) => Game.addMarker(mk, hz, found.has(hz.id) ? 'found' : 'missed', i + 1, ar));
    };
    img.onload = draw; img.src = lv.image;
    if (img.complete && img.naturalWidth) draw();

    const ua = lv.hazards.filter((h) => h.type === 'UA'), uc = lv.hazards.filter((h) => h.type !== 'UA');
    const cnt = (arr) => arr.filter((h) => found.has(h.id)).length;
    $('deb-summary').innerHTML = `
      <div><b>${res.found}/${res.total}</b><small>พบทั้งหมด</small></div>
      <div><b style="color:var(--ua)">${cnt(ua)}/${ua.length}</b><small>Unsafe Act</small></div>
      <div><b style="color:var(--uc)">${cnt(uc)}/${uc.length}</b><small>Unsafe Condition</small></div>
      <div><b>${(res.score || 0).toLocaleString()}</b><small>คะแนน</small></div>`;
    const list = $('deb-list');
    list.innerHTML = '';
    lv.hazards.forEach((hz, i) => {
      const t = hz.type === 'UA' ? 'ua' : 'uc';
      const li = document.createElement('li');
      li.className = t;
      li.style.animationDelay = (i * 0.05) + 's';
      li.innerHTML = `<div class="row1"><span class="num">${i + 1}</span><span class="ttl">${esc(hz.title || 'จุดอันตราย')}</span>
          <i class="tag ${t}">${hz.type}</i><span class="st ${found.has(hz.id) ? 'found">✔ พบ' : 'miss">✕ ไม่พบ'}</span></div>
        <div class="det">${hz.desc ? `<div><b>ความเสี่ยง:</b> ${esc(hz.desc)}</div>` : ''}${hz.fix ? `<div><b>วิธีแก้ไข:</b> ${esc(hz.fix)}</div>` : ''}</div>`;
      li.onclick = () => focusHazard(li, hz);
      list.appendChild(li);
    });
  }

  function focusHazard(li, hz) {
    const stage = $('deb-stage');
    const wasActive = li.classList.contains('active');
    document.querySelectorAll('#deb-list li').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('#deb-markers .mk-group').forEach((g) => g.classList.toggle('focus', !wasActive && g.dataset.id === hz.id));
    if (wasActive) { stage.style.transform = ''; return; }
    li.classList.add('active');
    const img = $('deb-img');
    const g = Game.zoneGeom(hz, img.naturalWidth / img.naturalHeight);
    const s = Math.max(1.3, Math.min(2.6, 0.45 / Math.max(g.width, g.height)));
    stage.style.transform = `scale(${s}) translate(${(0.5 - g.cx) * 100}%, ${(0.5 - g.cy) * 100}%)`;
    Sfx.click();
  }
  window.addEventListener('resize', () => { if (screen === 'debrief') renderDebrief(); });

  /* ---------- leaderboard ---------- */
  async function renderBoard() {
    const levels = await Store.listLevels();
    if (!levels.find((l) => l.id === boardLevel)) boardLevel = (current && current.level.id) || (levels[0] && levels[0].id);
    const tabs = $('board-tabs');
    tabs.innerHTML = '';
    levels.forEach((lv) => {
      const b = document.createElement('button');
      b.className = 'chip' + (lv.id === boardLevel ? ' active' : '');
      b.textContent = lv.name;
      b.onclick = () => { boardLevel = lv.id; renderBoard(); };
      tabs.appendChild(b);
    });
    const rows = boardLevel ? Store.getBoard(boardLevel) : [];
    const body = $('board-body');
    body.innerHTML = rows.length ? '' : '<tr class="empty"><td colspan="6">ยังไม่มีผลการเล่น</td></tr>';
    const medal = ['🥇', '🥈', '🥉'];
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.className = i < 3 ? 'r' + (i + 1) : '';
      tr.style.animationDelay = (i * 0.05) + 's';
      const d = new Date(r.date);
      tr.innerHTML = `<td>${medal[i] || i + 1}</td><td>${esc(r.team)}</td><td><b>${r.score.toLocaleString()}</b></td>
        <td>${r.found}/${r.total}</td><td style="color:var(--gold)">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</td>
        <td>${d.toLocaleDateString('th-TH')} ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>`;
      body.appendChild(tr);
    });
  }
  $('btn-board-clear').onclick = () => {
    if (boardLevel && confirm('ล้างตารางอันดับของด่านนี้?')) { Store.clearBoard(boardLevel); renderBoard(); }
  };

  /* ---------- help / sound / fullscreen ---------- */
  const help = $('help-overlay');
  $('btn-help').onclick = () => help.classList.add('on');
  $('btn-help-close').onclick = () => help.classList.remove('on');
  const soundBtn = $('btn-sound');
  const syncSound = () => { soundBtn.textContent = Sfx.muted ? '🔇' : '🔊'; };
  soundBtn.onclick = () => { Sfx.toggle(); syncSound(); Fx.toast(Sfx.muted ? 'ปิดเสียง' : 'เปิดเสียง', 1000); };
  syncSound();
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  }

  document.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      if (e.key === 'Enter' && screen === 'setup') $('btn-start').click();
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'f') fullscreen();
    else if (k === 'm') soundBtn.click();
    else if (screen === 'game') {
      const s = Game.state;
      if (k === ' ') { e.preventDefault(); Game.togglePause(); }
      else if (k === 'h') Game.hint();
      else if (k === 'r') Game.revealAll();
      else if (k === 'escape') {
        if (s && s.paused) show(current.opts.fromEditor ? 'editor' : 'setup');
        else if (s && s.running && !s.over) Game.togglePause(true);
        else show('menu');
      }
    } else if (k === 'escape') {
      if (help.classList.contains('on')) help.classList.remove('on');
      else if (screen !== 'menu' && screen !== 'editor') show('menu');
    }
  });
  document.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });

  window.App = { show, play };
  // warm up storage (seed sample levels on first run)
  Store.listLevels();
})();
