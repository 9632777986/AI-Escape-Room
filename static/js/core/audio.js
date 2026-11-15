// Procedural audio (Web Audio only, no files). Every export is safe: nothing throws without AudioContext.
let ctx = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
let muted = false, volume = 0.7;
try { muted = localStorage.getItem('nf_muted') === '1'; const v = parseFloat(localStorage.getItem('nf_vol')); if (!isNaN(v)) volume = Math.min(1, Math.max(0, v)); } catch {}

function ensure() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : volume; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
  return ctx;
}
export function init() { const c = ensure(); if (c && c.state === 'suspended') c.resume().catch(() => {}); }
export function setMuted(m) { muted = !!m; try { localStorage.setItem('nf_muted', muted ? '1' : '0'); } catch {} if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05); }
export const isMuted = () => muted;
export function setVolume(v) { volume = Math.min(1, Math.max(0, +v || 0)); try { localStorage.setItem('nf_vol', String(volume)); } catch {} if (master && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05); }
export const getVolume = () => volume;

/* ---------- building blocks ---------- */
function tone({ f = 440, f2, type = 'sine', t = 0, dur = 0.2, vol = 0.2, attack = 0.005, bus, lp }) {
  const c = ctx, st = c.currentTime + t;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, st);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), st + dur);
  g.gain.setValueAtTime(0.0001, st); g.gain.linearRampToValueAtTime(vol, st + attack); g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
  let out = o;
  if (lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); out = fl; }
  out.connect(g); g.connect(bus || sfxBus);
  o.start(st); o.stop(st + dur + 0.05);
}
function noise({ t = 0, dur = 0.2, vol = 0.15, type = 'bandpass', f = 1000, f2, q = 1, bus }) {
  const c = ctx, st = c.currentTime + t;
  const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, st);
  if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), st + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, st); g.gain.linearRampToValueAtTime(vol, st + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
  s.connect(fl); fl.connect(g); g.connect(bus || sfxBus); s.start(st, Math.random()); s.stop(st + dur + 0.05);
}

let lastType = 0, lastHover = 0;
const SFX = {
  click() { tone({ f: 620, f2: 380, type: 'square', dur: 0.06, vol: 0.06, lp: 2500 }); },
  hover() { tone({ f: 900, type: 'sine', dur: 0.05, vol: 0.025 }); },
  type() { noise({ dur: 0.03, vol: 0.05, f: 2600 + Math.random() * 1200, q: 4 }); tone({ f: 150 + Math.random() * 60, type: 'triangle', dur: 0.03, vol: 0.03 }); },
  discover() { [523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'triangle', t: i * 0.07, dur: 0.35, vol: 0.09 })); tone({ f: 2093, type: 'sine', t: 0.3, dur: 0.6, vol: 0.03 }); },
  good() { tone({ f: 660, type: 'triangle', dur: 0.14, vol: 0.09 }); tone({ f: 990, type: 'triangle', t: 0.1, dur: 0.3, vol: 0.09 }); },
  error() { tone({ f: 170, f2: 110, type: 'sawtooth', dur: 0.28, vol: 0.09, lp: 900 }); tone({ f: 180, f2: 120, type: 'sawtooth', t: 0.12, dur: 0.22, vol: 0.07, lp: 900 }); },
  penalty() { SFX.error(); noise({ dur: 0.5, vol: 0.1, type: 'lowpass', f: 400, f2: 60 }); },
  unlock() { noise({ dur: 0.12, vol: 0.1, f: 3000, q: 3 }); tone({ f: 300, type: 'square', t: 0.1, dur: 0.07, vol: 0.06, lp: 1800 }); [440, 554, 659, 880].forEach((f, i) => tone({ f, type: 'sine', t: 0.22 + i * 0.09, dur: 0.5, vol: 0.08 })); },
  info() { tone({ f: 740, type: 'sine', dur: 0.12, vol: 0.06 }); tone({ f: 740, type: 'sine', t: 0.14, dur: 0.12, vol: 0.04 }); },
  whoosh() { noise({ dur: 0.9, vol: 0.2, type: 'bandpass', f: 200, f2: 4500, q: 0.8 }); tone({ f: 70, f2: 35, type: 'sine', dur: 0.9, vol: 0.12 }); },
  alarm() { for (let i = 0; i < 4; i++) tone({ f: i % 2 ? 640 : 880, type: 'square', t: i * 0.22, dur: 0.2, vol: 0.07, lp: 2200 }); },
  phone() { for (let i = 0; i < 6; i++) { tone({ f: 95, type: 'sawtooth', t: i * 0.09, dur: 0.07, vol: 0.12, lp: 500 }); noise({ t: i * 0.09, dur: 0.06, vol: 0.05, type: 'lowpass', f: 300 }); } },
  ring() { for (let k = 0; k < 2; k++) for (let i = 0; i < 4; i++) { tone({ f: 1250, type: 'sine', t: k * 0.7 + i * 0.07, dur: 0.05, vol: 0.06 }); tone({ f: 1580, type: 'sine', t: k * 0.7 + i * 0.07, dur: 0.05, vol: 0.05 }); } },
  door() { noise({ dur: 0.35, vol: 0.2, type: 'lowpass', f: 600, f2: 80 }); tone({ f: 90, f2: 45, type: 'sine', t: 0.05, dur: 0.4, vol: 0.2 }); },
  paper() { noise({ dur: 0.22, vol: 0.12, type: 'highpass', f: 2200, q: 0.5 }); noise({ t: 0.1, dur: 0.15, vol: 0.08, type: 'highpass', f: 3000 }); },
  keys() { for (let i = 0; i < 5; i++) noise({ t: i * 0.05 + Math.random() * 0.02, dur: 0.025, vol: 0.06, f: 3500 + Math.random() * 1500, q: 5 }); },
  heartbeat() { tone({ f: 62, f2: 40, type: 'sine', dur: 0.22, vol: 0.4 }); tone({ f: 58, f2: 38, type: 'sine', t: 0.2, dur: 0.26, vol: 0.3 }); },
  success() { [392, 494, 587, 784].forEach((f, i) => tone({ f, type: 'triangle', t: i * 0.14, dur: 1.2, vol: 0.09 })); tone({ f: 196, type: 'sine', dur: 2, vol: 0.12 }); },
  fail() { [330, 277, 233, 196].forEach((f, i) => tone({ f, type: 'sawtooth', t: i * 0.3, dur: 1.2, vol: 0.07, lp: 700 })); tone({ f: 55, f2: 30, type: 'sine', dur: 2.4, vol: 0.25 }); },
};

export function play(name) {
  try {
    if (muted) return;
    const c = ensure(); if (!c) return;
    if (c.state !== 'running') { c.resume().catch(() => {}); return; }
    const now = performance.now();
    if (name === 'type') { if (now - lastType < 45) return; lastType = now; }
    if (name === 'hover') { if (now - lastHover < 80) return; lastHover = now; }
    SFX[name]?.();
  } catch {}
}

/* ---------- generative music ---------- */
const MOODS = {
  title:   { root: 55.0, scale: [0, 3, 7, 10, 12, 15], drone: ['sawtooth', 'sawtooth'], lp: 380, pulse: 0.5, arp: 'triangle', step: 0.55, dens: 0.55, oct: 2, vol: 1 },
  tense:   { root: 49.0, scale: [0, 1, 5, 7, 10, 12], drone: ['sawtooth', 'square'], lp: 300, pulse: 0.8, arp: 'sine', step: 0.7, dens: 0.3, oct: 3, vol: 0.9 },
  lab:     { root: 58.3, scale: [0, 2, 3, 7, 9, 12], drone: ['triangle', 'sawtooth'], lp: 520, pulse: 0.4, arp: 'square', step: 0.35, dens: 0.5, oct: 3, vol: 0.7 },
  war:     { root: 46.2, scale: [0, 3, 5, 6, 10, 12], drone: ['sawtooth', 'sawtooth'], lp: 460, pulse: 0.3, arp: 'sawtooth', step: 0.3, dens: 0.6, oct: 2, vol: 0.8 },
  success: { root: 65.4, scale: [0, 4, 7, 11, 12, 16], drone: ['triangle', 'sine'], lp: 700, pulse: 0, arp: 'triangle', step: 0.5, dens: 0.6, oct: 3, vol: 0.9 },
  fail:    { root: 41.2, scale: [0, 1, 3, 6, 8, 11], drone: ['sawtooth', 'sawtooth'], lp: 240, pulse: 1.1, arp: 'sine', step: 0.9, dens: 0.25, oct: 3, vol: 0.9 },
};
let cur = null, curName = null, timer = null;
const hz = (root, semis) => root * Math.pow(2, semis / 12);

function stopCur(fadeS = 1.2) {
  if (timer) { clearInterval(timer); timer = null; }
  if (cur) {
    const c = cur; cur = null;
    try { c.g.gain.cancelScheduledValues(ctx.currentTime); c.g.gain.setTargetAtTime(0, ctx.currentTime, fadeS / 3); } catch {}
    setTimeout(() => { try { c.nodes.forEach((n) => { try { n.stop?.(); } catch {} try { n.disconnect(); } catch {} }); c.g.disconnect(); } catch {} }, fadeS * 1000 + 300);
  }
}
export function music(track) {
  try {
    if (!ensure()) return;
    if (track === curName) return;
    curName = track || null;
    stopCur();
    if (!track || !MOODS[track]) return;
    const m = MOODS[track];
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(musicBus);
    g.gain.setTargetAtTime(0.5 * m.vol, ctx.currentTime, 1.2);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = m.lp; lp.Q.value = 3; lp.connect(g);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = m.lp * 0.5; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    const nodes = [lfo];
    m.drone.forEach((ty, i) => {
      const o = ctx.createOscillator(); o.type = ty; o.frequency.value = m.root * (i ? 1.004 : 1);
      const og = ctx.createGain(); og.gain.value = i ? 0.1 : 0.14; o.connect(og); og.connect(lp); o.start(); nodes.push(o);
    });
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = m.root / 2; const sg = ctx.createGain(); sg.gain.value = 0.2; sub.connect(sg); sg.connect(g); sub.start(); nodes.push(sub);
    cur = { g, nodes };
    let n = 0;
    const tick = () => {
      if (!ctx || ctx.state !== 'running' || muted) return;
      n++;
      if (m.pulse && n % Math.max(1, Math.round(m.pulse / m.step * 2)) === 0) tone({ f: m.root, f2: m.root * 0.7, type: 'sine', dur: 0.4, vol: 0.18, bus: g });
      if (Math.random() < m.dens) {
        const s = m.scale[Math.floor(Math.random() * m.scale.length)];
        tone({ f: hz(m.root, s) * Math.pow(2, m.oct - 1), type: m.arp, dur: 1.4 + Math.random(), vol: 0.035, attack: 0.08, bus: g, lp: 1800 });
      }
    };
    timer = setInterval(tick, m.step * 1000);
  } catch {}
}
