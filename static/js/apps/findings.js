// Findings: mark each statement SUPPORTED or ASSUMPTION. Account activity is not human identity.
import { el, icon } from '../core/runtime.js';

export default {
  id: 'findings', title: 'Findings Report', eyebrow: 'Incident Room / Table', size: 'lg',
  async mount(body, ctx) {
    const r = await ctx.api('findings', {}, { silent: true, quiet: true });
    if (r.ok === false) { body.append(el('div', { class: 'pane', text: r.msg || 'Locked.' })); return; }
    const foot = ctx.foot(); let done = !!r.done; const ans = {};
    foot.msg(done ? 'Findings accepted.' : 'Only evidence-backed statements may be reported as findings.', done ? 'ok' : '');
    const submit = el('button', { class: 'btn', html: `${icon('check')} SUBMIT FINDINGS`, disabled: true });
    const rows = r.items.map((f) => {
      const mk = (v, label) => el('button', { class: 'chip', text: label, onclick: () => { if (done) return; ans[f.id] = v; paint(); ctx.sfx('click'); } });
      const y = mk(true, 'SUPPORTED'), n = mk(false, 'ASSUMPTION');
      const row = el('div', { class: 'v-frow' }, el('p', { text: f.text }), el('div', { class: 'v-fch' }, y, n));
      row._set = () => { y.classList.toggle('on', ans[f.id] === true); n.classList.toggle('on', ans[f.id] === false); };
      return row;
    });
    function paint() { rows.forEach((x) => x._set()); submit.disabled = done || rows.length !== Object.keys(ans).length; }
    submit.onclick = async () => {
      submit.disabled = true;
      const j = await ctx.api('findings_submit', { answers: ans }, { silent: true }).catch(() => null);
      if (!j) return;
      if (j.passed) { done = true; ctx.sfx('good'); foot.msg(j.msg, 'ok'); }
      else { ctx.sfx('error'); foot.msg(j.msg, 'bad'); body.classList.remove('shake'); void body.offsetWidth; body.classList.add('shake'); }
      paint();
    };
    body.append(el('div', { class: 'v-find' }, ...rows, el('div', { class: 'v-footbar' }, el('span'), submit)));
    paint();
  },
};
