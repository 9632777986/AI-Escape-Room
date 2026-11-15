import { $, el, showScreen, music, sfx } from '../core/runtime.js';
import * as audio from '../core/audio.js';

let glitchTimer = null;

export function showTitle({ hasSave = false, onNew, onContinue, onSettings } = {}) {
  const root = $('#screen-title');
  root.innerHTML = '';
  const bg = el('div', { class: 't-bg' }, el('img', { src: 'static/img/title.jpg', alt: '' }));
  const rain = el('canvas', { class: 's-rain' });
  const shade = el('div', { class: 't-shade' });

  const title = el('div', { class: 't-title', 'data-t': 'THE FALL', text: 'THE FALL' });
  const mk = (label, sub, fn, disabled) => {
    const b = el('button', { class: 't-item', disabled: disabled || null, onmouseenter: () => sfx('hover'), onclick: () => { audio.init(); sfx('click'); fn?.(); } },
      label, sub ? el('small', { text: sub }) : null);
    return b;
  };
  const menu = el('div', { class: 't-menu' },
    mk('New Investigation', null, onNew),
    mk('Continue', hasSave ? 'SAVED CASE' : 'NO SAVE', onContinue, !hasSave),
    mk('Settings', null, onSettings));

  const main = el('div', { class: 't-main' },
    el('div', { class: 'eyebrow', text: 'Interactive corporate cyber-thriller  /  fictional simulation' }),
    el('div', { class: 't-brand', text: 'NVIDIA' }),
    title,
    el('div', { class: 't-sub', text: "THE CEO'S LAST CHANCE" }),
    menu);

  const foot = el('div', { class: 't-foot' },
    el('span', { text: 'Fictional educational simulation. All accounts, devices, events and people are invented.' }),
    el('span', { text: 'Click anywhere to enable sound' }));
  root.append(bg, rain, shade, main, foot);
  showScreen('title');
  music('title');

  // first gesture unlocks audio
  const unlock = () => { audio.init(); music('title'); };
  root.addEventListener('pointerdown', unlock, { once: true });

  // glitch flicker now and then
  clearTimeout(glitchTimer);
  const flick = () => {
    if (!root.classList.contains('on')) return;
    title.classList.add('glitch');
    setTimeout(() => title.classList.remove('glitch'), 140 + Math.random() * 160);
    glitchTimer = setTimeout(flick, 3500 + Math.random() * 5000);
  };
  glitchTimer = setTimeout(flick, 2600);

  // light rain
  const c = rain.getContext('2d');
  const size = () => { rain.width = rain.clientWidth || 1280; rain.height = rain.clientHeight || 720; };
  size();
  const drops = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), l: Math.random() * .03 + .015, v: Math.random() * .0012 + .0008 }));
  let last = performance.now();
  const loop = (t) => {
    if (!root.classList.contains('on')) return;
    const dt = t - last; last = t;
    c.clearRect(0, 0, rain.width, rain.height);
    c.strokeStyle = 'rgba(160,210,230,.16)'; c.lineWidth = 1;
    c.beginPath();
    for (const d of drops) {
      d.y += d.v * dt; d.x -= d.v * dt * .12; if (d.y > 1) { d.y = -.05; d.x = Math.random() * 1.1; }
      c.moveTo(d.x * rain.width, d.y * rain.height); c.lineTo((d.x - d.l * .12) * rain.width, (d.y + d.l) * rain.height);
    }
    c.stroke();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
