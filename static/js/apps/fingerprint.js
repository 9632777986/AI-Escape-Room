// Device fingerprint: drag the observed session fingerprint onto an asset card. Python compares and reports.
import { el, esc, icon, dragDrop, state } from '../core/runtime.js';

const LABEL = { mac_oui: 'Hardware vendor (MAC OUI)', os_build: 'OS build', tls: 'TLS client fingerprint', hostname: 'Hostname' };

export default {
  id: 'fingerprint', title: 'Device Fingerprint Matcher', eyebrow: 'Digital Forensics / Server Rack', size: 'xl',
  async mount(body, ctx) {
    const r = await ctx.api('fingerprint', {}, { silent: true, quiet: true });
    if (r.ok === false) { body.append(el('div', { class: 'pane', text: r.msg || 'Locked.' })); return; }
    const foot = ctx.foot();
    const keys = r.observed_keys, assets = r.assets;
    let observed = null, done = !!state.s?.flags?.r2_fingerprint, busy = false;
    foot.msg(done ? 'Fingerprint already matched.' : 'Drag the observed fingerprint onto an asset, or press Compare.', done ? 'ok' : '');

    const obs = el('div', { class: 'v-fpobs', tabindex: '0' },
      el('div', { class: 'eyebrow', text: 'Observed session fingerprint' }),
      el('div', { class: 'v-fpt', text: 'Session 22:04:51  ·  account label alice.huang' }),
      ...keys.map((k) => el('div', { class: 'v-fprow', dataset: { k } }, el('span', { text: LABEL[k] || k }), el('b', { class: 'v-fpv', text: '••••••' }))),
      el('div', { class: 'v-fpgrip', html: `${icon('drag')} DRAG ME` }));
    const result = el('div', { class: 'v-fpres' }, el('div', { class: 'mut', text: 'No comparison yet. The observed values appear on the first comparison.' }));

    const cards = Object.entries(assets).map(([id, a]) => {
      const card = el('div', { class: 'v-asset dz', dataset: { id }, tabindex: '0' },
        el('div', { class: 'v-aid', text: id }), el('div', { class: 'v-aas', html: `<small>Assigned to</small>${esc(a.assigned)}` }),
        el('span', { class: 'v-acmp', text: 'CLICK TO COMPARE' }));
      card.onclick = () => compare(id); card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); compare(id); } };
      return card;
    });

    async function compare(id) {
      if (busy) return; busy = true;
      cards.forEach((c) => c.classList.toggle('cmp', c.dataset.id === id));
      const j = await ctx.api('fingerprint_compare', { asset: id }, { silent: true, quiet: false }).catch(() => null);
      busy = false;
      if (!j || j.ok === false) { foot.msg(j?.msg || 'Could not compare.', 'bad'); return; }
      observed = true;
      for (const row of j.rows) obs.querySelector(`[data-k="${row.key}"] .v-fpv`).textContent = row.observed;
      result.innerHTML = '';
      result.append(el('div', { class: 'eyebrow', text: `Compared with ${id}` }),
        el('div', { class: 'v-fpassigned', html: `<small>Registered to</small> ${esc(j.assigned)}` }));
      const grid = el('div', { class: 'v-fpgrid' }, el('div', { class: 'th', text: 'Attribute' }), el('div', { class: 'th', text: 'Observed' }), el('div', { class: 'th', text: id }), el('div', { class: 'th', text: '' }));
      j.rows.forEach((row, i) => {
        const cells = [el('div', { text: LABEL[row.key] || row.key }), el('div', { class: 'v', text: row.observed }), el('div', { class: 'v', text: row.asset }),
          el('div', { class: 'v-fpm ' + (row.match ? 'y' : 'n'), html: row.match ? `${icon('check')} MATCH` : `${icon('x')} DIFFERENT` })];
        cells.forEach((c) => { c.style.animationDelay = i * 0.12 + 's'; c.classList.add('v-fadein'); grid.append(c); });
      });
      result.append(grid, el('div', { class: 'callout' + (j.matched ? '' : ' warn'), html: esc(j.msg) }));
      if (j.matched) { ctx.sfx('good'); done = true; foot.msg('All four attributes match this asset. Added to evidence.', 'ok'); }
      else { ctx.sfx('error'); foot.msg('Attributes do not line up. Try another asset.', 'bad'); }
    }
    dragDrop(obs, { zones: () => cards, onDrop: (z) => { if (z) compare(z.dataset.id); } });

    body.append(el('div', { class: 'v-fp' },
      el('div', { class: 'v-fpl' }, obs, el('p', { class: 'p mut', style: { marginTop: '.8rem' }, text: 'A fingerprint says what kind of machine made the connection. It does not say who was sitting at it.' })),
      el('div', { class: 'v-fpm2' }, el('div', { class: 'eyebrow', text: 'Asset registry' }), el('div', { class: 'v-assets' }, ...cards), result)));
    void observed;
  },
};
