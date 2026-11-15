// Mail client. Every message, search and header check is served by the Python engine.
//   exec mailbox  -> read, search, collect evidence
//   quarantine    -> additionally: click suspicious header lines and let Python judge them
import { el, esc, icon } from '../core/runtime.js';

const MONTH = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const dkey = (s) => { const m = /^(\w{3}) (\d+), (\d+):(\d+)/.exec(s || ''); return m ? (MONTH[m[1]] || 0) * 1e6 + +m[2] * 1e4 + +m[3] * 100 + +m[4] : 0; };
const FOLDER_ICON = { Inbox: 'inbox', Sent: 'send', Archive: 'folder', Deleted: 'trash', Quarantine: 'shield' };
const FOLDER_ORDER = ['Inbox', 'Sent', 'Archive', 'Deleted', 'Quarantine'];

export function mountMail(host, ctx, opts = {}) {
  const box = opts.box || 'exec';
  const A = (n, p) => ctx.api(n, { box, ...p }, { silent: true, quiet: true });
  let all = [], list = [], folder = null, q = '', sel = null, current = null, tok = 0, dead = false, timer = 0;
  let headerMode = false, flagged = new Set(), result = null, locked = false;

  const hl = (text) => {
    const t = String(text ?? '');
    if (!q) return esc(t);
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let o = '', last = 0, m;
    while ((m = re.exec(t))) { o += esc(t.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>'; last = m.index + m[0].length; if (!m[0].length) re.lastIndex++; }
    return o + esc(t.slice(last));
  };

  /* ---- skeleton ---- */
  const side = el('div', { class: 'm-side' });
  const items = el('div', { class: 'm-items' });
  const input = el('input', { type: 'text', placeholder: 'Search all mail', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Search mail' });
  const clear = el('button', { class: 'a1-clr', 'aria-label': 'Clear search', html: icon('x'), onclick: () => { input.value = ''; q = ''; clear.style.display = 'none'; refreshList(); input.focus(); } });
  clear.style.display = 'none';
  const search = el('div', { class: 'm-search' }, el('span', { html: icon('search') }), input, clear);
  const status = el('div', { class: 'a1-mstat' });
  const listCol = el('div', { class: 'm-list' }, search, status, items);
  const read = el('div', { class: 'm-read' });
  host.append(el('div', { class: 'mail' }, side, listCol, read));

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { if (input.value) { input.value = ''; q = ''; clear.style.display = 'none'; refreshList(); } else ctx.close(); }
  });
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { q = input.value.trim(); clear.style.display = q ? '' : 'none'; refreshList(); }, 200);
  });

  const folders = () => FOLDER_ORDER.filter((f) => all.some((m) => m.folder === f));
  const count = (f) => { const n = all.filter((m) => m.folder === f); return f === 'Inbox' ? n.filter((m) => m.unread).length || '' : n.length; };

  function renderSide() {
    side.innerHTML = '<h5>Mailboxes</h5>';
    for (const f of folders()) {
      side.append(el('button', { class: 'm-fold' + (!q && f === folder ? ' on' : ''), onclick: () => { folder = f; q = ''; input.value = ''; clear.style.display = 'none'; sel = null; current = null; renderRead(); refreshList(); } },
        el('span', { html: `${icon(FOLDER_ICON[f] || 'folder')} ${esc(f)}`, style: { display: 'flex', gap: '.5rem', alignItems: 'center' } }), el('span', { text: count(f) })));
    }
    side.append(el('div', { class: 'a1-acct', html: opts.gateway ? '<small>mail gateway</small>quarantine store' : '<small>exec-office</small>@nvidia.example' }));
  }

  async function loadAll() {
    status.textContent = 'Loading…'; status.classList.add('on');
    let r; try { r = await A('mail_list', {}); } catch { status.textContent = 'Mail server unreachable.'; return; }
    if (dead) return;
    all = r.mails || [];
    folder = folder || folders()[0];
    opts.onUnread?.(all.filter((m) => m.folder === 'Inbox' && m.unread).length);
    status.classList.remove('on');
    renderSide(); await refreshList();
  }

  async function refreshList() {
    const my = ++tok;
    if (q) {
      status.textContent = 'Searching…'; status.classList.add('on');
      let r; try { r = await A('mail_search', { q }); } catch { return; }
      if (my !== tok || dead) return;
      list = (r.mails || []).slice();
      status.textContent = `${list.length} result${list.length === 1 ? '' : 's'} for “${q}” in all folders`;
    } else {
      list = all.filter((m) => m.folder === folder);
      status.classList.remove('on');
    }
    list.sort((a, b) => dkey(b.date) - dkey(a.date));
    renderSide(); renderList();
  }

  function renderList() {
    items.innerHTML = '';
    if (!list.length) {
      items.append(el('div', { class: 'm-empty', html: q ? `<div>${icon('search')}<div style="margin-top:.5rem">No messages match <b>${esc(q)}</b>.<br><span class="mut">Try other words: a device, a person, a place.</span></div></div>` : `<div class="mut">This folder is empty.</div>` }));
      return;
    }
    for (const m of list) {
      const bodyOnly = q && m.hit === 'body';
      items.append(el('button', { class: 'm-item' + (m.unread ? ' unread' : '') + (m.id === sel ? ' on' : ''), dataset: { id: m.id }, onclick: () => openMail(m.id) },
        el('div', { class: 'f', html: `<b>${hl(m.from)}</b><em>${esc(m.date)}</em>` }),
        el('div', { class: 's', html: (m.attach ? icon('file') + ' ' : '') + hl(m.subject) }),
        el('div', { class: 'sn', html: q ? `${esc(m.folder)}${bodyOnly ? ' · <span class="a1-mm">match in message text</span>' : ''}` : hl(m.addr) })));
    }
  }

  function renderRead() {
    read.innerHTML = '';
    if (!current) { read.append(el('div', { class: 'm-empty', html: `<div>${icon('mail', 'a1-big')}<div class="mut" style="margin-top:.6rem">Select a message to read.</div></div>` })); return; }
    if (headerMode) return renderHeaders();
    const m = current;
    read.append(el('h2', { html: hl(m.subject) }));
    read.append(el('div', { class: 'm-meta', html: `<span>From</span><b>${hl(m.from)} &lt;${hl(m.addr)}&gt;</b><span>To</span><b>${esc(m.to)}</b><span>Date</span><b>${esc(m.date)}</b>` }));
    if (m.needs_header_check) read.append(el('div', { class: 'callout warn', html: `<b>${icon('warn')} Gateway flag.</b> This message was held back because its routing looks wrong. The sender name is not proof of where it came from. Open the raw headers and check.` }));
    read.append(el('div', { class: 'm-body', html: hl(m.body) }));
    if (m.attach?.length) {
      const att = el('div', { class: 'm-att' }); const pv = el('div');
      for (const a of m.attach) att.append(el('button', { html: `${icon('file')} ${esc(a)}`, onclick: () => {
        pv.innerHTML = ''; pv.append(el('div', { class: 'callout warn a1-prev', html: `<b>${esc(a)}</b><br>Preview unavailable in forensic mode. This is a fictional file; its contents are not part of the simulation.` }));
      } }));
      read.append(att, pv);
    }
    const tools = el('div', { class: 'm-tools' });
    tools.append(el('button', { class: 'btn ghost sm', html: `${icon('eye')} View source`, onclick: () => { headerMode = true; flagged = new Set(); result = current.verified ? { verified: true, prior: true } : null; locked = !!current.verified; renderRead(); } }));
    read.append(tools);
  }

  function renderHeaders() {
    read.innerHTML = '';
    const m = current, judge = !!opts.gateway;
    read.append(el('h2', { text: 'Message source: ' + m.subject }));
    read.append(el('div', { class: 'callout', html: judge
      ? 'Raw headers. A display name can say anything; routing and authentication lines cannot be faked as easily. <b>Click the lines that look inconsistent</b> to flag them, then press Analyse.'
      : 'Raw headers (read-only). Compare them with the quarantine copy of suspicious mail on the laptop.' }));
    const boxEl = el('div', { class: 'hdr a1-hdrbox' });
    const go = el('button', { class: 'btn sm', html: `${icon('shield')} Analyse headers` });
    for (const h of m.headers) {
      const node = el('div', { class: 'hl' + (flagged.has(h.i) ? ' flag' : ''), tabindex: judge ? '0' : null, role: judge ? 'button' : null }, el('div', { html: `<b>${esc(h.k)}:</b> ${esc(h.v)}` }));
      if (judge) {
        const toggle = () => { if (locked) return; flagged.has(h.i) ? flagged.delete(h.i) : flagged.add(h.i); node.classList.toggle('flag'); go.disabled = !flagged.size; ctx.sfx('click'); };
        node.addEventListener('click', toggle);
        node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggle(); } });
      }
      boxEl.append(node);
    }
    read.append(boxEl);
    const res = el('div');
    if (result?.verified) res.append(el('div', { class: 'callout', html: `<b>Header forensics confirmed.</b> ${esc(result.msg || 'The message did not come from the company mail system.')} Collect it as evidence.` }));
    else if (result && result.relevant === false) res.append(el('div', { class: 'callout', html: `<b>Noted.</b> ${esc(result.msg)}` }));
    else if (result) res.append(el('div', { class: 'callout bad', html: `<b>Analysis not accepted.</b> ${esc(result.msg || '')}` }));
    read.append(res);
    go.disabled = !flagged.size || locked;
    go.onclick = async () => {
      go.disabled = true;
      const r = await A('header_submit', { id: m.id, flags: [...flagged] }).catch(() => null);
      if (!r) { go.disabled = false; return; }
      result = r;
      if (r.verified) { locked = true; current.verified = true; ctx.sfx('good'); ctx.offer('ev_spoof'); }
      else if (r.ok === false) { ctx.sfx('error'); read.classList.remove('shake'); void read.offsetWidth; read.classList.add('shake'); }
      renderHeaders();
    };
    const tools = el('div', { class: 'm-tools' }, el('button', { class: 'btn ghost sm', html: `${icon('left')} Back to message`, onclick: () => { headerMode = false; renderRead(); } }));
    if (judge) tools.append(go);
    read.append(tools);
  }

  async function openMail(id) {
    sel = id; headerMode = false; renderList();
    const r = await A('mail_open', { id }).catch(() => null);
    if (!r || r.ok === false) return;
    current = r; current.verified = r.evidence === 'ev_spoof';
    const row = all.find((x) => x.id === id); if (row) row.unread = false;
    opts.onUnread?.(all.filter((x) => x.folder === 'Inbox' && x.unread).length);
    if (r.evidence) ctx.offer(r.evidence);
    renderSide(); renderList(); renderRead(); read.scrollTop = 0;
  }

  renderSide(); renderRead(); loadAll();
  return { destroy() { dead = true; clearTimeout(timer); }, refresh: loadAll, focus: () => input.focus() };
}

export default { id: 'mail', title: 'Mail', size: 'xl', mount(body, ctx) { const m = mountMail(body, ctx); return () => m.destroy(); } };
