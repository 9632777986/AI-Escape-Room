// Security console. Every command is executed by the Python engine (action 'console').
import { el, sleep } from '../core/runtime.js';

const CMDS = ['help', 'summary', 'archive', 'unlock', 'sessions', 'devices', 'whoami', 'date', 'clear'];

export function mountTerminal(host, ctx, opts = {}) {
  const out = el('div', { class: 'a1-tout' });
  const input = el('input', { type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Console command', maxlength: '60' });
  const PS = 'investigator@exec-console:~$';
  const prompt = el('div', { class: 'pr' }, el('span', { class: 'o', text: PS }), input);
  const term = el('div', { class: 'term a1-term' }, out, prompt);
  host.append(term);
  const hist = []; let hi = 0, busy = false, dead = false;

  const scroll = () => { term.scrollTop = term.scrollHeight; };
  const cls = (t) => (/DENIED|LOCKED|RESTRICTED|not found|must be/i.test(t) ? 'e' : /ACCEPTED|DECRYPTED|Decrypting/i.test(t) ? 'o' : /^\s{2}\S|^[A-Z ]{6,}/.test(t) && /\.\.\.|\[!\]/.test(t) ? 'h' : '');
  const line = (t, c) => { const d = el('div', { class: c ?? cls(t), text: t === '' ? ' ' : t }); out.append(d); scroll(); return d; };

  async function run(raw) {
    const cmd = raw.trim();
    out.append(el('div', {}, el('span', { class: 'o', text: PS + ' ' }), document.createTextNode(cmd)));
    scroll();
    if (!cmd) return;
    hist.push(cmd); hi = hist.length;
    busy = true; prompt.style.opacity = '.5'; ctx.sfx('keys');
    try {
      const r = await ctx.api('console', { cmd }, { silent: true, quiet: true });
      if (r.clear) out.innerHTML = '';
      for (const l of r.lines || []) { if (dead) return; line(l); await sleep(16); }
      if (r.ok === false && r.msg && !(r.lines || []).length) line(r.msg, 'e');
      if (r.evidence) ctx.offer(r.evidence);
      if (r.keypad) opts.onKeypad?.();
      if (r.unlocked) { ctx.sfx('unlock'); opts.onUnlocked?.(); }
      if (r.ok === false) ctx.sfx('error');
    } catch (e) {
      line('error: ' + e.message, 'e');
    }
    busy = false; prompt.style.opacity = ''; if (!dead) input.focus(); scroll();
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { ctx.close(); return; }
    if (e.key === 'Enter') { if (busy) return; const v = input.value; input.value = ''; run(v); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (hi > 0) input.value = hist[--hi]; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hist.length, hi + 1); input.value = hist[hi] ?? ''; }
    else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); out.innerHTML = ''; }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const v = input.value.trim();
      if (v && !v.includes(' ')) { const m = CMDS.filter((c) => c.startsWith(v.toLowerCase())); if (m.length === 1) input.value = m[0] + ' '; }
    } else if (e.key.length === 1) ctx.sfx('type');
  });
  term.addEventListener('pointerdown', () => setTimeout(() => { if (!getSelection().toString()) input.focus(); }, 0));
  for (const l of ['EXEC-OS secure console v4.2  (read-only forensic session)', "Type 'help' for commands.", '']) line(l, 'd');
  setTimeout(() => input.focus(), 60);
  return { focus: () => input.focus(), destroy() { dead = true; } };
}

export default { id: 'terminal', title: 'Security Console', size: 'md', mount(body, ctx) { const t = mountTerminal(body, ctx); return () => t.destroy(); } };
