/* Synthesised sound effects – Web Audio API, no audio files needed (works offline). */
(function () {
  let ctx = null, master = null;
  let muted = (window.Store && Store.pref('muted')) === '1';

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, opt = {}) {
    if (muted) return;
    const c = ac(); if (!c) return;
    const t = c.currentTime + (opt.delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = opt.type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
    const v = opt.vol ?? 0.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (opt.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, opt = {}) {
    if (muted) return;
    const c = ac(); if (!c) return;
    const t = c.currentTime + (opt.delay || 0);
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, opt.decay || 2);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = opt.filter || 'lowpass';
    f.frequency.setValueAtTime(opt.freq || 1200, t);
    if (opt.freqTo) f.frequency.exponentialRampToValueAtTime(opt.freqTo, t + dur);
    const g = c.createGain(); g.gain.value = opt.vol ?? 0.6;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  const Sfx = {
    unlock() { ac(); },
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      if (window.Store) Store.pref('muted', muted ? '1' : '0');
      return muted;
    },
    tick(urgent) {
      tone(urgent ? 1500 : 1000, 0.05, { type: 'square', vol: urgent ? 0.18 : 0.1 });
    },
    heartbeat() {
      tone(70, 0.15, { type: 'sine', vol: 0.7, to: 40 });
      tone(65, 0.15, { type: 'sine', vol: 0.5, to: 40, delay: 0.18 });
    },
    countdown() { tone(660, 0.25, { type: 'triangle', vol: 0.5 }); },
    go() {
      tone(880, 0.12, { type: 'square', vol: 0.3 });
      tone(1320, 0.4, { type: 'square', vol: 0.3, delay: 0.1 });
    },
    correct(combo = 1) {
      const base = 523 * Math.pow(1.12, Math.min(combo - 1, 6));
      [0, 4, 7, 12].forEach((s, i) =>
        tone(base * Math.pow(2, s / 12), 0.18, { type: 'triangle', vol: 0.35, delay: i * 0.06 }));
      noise(0.15, { filter: 'highpass', freq: 5000, vol: 0.15 });
    },
    combo() {
      [0, 3, 7, 10, 12, 15].forEach((s, i) =>
        tone(660 * Math.pow(2, s / 12), 0.12, { type: 'square', vol: 0.18, delay: i * 0.05 }));
    },
    wrong() {
      tone(160, 0.35, { type: 'sawtooth', vol: 0.35, to: 90 });
      tone(150, 0.35, { type: 'square', vol: 0.15, to: 80 });
    },
    hint() {
      tone(1200, 0.5, { type: 'sine', vol: 0.3, to: 400 });
      tone(1200, 0.5, { type: 'sine', vol: 0.2, to: 400, delay: 0.4 });
    },
    timeBonus() { tone(1400, 0.1, { type: 'sine', vol: 0.25 }); tone(1900, 0.15, { type: 'sine', vol: 0.25, delay: 0.07 }); },
    boom() {
      noise(2.2, { freq: 1800, freqTo: 60, vol: 1, decay: 1.5 });
      tone(90, 1.4, { type: 'sine', vol: 0.9, to: 25 });
      noise(0.8, { filter: 'bandpass', freq: 300, vol: 0.6, delay: 0.25, decay: 3 });
    },
    defuse() {
      noise(0.08, { filter: 'highpass', freq: 3000, vol: 0.5 });
      tone(300, 0.1, { type: 'square', vol: 0.2, delay: 0.05 });
    },
    win() {
      const notes = [523, 659, 784, 1047, 784, 1047, 1319];
      notes.forEach((f, i) => tone(f, i === notes.length - 1 ? 0.8 : 0.16, { type: 'triangle', vol: 0.35, delay: i * 0.12 }));
    },
    firework() {
      noise(0.6, { filter: 'highpass', freq: 2500, vol: 0.25, decay: 3 });
      tone(200, 0.3, { type: 'sine', vol: 0.3, to: 60 });
    },
    star(i) { tone(880 * Math.pow(1.26, i), 0.3, { type: 'triangle', vol: 0.4 }); },
    reveal() { tone(440, 0.3, { type: 'sine', vol: 0.3, to: 880 }); },
    count() { tone(1800, 0.03, { type: 'square', vol: 0.06 }); },
    click() { tone(800, 0.04, { type: 'triangle', vol: 0.15 }); }
  };

  window.Sfx = Sfx;
})();
