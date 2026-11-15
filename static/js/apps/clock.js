// Time sync console: compare the CCTV camera clock with the system logs and find the offset.
import { el, esc, icon, hms, toSec, clamp, state } from '../core/runtime.js';

export default {
  id: 'clock', title: 'Time Sync Console', eyebrow: 'Digital Forensics / SOC Desk', size: 'xl',
  async mount(body, ctx) {
    const r = await ctx.api('clock_info', {}, { silent: true, quiet: true });
    const foot = ctx.foot();
    if (r.ok === false) {
      body.append(el('div', { class: 'pane v-center' }, el('div', { class: 'callout warn', html: `${icon('camera')} <b>${esc(r.msg || 'No footage reviewed.')}</b><br>Go back to the executive office and review the corridor camera first.` })));
      foot.msg('Locked: needs the CCTV frame from the executive office.', 'bad');
      return;
    }
    let done = !!r.done, offset = 0;
    const camSec = toSec(r.cam_time), T0 = toSec('22:03:00'), T1 = toSec('22:06:00');
    foot.msg(done ? 'Clocks already aligned.' : 'Slide the offset until the corrected camera time lines up with a log event.', done ? 'ok' : '');

    const camBig = el('div', { class: 'v-clk' }, el('small', { text: 'CAMERA 04 CLOCK' }), el('b', { text: r.cam_time }));
    const corr = el('div', { class: 'v-clk good' }, el('small', { text: 'CORRECTED (SYSTEM TIME)' }), el('b'));
    const off = el('input', { type: 'range', class: 'rng', min: -180, max: 180, step: 1, value: 0, 'aria-label': 'Offset in seconds' });
    const offLbl = el('div', { class: 'v-off' });
    const minus = el('button', { class: 'btn ghost sm', text: '−1 s', onclick: () => set(offset - 1) });
    const plus = el('button', { class: 'btn ghost sm', text: '+1 s', onclick: () => set(offset + 1) });
    const axis = el('div', { class: 'v-axis' });
    const marker = el('div', { class: 'v-mark' }, el('i'), el('span'));
    const commit = el('button', { class: 'btn', html: `${icon('clock')} COMMIT OFFSET`, disabled: done });

    const pct = (s) => ((s - T0) / (T1 - T0)) * 100;
    for (const row of r.log) {
      const ev = el('div', { class: 'v-tick ' + (row.type === 'DOOR' ? 'door' : row.event === 'FAILED' ? 'fail' : 'ok'), style: { left: pct(toSec(row.time)) + '%' } },
        el('i'), el('span', { html: `<b>${esc(row.time)}</b>${esc(row.type === 'DOOR' ? 'Door ' + row.target : row.event + ' · ' + row.device)}` }));
      axis.append(ev);
    }
    axis.append(marker);
    const list = el('div', { class: 'v-evlist' }, ...r.log.map((x) => el('div', { class: 'v-evrow ' + (x.type === 'DOOR' ? 'door' : ''), html: `<b>${esc(x.time)}</b><span>${esc(x.type)}</span><span>${esc(x.device)}</span><span>${esc(x.account)}</span><span>${esc(x.target)}</span><em>${esc(x.event)}</em>` })));

    function set(v) {
      offset = clamp(Math.round(v), -180, 180); off.value = offset;
      const c = camSec + offset;
      corr.querySelector('b').textContent = hms(c);
      offLbl.innerHTML = `Offset <b>${offset >= 0 ? '+' : ''}${offset} s</b>`;
      marker.style.left = clamp(pct(c), 0, 100) + '%'; marker.querySelector('span').textContent = hms(c);
      list.querySelectorAll('.v-evrow').forEach((n, i) => n.classList.toggle('hit', Math.abs(toSec(r.log[i].time) - c) <= 1));
    }
    off.oninput = () => set(+off.value);
    commit.onclick = async () => {
      commit.disabled = true;
      const j = await ctx.api('clock_sync', { offset }, { silent: true }).catch(() => null);
      if (!j) { commit.disabled = false; return; }
      if (j.passed) { done = true; ctx.sfx('good'); foot.msg(j.msg || `Aligned at ${j.corrected}.`, 'ok'); }
      else { commit.disabled = false; ctx.sfx('error'); body.classList.remove('shake'); void body.offsetWidth; body.classList.add('shake'); foot.msg(j.msg || 'No log event lines up.', 'bad'); }
    };

    body.append(el('div', { class: 'v-clock' },
      el('div', { class: 'callout', html: `${icon('info')} <span>The camera does not keep system time. Compare the frame you marked with the events below. Which event does the same moment belong to?</span>` }),
      el('div', { class: 'v-clkrow' }, camBig, el('div', { class: 'v-ctl' }, offLbl, el('div', { class: 'v-ctlr' }, minus, off, plus), commit), corr),
      axis, list));
    set(0);
  },
};
