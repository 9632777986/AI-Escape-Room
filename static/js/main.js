// Boot, flow control, room screen (scene + polygon hotspots + zoom), HUD, panels, endings.
import { $, el, esc, mmss, sleep, api, refresh, health, state, session, bus, setState, showScreen, fade, initScale, sfx, music,
  toast, openApp, closeApp, isAppOpen, clearOffers, holds, EV_LABEL } from './core/runtime.js';
import { icon } from './core/icons.js';
import * as audio from './core/audio.js';
import { playCine } from './screens/cine.js';
import { showTitle } from './screens/title.js';
import { showBriefing } from './screens/brief.js';
import { showEnding } from './screens/end.js';
import { APPS } from './apps/index.js';

const SCENES = { 1: { key: 'office', img: 'static/img/office.jpg', name: 'Executive Office', sub: 'Floor 14' },
  2: { key: 'forensics', img: 'static/img/forensics.jpg', name: 'Digital Forensics', sub: 'Lab' },
  3: { key: 'warroom', img: 'static/img/warroom.jpg', name: 'Incident Room', sub: 'War room' } };
const LABELS = { monitor: 'Computer', laptop: 'Laptop', desk: 'Desk', bin: 'Waste bin', cctv: 'CCTV monitor', statement: 'Wall statement', door: 'Door',
  logs: 'Log analyzer', route: 'Route display', fingerprint: 'Device rack', clock: 'Time sync', board: 'Evidence board', timeline: 'Timeline wall', findings: 'Findings table', response: 'Response console' };
const DONE_FLAG = { logs: 'r2_logs', fingerprint: 'r2_fingerprint', route: 'r2_route', clock: 'r2_clock', board: 'r3_board', timeline: 'r3_timeline', findings: 'r3_findings' };
const ROOM_CINE = { 2: 'room2', 3: 'room3' };
const DBG = new URLSearchParams(location.search).has('debug');
if (DBG) document.body.classList.add('dbg');

let HS = {}, hudBuilt = false, flowBusy = false, curRoom = 0, timerEl, objsEl, roomEl, badgeEl, navs = {};
const seenKey = () => 'nf_seen_' + session.sid;
const seen = () => { try { return JSON.parse(localStorage.getItem(seenKey()) || '[]'); } catch { return []; } };
const markSeen = (n) => { try { localStorage.setItem(seenKey(), JSON.stringify([...new Set([...seen(), n])])); } catch { /* ignore */ } };

/* ------------------------------------------------------------ boot */
async function boot() {
  initScale();
  const bar = $('#load-bar'), line = $('#load-line');
  const step = (p, t) => { bar.style.width = p + '%'; line.textContent = t; };
  step(15, 'LOADING CASE FILE');
  try { HS = await (await fetch('static/data/hotspots.json')).json(); } catch { toast('Could not load scene data.', 'error'); }
  step(45, 'PRELOADING SCENES');
  await Promise.all(Object.values(SCENES).map((s) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = s.img; })));
  step(75, 'CONNECTING TO CASE SERVER');
  const h = await health(); const st = await refresh();
  step(100, h.ok ? 'READY' : 'SERVER OFFLINE');
  await sleep(500);
  goTitle(st);
}
function hasSave(st) { return !!st && (st.started || ['intro', 'briefing'].includes(st.phase)) && !['success', 'failed'].includes(st.phase); }
function goTitle(st = state.s) {
  curRoom = 0; clearOffers(); closeApp(true); closePanel();
  showTitle({ hasSave: hasSave(st), onNew: newGame, onContinue: resume, onSettings: settings });
}

/* ------------------------------------------------------------ flow */
async function newGame() {
  if (flowBusy) return; flowBusy = true;
  try {
    await api('new'); try { localStorage.removeItem(seenKey()); } catch {}
    await api('phase', { to: 'intro' });
    await playCine('prologue');
    await api('phase', { to: 'briefing' });
    briefing();
  } finally { flowBusy = false; }
}
function briefing() {
  showBriefing({ onBegin: async () => { await fade(true, 400); const j = await api('begin'); if (j.ok === false) return; await enterRoom(1, true); await fade(false, 500); } });
}
async function resume() {
  const st = await refresh();
  if (!st) return;
  if (st.started && ['room1', 'room2', 'room3'].includes(st.phase)) { await fade(true, 400); await enterRoom(st.room, true); await fade(false, 500); }
  else if (st.phase === 'briefing') briefing();
  else newGame();
}
async function travel(to) {
  if (flowBusy) return; flowBusy = true;
  try {
    const j = await api('travel', { to }, { silent: true });
    if (j.ok === false) { toast(j.msg || 'Locked.', 'info'); sfx('error'); return; }
    closeApp(true);
    await fade(true, 450);
    await enterRoom(to);
    await fade(false, 500);
  } finally { flowBusy = false; }
}

/* ------------------------------------------------------------ room screen */
async function enterRoom(n, first = false) {
  curRoom = n; clearOffers();
  const S = SCENES[n];
  if (ROOM_CINE[n] && !seen().includes(n)) { markSeen(n); await playCine(ROOM_CINE[n]); }
  $('#scene-bg').src = S.img;
  $('#scene').style.transformOrigin = '50% 50%'; $('#scene').classList.remove('zoom'); $('#scene').style.transform = '';
  buildHotspots(n);
  buildHud();
  paintHud();
  showScreen('room');
  music(n === 1 ? 'tense' : n === 2 ? 'lab' : 'war');
  dust();
  if (first && n === 1) setTimeout(() => toast('Click objects in the office. The computer is a good place to start.', 'info'), 900);
}
function bbox(poly) {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { x0, y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
function buildHotspots(n) {
  const host = $('#hotspots'); host.innerHTML = '';
  const defs = HS[SCENES[n].key] || {};
  for (const [id, polys] of Object.entries(defs)) {
    for (const poly of polys) {
      const b = bbox(poly);
      const clip = 'polygon(' + poly.map(([x, y]) => `${((x - b.x0) / b.w * 100).toFixed(2)}% ${((y - b.y0) / b.h * 100).toFixed(2)}%`).join(',') + ')';
      const wrap = el('div', { class: 'hs' + (b.cy > 760 ? ' low' : ''), dataset: { id }, style: { left: b.x0 / 19.2 + '%', top: b.y0 / 10.8 + '%', width: b.w / 19.2 + '%', height: b.h / 10.8 + '%' } });
      const hit = el('button', { class: 'hit', 'aria-label': LABELS[id] || id, style: { clipPath: clip } });
      hit.onmouseenter = () => { wrap.classList.add('show'); sfx('hover'); }; hit.onmouseleave = () => wrap.classList.remove('show');
      hit.onfocus = () => wrap.classList.add('show'); hit.onblur = () => wrap.classList.remove('show');
      hit.onclick = () => activate(id, b);
      wrap.append(hit, el('span', { class: 'lab', text: LABELS[id] || id }), el('span', { class: 'ping' }));
      host.append(wrap);
    }
  }
}
function paintHotspots() {
  const s = state.s; if (!s) return;
  for (const w of $('#hotspots').children) {
    const id = w.dataset.id; const f = DONE_FLAG[id];
    w.classList.toggle('done', f ? !!s.flags[f] : s.stations.includes(id));
  }
}
async function activate(id, b) {
  if (isAppOpen() || flowBusy) return;
  sfx('click');
  if (id === 'door') return curRoom === 1 ? (state.s.unlocked['2'] ? travel(2) : (toast('The door is sealed. Unlock the archive from the console first.', 'info'), sfx('error'))) : null;
  const mod = APPS[id]; if (!mod) return;
  if (curRoom === 1 && ['monitor', 'laptop'].includes(id)) await api('interact', { target: id }, { silent: true, quiet: true });
  const sc = $('#scene'); sc.style.transformOrigin = `${b.cx / 19.2}% ${b.cy / 10.8}%`; sc.style.transform = 'scale(1.6)'; sc.classList.add('zoom');
  await sleep(420);
  openApp(mod);
}
bus.on('app:close', () => { const sc = $('#scene'); sc.style.transform = ''; sc.classList.remove('zoom'); paintHud(); });

/* ------------------------------------------------------------ HUD */
function buildHud() {
  const hud = $('#hud'); hud.innerHTML = '';
  roomEl = el('div', { class: 'h-room' }); objsEl = el('div', { class: 'objs' });
  timerEl = el('div', { class: 'timer' }, el('div', { class: 'lbl', html: 'Time<br>remaining' }), el('div', { class: 't', text: '30:00' }));
  hud.append(el('div', { class: 'h-top' }, el('div', { class: 'h-obj' }, roomEl, objsEl), timerEl));
  navs = { l: el('button', { class: 'nav l', onclick: () => travel(curRoom - 1) }), r: el('button', { class: 'nav r', onclick: () => travel(curRoom + 1) }) };
  hud.append(navs.l, navs.r);
  const dk = (id, ic, label, fn) => { const b = el('button', { class: 'dk', dataset: { id }, onclick: () => { sfx('click'); fn(); } }, el('span', { html: icon(ic, 'ic') }), label); return b; };
  badgeEl = el('b', { text: '0' });
  const ev = dk('ev', 'bag', 'Evidence', () => panel('evidence')); ev.append(badgeEl);
  hud.append(el('div', { class: 'dock' }, ev, dk('jr', 'book', 'Journal', () => panel('journal')), dk('hint', 'bulb', 'Hint', askHint),
    dk('gm', 'chat', 'Nightwatch', () => panel('gm')), dk('set', 'gear', 'Menu', settings)));
}
let lastCount = 0;
function paintHud() {
  const s = state.s; if (!s || !roomEl) return;
  const S = SCENES[curRoom] || SCENES[1];
  roomEl.innerHTML = `<small>${esc(S.sub)}</small>${esc(S.name)}`;
  const firstOpen = s.objectives.findIndex((o) => !o.done);
  objsEl.innerHTML = '';
  s.objectives.forEach((o, i) => objsEl.append(el('div', { class: 'obj' + (o.done ? ' done' : i === firstOpen ? ' on' : '') }, el('i'), el('span', { text: o.text }))));
  badgeEl.textContent = s.evidence.length; badgeEl.style.display = s.evidence.length ? '' : 'none';
  if (s.evidence.length !== lastCount) { badgeEl.classList.remove('pop'); void badgeEl.offsetWidth; badgeEl.classList.add('pop'); lastCount = s.evidence.length; }
  const prev = curRoom > 1, next = curRoom < 3;
  navs.l.hidden = !prev; navs.r.hidden = !next;
  if (prev) navs.l.innerHTML = `${icon('left')}<span>${SCENES[curRoom - 1].name}<small>GO BACK</small></span>`;
  if (next) { const open = s.unlocked[String(curRoom + 1)]; navs.r.classList.toggle('lock', !open); navs.r.innerHTML = `<span>${SCENES[curRoom + 1].name}<small>${open ? 'OPEN' : 'LOCKED'}</small></span>${icon(open ? 'right' : 'lock')}`; }
  paintHotspots();
  if (document.querySelector('#panel.on')) repaintPanel();
}
bus.on('state', paintHud);
bus.on('tick', (r) => { if (!timerEl) return; timerEl.querySelector('.t').textContent = mmss(r); timerEl.classList.toggle('warn', r <= 300 && r > 60); timerEl.classList.toggle('crit', r <= 60); });
bus.on('ended', async (v) => { closeApp(true); closePanel(); clearOffers(); await sleep(300); showEnding(v, { onRestart: async () => { await api('new'); newGame(); }, onTitle: async () => { await refresh(); goTitle(); } }); });
bus.on('event', (e) => { if (e.type === 'penalty') { const t = $('#timer'); void t; } });

/* ------------------------------------------------------------ panels */
let panelKind = null;
function closePanel() { panelKind = null; const p = $('#panel'); p.classList.remove('on'); setTimeout(() => { if (!panelKind) p.innerHTML = ''; }, 400); }
function panel(kind) {
  if (panelKind === kind) return closePanel();
  panelKind = kind; const p = $('#panel'); p.innerHTML = '';
  const titles = { evidence: 'Evidence', journal: 'Case journal', gm: 'Nightwatch' };
  const body = el('div', { class: 'wb' });
  const side = el('div', { class: 'side' }, el('div', { class: 'wh' }, el('div', { class: 'wt', text: titles[kind] }), el('button', { class: 'xbtn', 'aria-label': 'Close', html: icon('x'), onclick: closePanel })), body);
  p.append(side); p.style.display = 'block'; void p.offsetWidth; p.classList.add('on');
  if (kind === 'gm') mountGM(side, body);
  repaintPanel();
}
let selEv = null;
function repaintPanel() {
  const s = state.s; if (!s || !panelKind) return; const body = $('#panel .wb');
  if (panelKind === 'evidence') {
    body.innerHTML = '';
    if (!s.evidence.length) return body.append(el('div', { class: 'empty', text: 'Nothing collected yet. Interact with objects, then press COLLECT.' }));
    const slots = el('div', { class: 'slots' }); const detail = el('div', { class: 'detail' });
    const show = (e) => { selEv = e.id; detail.innerHTML = `<h4>${esc(e.title)}</h4><p>${esc(e.text)}</p>`; slots.querySelectorAll('.slot').forEach((n) => n.classList.toggle('sel', n.dataset.id === e.id)); };
    s.evidence.forEach((e) => slots.append(el('button', { class: 'slot has', dataset: { id: e.id }, title: e.title, html: icon(e.kind === 'email' ? 'mail' : e.kind === 'log' ? 'log' : 'paper', 'ic'), onclick: () => show(e) })));
    body.append(slots, detail); show(s.evidence.find((e) => e.id === selEv) || s.evidence[s.evidence.length - 1]);
  } else if (panelKind === 'journal') {
    body.innerHTML = '';
    if (!s.evidence.length) body.append(el('div', { class: 'empty', text: 'Your findings will be written here.' }));
    [...s.evidence].reverse().forEach((e) => body.append(el('div', { class: 'jr' }, el('div', { class: 'm', text: `Room ${e.room} / ${e.kind}` }), el('b', { text: e.title }), el('p', { text: e.text }))));
  }
}
function mountGM(side, body) {
  const log = el('div', { class: 'chat' }); body.append(log);
  const add = (who, t) => { const m = el('div', { class: 'msgb ' + (who === 'me' ? 'me' : 'gm') }, who === 'me' ? null : el('span', { class: 'w', text: 'Nightwatch' }), el('span', { text: t })); log.append(m); body.scrollTop = body.scrollHeight; return m; };
  add('gm', 'Nightwatch online. I can describe what you have seen and nudge you. I do not hold the answers and I cannot unlock anything.');
  (gmHistory).forEach(([w, t]) => add(w, t));
  const input = el('input', { placeholder: 'Ask Nightwatch…', 'aria-label': 'Message', maxlength: 300 });
  const send = async () => {
    const t = input.value.trim(); if (!t) return; input.value = ''; add('me', t); gmHistory.push(['me', t]);
    const wait = el('div', { class: 'msgb gm typing' }, el('i'), el('i'), el('i')); log.append(wait);
    const j = await api('gm', { text: t }, { silent: true, quiet: true }).catch(() => null); wait.remove();
    const r = j?.reply || 'Connection lost.'; add('gm', r); gmHistory.push(['gm', r]);
  };
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') send(); });
  side.append(el('div', { class: 'chatin' }, input, el('button', { class: 'btn sm', text: 'SEND', onclick: send })));
  setTimeout(() => input.focus(), 450);
}
const gmHistory = [];
async function askHint() {
  const j = await api('hint', {}, { silent: true }).catch(() => null);
  if (!j) return;
  if (j.ok === false) return toast(j.msg || 'No hint.', 'info');
  const msg = j.hint || j.msg; gmHistory.push(['gm', 'Hint: ' + msg]);
  toast(`Hint (${state.s.hints_left} left): ${msg}`, 'info'); sfx('info');
}

/* ------------------------------------------------------------ settings */
function settings() {
  const m = $('#modal'); m.innerHTML = ''; m.style.display = 'block'; m.classList.add('on');
  const close = () => { m.classList.remove('on'); m.style.display = ''; m.innerHTML = ''; };
  const vol = el('input', { type: 'range', class: 'rng', min: 0, max: 100, value: Math.round(audio.getVolume() * 100), oninput: (e) => audio.setVolume(e.target.value / 100) });
  const mute = el('button', { class: 'btn ghost sm', text: audio.isMuted() ? 'UNMUTE' : 'MUTE', onclick: (e) => { audio.setMuted(!audio.isMuted()); e.target.textContent = audio.isMuted() ? 'UNMUTE' : 'MUTE'; } });
  const inGame = state.s?.started && ['room1', 'room2', 'room3'].includes(state.s.phase);
  m.append(el('div', { class: 'mbox' }, el('h3', { text: 'Menu' }), el('div', { class: 'p', text: 'Sound' }), el('div', { style: { display: 'flex', gap: '1rem', alignItems: 'center' } }, vol, mute),
    el('div', { class: 'row' },
      inGame ? el('button', { class: 'btn ghost', text: 'TITLE', onclick: () => { close(); goTitle(); } }) : null,
      inGame ? el('button', { class: 'btn danger', text: 'RESTART CASE', onclick: async () => { close(); await api('new'); newGame(); } }) : null,
      el('button', { class: 'btn', text: 'RESUME', onclick: close }))));
}

/* ------------------------------------------------------------ dust */
let dustOn = false;
function dust() {
  if (dustOn) return; dustOn = true;
  const cv = $('#dust'), c = cv.getContext('2d'); cv.width = 960; cv.height = 540;
  const ps = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + .4, v: Math.random() * .00004 + .00001, d: Math.random() * 6 }));
  let last = performance.now();
  (function loop(t) { const dt = t - last; last = t; c.clearRect(0, 0, 960, 540);
    if ($('#screen-room').classList.contains('on')) for (const p of ps) { p.y -= p.v * dt; p.x += Math.sin(t / 3000 + p.d) * .00004 * dt; if (p.y < 0) { p.y = 1; p.x = Math.random(); } c.fillStyle = `rgba(200,230,210,${.12 + .1 * Math.sin(t / 900 + p.d)})`; c.beginPath(); c.arc(p.x * 960, p.y * 540, p.r, 0, 7); c.fill(); }
    requestAnimationFrame(loop); })(last);
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !isAppOpen() && panelKind) closePanel(); });
window.addEventListener('pointerdown', () => audio.init(), { once: true });
boot();
void setState; void holds; void EV_LABEL;
