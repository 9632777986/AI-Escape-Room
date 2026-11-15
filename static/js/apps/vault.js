// Archive vault: five rotating digit wheels. The code is checked by Python (action 'keypad'); nothing here knows it.
import { el, icon, state } from '../core/runtime.js';

export function mountVault(host, ctx, opts = {}) {
  const digits = [0, 0, 0, 0, 0];
  let busy = false, dead = false, timer = 0, sel = 0;
  const lamp = el('div', { class: 'vt-lamp' });
  const wheels = el('div', { class: 'vt-wheels' });
  const msg = el('div', { class: 'vt-msg' });
  const go = el('button', { class: 'btn', html: `${icon('unlock')} UNLOCK ARCHIVE` });
  const root = el('div', { class: 'vault', tabindex: '0' },
    el('div', { class: 'eyebrow', text: 'exec.archive.lock  /  5-digit recovery key' }),
    lamp, wheels, msg, go,
    el('div', { class: 'vt-hint', text: 'Click the arrows, scroll, or type digits. Three wrong keys lock the pad and cost time.' }));
  host.append(root);

  const wEls = digits.map((_, i) => {
    const num = el('div', { class: 'vt-n', text: '0' });
    const w = el('div', { class: 'vt-w' + (i === 0 ? ' sel' : '') },
      el('button', { class: 'vt-ar', 'aria-label': `Digit ${i + 1} up`, html: icon('up'), onclick: () => step(i, 1) }), num,
      el('button', { class: 'vt-ar', 'aria-label': `Digit ${i + 1} down`, html: icon('down'), onclick: () => step(i, -1) }));
    w.addEventListener('wheel', (e) => { e.preventDefault(); step(i, e.deltaY < 0 ? 1 : -1); }, { passive: false });
    w.addEventListener('pointerdown', () => select(i));
    wheels.append(w);
    return { w, num };
  });
  function select(i) { sel = i; wEls.forEach((x, k) => x.w.classList.toggle('sel', k === i)); }
  function paint() { wEls.forEach((x, i) => { x.num.textContent = digits[i]; }); }
  function step(i, d) { if (busy) return; digits[i] = (digits[i] + d + 10) % 10; select(i); paint(); ctx.sfx('click'); }
  root.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (/^\d$/.test(e.key)) { digits[sel] = +e.key; paint(); select(Math.min(4, sel + 1)); ctx.sfx('click'); }
    else if (e.key === 'ArrowLeft') select(Math.max(0, sel - 1));
    else if (e.key === 'ArrowRight') select(Math.min(4, sel + 1));
    else if (e.key === 'ArrowUp') step(sel, 1);
    else if (e.key === 'ArrowDown') step(sel, -1);
    else if (e.key === 'Backspace') { digits[sel] = 0; paint(); select(Math.max(0, sel - 1)); }
    else if (e.key === 'Enter') submit();
    else if (e.key === 'Escape') ctx.close();
  });

  function setLamp(kind, text) { lamp.className = 'vt-lamp ' + kind; lamp.textContent = text; }
  function lockout(secs) {
    clearInterval(timer); let left = secs;
    go.disabled = true; setLamp('bad', `KEYPAD LOCKED  ${left}s`);
    timer = setInterval(() => {
      left--; if (left <= 0 || dead) { clearInterval(timer); go.disabled = false; setLamp('idle', 'READY'); msg.textContent = ''; }
      else setLamp('bad', `KEYPAD LOCKED  ${left}s`);
    }, 1000);
  }
  function showUnlocked() {
    root.classList.add('ok'); go.style.display = 'none'; setLamp('ok', 'DECRYPTED');
    msg.textContent = 'exec.archive is open. RECOVERY_SEQUENCE.TXT has been placed on the desktop.';
    wEls.forEach((x) => x.w.classList.add('done'));
  }

  async function submit() {
    if (busy || go.disabled) return;
    busy = true; go.disabled = true; setLamp('work', 'CHECKING…'); ctx.sfx('keys');
    const r = await ctx.api('keypad', { code: digits.join('') }, { silent: true, quiet: true }).catch(() => null);
    busy = false; go.disabled = false;
    if (!r) { setLamp('bad', 'NO CONNECTION'); return; }
    if (r.unlocked) {
      if (r.ok !== false) { ctx.sfx('unlock'); }
      showUnlocked();
      if (r.evidence) ctx.offer(r.evidence);
      opts.onUnlocked?.();
      return;
    }
    ctx.sfx('error'); root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake');
    setLamp('bad', 'ACCESS DENIED'); msg.textContent = (r.lines && r.lines[0]) || r.msg || 'Access denied.';
    if (r.locked) lockout(r.locked);
    ctx.bus.emit('state', state.s);
  }
  go.onclick = submit;

  if (state.s?.flags?.archive_unlocked) showUnlocked();
  else if (state.s?.lock > 0) lockout(state.s.lock);
  else setLamp('idle', 'READY');
  paint(); setTimeout(() => root.focus(), 60);
  return { destroy() { dead = true; clearInterval(timer); }, focus: () => root.focus() };
}

export default { id: 'vault', title: 'Archive Vault', size: 'sm', mount(body, ctx) { const v = mountVault(body, ctx); return () => v.destroy(); } };
