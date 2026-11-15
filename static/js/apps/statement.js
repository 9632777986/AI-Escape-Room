// Framed draft statement on the wall. Pure context; a magnifier lens lets the player read the small print.
import { el, esc, loupe } from '../core/runtime.js';

export default {
  id: 'statement', title: 'Draft Public Statement', eyebrow: 'Executive Office / Wall', size: 'md',
  async mount(body, ctx) {
    const r = await ctx.api('interact', { target: 'statement' }, { silent: true, quiet: true });
    if (r.ok === false) { body.append(el('div', { class: 'pane', text: r.msg || 'Nothing here.' })); return; }
    const s = r.statement;
    const paper = el('div', { class: 'v-sheet' },
      el('div', { class: 'v-sheet-h', text: s.title }),
      ...s.lines.map((l) => el('p', { text: l })),
      el('div', { class: 'v-sheet-f', text: s.footer }));
    const frame = el('div', { class: 'v-frame' }, paper);
    const lens = loupe(frame, { zoom: 2.2 });
    const left = el('div', { class: 'pane v-center' }, frame);
    const right = el('div', { class: 'pane' },
      el('div', { class: 'eyebrow', text: 'What you notice' }),
      el('div', { class: 'h3', text: 'A routine notice' }),
      el('p', { class: 'p', text: 'The statement announces a scheduled access review. It is polished, dated and deliberately vague: it names nobody and mentions no system.' }),
      el('div', { class: 'callout', html: 'Context only. There is no credential, code or account detail in this document. It tells you <b>why the timing matters</b>, nothing more.' }),
      el('p', { class: 'p mut', text: 'Tip: move the pointer over the page to use the magnifier.' }));
    body.append(el('div', { class: 'split' }, left, right));
    ctx.offer('ev_statement');
    ctx.sfx('paper');
    return () => lens;
  },
};
