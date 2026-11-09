/* Visual effects: canvas particle engine + DOM helpers (shake, flash, float text, toast). */
(function () {
  const cv = document.getElementById('fx-canvas');
  const g = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const parts = [];
  let running = false;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  function add(p) {
    parts.push(Object.assign({ vx: 0, vy: 0, g: 0, drag: 0.99, life: 1, age: 0, size: 4, rot: 0, vr: 0, shape: 'circle', color: '#fff', fade: true }, p));
    if (!running) { running = true; requestAnimationFrame(loop); }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    g.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.trail) {
        p.trail.push([p.x, p.y]); if (p.trail.length > 8) p.trail.shift();
      }
      const k = p.age / p.life;
      const alpha = p.fade ? 1 - k * k : 1;
      g.globalAlpha = Math.max(0, alpha);
      const s = p.grow ? p.size * (1 + k * p.grow) : p.size;
      if (p.trail) {
        g.strokeStyle = p.color; g.lineWidth = s * .6; g.lineCap = 'round';
        g.beginPath(); p.trail.forEach(([x, y], j) => j ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
      }
      g.fillStyle = p.color;
      if (p.shape === 'rect') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.fillRect(-s / 2, -s / 4, s, s / 2 * Math.abs(Math.cos(p.rot * 2)) + 1);
        g.restore();
      } else if (p.shape === 'shard') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.beginPath(); g.moveTo(-s, -s * .4); g.lineTo(s, 0); g.lineTo(-s * .6, s * .6); g.closePath(); g.fill();
        g.restore();
      } else if (p.shape === 'glow') {
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, s);
        gr.addColorStop(0, p.color); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, s, 0, Math.PI * 2); g.fill();
      } else {
        g.beginPath(); g.arc(p.x, p.y, s, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalAlpha = 1;
    if (parts.length) requestAnimationFrame(loop); else { running = false; g.clearRect(0, 0, W, H); }
  }

  const CONFETTI = ['#2f8cff', '#22d38a', '#4da3ff', '#ff3b6b', '#ff8a00', '#ffffff', '#b06bff'];

  const Fx = {
    confetti(x, y, n = 60) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(200, 650);
        add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 250, g: 900, drag: 0.97, life: rand(1, 1.8),
          size: rand(8, 14), shape: 'rect', rot: rand(0, 6), vr: rand(-12, 12), color: pick(CONFETTI) });
      }
    },
    sparks(x, y, n = 25, color = '#ffd36b') {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(150, 500);
        add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 600, drag: 0.95, life: rand(.3, .7), size: rand(1.5, 3), color, trail: [] });
      }
    },
    fuseSpark(x, y) {
      for (let i = 0; i < 3; i++) {
        const a = rand(-Math.PI, 0), sp = rand(60, 220);
        add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 500, life: rand(.2, .45), size: rand(1, 2.4), color: pick(['#fff3b0', '#ffb300', '#ff7a00']) });
      }
    },
    explosion(x, y) {
      // core glow
      add({ x, y, life: .7, size: Math.max(W, H) * .35, shape: 'glow', color: 'rgba(255,220,120,1)', grow: .6 });
      add({ x, y, life: 1.1, size: Math.max(W, H) * .2, shape: 'glow', color: 'rgba(255,90,0,.9)', grow: 1.5 });
      // fire
      for (let i = 0; i < 140; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(200, 1400);
        add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 300, drag: 0.93, life: rand(.5, 1.4), size: rand(2, 6),
          color: pick(['#fff1a8', '#ffc400', '#ff7a00', '#ff3b00']), trail: [] });
      }
      // debris
      for (let i = 0; i < 60; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(300, 1100);
        add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 300, g: 1400, drag: 0.98, life: rand(1.2, 2.2), size: rand(6, 16),
          shape: 'shard', rot: rand(0, 6), vr: rand(-15, 15), color: pick(['#2a2e38', '#3d4250', '#1a1d24', '#6b5a3a']), fade: false });
      }
      // smoke
      for (let i = 0; i < 40; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(40, 260);
        add({ x: x + rand(-40, 40), y: y + rand(-40, 40), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, drag: 0.96, life: rand(1.8, 3.2),
          size: rand(40, 90), grow: 1.5, shape: 'glow', color: pick(['rgba(70,70,80,.8)', 'rgba(40,40,45,.8)', 'rgba(100,90,80,.6)']) });
      }
    },
    firework(x, y) {
      const color = pick(CONFETTI);
      add({ x, y, life: .4, size: 80, shape: 'glow', color, grow: 1 });
      for (let i = 0; i < 70; i++) {
        const a = (i / 70) * Math.PI * 2, sp = rand(250, 420);
        add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 220, drag: 0.96, life: rand(1, 1.6), size: rand(2, 3.5), color, trail: [] });
      }
    },
    fireworksShow(duration = 3500) {
      const end = performance.now() + duration;
      const launch = () => {
        if (performance.now() > end) return;
        Fx.firework(rand(W * .15, W * .85), rand(H * .12, H * .5));
        if (window.Sfx) Sfx.firework();
        setTimeout(launch, rand(250, 550));
      };
      launch();
    },
    shake(el, hard) {
      if (!el) return;
      const cls = hard ? 'shake-hard' : 'shake';
      el.classList.remove('shake', 'shake-hard'); void el.offsetWidth; el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), hard ? 950 : 500);
    },
    flash() {
      const f = document.getElementById('flash');
      f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
    },
    floatText(parent, xPct, yPct, text, color) {
      const d = document.createElement('div');
      d.className = 'float-text';
      d.textContent = text;
      d.style.left = xPct + '%'; d.style.top = yPct + '%';
      d.style.color = color || '#7cc0ff';
      parent.appendChild(d);
      setTimeout(() => d.remove(), 1400);
    },
    toast(msg, ms = 2200) {
      const t = document.getElementById('toast');
      t.textContent = msg; t.classList.add('on');
      clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms);
    },
    clear() { parts.length = 0; }
  };

  window.Fx = Fx;
})();
