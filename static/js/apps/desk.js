// The executive desk. Three searchable spots, each found by interacting (nothing is shown up front):
//   blotter -> lift the corner     drawer -> pull it open     pad -> rub it with a pencil
import { el, icon, loupe, clamp } from '../core/runtime.js';

export default {
  id: 'desk', title: 'Executive Desk', eyebrow: 'Executive Office / Desk', size: 'xl',
  async mount(body, ctx) {
    const r = await ctx.api('interact', { target: 'desk' }, { silent: true, quiet: true });
    const found = { blotter: !!r.blotter, drawer: !!r.drawer, pad: !!r.pad };
    const foot = ctx.foot();
    foot.msg('Search the desk. Lift, open, rub. Anything you find can be collected.');

    const desk = el('div', { class: 'v-desk' });
    body.append(desk);
    const dim = el('div', { class: 'v-dim' }); desk.append(dim);

    /* ---------- note viewer / slip viewer (floating card) ---------- */
    let card = null;
    const closeCard = () => { card?.remove(); card = null; dim.classList.remove('on'); };
    dim.onclick = closeCard;
    function showCard(node) { closeCard(); card = el('div', { class: 'v-card' }, node, el('button', { class: 'btn ghost sm v-card-x', text: 'BACK TO DESK', onclick: closeCard })); desk.append(card); dim.classList.add('on'); }

    function noteView(text) {
      const paper = el('div', { class: 'v-note' },
        el('div', { class: 'v-note-h', text: 'Recovery code:' }),
        el('div', { class: 'v-note-n hand', text }));
      const wrap = el('div', { class: 'v-notewrap' }, paper);
      loupe(wrap, { zoom: 2 });
      showCard(el('div', {}, el('div', { class: 'eyebrow', text: 'Found under the blotter' }), wrap,
        el('p', { class: 'p', style: { marginTop: '.8rem' }, text: 'Two digits are missing and the ink has run. The other three are legible. Where could two more numbers come from?' })));
      ctx.offer('ev_note');
    }
    function slipView(text) {
      showCard(el('div', {}, el('div', { class: 'eyebrow', text: 'Found in the drawer' }),
        el('pre', { class: 'v-slip', text }),
        el('p', { class: 'p', style: { marginTop: '.8rem' }, text: 'Somebody was handed a laptop and never signed to return it.' })));
      ctx.offer('ev_slip');
    }

    /* ---------- blotter ---------- */
    const blot = el('button', { class: 'v-obj v-blotter' + (found.blotter ? ' lifted' : ''), 'aria-label': 'Desk blotter. Lift the corner.' },
      el('span', { class: 'v-corner' }), el('span', { class: 'v-lab', text: 'Blotter' }));
    blot.onclick = async () => {
      const j = await ctx.api('desk_item', { item: 'blotter' }, { silent: true, quiet: true });
      if (j.ok === false) return;
      blot.classList.add('lifted'); ctx.sfx('paper');
      setTimeout(() => noteView(j.note), 420);
    };

    /* ---------- drawer ---------- */
    const drawer = el('button', { class: 'v-obj v-drawer' + (found.drawer ? ' open' : ''), 'aria-label': 'Desk drawer. Open it.' },
      el('span', { class: 'v-handle' }), el('span', { class: 'v-lab', text: 'Drawer' }));
    drawer.onclick = async () => {
      const j = await ctx.api('desk_item', { item: 'drawer' }, { silent: true, quiet: true });
      if (j.ok === false) return;
      drawer.classList.add('open'); ctx.sfx('door');
      setTimeout(() => slipView(j.slip), 450);
    };

    /* ---------- pad: rub with a pencil ---------- */
    const padWrap = el('div', { class: 'v-obj v-pad', 'aria-label': 'Legal pad. Rub it with the pencil.' });
    const cv = el('canvas', { width: 360, height: 250 });
    const padTxt = el('div', { class: 'v-padtxt hand' });
    padWrap.append(el('span', { class: 'v-lab', text: 'Legal pad: rub' }), cv, padTxt);
    const G = { cols: 18, rows: 12 }, hit = new Set(); let pad = found.pad, drawing = false;
    const c2 = cv.getContext('2d');
    function reveal(text) {
      pad = true; padTxt.textContent = text; padWrap.classList.add('done');
      cv.style.transition = 'opacity 1.2s'; cv.style.opacity = '.35';
      ctx.sfx('good'); ctx.offer('ev_pad');
    }
    async function fetchPad() {
      const j = await ctx.api('desk_item', { item: 'pad' }, { silent: true, quiet: true });
      if (j.ok !== false && j.pad) reveal(j.pad);
    }
    function scratch(e) {
      if (pad) return;
      const b = cv.getBoundingClientRect();
      const x = (e.clientX - b.left) * (cv.width / b.width), y = (e.clientY - b.top) * (cv.height / b.height);
      c2.fillStyle = 'rgba(40,46,52,.16)';
      for (let i = 0; i < 3; i++) { c2.beginPath(); c2.arc(x + (Math.random() - .5) * 14, y + (Math.random() - .5) * 14, 7 + Math.random() * 5, 0, 7); c2.fill(); }
      hit.add(clamp(Math.floor(x / (cv.width / G.cols)), 0, G.cols - 1) + ',' + clamp(Math.floor(y / (cv.height / G.rows)), 0, G.rows - 1));
      if (hit.size / (G.cols * G.rows) > 0.5) { drawing = false; fetchPad(); }
    }
    cv.addEventListener('pointerdown', (e) => { drawing = true; cv.setPointerCapture(e.pointerId); scratch(e); });
    cv.addEventListener('pointermove', (e) => { if (drawing) { scratch(e); if (Math.random() < .12) ctx.sfx('paper'); } });
    cv.addEventListener('pointerup', () => { drawing = false; });
    if (found.pad) fetchPad();

    /* ---------- decor ---------- */
    const lamp = el('div', { class: 'v-lamp' });
    const mug = el('div', { class: 'v-mug' });
    const pen = el('div', { class: 'v-pencil', title: 'Pencil' });
    desk.append(lamp, mug, blot, drawer, padWrap, pen,
      el('div', { class: 'v-tip', html: `${icon('search')} Click the blotter and the drawer. Hold the mouse down and rub the pad.` }));

    // revisits: show what was already found
    if (found.blotter) blot.classList.add('lifted');
    return () => { closeCard(); };
  },
};
