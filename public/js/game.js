/* Time Attack game engine */
(function () {
  const $ = (id) => document.getElementById(id);
  const CFG = { bonus: 5, penalty: 5, hintCost: 10, comboWindow: 5, tolPx: 14, dangerAt: 10 };

  const els = {};
  ['scr-game', 'stage', 'stage-wrap', 'stage-img', 'markers', 'timer', 'fuse', 'spark', 'bomb', 'hud-team', 'hud-level',
    'hud-score', 'hud-found', 'hud-ua', 'hud-uc', 'hud-combo', 'hud-combo-v', 'hazard-card', 'countdown', 'banner',
    'pause-overlay', 'result-overlay', 'res-title', 'res-stars', 'res-found', 'res-score', 'res-bonus']
    .forEach((id) => { els[id] = $(id); });

  let st = null;
  let timers = [];
  const later = (fn, ms) => { const h = setTimeout(fn, ms); timers.push(h); return h; };
  const clearLater = () => { timers.forEach(clearTimeout); timers = []; };

  /* ---------- geometry helpers (shared with debrief/editor) ---------- */
  function zoneGeom(hz, ar) {
    if (hz.shape === 'circle') {
      const rx = hz.r, ry = hz.r * ar;
      return { left: hz.x - rx, top: hz.y - ry, width: rx * 2, height: ry * 2, cx: hz.x, cy: hz.y,
        pinX: hz.x + rx * 0.7, pinY: hz.y - ry * 0.7 };
    }
    return { left: hz.x, top: hz.y, width: hz.w, height: hz.h, cx: hz.x + hz.w / 2, cy: hz.y + hz.h / 2,
      pinX: hz.x + hz.w, pinY: hz.y };
  }

  // distance (px) from point to zone edge, 0 when inside
  function zoneDist(hz, px, py, W, H) {
    if (hz.shape === 'circle') return Math.max(0, Math.hypot((px - hz.x) * W, (py - hz.y) * H) - hz.r * W);
    const dx = Math.max(hz.x - px, 0, px - (hz.x + hz.w)) * W;
    const dy = Math.max(hz.y - py, 0, py - (hz.y + hz.h)) * H;
    return Math.hypot(dx, dy);
  }

  function addMarker(container, hz, kind, num, ar) {
    const g = zoneGeom(hz, ar);
    const pct = (v) => (v * 100) + '%';
    const wrap = document.createElement('div');
    wrap.className = 'mk-group';
    wrap.dataset.id = hz.id;
    const z = document.createElement('div');
    const t = (hz.type || 'UC').toLowerCase();
    z.className = `mk-zone ${hz.shape} ${kind === 'missed' ? 'missed' : t}`;
    Object.assign(z.style, { left: pct(g.left), top: pct(g.top), width: pct(g.width), height: pct(g.height) });
    const mk = document.createElement('div');
    mk.className = 'mk';
    Object.assign(mk.style, { left: pct(Math.min(.97, g.pinX)), top: pct(Math.max(.04, g.pinY)) });
    mk.innerHTML = `<div class="mk-pin ${kind === 'missed' ? 'missed' : t}">${num}</div>`;
    wrap.appendChild(z); wrap.appendChild(mk);
    container.appendChild(wrap);
    return wrap;
  }

  function fitStage(stage, wrap, img, pad = 24) {
    const ar = (img.naturalWidth || 16) / (img.naturalHeight || 9);
    const aw = wrap.clientWidth - pad, ah = wrap.clientHeight - pad;
    let w = aw, h = aw / ar;
    if (h > ah) { h = ah; w = ah * ar; }
    stage.style.width = Math.max(50, w) + 'px';
    stage.style.height = Math.max(30, h) + 'px';
    return ar;
  }

  /* ---------- HUD ---------- */
  function hud() {
    const hz = st.level.hazards;
    const ua = hz.filter((h) => h.type === 'UA'), uc = hz.filter((h) => h.type !== 'UA');
    const f = (arr) => arr.filter((h) => st.found.has(h.id)).length;
    els['hud-score'].textContent = st.score.toLocaleString();
    els['hud-found'].textContent = `${st.found.size}/${hz.length}`;
    els['hud-ua'].textContent = `${f(ua)}/${ua.length}`;
    els['hud-uc'].textContent = `${f(uc)}/${uc.length}`;
    const mult = Math.min(Math.max(st.combo, 1), 3);
    els['hud-combo-v'].textContent = 'x' + mult;
    els['hud-combo'].classList.toggle('on', mult > 1);
  }
  function pop(id) { const e = els[id].parentElement; e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }
  function bumpTimer(up) {
    const t = els.timer; t.classList.remove('bump-up', 'bump-down'); void t.offsetWidth; t.classList.add(up ? 'bump-up' : 'bump-down');
  }

  let fuseLen = 0;
  function drawFuse() {
    if (!fuseLen) fuseLen = els.fuse.getTotalLength();
    st.maxFuse = Math.max(st.maxFuse, st.remaining);
    const f = Math.max(0, Math.min(1, st.remaining / st.maxFuse));
    els.fuse.style.strokeDasharray = `${f * fuseLen} ${fuseLen}`;
    const p = els.fuse.getPointAtLength(f * fuseLen);
    els.spark.setAttribute('transform', `translate(${p.x},${p.y})`);
    return p;
  }
  function sparkScreen(p) {
    const m = els.bomb.getScreenCTM(); if (!m) return null;
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  }
  function showTimer() { els.timer.textContent = (Math.max(0, st.remaining) / 1000).toFixed(1); }

  /* ---------- flow ---------- */
  function start(level, opts) {
    stop();
    st = {
      level, team: opts.team || 'ผู้เล่น', time: opts.time, remaining: opts.time * 1000, maxFuse: opts.time * 1000,
      found: new Set(), score: 0, combo: 0, lastHitAt: -1e9, elapsed: 0, wrong: 0, hints: 0,
      running: false, paused: false, over: false, lastSec: null, frame: 0, ar: 16 / 9
    };
    els['hud-team'].textContent = st.team;
    els['hud-level'].textContent = level.name + ' · ' + level.hazards.length + ' จุด';
    els.markers.innerHTML = '';
    els['result-overlay'].classList.remove('on');
    els['pause-overlay'].classList.remove('on');
    els['scr-game'].classList.remove('danger');
    els.fuse.style.display = ''; els.spark.style.display = '';
    els['stage'].style.transform = '';
    fuseLen = 0;
    hud(); showTimer();
    const img = els['stage-img'];
    const go = () => { st.ar = fitStage(els.stage, els['stage-wrap'], img); drawFuse(); countdown(); };
    img.onload = go;
    img.src = level.image;
    if (img.complete && img.naturalWidth) { img.onload = null; go(); }
  }

  function countdown() {
    const cd = els.countdown;
    cd.classList.add('on');
    const seq = ['3', '2', '1', 'GO!'];
    seq.forEach((txt, i) => later(() => {
      cd.innerHTML = `<span class="${txt === 'GO!' ? 'go' : ''}">${txt}</span>`;
      txt === 'GO!' ? Sfx.go() : Sfx.countdown();
    }, i * 850));
    later(() => { cd.classList.remove('on'); cd.innerHTML = ''; begin(); }, seq.length * 850);
  }

  let lastT = 0, raf = 0;
  function begin() { st.running = true; lastT = performance.now(); raf = requestAnimationFrame(loop); }

  function loop(now) {
    if (!st || st.over) return;
    const dt = now - lastT; lastT = now;
    if (st.running && !st.paused) {
      st.remaining -= dt; st.elapsed += dt;
      const sec = Math.ceil(st.remaining / 1000);
      const danger = st.remaining <= CFG.dangerAt * 1000;
      els['scr-game'].classList.toggle('danger', danger);
      if (st.lastSec !== null && sec !== st.lastSec && sec >= 0) {
        Sfx.tick(danger);
        if (danger) { Sfx.heartbeat(); later(() => st && !st.over && Sfx.tick(true), 500); }
      }
      st.lastSec = sec;
      showTimer();
      const p = drawFuse();
      if ((st.frame++ & 1) === 0) { const sp = sparkScreen(p); if (sp) Fx.fuseSpark(sp.x, sp.y); }
      if (st.remaining <= 0) { timeUp(); return; }
    }
    raf = requestAnimationFrame(loop);
  }

  function relPoint(e) {
    const r = els.stage.getBoundingClientRect();
    return { px: (e.clientX - r.left) / r.width, py: (e.clientY - r.top) / r.height, W: r.width, H: r.height, sx: e.clientX, sy: e.clientY };
  }

  function onPointer(e) {
    if (!st || !st.running || st.paused || st.over) return;
    e.preventDefault();
    const pt = relPoint(e);
    let best = null, bestD = Infinity;
    for (const hz of st.level.hazards) {
      if (st.found.has(hz.id)) continue;
      const d = zoneDist(hz, pt.px, pt.py, pt.W, pt.H);
      if (d <= CFG.tolPx && d < bestD) { best = hz; bestD = d; }
    }
    if (best) return correct(best, pt);
    const already = st.level.hazards.some((hz) => st.found.has(hz.id) && zoneDist(hz, pt.px, pt.py, pt.W, pt.H) <= 0);
    if (already) { Fx.floatText(els.markers, pt.px * 100, pt.py * 100, 'พบแล้ว', '#9fb3ff'); Sfx.click(); return; }
    wrong(pt);
  }

  function ripple(pt) {
    for (const c of ['', ' r2']) {
      const r = document.createElement('div');
      r.className = 'mk-ripple' + c;
      r.style.left = pt.px * 100 + '%'; r.style.top = pt.py * 100 + '%';
      r.style.position = 'absolute';
      els.markers.appendChild(r);
      setTimeout(() => r.remove(), 1100);
    }
  }

  function correct(hz, pt) {
    st.found.add(hz.id);
    st.combo = (st.elapsed - st.lastHitAt <= CFG.comboWindow * 1000) ? st.combo + 1 : 1;
    st.lastHitAt = st.elapsed;
    const mult = Math.min(st.combo, 3);
    const pts = (Number(hz.points) || 100) * mult;
    st.score += pts;
    st.remaining += CFG.bonus * 1000;
    const num = st.level.hazards.indexOf(hz) + 1;
    addMarker(els.markers, hz, 'found', num, st.ar);
    ripple(pt);
    Fx.confetti(pt.sx, pt.sy, 50 + mult * 20);
    Fx.sparks(pt.sx, pt.sy, 20);
    Fx.floatText(els.markers, pt.px * 100, pt.py * 100, '+' + pts, hz.type === 'UA' ? '#ffb347' : '#ff6b8f');
    later(() => Fx.floatText(els.markers, pt.px * 100, Math.min(95, pt.py * 100 + 8), `+${CFG.bonus} วิ`, '#22d38a'), 200);
    Sfx.correct(st.combo);
    if (st.combo >= 2) { banner(`COMBO x${mult}!`, 'combo'); later(() => Sfx.combo(), 150); }
    bumpTimer(true); pop('hud-score'); pop('hud-found');
    showCard(hz);
    hud();
    if (st.found.size === st.level.hazards.length) win();
  }

  function wrong(pt) {
    st.remaining -= CFG.penalty * 1000;
    st.combo = 0; st.wrong++;
    const x = document.createElement('div');
    x.className = 'mk-x'; x.textContent = '✕';
    x.style.left = pt.px * 100 + '%'; x.style.top = pt.py * 100 + '%';
    els.markers.appendChild(x);
    setTimeout(() => x.remove(), 950);
    Fx.floatText(els.markers, pt.px * 100, Math.min(95, pt.py * 100 + 7), `−${CFG.penalty} วิ`, '#ff3b4f');
    Fx.shake(els.stage);
    Sfx.wrong();
    bumpTimer(false);
    hud();
  }

  function hint() {
    if (!st || !st.running || st.paused || st.over) return;
    if (st.remaining <= (CFG.hintCost + 2) * 1000) { Fx.toast('เวลาไม่พอสำหรับคำใบ้!'); return; }
    const left = st.level.hazards.filter((h) => !st.found.has(h.id));
    if (!left.length) return;
    const hz = left[(Math.random() * left.length) | 0];
    st.remaining -= CFG.hintCost * 1000; st.hints++;
    const g = zoneGeom(hz, st.ar);
    const sizeW = Math.max(g.width, g.height / st.ar) * 2.2;
    const ox = (Math.random() - .5) * g.width * .6, oy = (Math.random() - .5) * g.height * .6;
    const r = document.createElement('div');
    r.className = 'mk-radar';
    Object.assign(r.style, {
      width: sizeW * 100 + '%', height: sizeW * st.ar * 100 + '%',
      left: (g.cx + ox - sizeW / 2) * 100 + '%', top: (g.cy + oy - sizeW * st.ar / 2) * 100 + '%'
    });
    els.markers.appendChild(r);
    setTimeout(() => r.remove(), 3800);
    Sfx.hint(); bumpTimer(false);
    Fx.floatText(els.markers, (g.cx + ox) * 100, (g.cy + oy) * 100, `💡 −${CFG.hintCost} วิ`, '#4da3ff');
  }

  let cardH = 0;
  function showCard(hz) {
    const c = els['hazard-card'];
    const ua = hz.type === 'UA';
    c.className = 'hazard-card ' + (ua ? 'ua' : 'uc');
    c.innerHTML = `<div class="hc-type"><i class="tag ${ua ? 'ua' : 'uc'}">${ua ? 'Unsafe Act · การกระทำไม่ปลอดภัย' : 'Unsafe Condition · สภาพไม่ปลอดภัย'}</i></div><div class="hc-title"></div>`;
    c.querySelector('.hc-title').textContent = hz.title || 'จุดอันตราย';
    void c.offsetWidth; c.classList.add('show');
    clearTimeout(cardH); cardH = setTimeout(() => c.classList.remove('show'), 2300);
  }

  function banner(text, cls) {
    const b = els.banner;
    b.className = 'banner ' + cls; b.textContent = text;
    void b.offsetWidth; b.classList.add('show');
  }

  function stageCenter() {
    const r = els.stage.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function revealMissed(step, done) {
    const missed = st.level.hazards.filter((h) => !st.found.has(h.id));
    missed.forEach((hz, i) => later(() => {
      addMarker(els.markers, hz, 'missed', st.level.hazards.indexOf(hz) + 1, st.ar);
      showCard(hz); Sfx.reveal();
    }, i * step));
    later(done, missed.length * step + 900);
  }

  function timeUp() {
    st.over = true; st.running = false; st.remaining = 0; showTimer();
    els['scr-game'].classList.remove('danger');
    els.fuse.style.display = 'none'; els.spark.style.display = 'none';
    const c = stageCenter();
    Sfx.boom(); Fx.flash(); Fx.explosion(c.x, c.y);
    Fx.shake(els['scr-game'], true);
    banner('BOOM! 💥', 'boom');
    later(() => revealMissed(900, () => finish('boom')), 2000);
  }

  function win() {
    st.over = true; st.running = false;
    els['scr-game'].classList.remove('danger');
    Sfx.defuse();
    els.spark.style.display = 'none';
    els.fuse.style.transition = 'stroke-dasharray .4s'; els.fuse.style.strokeDasharray = `0 ${fuseLen}`;
    later(() => { els.fuse.style.transition = ''; }, 500);
    later(() => { banner('กู้ระเบิดสำเร็จ! 🎉', 'win'); Sfx.win(); Fx.fireworksShow(3800); const c = stageCenter(); Fx.confetti(c.x, c.y, 160); }, 350);
    later(() => finish('win'), 2600);
  }

  function revealAll() {
    if (!st || st.over) return;
    st.over = true; st.running = false;
    els['pause-overlay'].classList.remove('on');
    els['scr-game'].classList.remove('danger');
    els.spark.style.display = 'none';
    banner('เฉลย', 'combo');
    revealMissed(450, () => finish('reveal'));
  }

  function finish(outcome) {
    const total = st.level.hazards.length, found = st.found.size;
    const timeLeft = Math.max(0, Math.ceil(st.remaining / 1000));
    const bonus = outcome === 'win' ? timeLeft * 10 : 0;
    const final = st.score + bonus;
    let stars = 0;
    if (found === total) stars = timeLeft >= st.time * 0.25 ? 3 : 2;
    else if (found / total >= 0.6) stars = 1;
    const result = { outcome, team: st.team, levelId: st.level.id, score: final, base: st.score, bonus, found, total, stars, timeLeft,
      foundIds: [...st.found], wrong: st.wrong, hints: st.hints };
    Game.lastResult = result;
    if (outcome !== 'reveal') Store.addScore(st.level.id, { team: st.team, score: final, found, total, stars, timeLeft });

    els['res-title'].textContent = outcome === 'win' ? '🎉 กู้ระเบิดสำเร็จ!' : outcome === 'boom' ? '💥 ระเบิดแล้ว!' : '📋 เฉลยคำตอบ';
    els['res-found'].textContent = `${found}/${total}`;
    els['res-bonus'].textContent = '+' + bonus;
    els['res-score'].textContent = '0';
    const starEls = els['res-stars'].querySelectorAll('span');
    starEls.forEach((s) => s.className = '');
    els['result-overlay'].classList.add('on');
    // count-up score
    const t0 = performance.now(), dur = 1200;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      els['res-score'].textContent = Math.round(final * (1 - Math.pow(1 - k, 3))).toLocaleString();
      if (k < 1) { Sfx.count(); requestAnimationFrame(step); }
    };
    requestAnimationFrame(step);
    starEls.forEach((s, i) => later(() => {
      s.classList.add('show'); if (i < stars) { s.classList.add('on'); Sfx.star(i); const r = s.getBoundingClientRect(); Fx.sparks(r.left + r.width / 2, r.top + r.height / 2, 30, '#ffc400'); }
    }, 500 + i * 450));
    if (typeof Game.onFinish === 'function') Game.onFinish(result);
  }

  function togglePause(force) {
    if (!st || !st.running || st.over) return;
    st.paused = force !== undefined ? force : !st.paused;
    els['pause-overlay'].classList.toggle('on', st.paused);
    if (!st.paused) lastT = performance.now();
  }

  function stop() {
    clearLater();
    cancelAnimationFrame(raf);
    if (st) { st.over = true; st.running = false; }
    els['scr-game'].classList.remove('danger');
    els['hazard-card'].classList.remove('show');
    els.countdown.classList.remove('on');
    Fx.clear();
  }

  els.stage.addEventListener('pointerdown', onPointer);
  window.addEventListener('resize', () => {
    if (st && els['scr-game'].classList.contains('active')) st.ar = fitStage(els.stage, els['stage-wrap'], els['stage-img']);
  });

  window.Game = {
    CFG, start, stop, hint, togglePause, revealAll, zoneGeom, zoneDist, addMarker, fitStage,
    get state() { return st; }, lastResult: null
  };
})();
