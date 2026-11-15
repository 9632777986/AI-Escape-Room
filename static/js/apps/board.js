// Evidence board: click two pieces of evidence to string a thread between them. Python decides if the link is meaningful.
import { el, esc, icon, state } from '../core/runtime.js';

export default {
  id: 'board', title: 'Evidence Board', eyebrow: 'Incident Room / Wall', size: 'xl',
  async mount(body, ctx) {
    const r = await ctx.api('board', {}, { silent: true, quiet: true });
    if (r.ok === false) { body.append(el('div', { class: 'pane', text: r.msg || 'Locked.' })); return; }
    const foot = ctx.foot();
    const nodes = r.nodes, need = r.need; let links = r.links.map((l) => [...l]), sel = null, busy = false;
    const done = () => links.length >= need;
    foot.msg(done() ? 'Board complete.' : `Connect evidence that supports each other. ${links.length}/${need} links.`, done() ? 'ok' : '');
    const W = 1000, H = 520, cx = W / 2, cy = H / 2;
    const pos = {}; const COLS = 5, ROWS = Math.ceil(nodes.length / COLS);
    nodes.forEach((n, i) => { const r = Math.floor(i / COLS), c = i % COLS, inRow = Math.min(COLS, nodes.length - r * COLS);
      pos[n.id] = { x: (W / (inRow + 1)) * (c + 1) + (r % 2 ? 18 : -18), y: (H / (ROWS + 1)) * (r + 1) + (c % 2 ? 22 : -22) }; });
    const stage = el('div', { class: 'v-board' });
    const svg = el('div', { class: 'v-bsvg' });
    const note = el('div', { class: 'v-bnote' });
    const cards = nodes.map((n) => {
      const c = el('button', { class: 'v-bcard ' + n.kind, dataset: { id: n.id }, style: { left: pos[n.id].x / W * 100 + '%', top: pos[n.id].y / H * 100 + '%' } },
        el('small', { text: n.kind }), el('b', { text: n.title }));
      c.onclick = () => pick(n.id, c); return c;
    });
    function lines() {
      svg.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${links.map(([a, b]) => `<line class="v-thread" x1="${pos[a].x}" y1="${pos[a].y}" x2="${pos[b].x}" y2="${pos[b].y}"/>`).join('')}</svg>`;
      cards.forEach((c) => c.classList.toggle('linked', links.some((l) => l.includes(c.dataset.id))));
    }
    async function pick(id, card) {
      if (busy) return;
      if (!sel) { sel = id; card.classList.add('sel'); ctx.sfx('click'); return; }
      if (sel === id) { sel = null; card.classList.remove('sel'); return; }
      const a = sel; sel = null; busy = true; cards.forEach((c) => c.classList.remove('sel'));
      const j = await ctx.api('board_link', { a, b: id }, { silent: true }).catch(() => null);
      busy = false; if (!j) return;
      if (j.valid) { if (!j.dup) { links.push([a, id]); ctx.sfx('good'); } note.className = 'v-bnote ok'; note.textContent = j.msg; }
      else { ctx.sfx('error'); note.className = 'v-bnote bad'; note.textContent = j.msg || 'Those do not connect.'; stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake'); }
      foot.msg(done() ? 'Board complete. The incident room is ready for the next stage.' : `${links.length}/${need} links.`, done() ? 'ok' : (j.valid ? '' : 'bad'));
      lines();
    }
    stage.append(svg, ...cards);
    body.append(el('div', { class: 'v-boardw' }, el('div', { class: 'callout', html: `${icon('info')} <span>Click one piece of evidence, then another, to connect them. Wrong threads cost time.</span>` }), stage, note));
    lines(); void state; void esc;
  },
};
