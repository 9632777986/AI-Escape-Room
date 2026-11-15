// Timeline: drag events into six slots in chronological order. Two of the cards belong to other incidents.
import { el, icon, dragDrop } from '../core/runtime.js';

export default {
  id: 'timeline', title: 'Incident Timeline', eyebrow: 'Incident Room / Wall', size: 'xl',
  async mount(body, ctx) {
    const r = await ctx.api('timeline', {}, { silent: true, quiet: true });
    if (r.ok === false) { body.append(el('div', { class: 'pane', text: r.msg || 'Locked.' })); return; }
    const foot = ctx.foot();
    const cards = Object.fromEntries(r.cards.map((c) => [c.id, c]));
    const slots = Array(r.slots).fill(null); let done = !!r.done;
    foot.msg(done ? 'Timeline verified.' : 'Drag events into the slots, earliest first. Some cards do not belong.', done ? 'ok' : '');
    const pool = el('div', { class: 'v-tpool' }), track = el('div', { class: 'v-ttrack' });
    const submit = el('button', { class: 'btn', html: `${icon('check')} VERIFY TIMELINE`, disabled: true });
    const cardEl = (c) => { const n = el('div', { class: 'v-tcard', dataset: { id: c.id }, tabindex: '0' }, el('b', { text: c.time }), el('span', { text: c.text })); dragDrop(n, { zones: () => [...track.children, pool], onDrop: (z) => z && place(c.id, z) }); return n; };
    const slotEls = slots.map((_, i) => el('div', { class: 'v-tslot dz', dataset: { i } }, el('em', { text: i + 1 })));
    slotEls.forEach((s) => track.append(s));
    function place(id, z) {
      const from = slots.indexOf(id); if (from >= 0) slots[from] = null;
      if (z === pool) { /* back to pool */ }
      else { const i = +z.dataset.i; if (slots[i]) {/* swap back */ slots[i] = null; } slots[i] = id; }
      ctx.sfx('click'); paint();
    }
    function paint() {
      pool.innerHTML = ''; slotEls.forEach((s, i) => { [...s.querySelectorAll('.v-tcard')].forEach((x) => x.remove()); if (slots[i]) s.append(cardEl(cards[slots[i]])); });
      Object.values(cards).filter((c) => !slots.includes(c.id)).forEach((c) => pool.append(cardEl(c)));
      submit.disabled = done || slots.some((x) => !x);
    }
    submit.onclick = async () => {
      submit.disabled = true;
      const j = await ctx.api('timeline_submit', { order: slots }, { silent: true }).catch(() => null);
      if (!j) return;
      if (j.passed) { done = true; ctx.sfx('good'); foot.msg('Timeline verified. Added to evidence.', 'ok'); }
      else { ctx.sfx('error'); foot.msg(j.msg, 'bad'); body.classList.remove('shake'); void body.offsetWidth; body.classList.add('shake'); }
      paint();
    };
    body.append(el('div', { class: 'v-tl' }, el('div', { class: 'eyebrow', text: 'Earliest' }), track, el('div', { class: 'eyebrow', text: 'Events (some belong to other incidents)' }), pool, el('div', { class: 'v-footbar' }, el('span'), submit)));
    paint();
  },
};
