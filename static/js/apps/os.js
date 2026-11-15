// EXEC-OS: a small desktop with real, draggable windows. Opened by the monitor and the laptop in the office.
//   monitor -> executive workstation: Mail (executive mailbox), Security Console, Archive Vault
//   laptop  -> security mail gateway: quarantined mail with raw-header analysis
import { el, icon, remaining, moveDrag, sleep, state } from '../core/runtime.js';
import { mountMail } from './mail.js';
import { mountTerminal } from './terminal.js';
import { mountVault } from './vault.js';

const BOOT_WS = [
  'EXEC-OS 4.2.1  secure executive workstation', 'bios .......................... ok', 'memory check ................. 32768 MB',
  'mounting VOL:/ ................ ok', 'mounting ARCHIVE:/ ............ encrypted (key required)', 'audit service ................. running',
  'session: exec-console (read-only forensic mode)', 'welcome.',
];
const BOOT_GW = [
  'MAILGATE 9.1  security mail gateway', 'quarantine store ............... ok', 'policy engine ................. running',
  'loading quarantined messages ..', 'session: investigator (read-only)', 'welcome.',
];

function makeOS(kind) {
  const gw = kind === 'laptop';
  return {
    id: kind, size: 'xl',
    title: gw ? 'Security Mail Gateway' : 'Executive Workstation',
    eyebrow: gw ? 'Executive Office / Laptop' : 'Executive Office / Computer',
    mount(body, ctx) {
      let dead = false, zTop = 5, activeKey = null;
      const wins = {}, offs = [];
      const desk = el('div', { class: 'os-desk' });
      const icons = el('div', { class: 'os-icons' });
      const task = el('div', { class: 'os-task' });
      const boot = el('div', { class: 'os-boot' });
      const os = el('div', { class: 'os' + (gw ? ' gw' : '') }, desk, task, boot);
      body.append(os); desk.append(icons);
      let badge = null;
      const setUnread = (n) => { if (!badge) return; badge.textContent = n; badge.style.display = n ? '' : 'none'; };

      const APPS = {
        mail: {
          title: gw ? 'Quarantine: held messages' : 'Mail: exec-office@nvidia.example', label: 'Mail', ic: 'mail',
          x: gw ? '7rem' : '7.6rem', y: '.7rem', w: gw ? '66rem' : '66.5rem', h: '32.6rem',
          mount: (host) => mountMail(host, ctx, { box: gw ? 'quarantine' : 'exec', onUnread: setUnread, gateway: gw }),
        },
        term: {
          title: 'Security Console: exec-console', label: 'Console', ic: 'terminal', x: '11rem', y: '4.5rem', w: '47rem', h: '26rem',
          mount: (host) => mountTerminal(host, ctx, { onKeypad: () => openWin('vault'), onUnlocked: () => paintLock() }),
        },
        vault: {
          title: 'Archive Vault: exec.archive.lock', label: 'Vault', ic: 'lock', x: '20rem', y: '3rem', w: '33rem', h: '28rem',
          mount: (host) => mountVault(host, ctx, { onUnlocked: () => { paintLock(); addRecoveryIcon(); openWin('readme'); } }),
        },
        readme: {
          title: 'RECOVERY_SEQUENCE.TXT', label: 'Recovery file', ic: 'doc', x: '14rem', y: '5rem', w: '38rem', h: '19rem',
          mount: (host) => {
            host.append(el('div', { class: 'a1-txt' },
              el('div', { class: 'mono', text: 'ARCHIVE: exec.archive  /  decrypted' }), ' ',
              el('div', { text: 'RECOVERY_SEQUENCE.TXT' }), ' ',
              el('div', { text: 'Unknown device LT-77 held an active session during the export window.' }),
              el('div', { text: 'Forensics lab access granted.' }), ' ',
              el('div', { class: 'mut', text: "Console tip: type 'sessions' for the active session list." })));
          },
        },
      };

      const DESK = gw ? [['mail', 'Quarantine', 'mail']] : [['mail', 'Mail', 'mail'], ['term', 'Security Console', 'terminal'], ['vault', 'Archive Vault', 'lock']];
      for (const [key, label, ic] of DESK) {
        const gl = el('div', { class: 'gl', html: icon(ic) });
        if (key === 'mail') { badge = el('b', { text: '' }); badge.style.display = 'none'; gl.append(badge); }
        icons.append(el('button', { class: 'os-ic', 'aria-label': 'Open ' + label, onclick: () => openWin(key) }, gl, el('span', { text: label })));
      }
      function addRecoveryIcon() {
        if (gw || icons.querySelector('[data-rec]')) return;
        const b = el('button', { class: 'os-ic', 'data-rec': '1', 'aria-label': 'Open RECOVERY_SEQUENCE.TXT', onclick: () => openWin('readme') },
          el('div', { class: 'gl', html: icon('doc') }), el('span', { text: 'RECOVERY_ SEQUENCE.TXT' }));
        icons.append(b);
      }

      function focus(key) {
        activeKey = key;
        for (const [k, w] of Object.entries(wins)) { w.node.classList.toggle('act', k === key); w.tb.classList.toggle('a1-tbon', k === key); }
        const w = wins[key]; if (w) { w.node.style.zIndex = ++zTop; w.node.style.display = ''; }
      }
      function closeWin(key) {
        const w = wins[key]; if (!w) return;
        try { w.inst?.destroy?.(); } catch (e) { console.error(e); }
        w.node.remove(); w.tb.remove(); delete wins[key];
        if (activeKey === key) { activeKey = null; const last = Object.keys(wins).pop(); if (last) focus(last); }
      }
      function openWin(key) {
        if (wins[key]) { focus(key); wins[key].inst?.focus?.(); return; }
        const a = APPS[key];
        const ob = el('div', { class: 'ob' });
        const xo = el('button', { class: 'xo', 'aria-label': 'Close window', html: icon('x'), dataset: { nodrag: '1' }, onclick: () => closeWin(key) });
        const oh = el('div', { class: 'oh' }, el('span', { html: `${icon(a.ic)} ${a.title}` }), xo);
        const node = el('div', { class: 'oswin', style: { left: a.x, top: a.y, width: a.w, height: a.h, opacity: '0', transform: 'scale(.97)' } }, oh, ob);
        desk.append(node);
        requestAnimationFrame(() => { node.style.transition = 'opacity .2s, transform .2s'; node.style.opacity = '1'; node.style.transform = 'none'; });
        const tb = el('button', { class: 'tb', html: `${icon(a.ic)} ${a.label}`, onclick: () => { if (activeKey === key && node.style.display !== 'none') { node.style.display = 'none'; activeKey = null; tb.classList.remove('a1-tbon'); } else focus(key); } });
        task.insertBefore(tb, spacer);
        const inst = a.mount(ob);
        wins[key] = { node, tb, inst };
        node.addEventListener('pointerdown', () => focus(key), true);
        moveDrag(node, { bounds: desk, handle: oh, onEnd: () => { node.style.zIndex = ++zTop; } });
        focus(key); ctx.sfx('click');
      }

      const spacer = el('div', { class: 'sp' });
      const lockInd = el('div', { class: 'a1-lock' });
      const clock = el('div', { class: 'a1-clock' });
      task.append(el('div', { class: 'a1-start', html: `${icon('shield')} ${gw ? 'MAILGATE' : 'EXEC-OS'}` }), spacer);
      if (!gw) task.append(lockInd);
      task.append(clock);
      function paintLock() {
        const ok = !!state.s?.flags?.archive_unlocked;
        lockInd.className = 'a1-lock ' + (ok ? 'ok' : 'no');
        lockInd.innerHTML = `${icon(ok ? 'unlock' : 'lock')} ARCHIVE: ${ok ? 'UNLOCKED' : 'LOCKED'}`;
        if (ok) addRecoveryIcon();
      }
      function paintClock() {
        const t = 22 * 3600 + 41 * 60 + Math.max(0, 1800 - remaining());
        clock.innerHTML = `${String(Math.floor(t / 3600) % 24).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}<small>13 NOV 2026</small>`;
      }
      paintLock(); paintClock();
      offs.push(ctx.bus.on('state', paintLock), ctx.bus.on('tick', paintClock));

      let booted = false;
      async function finishBoot() {
        if (booted) return; booted = true;
        boot.style.transition = 'opacity .45s'; boot.style.opacity = '0'; ctx.sfx('unlock');
        setTimeout(() => boot.remove(), 480);
        if (dead) return;
        openWin('mail');
      }
      boot.addEventListener('click', finishBoot);
      (async () => {
        for (const l of (gw ? BOOT_GW : BOOT_WS)) { if (booted || dead) return; boot.append(el('div', { text: l })); ctx.sfx('keys'); await sleep(140); }
        await sleep(260); finishBoot();
      })();

      return () => { dead = true; offs.forEach((f) => f()); Object.keys(wins).forEach(closeWin); };
    },
  };
}

export const monitor = makeOS('monitor');
export const laptop = makeOS('laptop');
export default monitor;
