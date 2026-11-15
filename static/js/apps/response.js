// Containment plan: tick the actions to take. Python simulates the consequences.
import { el, icon, state } from '../core/runtime.js';

export default {
  id: 'response', title: 'Containment Plan', eyebrow: 'Incident Room / Response Console', size: 'lg',
  async mount(body, ctx) {
    const r = await ctx.api('actions', {}, { silent: true, quiet: true });
    if (r.ok === false) { body.append(el('div', { class: 'pane', text: r.msg || 'Locked.' })); return; }
    const foot = ctx.foot(); const plan = []; const result = el('div', { class: 'v-resbox' });
    foot.msg(r.ready ? 'Order matters. Choose the steps in the order you would run them.' : 'Finish the board, the timeline and the findings first.', r.ready ? '' : 'bad');
    const go = el('button', { class: 'btn danger', html: `${icon('play')} EXECUTE PLAN`, disabled: true });
    const list = el('div', { class: 'v-acts' });
    const paint = () => {
      list.innerHTML = '';
      r.actions.forEach((a) => { const i = plan.indexOf(a.id);
        list.append(el('button', { class: 'v-act' + (i >= 0 ? ' on' : ''), disabled: !r.ready, onclick: () => { i >= 0 ? plan.splice(i, 1) : plan.push(a.id); ctx.sfx('click'); paint(); } },
          el('i', { text: i >= 0 ? i + 1 : '' }), el('span', { text: a.label }))); });
      go.disabled = !r.ready || !plan.length;
    };
    go.onclick = async () => {
      go.disabled = true;
      const j = await ctx.api('response_submit', { plan }, { silent: true }).catch(() => null);
      if (!j) { go.disabled = false; return; }
      if (j.outcome === 'rejected') { result.innerHTML = ''; result.append(el('div', { class: 'callout warn', html: `<b>${j.msg}</b><br>${(j.gaps || []).join('<br>')}` })); ctx.sfx('error'); go.disabled = false; }
      void state;
    };
    body.append(el('div', { class: 'v-resp' }, el('div', { class: 'callout', html: `${icon('info')} <span>Preserve before you remediate. Do not accuse anyone the evidence does not name.</span>` }), list, result, el('div', { class: 'v-footbar' }, el('span'), go)));
    paint();
  },
};
