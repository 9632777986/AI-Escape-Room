// Endings driven by the server's `end` object. Success: dawn cinematic -> simulated recovery -> case report. Failure: fictional news -> mission failed.
import { $, el, esc, showScreen, music, sfx, sleep, clamp, mmss } from '../core/runtime.js';
import { icon } from '../core/icons.js';
import { playCine } from './cine.js';

let token = 0;
const bgImg = (src) => el('div', { class: 'e-bg' }, el('img', { src, alt: '' }));
function countUp(node, to, { dur = 1400, suffix = '', my } = {}) {
  const t0 = performance.now();
  const step = (t) => { if (my !== token) return; const k = clamp((t - t0) / dur, 0, 1); node.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + suffix; if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const buttons = (cb) => el('div', { class: 'report-actions' },
  el('button', { class: 'btn', onclick: () => { sfx('click'); cb.onRestart?.(); } }, 'PLAY AGAIN'),
  el('button', { class: 'btn ghost', onclick: () => { sfx('click'); cb.onTitle?.(); } }, 'TITLE'));

export async function showEnding(view, cb = {}) {
  const my = ++token;
  const e = view?.end || {};
  return e.type === 'success' ? win(view, e, cb, my) : lose(view, e, cb, my);
}

async function win(view, e, cb, my) {
  await playCine('win');
  if (my !== token) return;
  const root = $('#screen-end'); root.innerHTML = '';
  music('success');
  const rec = e.recovery || {};
  const rows = Object.entries(rec).map(([k, v]) => el('div', { class: 'tick s-tick' }, el('span', { text: k.toUpperCase() }), el('b', { class: 's-v', 'data-to': v, text: '0' })));
  const recov = el('div', { class: 'recov s-fadein' },
    el('div', { class: 'eyebrow', text: 'Simulated outcome  /  not real data' }),
    el('div', { class: 'big', text: 'COMPANY RECOVERY' }),
    el('p', { class: 'p', style: { margin: '1rem auto 0', maxWidth: '34rem' }, text: 'In this fictional scenario the incident is contained and the company begins to recover. These figures are generated from your decisions.' }),
    ...rows,
    el('div', { style: { marginTop: '1.6rem' } }, el('button', { class: 'btn', onclick: () => { sfx('click'); report(); } }, 'OPEN CASE REPORT ', el('span', { html: icon('right') }))));
  root.append(bgImg('static/img/end_success.jpg'), el('div', { class: 'e-wrap' }, recov));
  showScreen('end');
  rows.forEach((r, i) => setTimeout(() => { if (my !== token) return; sfx('info'); const b = r.querySelector('.s-v'); countUp(b, +b.dataset.to, { suffix: ' / 100', my }); }, 900 + i * 700));

  function report() {
    if (my !== token) return;
    sfx('paper'); root.innerHTML = '';
    const left = el('div', { class: 'rl' },
      el('div', { class: 'mono', style: { color: '#3d6200', letterSpacing: '.2em' }, text: 'OPERATION NIGHTFALL  /  CASE REPORT  /  FICTIONAL' }),
      el('h2', { html: 'Incident<br>Report' }),
      el('div', { class: 'mono', text: `Time left ${mmss(e.time_left)}   ·   Wrong submissions ${e.wrong}   ·   Hints ${e.hints}` }),
      el('h4', { text: 'Summary' }),
      el('p', { style: { fontSize: '.78rem', lineHeight: 1.55 }, text: 'On the night of 13 November 2026 a session labelled "alice.huang" from unregistered device LT-77 opened the restricted archive, exported confidential_architecture.zip and deleted the source copy. The evidence supports account compromise or misuse.' }),
      el('p', { style: { fontSize: '.78rem', lineHeight: 1.55, marginTop: '.5rem', fontWeight: 600 }, text: 'It does not identify who operated the device. No individual is named in this report.' }));
    const right = el('div', { class: 'rr' },
      el('h4', { style: { marginTop: 0 }, text: 'Containment plan executed' }),
      el('ol', {}, ...(e.steps || []).map((x) => el('li', { text: x.label }))),
      el('h4', { text: 'Review notes' }),
      el('ul', {}, ...((e.notes || []).length ? e.notes : ['Textbook response order. No issues recorded.']).map((n) => el('li', { text: n }))),
      el('h4', { text: `Evidence collected: ${e.evidence}` }),
      el('h4', { text: 'Score' }),
      el('div', { class: 'mono', style: { fontSize: '1.4rem' }, text: String(e.score) }),
      el('div', { style: { marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' } }, el('div', { class: 'rank', text: e.grade || 'C' })));
    root.append(bgImg('static/img/end_success.jpg'), el('div', { class: 'e-wrap' }, el('div', { class: 'report s-fadein' }, left, right)), buttons(cb));
    setTimeout(() => sfx('success'), 400);
  }
}

const HEAD = {
  time: ['ARCHIVE EXPORT NEVER CONTAINED AS DEADLINE PASSES', 'Security staff ran out of time to reconstruct the incident. The exported files remain unaccounted for.', ['Clear the cheap clues first: note, bin, terminal.', 'Wrong answers cost seconds. Verify before you submit.', 'Hints are limited, but the clock is harsher.']],
  a_wipe: ['ONLY FORENSIC COPY OF SUSPECT DEVICE WIPED', 'A decision made under pressure destroyed the record, leaving the case unprovable.', ['Contain, then preserve, then reset.', 'Never wipe a device before imaging it.']],
  a_accuse: ['EMPLOYEE NAMED WITHOUT PROOF', 'You named a person the evidence does not identify.', ['Account activity is not human identity.', 'Report what you can prove.']],
  a_purge: ['AUDIT TRAIL ERASED DURING CLEAN-UP', 'You erased the records the investigation needed.', ['Never delete the evidence you still need.']],
  a_wait: ['RESPONSE DELAYED AS EXPORT SPREADS', 'The session stayed open all weekend.', ['Isolate and revoke early.']],
};

async function lose(view, e, cb, my) {
  const [head, subText, lessonList] = HEAD[e.cause] || HEAD.time;
  const root = $('#screen-end'); root.innerHTML = '';
  sfx('alarm'); music('fail');
  const lt = el('div', { class: 'lt' }, el('span', { class: 'br', text: 'BREAKING' }), el('b'));
  const news = el('div', { class: 'news s-fadein' }, el('img', { class: 's-newsbg', src: 'static/img/end_fail.jpg', alt: '' }), el('div', { class: 's-newsdim' }),
    el('div', { class: 'fict', text: 'MERIDIAN NEWS 24  /  FICTIONAL NETWORK  /  FICTIONAL SIMULATION' }), lt, el('div', { class: 'sub', text: subText }));
  const skip = el('button', { class: 'btn ghost sm s-newskip', onclick: () => { token++; card(); } }, 'SKIP');
  root.append(bgImg('static/img/end_fail.jpg'), el('div', { class: 'e-wrap' }, news), skip);
  showScreen('end');
  const b = lt.querySelector('b');
  for (let i = 1; i <= head.length; i++) { if (my !== token) return; b.textContent = head.slice(0, i); if (i % 2 === 0) sfx('type'); await sleep(32); }
  await sleep(4500);
  if (my !== token) return;
  card();
  function card() {
    root.innerHTML = '';
    sfx('fail');
    const box = el('div', { class: 's-failcard s-fadein' },
      el('div', { class: 'eyebrow', style: { color: 'var(--red)' }, text: 'Mission failed  /  fictional outcome' }),
      el('div', { class: 's-failtitle', text: 'MISSION FAILED' }),
      el('div', { class: 'p', style: { maxWidth: '36rem', margin: '.4rem auto 1rem' }, text: subText }),
      (e.steps || []).length ? el('div', { class: 'callout bad', style: { textAlign: 'left' }, html: esc(e.steps.find((s) => s.kind === 'critical')?.why || '') }) : null,
      el('div', { class: 'rank f', style: { margin: '1rem auto' }, text: 'F' }),
      el('div', { class: 'h3', text: 'Lessons learned' }),
      el('ul', { class: 's-lessons' }, ...lessonList.map((x, i) => el('li', { style: { animationDelay: 0.5 + i * 0.35 + 's' }, text: x }))),
      el('div', { class: 's-failbtns' },
        el('button', { class: 'btn', onclick: () => { sfx('click'); cb.onRestart?.(); } }, 'PLAY AGAIN'),
        el('button', { class: 'btn ghost', onclick: () => { sfx('click'); cb.onTitle?.(); } }, 'TITLE')));
    root.append(bgImg('static/img/end_fail.jpg'), el('div', { class: 'e-wrap' }, box));
  }
}
