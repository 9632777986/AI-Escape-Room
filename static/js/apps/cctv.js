// CCTV review. Footage is drawn live on a canvas from the camera's own clock.
// The player scrubs, finds the frame that matters and marks it; Python validates the mark.
// Note: the camera's clock is NOT system time. Nothing on screen says how far off it is.
import { el, icon, hms, toSec, clamp } from '../core/runtime.js';

const W = 640, H = 360, VP = { x: 320, y: 150 };

// What the camera "saw" (camera clock). Rendering needs it; the server decides what counts as a valid mark.
const SEEN = { in: '22:03:17', alcove: '22:03:52', out0: '22:04:57', out: '22:05:09' };

function figure(c, t) {
  const tin = toSec(SEEN.in), ta = toSec(SEEN.alcove), t0 = toSec(SEEN.out0), tout = toSec(SEEN.out);
  if (t < tin || t > tout) return null;
  let d, x;
  if (t < ta) { const k = (t - tin) / (ta - tin); d = .06 + k * .5; x = k * .34; }
  else if (t < t0) { d = .56; x = .34; }
  else { const k = (t - t0) / (tout - t0); d = .56 - k * .5; x = .34 * (1 - k); }
  return { d, x, walking: t < ta || t >= t0 };
}

function drawCam(c, t, f, noise) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a1613'); g.addColorStop(.5, '#0f1f1b'); g.addColorStop(1, '#081210');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // walls + floor + ceiling in perspective
  const poly = (pts, fill) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fillStyle = fill; c.fill(); };
  poly([[0, 0], [W, 0], [VP.x + 34, VP.y - 38], [VP.x - 34, VP.y - 38]], '#0b1816');
  poly([[0, H], [W, H], [VP.x + 34, VP.y + 36], [VP.x - 34, VP.y + 36]], '#13221f');
  poly([[0, 0], [VP.x - 34, VP.y - 38], [VP.x - 34, VP.y + 36], [0, H]], '#0d1b19');
  poly([[W, 0], [VP.x + 34, VP.y - 38], [VP.x + 34, VP.y + 36], [W, H]], '#0d1b19');
  // floor lines and ceiling lights
  c.strokeStyle = 'rgba(120,200,170,.10)'; c.lineWidth = 1;
  for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(VP.x + i * 5, VP.y + 36); c.lineTo(VP.x + i * 105, H); c.stroke(); }
  for (let k = 1; k < 7; k++) {
    const p = k / 7, y = VP.y - 38 - (VP.y - 38) * Math.pow(1 - p, 1.7) * -1;
    const yy = (VP.y - 38) * (1 - Math.pow(1 - p, 2.2));
    const w = 20 + 140 * Math.pow(p, 1.8), cx = VP.x;
    const flick = k === 4 ? (Math.sin(f / 7) > .92 ? .25 : 1) : 1;
    c.fillStyle = `rgba(190,255,230,${.55 * flick})`; c.fillRect(cx - w / 2, yy * .98 + 3, w, 3 + 4 * p); void y;
  }
  // far door (opens while the person is inside)
  const open = t >= toSec(SEEN.in) - 4 && t <= toSec(SEEN.out) + 3;
  c.fillStyle = open ? 'rgba(200,255,225,.55)' : '#050b0a'; c.fillRect(VP.x - 28, VP.y - 30, 56, 64);
  c.strokeStyle = '#2d4a43'; c.lineWidth = 2; c.strokeRect(VP.x - 28, VP.y - 30, 56, 64);
  c.fillStyle = '#6bd9a8'; c.font = '8px monospace'; c.fillText('C04', VP.x - 9, VP.y - 34);
  // server alcove on the right wall
  poly([[470, 120], [560, 98], [560, 262], [470, 232]], '#07100f');
  for (let i = 0; i < 6; i++) { c.fillStyle = (Math.floor(f / (9 + i * 3)) + i) % 3 ? '#38e08a' : '#0a2a1c'; c.fillRect(486 + (i % 2) * 22, 128 + Math.floor(i / 2) * 28 - (i % 2) * 4, 5, 3); }
  // figure
  const p = figure(c, t);
  if (p) {
    const s = .36 + 1.25 * p.d, bx = VP.x + p.x * 250 * (.4 + p.d), by = VP.y + 36 + p.d * 190;
    const bob = p.walking ? Math.sin(f / 4) * 2 * s : Math.sin(f / 26) * .8;
    c.save(); c.translate(bx, by);
    c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.ellipse(0, 2, 22 * s, 5 * s, 0, 0, 7); c.fill();
    const leg = p.walking ? Math.sin(f / 4) * 7 * s : 0;
    c.fillStyle = '#0a0f12';
    c.fillRect(-9 * s + leg, -38 * s, 7 * s, 38 * s); c.fillRect(2 * s - leg, -38 * s, 7 * s, 38 * s);
    c.fillStyle = '#12191d'; c.beginPath(); c.moveTo(-14 * s, -38 * s + bob); c.lineTo(14 * s, -38 * s + bob); c.lineTo(11 * s, -82 * s + bob); c.lineTo(-11 * s, -82 * s + bob); c.closePath(); c.fill();
    c.fillStyle = '#1b262c'; c.fillRect(-15 * s, -80 * s + bob, 5 * s, 30 * s);
    c.fillStyle = '#1a2a31'; c.fillRect(-20 * s, -66 * s + bob, 16 * s, 24 * s);          // laptop sleeve
    c.strokeStyle = 'rgba(120,220,180,.35)'; c.lineWidth = 1; c.strokeRect(-20 * s, -66 * s + bob, 16 * s, 24 * s);
    c.fillStyle = '#0e1417'; c.beginPath(); c.arc(0, -92 * s + bob, 9 * s, 0, 7); c.fill();
    const glare = c.createRadialGradient(0, -92 * s + bob, 1, 0, -92 * s + bob, 15 * s);   // glare hides the face
    glare.addColorStop(0, 'rgba(255,255,255,.95)'); glare.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = glare; c.fillRect(-18 * s, -112 * s + bob, 36 * s, 36 * s);
    c.restore();
  }
  // camera look: green tint, scanlines, vignette, noise
  c.fillStyle = 'rgba(30,120,80,.10)'; c.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 3) { c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, y, W, 1); }
  const v = c.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .95);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.65)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
  for (let i = 0; i < noise; i++) { c.fillStyle = `rgba(200,255,230,${Math.random() * .25})`; c.fillRect(Math.random() * W, Math.random() * H, 2, 1); }
  if (f % 90 > 84) { c.fillStyle = 'rgba(200,255,230,.06)'; c.fillRect(0, (f * 7) % H, W, 6); }
}

export default {
  id: 'cctv', title: 'CCTV Review', eyebrow: 'Executive Office / Wall Monitor', size: 'xl',
  async mount(body, ctx) {
    const r = await ctx.api('interact', { target: 'cctv' }, { silent: true, quiet: true });
    if (r.ok === false) { body.append(el('div', { class: 'pane', text: r.msg || 'Nothing here.' })); return; }
    const cam = r.cctv, a = toSec(cam.start), z = toSec(cam.end), total = z - a;
    let marked = !!r.marked, t = 0, playing = false, speed = 1, last = performance.now(), frame = 0, raf = 0, dead = false;
    const foot = ctx.foot(); foot.msg('Scrub the footage. Mark the frame where something is wrong.');

    const cv = el('canvas', { width: W, height: H, class: 'v-cam' });
    const c = cv.getContext('2d');
    const stamp = el('div', { class: 'v-stamp' });
    const view = el('div', { class: 'cc-view v-ccview' }, cv, stamp,
      el('div', { class: 'v-rec' }, el('i'), ' REC'), el('div', { class: 'v-camname', text: cam.camera }));
    const slider = el('input', { type: 'range', class: 'rng', min: 0, max: total, step: 1, value: 0, 'aria-label': 'Footage position' });
    const tm = el('div', { class: 'tm', text: cam.start });
    const play = el('button', { class: 'btn ghost sm', 'aria-label': 'Play', html: icon('play') });
    const back = el('button', { class: 'btn ghost sm', 'aria-label': 'Back one second', html: icon('left') });
    const fwd = el('button', { class: 'btn ghost sm', 'aria-label': 'Forward one second', html: icon('right') });
    const spd = el('button', { class: 'btn ghost sm', text: 'x1', 'aria-label': 'Playback speed' });
    const mark = el('button', { class: 'btn', html: `${icon('flag')} MARK THIS FRAME` });
    const ctrl = el('div', { class: 'cc-ctrl' }, play, back, fwd, spd, el('div', { class: 'sc' }, slider), tm, mark);

    const side = el('div', { class: 'cc-side' }, el('div', { class: 'eyebrow', text: 'Cameras' }));
    const tiles = [['CAM 01 LOBBY', 0], ['CAM 02 GARAGE', 1], ['CAM 03 STAIRS', 2], [cam.camera, 3]].map(([n, i]) => {
      const t0 = el('canvas', { width: 160, height: 90 });
      const b = el('button', { class: 'cam' + (i === 3 ? ' on' : ''), 'aria-label': n }, t0, el('span', { text: n }));
      b.onclick = () => { if (i !== 3) { foot.msg(`${n}: no motion recorded in this window.`); ctx.sfx('error'); } };
      side.append(b); return t0;
    });
    const log = el('div', { class: 'v-log' });
    side.append(log);

    const setT = (v) => { t = clamp(v, 0, total); slider.value = t; };
    const paintLog = (events) => {
      log.innerHTML = '';
      if (!events?.length) return;
      log.append(el('div', { class: 'eyebrow', text: 'Motion log (camera clock)' }));
      for (const e of events) log.append(el('div', { class: 'v-ev', html: `<b>${esc2(e.t)}</b> ${esc2(e.text)}` }));
    };
    const esc2 = (s) => String(s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
    if (marked) paintLog(cam.events);

    play.onclick = () => { playing = !playing; play.innerHTML = icon(playing ? 'pause' : 'play'); play.setAttribute('aria-label', playing ? 'Pause' : 'Play'); ctx.sfx('click'); if (playing && t >= total) setT(0); };
    back.onclick = () => { playing = false; play.innerHTML = icon('play'); setT(t - 1); };
    fwd.onclick = () => { playing = false; play.innerHTML = icon('play'); setT(t + 1); };
    spd.onclick = () => { speed = speed === 1 ? 4 : speed === 4 ? 8 : 1; spd.textContent = 'x' + speed; };
    slider.oninput = () => { t = +slider.value; };
    mark.onclick = async () => {
      mark.disabled = true;
      const j = await ctx.api('cctv_mark', { t: hms(a + Math.round(t)) }, { silent: true, quiet: true }).catch(() => null);
      mark.disabled = false;
      if (!j) return;
      if (j.marked) {
        marked = true; playing = false; play.innerHTML = icon('play'); ctx.sfx('discover');
        foot.msg(`Frame marked at ${j.t}. A person is carrying something. The face is lost in glare.`, 'ok');
        const rr = await ctx.api('interact', { target: 'cctv' }, { silent: true, quiet: true }); paintLog(rr.cctv?.events);
        ctx.offer('ev_cctv');
      } else { ctx.sfx('error'); foot.msg(j.msg || 'Nothing of interest in this frame.', 'bad'); }
    };
    body.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' && e.target !== slider) return;
      if (e.key === ' ') { e.preventDefault(); play.click(); } else if (e.key === 'ArrowLeft') back.click(); else if (e.key === 'ArrowRight') fwd.click();
    });

    body.append(el('div', { class: 'cctv' }, el('div', { class: 'cc-main' }, view, ctrl), side));

    function loop(now) {
      if (dead) return;
      const dt = (now - last) / 1000; last = now; frame++;
      if (playing) { setT(t + dt * speed); if (t >= total) { playing = false; play.innerHTML = icon('play'); } }
      const sec = a + Math.floor(t);
      drawCam(c, sec, frame, 90);
      tm.textContent = hms(sec);
      stamp.textContent = `2026-11-13  ${hms(sec)}`;
      tiles.forEach((t0, i) => { if (i < 3 && frame % 4 === 0) { const x = t0.getContext('2d'); x.fillStyle = '#05100d'; x.fillRect(0, 0, 160, 90); for (let k = 0; k < 160; k++) { x.fillStyle = `rgba(160,230,200,${Math.random() * .25})`; x.fillRect(Math.random() * 160, Math.random() * 90, 2, 1); } x.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < 90; y += 3) x.fillRect(0, y, 160, 1); } else if (i === 3 && frame % 4 === 0) { const x = t0.getContext('2d'); x.drawImage(cv, 0, 0, 160, 90); } });
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => { dead = true; cancelAnimationFrame(raf); };
  },
};
