// Network route inspector. Three sign-ins, three paths. Find the hop that does not belong to the company.
import { el, esc, icon, state } from '../core/runtime.js';

export default {
  id: 'route', title: 'Network Route Inspector', eyebrow: 'Digital Forensics / Wall Display', size: 'xl',
  async mount(body, ctx) {
    const r = await ctx.api('routes', {}, { silent: true, quiet: true });
    if (r.ok === false) { body.append(el('div', { class: 'pane', text: r.msg || 'Locked.' })); return; }
    const routes = r.routes, ids = Object.keys(routes);
    const foot = ctx.foot();
    let trace = ids[0], hop = null, done = !!state.s?.flags?.r2_route;
    foot.msg(done ? 'Route finding already confirmed.' : 'Pick a trace, inspect each hop, then flag the one that is not corporate.', done ? 'ok' : '');

    const tabs = el('div', { class: 'v-rtabs' });
    const svg = el('div', { class: 'v-rsvg' });
    const info = el('div', { class: 'v-rinfo' });
    const flag = el('button', { class: 'btn danger', html: `${icon('flag')} FLAG THIS HOP AS NOT CORPORATE`, disabled: true });

    function paintTabs() {
      tabs.innerHTML = '';
      for (const id of ids) tabs.append(el('button', { class: 'v-rtab' + (id === trace ? ' on' : ''), onclick: () => { trace = id; hop = null; paint(); ctx.sfx('click'); } },
        el('b', { text: id }), el('span', { text: routes[id].label })));
    }
    function paintGraph() {
      const hops = routes[trace].hops, n = hops.length, W = 880, H = 210, gap = W / n;
      const xs = hops.map((_, i) => gap * i + gap / 2);
      let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`;
      for (let i = 0; i < n - 1; i++) s += `<line class="v-link" x1="${xs[i] + 62}" y1="${H / 2}" x2="${xs[i + 1] - 62}" y2="${H / 2}"/><circle class="v-pkt" r="3.5" cy="${H / 2}"><animate attributeName="cx" from="${xs[i] + 62}" to="${xs[i + 1] - 62}" dur="${1.4 + i * .2}s" repeatCount="indefinite"/></circle>`;
      hops.forEach((h, i) => {
        s += `<g class="hop${hop === h.id ? ' flag' : ''}" data-id="${h.id}" tabindex="0" role="button" aria-label="${esc(h.name)}"><rect x="${xs[i] - 62}" y="${H / 2 - 34}" width="124" height="68" rx="3"/>
          <text x="${xs[i]}" y="${H / 2 - 6}" style="font-size:11px;font-weight:600">${esc(h.name.length > 22 ? h.name.slice(0, 21) + '…' : h.name)}</text>
          <text x="${xs[i]}" y="${H / 2 + 12}" style="font-size:9px;fill:#7f9aa0">${esc(h.addr)}</text>
          <text x="${xs[i]}" y="${H / 2 - 44}" style="font-size:9px;fill:#4fc78a;letter-spacing:.2em">HOP ${i + 1}</text></g>`;
      });
      svg.innerHTML = s + '</svg>';
      svg.querySelectorAll('.hop').forEach((g) => {
        const pick = () => { hop = g.dataset.id; ctx.sfx('click'); paint(); };
        g.addEventListener('click', pick); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      });
    }
    function paintInfo() {
      const h = routes[trace].hops.find((x) => x.id === hop);
      info.innerHTML = h ? `<div class="eyebrow">Selected hop</div><div class="h3">${esc(h.name)}</div><div class="mono mut">${esc(h.addr)}</div><p class="p" style="margin-top:.6rem">${esc(h.note)}</p>` : '<div class="mut">Select a hop in the path to inspect it.</div>';
      flag.disabled = !h || done;
    }
    function paint() { paintTabs(); paintGraph(); paintInfo(); }

    flag.onclick = async () => {
      flag.disabled = true;
      const j = await ctx.api('route_submit', { trace, hop }, { silent: true }).catch(() => null);
      if (!j) { flag.disabled = false; return; }
      if (j.passed) { done = true; ctx.sfx('good'); foot.msg(j.msg || 'Confirmed.', 'ok'); }
      else { ctx.sfx('error'); body.classList.remove('shake'); void body.offsetWidth; body.classList.add('shake'); foot.msg(j.msg || 'That is not the abnormal hop.', 'bad'); }
      paintInfo();
    };

    body.append(el('div', { class: 'v-route' },
      el('div', { class: 'callout', html: `${icon('globe')} <span>Each trace is one sign-in. Compare what each path traverses. The traffic that matters followed the failed attempts.</span>` }),
      tabs, svg, el('div', { class: 'v-rbot' }, info, flag)));
    paint();
  },
};
