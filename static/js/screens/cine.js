// Cinematic player: letterboxed, one line at a time, typewriter + deliberate pauses, phone call beat.
import { $, el, esc, showScreen, music, sfx, sleep } from '../core/runtime.js';
import { icon } from '../core/icons.js';
import { SCRIPTS } from '../story.js';
import * as audio from '../core/audio.js';

const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

const PORTRAITS = {
  voss: `<svg viewBox="0 0 240 300" aria-hidden="true"><defs><linearGradient id="pv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16262c"/><stop offset="1" stop-color="#05090b"/></linearGradient><linearGradient id="pr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#76b900" stop-opacity="0"/><stop offset="1" stop-color="#a6ee35" stop-opacity=".9"/></linearGradient></defs>
    <path d="M10 300c0-62 38-96 110-100 72 4 110 38 110 100z" fill="url(#pv)"/><path d="M230 300c0-62-38-96-110-100" fill="none" stroke="url(#pr)" stroke-width="3"/>
    <rect x="104" y="170" width="32" height="36" fill="#0c171b"/>
    <ellipse cx="120" cy="120" rx="40" ry="50" fill="url(#pv)"/>
    <path d="M76 118c-6-52 30-80 66-72 34 8 38 48 28 86-4-30-12-46-30-52-26 2-46 12-64 38z" fill="#05090b"/>
    <path d="M160 70c14 14 22 40 12 84" fill="none" stroke="url(#pr)" stroke-width="3"/>
    <path d="M80 126c0 10 4 20 8 26" fill="none" stroke="#a6ee35" stroke-width="3" stroke-linecap="round"/><path d="M88 152c6 8 16 12 26 10" fill="none" stroke="#a6ee35" stroke-width="2.5" stroke-linecap="round"/><circle cx="116" cy="162" r="4" fill="#a6ee35"/></svg>`,
  ceo: `<svg viewBox="0 0 240 300" aria-hidden="true"><defs><linearGradient id="pc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2230"/><stop offset="1" stop-color="#05070b"/></linearGradient><linearGradient id="pcr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#46c3ff" stop-opacity="0"/><stop offset="1" stop-color="#46c3ff" stop-opacity=".8"/></linearGradient></defs>
    <path d="M0 300c0-64 40-100 120-104 80 4 120 40 120 104z" fill="url(#pc)"/><path d="M240 300c0-64-40-100-120-104" fill="none" stroke="url(#pcr)" stroke-width="3"/>
    <path d="M120 200l-22 40 22 60 22-60z" fill="#090d14"/><path d="M96 198l24 28 24-28" fill="none" stroke="#2d3850" stroke-width="3"/>
    <rect x="104" y="166" width="32" height="38" fill="#0b0f16"/>
    <ellipse cx="120" cy="116" rx="38" ry="48" fill="url(#pc)"/>
    <path d="M82 104c2-38 24-52 42-50 24 2 36 22 34 50-8-18-22-26-40-26-14 0-28 8-36 26z" fill="#05070b"/>
    <path d="M156 78c12 12 16 34 8 66" fill="none" stroke="url(#pcr)" stroke-width="3"/></svg>`,
};

let sess = null;

function buildDOM(root) {
  root.innerHTML = '';
  const bg = el('div', { class: 'c-bg dim' }, el('img', { alt: '' }));
  const tint = el('div', { class: 'c-tint', style: { background: 'radial-gradient(ellipse at 50% 55%,transparent 40%,rgba(0,8,6,.55))' } });
  const fx = el('canvas', { id: 'cine-fx' });
  const barT = el('div', { class: 'c-bar t' }), barB = el('div', { class: 'c-bar b' });
  const stamp = el('div', { class: 'c-stamp s-hide' });
  const portrait = el('div', { class: 'portrait' });
  const title = el('div', { class: 'c-title' });
  const who = el('div', { class: 'c-who' }), line = el('div', { class: 'c-line' });
  const text = el('div', { class: 'c-text' }, who, line);
  const phone = el('div', { class: 'phone s-hide' });
  const skip = el('button', { class: 'btn ghost sm', html: `SKIP ${icon('skip')}`, 'aria-label': 'Skip cinematic' });
  const mute = el('button', { class: 'btn ghost sm', 'aria-label': 'Toggle sound', html: icon(audio.isMuted() ? 'mute' : 'volume') });
  const ctrl = el('div', { class: 'c-ctrl' }, mute, skip);
  const hint = el('div', { class: 'c-hint', text: 'CLICK OR SPACE TO ADVANCE   /   ESC TO SKIP' });
  const black = el('div', { class: 's-black' });
  root.append(bg, tint, fx, barT, barB, stamp, portrait, title, text, phone, ctrl, hint, black);
  return { bg, fx, stamp, portrait, title, who, line, text, phone, skip, mute, hint, black };
}

function embers(canvas, isStopped) {
  const c = canvas.getContext('2d'); if (!c) return;
  const resize = () => { canvas.width = canvas.clientWidth || 1280; canvas.height = canvas.clientHeight || 720; };
  resize();
  const P = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.8 + .4, s: Math.random() * .00025 + .00008, a: Math.random() * .5 + .15, d: Math.random() * 6 }));
  let last = performance.now();
  const loop = (t) => {
    if (isStopped()) return;
    const dt = t - last; last = t;
    c.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of P) {
      p.y -= p.s * dt; p.x += Math.sin(t / 2600 + p.d) * .00005 * dt; if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
      c.beginPath(); c.fillStyle = `rgba(166,238,53,${p.a * (.6 + .4 * Math.sin(t / 900 + p.d))})`;
      c.arc(p.x * canvas.width, p.y * canvas.height, p.r * (canvas.width / 1280), 0, 7); c.fill();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export async function playCine(id) {
  const script = SCRIPTS[id];
  if (!script) return;
  if (sess) sess.abort();
  const root = $('#screen-cine');
  const d = buildDOM(root);
  showScreen('cine');
  audio.init();

  const S = { aborted: false, waiter: null, typing: false, skipType: false, phoneTimer: null };
  sess = { abort: () => { S.aborted = true; S.waiter?.(); } };
  const rm = reduced();

  const wait = (ms, interruptible = true) => new Promise((res) => {
    if (S.aborted) return res();
    const done = () => { clearTimeout(t); S.waiter = null; res(); };
    const t = setTimeout(done, rm ? Math.min(ms, 500) : ms);
    S.waiter = interruptible ? done : null;
  });
  const advance = () => { if (S.typing) S.skipType = true; else S.waiter?.(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); sess.abort(); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advance(); }
  };
  const onClick = (e) => { if (e.target.closest('.c-ctrl') || e.target.closest('.phone')) return; advance(); };
  window.addEventListener('keydown', onKey);
  root.addEventListener('click', onClick);
  d.skip.onclick = () => sess.abort();
  d.mute.onclick = () => { audio.setMuted(!audio.isMuted()); d.mute.innerHTML = icon(audio.isMuted() ? 'mute' : 'volume'); };
  embers(d.fx, () => S.aborted && !root.classList.contains('on'));

  const type = async (text, node, say) => {
    node.className = 'c-line' + (say ? ' say' : '');
    node.innerHTML = '';
    const span = el('span'), cur = el('span', { class: 'cur' });
    node.append(span, cur);
    S.typing = true; S.skipType = false;
    const speed = say ? 30 : 38;
    for (let i = 1; i <= text.length; i++) {
      if (S.aborted || S.skipType) { span.textContent = text; break; }
      span.textContent = text.slice(0, i);
      if (text[i - 1] !== ' ') sfx('type');
      await sleep(/[.,!?:]/.test(text[i - 1]) ? speed * 7 : speed);
    }
    span.textContent = text;
    S.typing = false;
    d.hint.classList.add('on');
  };
  const clearText = async () => {
    d.hint.classList.remove('on');
    d.line.classList.add('s-out'); d.who.classList.add('s-out');
    await sleep(rm ? 0 : 450);
    d.line.innerHTML = ''; d.who.textContent = '';
    d.line.classList.remove('s-out'); d.who.classList.remove('s-out');
  };
  let textShown = false;

  const setScene = async (url, dim) => {
    const first = !d.bg.querySelector('img').getAttribute('src');
    if (!first) { sfx('whoosh'); d.bg.style.opacity = 0; await sleep(rm ? 0 : 900); }
    const img = d.bg.querySelector('img');
    d.bg.classList.toggle('dim', dim !== false);
    img.src = url;
    img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
    if (first) d.bg.style.opacity = 0;
    void d.bg.offsetWidth; d.bg.style.opacity = 1;
    await sleep(first ? 500 : 700);
  };
  const setPortrait = (name) => {
    d.portrait.innerHTML = PORTRAITS[name] || '';
    d.portrait.classList.add('on');
    d.text.classList.add('s-withp');
  };
  const hidePortrait = () => { d.portrait.classList.remove('on'); d.text.classList.remove('s-withp'); };

  const phoneBeat = async (cfg) => {
    d.phone.classList.remove('s-hide', 'ans');
    d.phone.innerHTML = `<div class="av">${icon('user')}</div><div class="nm">${esc(cfg.name)}</div><div class="sb">${esc(cfg.sub)} / incoming</div>` +
      `<button class="btn" data-ans>ANSWER ${icon('play')}</button>`;
    let answered = false;
    const ringOnce = () => { sfx('phone'); setTimeout(() => sfx('ring'), 650); };
    ringOnce(); S.phoneTimer = setInterval(ringOnce, 1900);
    await new Promise((res) => {
      const ans = () => { if (answered) return; answered = true; res(); };
      d.phone.querySelector('[data-ans]').onclick = ans;
      const t = setTimeout(ans, rm ? 400 : 5200);
      const poll = setInterval(() => { if (S.aborted) { clearInterval(poll); clearTimeout(t); ans(); } }, 100);
    });
    clearInterval(S.phoneTimer); S.phoneTimer = null;
    d.phone.classList.add('ans');
    d.phone.querySelector('.sb').textContent = 'CONNECTED';
    d.phone.querySelector('[data-ans]').remove();
    sfx('click');
    await sleep(900);
    d.phone.classList.add('s-hide');
  };

  requestAnimationFrame(() => root.classList.add('live'));
  await sleep(rm ? 100 : 1200);

  try {
    for (const st of script) {
      if (S.aborted) break;
      if (st.music !== undefined) music(st.music);
      if (st.scene) await setScene(st.scene, st.dim);
      if (st.stamp !== undefined) {
        if (st.stamp) { d.stamp.innerHTML = `<i></i>${esc(st.stamp)}`; d.stamp.classList.remove('s-hide'); } else d.stamp.classList.add('s-hide');
      }
      if (st.sfx && !st.line) sfx(st.sfx);
      if (st.fx === 'shake' && !rm) { root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake'); setTimeout(() => root.classList.remove('shake'), 500); }
      if (st.fx === 'flash') { const f = el('div', { class: 's-flash' }); root.append(f); setTimeout(() => f.remove(), 700); }
      if (st.hidePortrait) hidePortrait();
      if (st.title) {
        d.title.innerHTML = `<b>${esc(st.title)}</b>${st.sub ? `<span>${esc(st.sub)}</span>` : ''}`;
        sfx('whoosh');
        await wait(3300, false);
        d.title.innerHTML = '';
      }
      if (st.phone) await phoneBeat(st.phone);
      if (st.pause && !st.line && !st.say) await wait(st.pause, false);
      if (st.line || st.say) {
        const say = !!st.say;
        if (say) { setPortrait(st.portrait); d.who.textContent = st.who || ''; }
        else d.who.textContent = '';
        if (st.sfx) sfx(st.sfx);
        await type(say ? `“${st.say}”` : st.line, d.line, say);
        textShown = true;
        await wait(st.pause || 1400);
        if (S.aborted) break;
        await clearText();
      }
    }
  } finally {
    clearInterval(S.phoneTimer);
    window.removeEventListener('keydown', onKey);
    root.removeEventListener('click', onClick);
    S.aborted = true;
    root.classList.remove('live');
    d.black.classList.add('on');
    await sleep(rm ? 0 : 650);
    if (sess && sess.abort) sess = null;
  }
}
