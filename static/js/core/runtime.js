// Shared runtime: API client for the Python engine, event bus, server-synced clock, toasts,
// evidence pickups, app-window manager and drag helpers.
// Python owns every rule. This file only sends requests and shows what comes back.
import { icon } from './icons.js';

export { icon };

/* ------------------------------------------------------------------ dom */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** el('div', {class:'x', onclick:fn, html:'<b>hi</b>', style:{color:'red'}, dataset:{a:1}}, child, 'text') */
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const mmss = (sec) => { sec = Math.max(0, Math.floor(sec)); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; };
export const hms = (n) => { n = ((n % 86400) + 86400) % 86400; return [Math.floor(n / 3600), Math.floor((n % 3600) / 60), n % 60].map((x) => String(x).padStart(2, '0')).join(':'); };
export const toSec = (t) => { const [h, m, s] = String(t).split(':').map(Number); return h * 3600 + m * 60 + (s || 0); };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ------------------------------------------------------------------ bus */
const handlers = {};
export const bus = {
  on(evt, fn) { (handlers[evt] ||= new Set()).add(fn); return () => handlers[evt].delete(fn); },
  off(evt, fn) { handlers[evt]?.delete(fn); },
  emit(evt, data) { for (const fn of [...(handlers[evt] || [])]) { try { fn(data); } catch (e) { console.error('[bus]', evt, e); } } },
};

/* ------------------------------------------------------------------ sound (lazy, never throws) */
export function sfx(name) { import('./audio.js').then((a) => a.play(name)).catch(() => {}); }
export function music(track) { import('./audio.js').then((a) => a.music(track)).catch(() => {}); }

/* ------------------------------------------------------------------ scaling: everything is in rem */
export function initScale() {
  const fit = () => {
    const W = window.innerWidth, H = window.innerHeight;
    let w = W, h = (W * 9) / 16;
    if (h > H) { h = H; w = (H * 16) / 9; }
    const st = document.documentElement.style;
    st.setProperty('--sw', w + 'px'); st.setProperty('--sh', h + 'px');
    st.fontSize = w / 80 + 'px';   // 1280px wide stage -> 16px/rem
  };
  fit(); window.addEventListener('resize', fit);
}

/* ------------------------------------------------------------------ screens + fade */
export function showScreen(id) {
  for (const s of $$('.screen')) s.classList.toggle('on', s.id === 'screen-' + id);
  bus.emit('screen', id);
}
export async function fade(toBlack, ms = 550) { $('#fade').classList.toggle('on', toBlack); await sleep(ms); }

/* ------------------------------------------------------------------ session + state */
const SID_KEY = 'nf_sid_v2';
const mkSid = () => { const a = new Uint8Array(12); crypto.getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
export const session = { sid: store.get(SID_KEY) || (() => { const s = mkSid(); store.set(SID_KEY, s); return s; })() };
export const state = { s: null };
export const PLAYING = ['room1', 'room2', 'room3'];
const clockRef = { rem: 1800, at: performance.now(), running: false };
let lastPhase = null, lastRoom = null, endedFor = null;

export function setState(view) {
  if (!view) return;
  const prev = state.s;
  state.s = view;
  clockRef.rem = view.time_left; clockRef.at = performance.now();
  clockRef.running = !!view.started && PLAYING.includes(view.phase);
  bus.emit('state', view);
  if (view.phase !== lastPhase) { const p = lastPhase; lastPhase = view.phase; bus.emit('phase', { phase: view.phase, prev: p }); }
  if (prev && prev.room !== view.room) bus.emit('room', view.room);
  lastRoom = view.room;
  if ((view.phase === 'success' || view.phase === 'failed') && endedFor !== view.phase) { endedFor = view.phase; bus.emit('ended', view); }
  if (view.phase !== 'success' && view.phase !== 'failed') endedFor = null;
}
export function remaining() {
  if (!clockRef.running) return clockRef.rem;
  return Math.max(0, clockRef.rem - (performance.now() - clockRef.at) / 1000);
}

// 4 Hz tick for HUD effects; asks the server to confirm expiry. A 5 s heartbeat keeps the active-play clock honest.
let expiryAsked = false;
setInterval(() => {
  if (!state.s || !clockRef.running) { expiryAsked = false; return; }
  const r = remaining();
  bus.emit('tick', r);
  if (r <= 0 && !expiryAsked) { expiryAsked = true; refresh(); }
}, 250);
setInterval(() => { if (clockRef.running) refresh(); }, 5000);

const headers = () => ({ 'Content-Type': 'application/json', 'X-Session': session.sid });

export async function refresh() {
  try {
    const r = await fetch('api/state', { headers: headers() });
    if (r.ok) { const j = await r.json(); setState(j.state); return j.state; }
  } catch { /* offline: keep local clock */ }
  return null;
}
export async function health() {
  try { return await (await fetch('api/health')).json(); } catch { return { ok: false, llm: false }; }
}

/**
 * The one door to the Python engine. Resolves with the server's JSON ({ok, msg, events, state, ...data}).
 * Rule failures come back as ok:false (not exceptions). Network/HTTP failures throw.
 * opts: { silent: don't toast failures, quiet: don't play event feedback }
 */
export async function api(name, body = {}, opts = {}) {
  let r, j;
  try {
    r = await fetch('api/act/' + name, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    j = await r.json();
  } catch (e) {
    const err = new Error('Connection to the case server was lost.');
    if (!opts.silent) toast(err.message, 'error');
    throw err;
  }
  if (!r.ok) {
    const msg = typeof j.detail === 'string' ? j.detail : 'Request failed.';
    if (!opts.silent) toast(msg, 'error');
    throw new Error(msg);
  }
  if (j.state) setState(j.state);
  handleEvents(j.events || [], opts);
  if (j.ok === false && !opts.silent && j.msg) toast(j.msg, 'error');
  return j;
}

/* ------------------------------------------------------------------ server events -> feedback */
export function handleEvents(events, opts = {}) {
  for (const ev of events) {
    bus.emit('event', ev);
    if (opts.quiet) continue;
    if (ev.type === 'discover') { toast(`Evidence logged: ${ev.title}`, 'discover'); sfx('discover'); }
    else if (ev.type === 'penalty') { toast(`-${ev.secs}s  ${ev.why}`, 'penalty'); sfx('penalty'); shake(); redFlash(); }
    else if (ev.type === 'error') sfx('error');
    else if (ev.type === 'unlock') sfx('unlock');
  }
}
export function shake() {
  const t = $('#app .win') || $('#screen-room');
  if (!t) return;
  t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake');
  setTimeout(() => t.classList.remove('shake'), 500);
}
export function redFlash() {
  const f = $('#fx'); if (!f) return;
  f.classList.remove('hurt'); void f.offsetWidth; f.classList.add('hurt');
  setTimeout(() => f.classList.remove('hurt'), 700);
}
const KICK = { discover: 'Found', penalty: 'Penalty', info: 'Note', error: 'Error', unlock: 'Unlocked', good: 'Confirmed' };
export function toast(msg, kind = 'info') {
  const box = $('#toasts'); if (!box || !msg) return;
  while (box.children.length >= 4) box.firstChild.remove();
  const t = el('div', { class: `toast ${kind}` }, el('span', { class: 'k', text: KICK[kind] || 'Note' }), el('span', { text: msg }));
  box.append(t);
  setTimeout(() => t.remove(), 4000);
}

/* ------------------------------------------------------------------ evidence pickups */
// Evidence is not automatic: a view discovers something, the player decides to collect it.
// The server refuses to collect anything the player has not actually found.
export const EV_LABEL = {
  ev_statement: 'Draft public statement', ev_note: 'Handwritten recovery note', ev_pad: 'Pad impression',
  ev_slip: 'Loaner checkout slip', ev_fragments: 'Recovered paper strips', ev_counters: 'Console session counters',
  ev_it_cctv: 'IT notice: camera 04 clock drift', ev_it_asset: 'IT asset notice: LT-77', ev_legal: 'Legal: preservation notice',
  ev_alice_normal: "Alice Huang's normal email", ev_spoof: "'Final Transfer' email", ev_cctv: 'CCTV frame, camera 04',
  ev_recovery: 'RECOVERY_SEQUENCE.TXT',
};
export const holds = (id) => !!state.s?.evidence?.some((e) => e.id === id);
const offered = new Map();
export function offer(id) {
  if (!id || holds(id) || offered.has(id)) return;
  let host = $('#pickups');
  if (!host) return;
  const chip = el('button', { class: 'pickup', 'aria-label': 'Collect evidence: ' + (EV_LABEL[id] || id) },
    el('span', { class: 'pk-ic', html: icon('bag') }),
    el('span', { class: 'pk-t' }, el('small', { text: 'New evidence' }), el('b', { text: EV_LABEL[id] || id })),
    el('span', { class: 'pk-go', text: 'COLLECT' }));
  chip.onclick = async () => {
    chip.disabled = true;
    try {
      const j = await api('collect', { id }, { silent: true });
      if (j.ok === false) { toast(j.msg || 'Not collected.', 'error'); chip.disabled = false; return; }
      chip.classList.add('fly'); setTimeout(() => chip.remove(), 500); offered.delete(id);
      bus.emit('collected', id);
    } catch { chip.disabled = false; }
  };
  host.append(chip); offered.set(id, chip); sfx('info');
}
export function clearOffers() { for (const c of offered.values()) c.remove(); offered.clear(); }
bus.on('state', () => { for (const [id, c] of [...offered]) if (holds(id)) { c.remove(); offered.delete(id); } });

/* ------------------------------------------------------------------ app windows (#app overlay) */
let current = null;
export const isAppOpen = () => !!current;
/**
 * openApp(mod, data)  where mod = { id, title, eyebrow?, size?: 'sm'|'md'|'lg'|'xl', noEsc?, bare?, mount(body, ctx) -> cleanup? }
 * ctx = { id, data, win, body, state, api, el, icon, toast, sfx, bus, offer, close(), title(t, eyebrow), foot() -> {node, msg(text, cls)}, onClose(fn) }
 */
export function openApp(mod, data = {}) {
  closeApp(true);
  const host = $('#app');
  const closers = [];
  const wt = el('div', { class: 'wt' });
  const setTitle = (t, eyebrow) => { wt.innerHTML = (eyebrow ? `<small>${esc(eyebrow)}</small>` : '') + esc(t); };
  setTitle(mod.title || 'Inspect', mod.eyebrow || '');
  const x = el('button', { class: 'xbtn', 'aria-label': 'Close', html: icon('x'), onclick: () => closeApp() });
  const body = el('div', { class: 'wb' });
  const win = el('div', { class: `win ${mod.size || 'lg'}`, role: 'dialog', 'aria-label': mod.title || 'Inspect' }, el('div', { class: 'wh' }, wt, x), body);
  host.innerHTML = ''; host.append(win);
  host.style.display = 'block'; void host.offsetWidth; host.classList.add('on');
  let footNode = null;
  const ctx = {
    id: mod.id, data, win, body, api, el, icon, toast, sfx, bus, esc, mmss, offer, sleep,
    get state() { return state.s; },
    close: () => closeApp(),
    title: setTitle,
    onClose: (fn) => closers.push(fn),
    foot() {
      if (!footNode) { footNode = el('div', { class: 'foot' }, el('span', { class: 'msg' })); win.append(footNode); }
      const msgEl = footNode.querySelector('.msg');
      return { node: footNode, msg: (text, cls = '') => { msgEl.textContent = text; msgEl.className = 'msg ' + cls; } };
    },
  };
  current = { mod, ctx, closers, host };
  try {
    const cleanup = mod.mount(body, ctx);
    if (typeof cleanup === 'function') closers.push(cleanup);
    else if (cleanup && typeof cleanup.then === 'function') cleanup.then((c) => { if (typeof c === 'function') closers.push(c); }).catch((e) => { console.error(e); toast('This station failed to load.', 'error'); });
  } catch (e) { console.error(e); toast('This station failed to load.', 'error'); }
  bus.emit('app:open', mod.id);
  return ctx;
}
export function closeApp(silent = false) {
  if (!current) return;
  const { closers, host, mod } = current; current = null;
  for (const fn of closers) { try { fn(); } catch (e) { console.error(e); } }
  host.classList.remove('on');
  setTimeout(() => { if (!current) { host.style.display = ''; host.innerHTML = ''; } }, silent ? 0 : 350);
  if (silent) { host.style.display = ''; }
  bus.emit('app:close', mod.id);
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && current && !current.mod.noEsc) closeApp();
});

/* ------------------------------------------------------------------ drag helpers */
/**
 * dragDrop(node, { zones: () => Element[], onDrop(zone|null, ev, node), onStart, onMove, ghost=true })
 * Press and drag `node`; a ghost clone follows the pointer; the hovered zone gets class 'hot'.
 * Pointer events, so it works with mouse, pen and touch.
 */
export function dragDrop(node, { zones, onDrop, onStart, onMove, ghost = true, threshold = 4 } = {}) {
  node.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || ev.target.closest('[data-nodrag]')) return;
    const sx = ev.clientX, sy = ev.clientY;
    let started = false, g = null, hot = null;
    const move = (e) => {
      if (!started) {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) < threshold) return;
        started = true; node.classList.add('dragging');
        if (ghost) {
          g = node.cloneNode(true); g.classList.remove('dragging'); g.classList.add('ghost');
          g.style.width = node.getBoundingClientRect().width + 'px'; g.style.margin = '0';
          document.body.append(g);
        }
        onStart?.(node, e);
      }
      if (g) { g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px'; }
      let h = null;
      for (const z of zones ? zones() : []) {
        const r = z.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) h = z;
      }
      if (h !== hot) { hot?.classList.remove('hot'); hot = h; hot?.classList.add('hot'); }
      onMove?.(e, hot);
    };
    const up = (e) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      hot?.classList.remove('hot'); g?.remove(); node.classList.remove('dragging');
      if (started) onDrop?.(hot, e, node);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  });
}
/** moveDrag(node, { bounds: Element, onMove(x,y), onEnd(x,y), handle? }) free-position drag inside `bounds` (px, relative to bounds). */
export function moveDrag(node, { bounds, onMove, onEnd, handle } = {}) {
  (handle || node).addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || ev.target.closest('[data-nodrag]')) return;
    ev.preventDefault();
    const b = bounds.getBoundingClientRect(), n = node.getBoundingClientRect();
    const ox = ev.clientX - n.left, oy = ev.clientY - n.top;
    node.style.zIndex = 20;
    const pos = (e) => ({ x: clamp(e.clientX - b.left - ox, 0, b.width - n.width), y: clamp(e.clientY - b.top - oy, 0, b.height - n.height) });
    const move = (e) => { const p = pos(e); node.style.left = p.x + 'px'; node.style.top = p.y + 'px'; onMove?.(p.x, p.y, e); };
    const up = (e) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      node.style.zIndex = ''; const p = pos(e); onEnd?.(p.x, p.y, e);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  });
}

/* ------------------------------------------------------------------ misc */
export function typewriter(node, text, { speed = 24, onTick, signal } = {}) {
  return new Promise((resolve) => {
    let i = 0; node.textContent = '';
    const step = () => {
      if (signal?.aborted) { node.textContent = text; return resolve(); }
      i++; node.textContent = text.slice(0, i); onTick?.(text[i - 1]);
      if (i >= text.length) return resolve();
      setTimeout(step, /[.,!?]/.test(text[i - 1]) ? speed * 8 : speed);
    };
    step();
  });
}

/** Magnifier lens over `host`. Content inside `host` is cloned at 2.4x inside a round lens that follows the pointer. */
export function loupe(host, { zoom = 2.4, size = 9 } = {}) {
  host.style.position ||= 'relative';
  const lens = el('div', { class: 'lens' });
  const inner = el('div', { class: 'in' });
  lens.append(inner);
  host.append(lens);
  const refresh = () => {
    inner.innerHTML = '';
    for (const c of [...host.children]) if (c !== lens) inner.append(c.cloneNode(true));
    inner.style.width = host.clientWidth + 'px'; inner.style.height = host.clientHeight + 'px';
    inner.style.transform = `scale(${zoom})`;
  };
  refresh();
  const move = (e) => {
    const r = host.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const ls = lens.offsetWidth;
    lens.style.display = 'block';
    lens.style.left = x - ls / 2 + 'px'; lens.style.top = y - ls / 2 + 'px';
    inner.style.left = -(x * zoom - ls / 2) + 'px'; inner.style.top = -(y * zoom - ls / 2) + 'px';
  };
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerleave', () => { lens.style.display = 'none'; });
  host.style.cursor = 'zoom-in';
  return { refresh };
}
