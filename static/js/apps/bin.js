// Waste-paper bin: shredded strips of one sentence. Drag them into order; Python checks the order.
import { el, dragDrop, esc } from '../core/runtime.js';

export default {
  id: 'bin', title: 'Waste-Paper Bin', eyebrow: 'Executive Office / Floor', size: 'lg',
  async mount(body, ctx) {
    const r = await ctx.api('interact', { target: 'bin' }, { silent: true, quiet: true });
    if (r.ok === false) { body.append(el('div', { class: 'pane', text: r.msg || 'Nothing here.' })); return; }
    const foot = ctx.foot();
    const strips = r.strips || [];
    const slots = [null, null, null, null];          // ids placed, in order
    let solved = !!r.solved, busy = false;

    const pile = el('div', { class: 'v-pile' });
    const table = el('div', { class: 'v-table' });
    const zones = slots.map((_, i) => el('div', { class: 'dz v-slot', dataset: { i } }, el('span', { class: 'num', text: i + 1 })));
    zones.forEach((z) => table.append(z));
    const tape = el('button', { class: 'btn', text: 'TAPE THE STRIPS TOGETHER', disabled: true });
    const result = el('div', { class: 'v-result' });
    const byId = Object.fromEntries(strips.map((s) => [s.id, s]));
    const nodes = {};

    function render() {
      pile.innerHTML = '';
      zones.forEach((z, i) => { z.querySelectorAll('.v-strip').forEach((n) => n.remove()); z.classList.toggle('full', !!slots[i]); });
      strips.forEach((s, k) => {
        const where = slots.indexOf(s.id);
        const n = nodes[s.id] ||= makeStrip(s, k);
        n.classList.toggle('placed', where >= 0);
        if (where >= 0) zones[where].append(n); else pile.append(n);
      });
      tape.disabled = busy || solved || slots.some((x) => !x);
    }
    function makeStrip(s, k) {
      const n = el('div', { class: 'v-strip', tabindex: '0', role: 'button', 'aria-label': 'Paper strip: ' + s.text, style: { '--rot': ((k * 37) % 9 - 4) / 2 + 'deg', '--tw': (3 + (k % 3) * .6) + 'rem' } }, el('span', { text: s.text }));
      const place = (i) => {
        const cur = slots.indexOf(s.id); if (cur >= 0) slots[cur] = null;
        if (slots[i]) { /* displaced strip returns to the pile */ }
        slots[i] = s.id; render(); ctx.sfx('paper');
      };
      n.addEventListener('click', () => {
        if (solved || n._dragged) { n._dragged = false; return; }
        const cur = slots.indexOf(s.id);
        if (cur >= 0) { slots[cur] = null; } else { const free = slots.indexOf(null); if (free >= 0) slots[free] = s.id; }
        render(); ctx.sfx('paper');
      });
      n.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); n.click(); } });
      dragDrop(n, {
        zones: () => (solved ? [] : zones),
        onStart: () => { n._dragged = true; },
        onDrop: (zone) => { if (zone) place(+zone.dataset.i); setTimeout(() => { n._dragged = false; }, 0); },
      });
      return n;
    }

    function showSolved(text, scrap) {
      solved = true; render();
      result.innerHTML = '';
      result.append(el('div', { class: 'v-sentence hand', text }),
        scrap ? el('div', { class: 'v-scrap hand', text: scrap }) : null,
        el('p', { class: 'p', style: { marginTop: '.6rem' }, text: 'An instruction, and a stray scrap that says something else entirely.' }));
      tape.style.display = 'none';
      ctx.offer('ev_fragments');
    }

    tape.onclick = async () => {
      busy = true; tape.disabled = true;
      const j = await ctx.api('bin_submit', { order: slots }, { silent: true, quiet: true }).catch(() => null);
      busy = false;
      if (!j) { render(); return; }
      if (j.solved) { ctx.sfx('good'); showSolved(j.text, j.scrap); foot.msg('The strips form a sentence.', 'ok'); }
      else { ctx.sfx('error'); body.classList.remove('shake'); void body.offsetWidth; body.classList.add('shake'); foot.msg(j.msg || 'That does not read as a sentence.', 'bad'); render(); }
    };

    body.append(el('div', { class: 'split v-binsplit' },
      el('div', { class: 'pane' },
        el('div', { class: 'eyebrow', text: 'Shredder spill' }),
        el('div', { class: 'h3', text: 'Strips from the bin' }),
        el('p', { class: 'p', text: 'Somebody fed a page through the shredder in a hurry. Drag the strips onto the table, top to bottom, until they read as one sentence. Click a strip to place or return it.' }),
        pile),
      el('div', { class: 'pane' },
        el('div', { class: 'h3', text: 'Reconstruction table' }), table,
        el('div', { style: { marginTop: '.9rem' } }, tape), result)));
    foot.msg('Rebuild the sentence.');
    if (solved) { slots.splice(0, 4, ...['s1', 's2', 's3', 's4']); showSolved(r.text, r.scrap); }
    render();
  },
};
