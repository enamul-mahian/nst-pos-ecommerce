/*
 * Browser tamper guard: blocks the context menu and the developer-tools / view-source / save shortcuts,
 * watches for docked developer tools and reports every attempt to the server (Security Center).
 * The server re-checks prices, amounts and permissions on every request; this only discourages tampering.
 */
const DEVTOOLS_GAP = 160;
const CHECK_EVERY_MS = 1500;

function isEditable(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
}

function shortcutOf(event) {
  const key = String(event.key || '').toLowerCase();
  const mod = event.ctrlKey || event.metaKey;
  if (key === 'f12') return ['devtools_key', 'F12'];
  if (mod && (event.shiftKey || event.altKey) && ['i', 'j', 'c'].includes(key)) return ['devtools_key', `${event.shiftKey ? 'Ctrl+Shift' : 'Cmd+Alt'}+${key.toUpperCase()}`];
  if (mod && !event.shiftKey && key === 'u') return ['view_source', 'Ctrl+U'];
  if (mod && !event.shiftKey && key === 's') return ['save_page', 'Ctrl+S'];
  return null;
}

function showNotice(text) {
  if (!text || typeof document === 'undefined') return;
  let box = document.getElementById('nst-guard-notice');
  if (!box) {
    box = document.createElement('div');
    box.id = 'nst-guard-notice';
    box.setAttribute('role', 'status');
    box.style.cssText = 'position:fixed;left:50%;bottom:24px;z-index:2147483647;transform:translateX(-50%);max-width:calc(100vw - 32px);padding:10px 16px;border-radius:12px;background:#111827;color:#fff;font:600 13px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);pointer-events:none;transition:opacity .2s';
    document.body.appendChild(box);
  }
  box.textContent = text;
  box.style.opacity = '1';
  window.clearTimeout(box.__timer);
  box.__timer = window.setTimeout(() => { box.style.opacity = '0'; }, 2600);
}

/**
 * start({ loadConfig, report, notice }) -> stop()
 *   loadConfig(): Promise<{ active: boolean, detectDevtools: boolean }>
 *   report(action, key): send one attempt to the server
 *   notice(): text shown to the visitor after a blocked action
 */
export function startTamperGuard({ loadConfig, report, notice }) {
  let stopped = false;
  let cleanup = () => {};

  loadConfig().then((config) => {
    if (stopped || !config?.active) return;
    const send = (action, key = '') => { try { report(action, key); } catch { /* reporting is best effort */ } };

    const onContextMenu = (event) => {
      if (isEditable(event.target)) return;
      event.preventDefault();
      showNotice(notice());
      send('context_menu');
    };
    const onKeyDown = (event) => {
      const hit = shortcutOf(event);
      if (!hit) return;
      event.preventDefault();
      event.stopPropagation();
      showNotice(notice());
      send(hit[0], hit[1]);
    };

    let devtoolsOpen = false;
    const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const checkDevtools = () => {
      const open = window.outerWidth - window.innerWidth > DEVTOOLS_GAP || window.outerHeight - window.innerHeight > DEVTOOLS_GAP;
      if (open && !devtoolsOpen) send('devtools_open');
      devtoolsOpen = open;
    };
    const timer = config.detectDevtools && !touch ? window.setInterval(checkDevtools, CHECK_EVERY_MS) : null;

    window.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('keydown', onKeyDown, true);
    cleanup = () => {
      window.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('keydown', onKeyDown, true);
      if (timer) window.clearInterval(timer);
    };
  }).catch(() => undefined);

  return () => { stopped = true; cleanup(); };
}
