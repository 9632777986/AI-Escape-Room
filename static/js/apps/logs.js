// Login & file-access audit: sort, filter, search, compare two timestamps, flag the anomalous rows.
// The player decides which rows are hostile; Python decides whether that set is right.
import { el, esc, icon, state, toSec, hms } from '../core/runtime.js';

const EVCLS = { FAILED: 'fail', SUCCESS: 'ok', EXPORT: 'exp', DELETE: 'del', OPENED: 'ok' };
const COLS = [['time', 'Time'], ['type', 'Type'], ['device', 'Device'], ['account', 'Account label'], ['target', 'Target'], ['network', 'Network'], ['event', 'Event']];

export default {
  id: 'logs', title: 'Audit Log Analyzer', eyebrow: 'Digital Forensics / Workstation', size: 'xl',
  async mount(body, ctx) {
    const r = await ctx.api('logs', {}, { silent: true, quiet: true });
    if (r.ok === false) { body.append(el('div', { class: 'pane', text: r.msg || 'Locked.' })); return; }
    const rows = r.rows;
    const solved = !!state.s?.flags?.r2_logs;
    const foot = ctx.foot();
    const flagged = new Set(); let sortKey = 'time', sortDir = 1, fDev = 'ALL', fType = 'ALL', q = '', cmpA = null, cmpB = null, passed = solved;
    foot.msg(solved ? 'Anomaly set already confirmed.' : 'Flag every row that looks like hostile activity, then submit.', solved ? 'ok' : '');

    const devs = ['ALL', ...new Set(rows.map((x) => x.device))];
    const types = ['ALL', ...new Set(rows.map((x) => x.type))];
    const bar = el('div', { class: 'v-bar' });
    const mkChips = (label, vals, get, set) => {
      const g = el('div', { class: 'v-chips' }, el('span', { class: 'v-cl', text: label }));
      for (const v of vals) g.append(el('button', { class: 'chip' + (get() === v ? ' on' : ''), text: v, onclick: () => { set(v); paint(); } }));
      return g;
    };
    const input = el('input', { class: 'v-search', placeholder: 'Search target, account, network…', 'aria-label': 'Search logs', spellcheck: 'false' });
    input.oninput = () => { q = input.value.trim().toLowerCase(); paintRows(); };
    input.addEventListener('keydown', (e) => e.stopPropagation());
    const delta = el('div', { class: 'v-delta' });
    const tbl = el('table', { class: 'tbl' });
    const scroll = el('div', { class: 'scr v-tbl' }, tbl);
    const count = el('span', { class: 'v-count' });
    const submit = el('button', { class: 'btn', html: `${icon('flag')} SUBMIT ANOMALOUS ROWS` });

    function chipsRow() {
      bar.innerHTML = '';
      bar.append(mkChips('Device', devs, () => fDev, (v) => { fDev = v; }), mkChips('Type', types, () => fType, (v) => { fType = v; }), input);
    }
    function vis() {
      return rows.filter((x) => (fDev === 'ALL' || x.device === fDev) && (fType === 'ALL' || x.type === fType)
        && (!q || (x.target + ' ' + x.account + ' ' + x.network + ' ' + x.device + ' ' + x.event).toLowerCase().includes(q)))
        .sort((a, b) => (a[sortKey] > b[sortKey] ? 1 : a[sortKey] < b[sortKey] ? -1 : 0) * sortDir);
    }
    function paintDelta() {
      if (!cmpA) { delta.innerHTML = `${icon('clock')} <span>Compare timestamps: click the <b>time</b> of two rows.</span>`; return; }
      if (!cmpB) { delta.innerHTML = `${icon('clock')} <span>A = <b>${cmpA.time}</b> (${esc(cmpA.event)} · ${esc(cmpA.device)}). Now click a second time.</span>`; return; }
      const d = Math.abs(toSec(cmpB.time) - toSec(cmpA.time));
      delta.innerHTML = `${icon('clock')} <span>A <b>${cmpA.time}</b> → B <b>${cmpB.time}</b> &nbsp; Δ = <b class="v-d">${d >= 60 ? Math.floor(d / 60) + ' min ' : ''}${d % 60} s</b></span>`;
    }
    function paintRows() {
      const list = vis();
      const head = el('tr', {}, el('th', { class: 'v-chk' }), ...COLS.map(([k, label]) => el('th', { class: sortKey === k ? 'sorted' : '', onclick: () => { sortDir = sortKey === k ? -sortDir : 1; sortKey = k; paintRows(); }, html: `${label} ${sortKey === k ? (sortDir > 0 ? '▲' : '▼') : ''}` })));
      tbl.innerHTML = ''; tbl.append(el('thead', {}, head));
      const tb = el('tbody');
      for (const x of list) {
        const on = flagged.has(x.id);
        const tr = el('tr', { class: 'r' + (on ? ' flag' : '') + (cmpA?.id === x.id ? ' ma' : '') + (cmpB?.id === x.id ? ' mb' : ''), dataset: { id: x.id }, tabindex: '0' });
        tr.append(el('td', { class: 'v-chk', html: on ? icon('flag') : '' }));
        tr.append(el('td', { class: 'v-time', title: 'Click to compare timestamps', text: x.time, onclick: (e) => { e.stopPropagation(); if (!cmpA || cmpB) { cmpA = x; cmpB = null; } else cmpB = x; ctx.sfx('click'); paintDelta(); paintRows(); } }));
        for (const k of ['type', 'device', 'account', 'target', 'network']) tr.append(el('td', { text: x[k] }));
        tr.append(el('td', {}, el('span', { class: 'ev ' + (EVCLS[x.event] || ''), text: x.event })));
        const toggle = () => { if (passed) return; flagged.has(x.id) ? flagged.delete(x.id) : flagged.add(x.id); ctx.sfx('click'); paintRows(); };
        tr.onclick = toggle; tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
        tb.append(tr);
      }
      tbl.append(tb);
      count.textContent = `${list.length} of ${rows.length} rows shown   ·   ${flagged.size} flagged`;
      submit.disabled = passed || !flagged.size;
    }
    function paint() { chipsRow(); paintRows(); }

    submit.onclick = async () => {
      submit.disabled = true;
      const j = await ctx.api('logs_submit', { ids: [...flagged] }, { silent: true }).catch(() => null);
      if (!j) { submit.disabled = false; return; }
      if (j.passed) { passed = true; ctx.sfx('good'); foot.msg('Anomaly set confirmed. Added to evidence.', 'ok'); }
      else { foot.msg(j.msg || 'Not accepted.', 'bad'); ctx.sfx('error'); body.classList.remove('shake'); void body.offsetWidth; body.classList.add('shake'); }
      paintRows();
    };

    body.append(el('div', { class: 'v-logs' },
      el('div', { class: 'callout v-top', html: `${icon('info')} <span><b>Synthetic training data.</b> An account label in a log is not a person. Sort and filter to find what does not belong. ${solved ? '' : 'Wrong sets cost time.'}</span>` }),
      bar, delta, scroll, el('div', { class: 'v-footbar' }, count, submit)));
    paintDelta(); paint();
    void hms;
  },
};
