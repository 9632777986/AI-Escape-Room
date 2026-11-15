import { $, el, esc, showScreen, music, sfx, sleep } from '../core/runtime.js';
import { icon } from '../core/icons.js';

// Mirrors server/content.py BRIEFING_OBJECTIVES with a short descriptor each.
const STEPS = [
  ['SEARCH', 'Search the executive office. Every object may hold a clue.'],
  ['RECOVER', 'Recover the five-digit key and open the archive.'],
  ['TRACE', 'Trace the device, align the clocks and rebuild the timeline.'],
  ['CONTAIN', 'Contain the incident without destroying evidence.'],
];
const PARAS = [
  'A confidential architecture archive has vanished. The export was deliberate, and the source copy was deleted minutes later.',
  'Someone used a trusted account name. Your assignment: reconstruct what happened before the evidence disappears, and report only what you can prove.',
];

let token = 0;

export function showBriefing({ onBegin } = {}) {
  const my = ++token;
  const root = $('#screen-brief');
  root.innerHTML = '';
  const bg = el('div', { class: 'b-bg' }, el('img', { src: 'static/img/office.jpg', alt: '' }));

  const p1 = el('p', { class: 't' }), p2 = el('p', { class: 't' });
  const params = el('div', { class: 'params s-hide-until' },
    el('div', { html: 'Time allowed<b>30 MINUTES</b>' }),
    el('div', { html: 'Threat level<b class="r">CRITICAL</b>' }),
    el('div', { html: 'Assistance<b>AI GAME MASTER</b>' }),
    el('div', { html: 'Failure condition<b class="r">TIME EXPIRES</b>' }));
  const clock = el('div', { class: 's-clock', text: '30:00' });
  const left = el('div', { class: 'l' },
    el('div', { class: 'stampc', text: 'CLASSIFIED / OPERATION NIGHTFALL' }),
    el('h2', { html: 'YOUR ORDERS,<br><em>INVESTIGATOR.</em>' }),
    p1, p2, params, clock);

  const list = el('ul', { class: 'mission' });
  const items = STEPS.map(([h, t], i) => el('li', { html: `<i>0${i + 1}</i><div><b>${esc(h)}</b><span>${esc(t)}</span></div>` }));
  items.forEach((li) => list.append(li));
  const right = el('div', { class: 'r' }, el('div', { class: 'eyebrow', style: { color: '#d4a15a' }, text: 'Your mission' }), list,
    el('div', { class: 's-note', html: `${icon('clock')} The 30:00 timer starts <b>only</b> when you press the button below. Every wrong answer costs you seconds.` }));

  const go = el('button', { class: 'btn b-go s-pulse s-hide', onclick: () => { if (!go._done) { go._done = true; sfx('click'); onBegin?.(); } } }, 'BEGIN THE 30-MINUTE INVESTIGATION ', el('span', { html: icon('play') }));
  root.append(bg, el('div', { class: 'dossier' }, left, right), go);
  showScreen('brief');
  music('tense');

  const typeInto = async (node, text) => {
    for (let i = 1; i <= text.length; i++) {
      if (my !== token) return;
      node.textContent = text.slice(0, i);
      if (i % 2 === 0) sfx('type');
      await sleep(/[.,]/.test(text[i - 1]) ? 120 : 14);
    }
  };
  (async () => {
    await sleep(700);
    await typeInto(p1, PARAS[0]); await sleep(300);
    await typeInto(p2, PARAS[1]); await sleep(300);
    if (my !== token) return;
    params.classList.add('s-in'); sfx('info');
    await sleep(500);
    for (const li of items) { if (my !== token) return; li.classList.add('on'); sfx('paper'); await sleep(550); }
    go.classList.remove('s-hide');
  })();
}
