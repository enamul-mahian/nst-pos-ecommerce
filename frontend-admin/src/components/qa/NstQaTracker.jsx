import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Bug,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleStop,
  Download,
  FileArchive,
  FilePlus2,
  GripVertical,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  addQaEvent,
  addQaFile,
  clearAllQaData,
  createQaSession,
  deleteQaSession,
  getQaEvents,
  getQaFiles,
  getQaSession,
  updateQaSession,
} from './qaStore';
import {
  isQaAuthorized,
  redactObject,
  redactText,
  roleList,
  safeSerialize,
  sanitizeLabel,
  sanitizeUrl,
  userSummary,
} from './qaRedaction';
import { createStoredZip, downloadBlob, sha256Hex } from './qaZip';
import './nstQaTracker.css';

const ACTIVE_SESSION_KEY = 'nst-qa-tracker:active-session:v1';
const POSITION_KEY = 'nst-qa-tracker:position:v1';
const SLOW_REQUEST_MS = 1800;
const MAX_VISIBLE_EVENTS = 150;
const AUTO_EVENT_DEDUP_MS = 2500;

const nowIso = () => new Date().toISOString();
const makeId = () => crypto.randomUUID?.() || `qa-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const formatTime = (value) => {
  try {
    return new Intl.DateTimeFormat('en-BD', {
      timeZone: 'Asia/Dhaka',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value));
  } catch {
    return String(value || '');
  }
};
const safeFilename = (value) => String(value || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
const eventFingerprint = (event) => `${event.category}|${event.type}|${event.severity}|${event.message}`;

function getThemeSnapshot() {
  const root = document.documentElement;
  const body = document.body;
  const style = window.getComputedStyle(root);
  return {
    mode: root.dataset.theme || root.dataset.mode || body.dataset.theme || (root.classList.contains('dark') || body.classList.contains('dark') ? 'dark' : 'light/custom'),
    primary: style.getPropertyValue('--nst-dashboard-primary').trim(),
    accent: style.getPropertyValue('--nst-dashboard-accent').trim(),
    background: style.getPropertyValue('--nst-dashboard-bg').trim(),
    surface: style.getPropertyValue('--nst-dashboard-surface').trim(),
    text: style.getPropertyValue('--nst-dashboard-text').trim(),
  };
}

function getEnvironment(auth) {
  return {
    generatedAt: nowIso(),
    timezone: 'Asia/Dhaka',
    user: userSummary(auth),
    browser: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    online: navigator.onLine,
    route: `${window.location.pathname}${window.location.search}`,
    origin: window.location.origin,
    build: import.meta.env.VITE_APP_VERSION || import.meta.env.VITE_BUILD_ID || 'frontend-admin-1.0.0',
    theme: getThemeSnapshot(),
  };
}

function severityRank(severity) {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[severity] ?? 0;
}

function summarizeEvents(events) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, pass: 0, fail: 0, review: 0 };
  events.forEach((event) => {
    const severity = event.severity || 'info';
    counts[severity] = (counts[severity] || 0) + 1;
    if (event.result === 'pass') counts.pass += 1;
    if (event.result === 'fail') counts.fail += 1;
    if (event.result === 'needs-review') counts.review += 1;
  });
  return counts;
}

function statusFromCounts(counts, sessionStatus) {
  if (sessionStatus === 'paused') return 'paused';
  if (sessionStatus === 'stopped') return 'stopped';
  if (counts.critical || counts.high || counts.fail) return 'error';
  if (counts.medium || counts.low || counts.review) return 'warning';
  return 'healthy';
}

function reportMarkdown(session, events, files, redactionStats) {
  const counts = summarizeEvents(events);
  const routes = events.filter((event) => event.category === 'navigation');
  const failures = events.filter((event) => severityRank(event.severity) >= 3 || event.result === 'fail');
  const slowRequests = events.filter((event) => event.category === 'network' && ['slow-fetch', 'slow-xhr'].includes(event.type));
  const failedRequests = events.filter((event) => event.category === 'network' && !['slow-fetch', 'slow-xhr'].includes(event.type) && (severityRank(event.severity) >= 2 || Number(event.details?.status || 0) >= 400));
  const firstFailure = failures[0];
  const lastFailure = failures[failures.length - 1];
  const testedPages = [...new Set(routes.map((event) => event.route).filter(Boolean))];
  return `# NST QA Tracker Report\n\n` +
    `**Session:** ${redactText(session.name)}  \n` +
    `**Status:** ${session.status}  \n` +
    `**Started:** ${session.startedAt}  \n` +
    `**Updated:** ${session.updatedAt || session.startedAt}  \n` +
    `**Build:** ${redactText(session.environment?.build || '')}  \n` +
    `**Role(s):** ${(session.environment?.user?.roles || []).join(', ')}  \n` +
    `**Branch:** ${redactText(session.environment?.user?.branch || '')}  \n\n` +
    `## Result Summary\n\n` +
    `- Critical: ${counts.critical}\n` +
    `- High: ${counts.high}\n` +
    `- Medium: ${counts.medium}\n` +
    `- Low: ${counts.low}\n` +
    `- Manual Pass: ${counts.pass}\n` +
    `- Manual Fail: ${counts.fail}\n` +
    `- Needs Review: ${counts.review}\n` +
    `- Failed API/network requests: ${failedRequests.length}\n` +
    `- Slow successful requests: ${slowRequests.length}\n` +
    `- Pages visited: ${testedPages.length}\n` +
    `- Files/screenshots: ${files.length}\n\n` +
    `## First Failure\n\n${firstFailure ? `- ${firstFailure.timestamp} — ${firstFailure.message}` : '- None detected'}\n\n` +
    `## Last Failure\n\n${lastFailure ? `- ${lastFailure.timestamp} — ${lastFailure.message}` : '- None detected'}\n\n` +
    `## Pages Tested\n\n${testedPages.length ? testedPages.map((route) => `- ${route}`).join('\n') : '- No route event'}\n\n` +
    `## Manual Notes\n\n${events.filter((event) => event.category === 'manual').map((event) => `### ${event.message}\n- Result: ${event.result || 'needs-review'}\n- Severity: ${event.severity}\n- Route: ${event.route}\n- Expected: ${event.details?.expected || '-'}\n- Actual: ${event.details?.actual || '-'}\n- Steps: ${event.details?.steps || '-'}\n- Note: ${event.details?.note || '-'}\n`).join('\n') || '- None'}\n` +
    `## Redaction Summary\n\n- Sensitive fields removed: ${redactionStats.redactedFields || 0}\n- Values masked/redacted: ${redactionStats.redactedValues || 0}\n`;
}

function reportHtml(markdown, events) {
  const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
  const rows = events.slice().reverse().map((event) => `<tr><td>${escape(event.timestamp)}</td><td>${escape(event.severity)}</td><td>${escape(event.category)}</td><td>${escape(event.route || '')}</td><td>${escape(event.message)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>NST QA Report</title><style>body{font-family:Arial,sans-serif;margin:32px;background:#f7f8fb;color:#172033}pre{white-space:pre-wrap;background:#fff;padding:20px;border-radius:16px;border:1px solid #dfe4ec}table{width:100%;border-collapse:collapse;background:#fff}th,td{padding:10px;border:1px solid #dfe4ec;text-align:left;font-size:12px}th{background:#eef2f7}</style></head><body><h1>NST QA Tracker Report</h1><pre>${escape(markdown)}</pre><h2>Event Timeline</h2><table><thead><tr><th>Time</th><th>Severity</th><th>Category</th><th>Route</th><th>Message</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

async function captureDisplayFrame() {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen capture is not supported by this browser');
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser' },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
  });
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    if (!video.videoWidth) await new Promise((resolve) => { video.onloadedmetadata = resolve; });
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || window.innerWidth;
    canvas.height = video.videoHeight || window.innerHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Screenshot capture failed')), 'image/png', 0.92));
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

export default function NstQaTracker({ auth }) {
  const location = useLocation();
  const authorized = isQaAuthorized(auth);
  const qaUserKey = useMemo(() => String(userSummary(auth).id || roleList(auth).join('-') || 'super-admin'), [auth]);
  const activeSessionStorageKey = `${ACTIVE_SESSION_KEY}:${qaUserKey}`;
  const positionStorageKey = `${POSITION_KEY}:${qaUserKey}`;
  const authRef = useRef(auth);
  const sessionRef = useRef(null);
  const statusRef = useRef('recording');
  const dedupRef = useRef(new Map());
  const dragRef = useRef(null);
  const recordRef = useRef(null);
  const [session, setSession] = useState(null);
  const [events, setEvents] = useState([]);
  const [sessionTotals, setSessionTotals] = useState({ critical: 0, high: 0, medium: 0, low: 0, info: 0, pass: 0, fail: 0, review: 0, total: 0 });
  const [files, setFiles] = useState([]);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState('summary');
  const [busy, setBusy] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [toast, setToast] = useState('');
  const [position, setPosition] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(positionStorageKey) || 'null');
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return saved;
    } catch {}
    return { x: Math.max(16, window.innerWidth - 78), y: Math.max(90, window.innerHeight - 88) };
  });
  const [manual, setManual] = useState({
    title: '',
    category: 'ui',
    severity: 'medium',
    result: 'needs-review',
    expected: '',
    actual: '',
    steps: '',
    note: '',
  });
  const [pendingFiles, setPendingFiles] = useState([]);

  useEffect(() => { authRef.current = auth; }, [auth]);
  useEffect(() => { sessionRef.current = session; statusRef.current = session?.status || 'stopped'; }, [session]);

  const showToast = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }, []);

  const loadSessionData = useCallback(async (nextSession) => {
    const [storedEvents, storedFiles] = await Promise.all([
      getQaEvents(nextSession.id),
      getQaFiles(nextSession.id),
    ]);
    setSession(nextSession);
    setEvents(storedEvents.slice(-MAX_VISIBLE_EVENTS));
    const totals = summarizeEvents(storedEvents);
    setSessionTotals({ ...totals, total: storedEvents.length });
    setFiles(storedFiles);
  }, []);

  const startNewSession = useCallback(async (name = '') => {
    const environment = getEnvironment(authRef.current);
    const next = {
      id: makeId(),
      name: name || `NST QA Session — ${new Intl.DateTimeFormat('en-BD', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`,
      status: 'recording',
      startedAt: nowIso(),
      updatedAt: nowIso(),
      environment,
    };
    await createQaSession(next);
    localStorage.setItem(activeSessionStorageKey, next.id);
    setEvents([]);
    setSessionTotals({ critical: 0, high: 0, medium: 0, low: 0, info: 0, pass: 0, fail: 0, review: 0, total: 0 });
    setFiles([]);
    setSession(next);
    sessionRef.current = next;
    statusRef.current = 'recording';
    return next;
  }, [activeSessionStorageKey]);

  useEffect(() => {
    if (!authorized) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const activeId = localStorage.getItem(activeSessionStorageKey);
        const existing = activeId ? await getQaSession(activeId) : null;
        if (cancelled) return;
        if (existing && ['recording', 'paused'].includes(existing.status)) {
          await loadSessionData(existing);
        } else {
          await startNewSession();
        }
      } catch (error) {
        if (!cancelled) setStorageError(error?.message || 'QA local storage could not be initialized');
      }
    })();
    return () => { cancelled = true; };
  }, [authorized, activeSessionStorageKey, loadSessionData, startNewSession]);

  const recordEvent = useCallback(async (input, options = {}) => {
    const activeSession = sessionRef.current;
    if (!activeSession) return null;
    if (statusRef.current !== 'recording' && !options.force) return null;

    const event = {
      sessionId: activeSession.id,
      timestamp: nowIso(),
      route: `${window.location.pathname}${window.location.search}`,
      category: input.category || 'system',
      type: input.type || 'event',
      severity: input.severity || 'info',
      result: input.result || null,
      message: sanitizeLabel(input.message || input.type || 'QA event'),
      details: redactObject(input.details || {}),
      source: input.source || 'automatic',
    };

    if (!options.force) {
      const fingerprint = eventFingerprint(event);
      const last = dedupRef.current.get(fingerprint) || 0;
      const timestamp = Date.now();
      if (timestamp - last < AUTO_EVENT_DEDUP_MS) return null;
      dedupRef.current.set(fingerprint, timestamp);
    }

    try {
      const stored = await addQaEvent(event);
      setEvents((current) => [...current, stored].slice(-MAX_VISIBLE_EVENTS));
      setSessionTotals((current) => {
        const severity = stored.severity || 'info';
        return {
          ...current,
          [severity]: (current[severity] || 0) + 1,
          pass: current.pass + (stored.result === 'pass' ? 1 : 0),
          fail: current.fail + (stored.result === 'fail' ? 1 : 0),
          review: current.review + (stored.result === 'needs-review' ? 1 : 0),
          total: current.total + 1,
        };
      });
      return stored;
    } catch (error) {
      setStorageError(error?.message || 'An event could not be saved');
      return null;
    }
  }, []);

  recordRef.current = recordEvent;

  useEffect(() => {
    if (!authorized || !session) return;
    recordEvent({
      category: 'navigation',
      type: 'route-change',
      severity: 'info',
      message: `Opened ${location.pathname}${location.search}`,
      details: { pathname: location.pathname, search: location.search, hash: location.hash },
    }, { force: true });

    const blankTimer = window.setTimeout(() => {
      const main = document.querySelector('main.nst-shell-main');
      const contentLength = String(main?.innerText || '').trim().length;
      const rect = main?.getBoundingClientRect?.();
      if (!main || contentLength < 2 || (rect && rect.height < 40)) {
        recordEvent({
          category: 'runtime',
          type: 'blank-page-suspected',
          severity: 'high',
          message: 'The current route appears blank or did not render visible content',
          details: { contentLength, height: rect?.height || 0 },
        });
      }
    }, 2600);
    return () => window.clearTimeout(blankTimer);
  }, [authorized, session?.id, location.pathname, location.search, location.hash, recordEvent]);

  useEffect(() => {
    if (!authorized || !session) return undefined;
    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = (...args) => {
      originalError(...args);
      recordRef.current?.({ category: 'console', type: 'console-error', severity: 'high', message: safeSerialize(args), details: { arguments: args.map(safeSerialize) } });
    };
    console.warn = (...args) => {
      originalWarn(...args);
      recordRef.current?.({ category: 'console', type: 'console-warning', severity: 'medium', message: safeSerialize(args), details: { arguments: args.map(safeSerialize) } });
    };

    const onWindowError = (event) => {
      const target = event.target;
      if (target && target !== window) {
        const url = target.src || target.href || '';
        recordRef.current?.({
          category: 'resource',
          type: 'resource-load-error',
          severity: 'high',
          message: `Failed to load ${target.tagName || 'resource'}`,
          details: { tag: target.tagName, url: sanitizeUrl(url) },
        });
        return;
      }
      recordRef.current?.({
        category: 'runtime',
        type: 'uncaught-error',
        severity: 'critical',
        message: event.message || event.error?.message || 'Uncaught JavaScript error',
        details: { filename: sanitizeUrl(event.filename), line: event.lineno, column: event.colno, error: event.error },
      });
    };
    const onRejection = (event) => recordRef.current?.({
      category: 'runtime',
      type: 'unhandled-rejection',
      severity: 'critical',
      message: event.reason?.message || safeSerialize(event.reason) || 'Unhandled promise rejection',
      details: { reason: event.reason },
    });
    const onCustom = (event) => recordRef.current?.(event.detail || {}, { force: true });
    const onOffline = () => recordRef.current?.({ category: 'network', type: 'offline', severity: 'high', message: 'Browser went offline' }, { force: true });
    const onOnline = () => recordRef.current?.({ category: 'network', type: 'online', severity: 'info', message: 'Browser connection restored' }, { force: true });

    window.addEventListener('error', onWindowError, true);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('nst-qa-event', onCustom);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
      window.removeEventListener('error', onWindowError, true);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('nst-qa-event', onCustom);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [authorized, session?.id]);

  useEffect(() => {
    if (!authorized || !session) return undefined;
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const input = args[0];
      const init = args[1] || {};
      const url = typeof input === 'string' ? input : input?.url;
      const method = init.method || input?.method || 'GET';
      const start = window.performance.now();
      try {
        const response = await originalFetch(...args);
        const duration = Math.round(window.performance.now() - start);
        if (!response.ok || duration >= SLOW_REQUEST_MS) {
          recordRef.current?.({
            category: 'network',
            type: response.ok ? 'slow-fetch' : 'failed-fetch',
            severity: response.ok ? 'medium' : response.status >= 500 ? 'high' : 'medium',
            message: `${method} ${sanitizeUrl(url)} — ${response.status} in ${duration}ms`,
            details: { method, url: sanitizeUrl(url), status: response.status, duration },
          });
        }
        return response;
      } catch (error) {
        const duration = Math.round(window.performance.now() - start);
        const aborted = error?.name === 'AbortError';
        recordRef.current?.({
          category: 'network',
          type: aborted ? 'aborted-fetch' : 'fetch-exception',
          severity: aborted ? 'info' : 'high',
          message: `${method} ${sanitizeUrl(url)} ${aborted ? 'was aborted' : 'failed'}`,
          details: { method, url: sanitizeUrl(url), duration, aborted, error },
        });
        throw error;
      }
    };

    const originalOpen = window.XMLHttpRequest.prototype.open;
    const originalSend = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.open = function qaOpen(method, url, ...rest) {
      this.__nstQa = { method: String(method || 'GET').toUpperCase(), url: String(url || ''), start: 0 };
      return originalOpen.call(this, method, url, ...rest);
    };
    window.XMLHttpRequest.prototype.send = function qaSend(body) {
      if (this.__nstQa) this.__nstQa.start = window.performance.now();
      const markTerminal = (terminal) => {
        if (this.__nstQa) this.__nstQa.terminal = terminal;
      };
      this.addEventListener('abort', () => markTerminal('abort'), { once: true });
      this.addEventListener('timeout', () => markTerminal('timeout'), { once: true });
      this.addEventListener('error', () => markTerminal('error'), { once: true });
      this.addEventListener('load', () => markTerminal('load'), { once: true });
      const onDone = () => {
        const meta = this.__nstQa || {};
        const duration = Math.round(window.performance.now() - (meta.start || window.performance.now()));
        const aborted = meta.terminal === 'abort';
        const timedOut = meta.terminal === 'timeout';
        const networkFailed = !aborted && (timedOut || meta.terminal === 'error' || this.status === 0);
        const httpFailed = this.status >= 400;
        const slow = !networkFailed && !httpFailed && duration >= SLOW_REQUEST_MS;
        if (aborted || networkFailed || httpFailed || slow) {
          const type = aborted ? 'aborted-xhr' : timedOut ? 'timeout-xhr' : (networkFailed || httpFailed) ? 'failed-xhr' : 'slow-xhr';
          const severity = aborted ? 'info' : (networkFailed || this.status >= 500) ? 'high' : 'medium';
          const statusLabel = aborted ? 'ABORTED' : timedOut ? 'TIMEOUT' : (this.status || 'NETWORK');
          recordRef.current?.({
            category: 'network',
            type,
            severity,
            message: `${meta.method || 'GET'} ${sanitizeUrl(meta.url)} — ${statusLabel} in ${duration}ms`,
            details: { method: meta.method, url: sanitizeUrl(meta.url), status: this.status, duration, terminal: meta.terminal || null },
          });
        }
      };
      this.addEventListener('loadend', onDone, { once: true });
      return originalSend.call(this, body);
    };

    return () => {
      window.fetch = originalFetch;
      window.XMLHttpRequest.prototype.open = originalOpen;
      window.XMLHttpRequest.prototype.send = originalSend;
    };
  }, [authorized, session?.id]);

  useEffect(() => {
    if (!authorized || !session) return undefined;
    const onClick = (event) => {
      if (event.target?.closest?.('[data-qa-ignore="true"]')) return;
      const control = event.target?.closest?.('button, a, [role="button"], input[type="submit"], input[type="button"]');
      if (!control) return;
      const label = sanitizeLabel(control.getAttribute('aria-label') || control.getAttribute('title') || control.innerText || control.value || control.name || control.tagName);
      recordRef.current?.({
        category: 'interaction',
        type: 'control-click',
        severity: 'info',
        message: `Clicked ${label || control.tagName}`,
        details: { label, tag: control.tagName, disabled: Boolean(control.disabled), href: control.href ? sanitizeUrl(control.href) : null },
      });
    };
    const onSubmit = (event) => {
      if (event.target?.closest?.('[data-qa-ignore="true"]')) return;
      const form = event.target;
      const label = sanitizeLabel(form.getAttribute('aria-label') || form.getAttribute('name') || form.id || 'form');
      recordRef.current?.({ category: 'interaction', type: 'form-submit', severity: 'info', message: `Submitted ${label}`, details: { form: label } }, { force: true });
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, [authorized, session?.id]);

  useEffect(() => {
    const clamp = () => setPosition((current) => ({
      x: Math.min(Math.max(8, current.x), Math.max(8, window.innerWidth - 64)),
      y: Math.min(Math.max(72, current.y), Math.max(72, window.innerHeight - 64)),
    }));
    window.addEventListener('resize', clamp);
    clamp();
    return () => window.removeEventListener('resize', clamp);
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(positionStorageKey) || 'null');
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) setPosition(saved);
    } catch {}
  }, [positionStorageKey]);

  useEffect(() => {
    try { localStorage.setItem(positionStorageKey, JSON.stringify(position)); } catch {}
  }, [position, positionStorageKey]);

  const beginDrag = (event) => {
    if (event.button !== 0) return;
    dragRef.current = { startX: event.clientX, startY: event.clientY, x: position.x, y: position.y, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    setPosition({
      x: Math.min(Math.max(8, drag.x + dx), Math.max(8, window.innerWidth - 64)),
      y: Math.min(Math.max(72, drag.y + dy), Math.max(72, window.innerHeight - 64)),
    });
  };
  const endDrag = () => { dragRef.current = null; };

  const changeStatus = async (nextStatus) => {
    if (!session) return;
    try {
      const updated = await updateQaSession(session.id, {
        status: nextStatus,
        ...(nextStatus === 'stopped' ? { endedAt: nowIso() } : {}),
      });
      setSession(updated);
      if (nextStatus === 'stopped') localStorage.removeItem(activeSessionStorageKey);
      else localStorage.setItem(activeSessionStorageKey, updated.id);
      showToast(nextStatus === 'recording' ? 'Tracking started' : nextStatus === 'paused' ? 'Tracking paused' : 'Session stopped');
    } catch (error) {
      setStorageError(error?.message || 'Session status could not be changed');
    }
  };

  const clearCurrentSession = async () => {
    if (!session || !window.confirm('Clear the current QA session and start a fresh session?')) return;
    setBusy(true);
    try {
      await deleteQaSession(session.id);
      localStorage.removeItem(activeSessionStorageKey);
      await startNewSession();
      showToast('Fresh QA session started');
    } catch (error) {
      setStorageError(error?.message || 'QA session could not be cleared');
    } finally {
      setBusy(false);
    }
  };

  const clearEverything = async () => {
    if (!window.confirm('Delete all locally stored NST QA tracker sessions?')) return;
    setBusy(true);
    try {
      await clearAllQaData();
      localStorage.removeItem(activeSessionStorageKey);
      await startNewSession();
      showToast('All local QA data cleared');
    } catch (error) {
      setStorageError(error?.message || 'Local QA data could not be cleared');
    } finally {
      setBusy(false);
    }
  };

  const captureScreenshot = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const blob = await captureDisplayFrame();
      const filename = `nst-qa-screenshot-${Date.now()}.png`;
      const stored = await addQaFile({
        sessionId: session.id,
        eventId: null,
        name: filename,
        type: blob.type,
        size: blob.size,
        kind: 'screenshot',
        timestamp: nowIso(),
        blob,
      });
      setFiles((current) => [...current, stored]);
      await recordEvent({ category: 'evidence', type: 'screenshot', severity: 'info', message: `Captured ${filename}`, details: { filename, size: blob.size } }, { force: true });
      showToast('Screenshot added to QA report');
    } catch (error) {
      await recordEvent({ category: 'evidence', type: 'screenshot-failed', severity: 'low', message: error?.message || 'Screenshot was cancelled or failed' }, { force: true });
      showToast(error?.message || 'Screenshot was not captured');
    } finally {
      setBusy(false);
    }
  };

  const addManualEntry = async (event) => {
    event.preventDefault();
    if (!manual.title.trim() || !session) {
      showToast('Issue title is required');
      return;
    }
    setBusy(true);
    try {
      const storedEvent = await recordEvent({
        category: 'manual',
        type: manual.category,
        severity: manual.severity,
        result: manual.result,
        message: manual.title,
        details: {
          expected: manual.expected,
          actual: manual.actual,
          steps: manual.steps,
          note: manual.note,
        },
        source: 'manual',
      }, { force: true });

      const accepted = pendingFiles.filter((file) => file.size <= 15 * 1024 * 1024);
      const savedFiles = [];
      for (const file of accepted) {
        const stored = await addQaFile({
          sessionId: session.id,
          eventId: storedEvent?.id || null,
          name: safeFilename(file.name),
          type: file.type || 'application/octet-stream',
          size: file.size,
          kind: 'attachment',
          timestamp: nowIso(),
          blob: file,
        });
        savedFiles.push(stored);
      }
      if (savedFiles.length) setFiles((current) => [...current, ...savedFiles]);
      setManual({ title: '', category: 'ui', severity: 'medium', result: 'needs-review', expected: '', actual: '', steps: '', note: '' });
      setPendingFiles([]);
      setTab('events');
      showToast('Manual QA entry saved');
    } catch (error) {
      setStorageError(error?.message || 'Manual entry could not be saved');
    } finally {
      setBusy(false);
    }
  };

  const prepareReport = async (sessionOverride = null) => {
    const reportSession = sessionOverride || session;
    if (!reportSession) throw new Error('No QA session is active');
    const [allEvents, allFiles] = await Promise.all([getQaEvents(reportSession.id), getQaFiles(reportSession.id)]);
    const redactionStats = { redactedFields: 0, redactedValues: 0 };
    const safeSession = redactObject(reportSession, redactionStats);
    const safeEvents = redactObject(allEvents, redactionStats);
    const markdown = reportMarkdown(safeSession, safeEvents, allFiles, redactionStats);
    return { allEvents: safeEvents, allFiles, markdown, html: reportHtml(markdown, safeEvents), redactionStats, safeSession };
  };

  const exportReport = async (format) => {
    setBusy(true);
    try {
      if (!session) throw new Error('No QA session is active');
      const finalizedSession = await updateQaSession(session.id, {
        status: 'completed',
        endedAt: session.endedAt || nowIso(),
      });
      setSession(finalizedSession);
      sessionRef.current = finalizedSession;
      statusRef.current = 'completed';
      localStorage.removeItem(activeSessionStorageKey);
      const report = await prepareReport(finalizedSession);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      if (format === 'md') {
        downloadBlob(new Blob([report.markdown], { type: 'text/markdown;charset=utf-8' }), `NST_QA_Report_${stamp}.md`);
        showToast('Markdown report downloaded');
        return;
      }
      if (format === 'html') {
        downloadBlob(new Blob([report.html], { type: 'text/html;charset=utf-8' }), `NST_QA_Report_${stamp}.html`);
        showToast('HTML report downloaded');
        return;
      }

      const failedApi = report.allEvents.filter((event) => event.category === 'network'
        && !['slow-fetch', 'slow-xhr'].includes(event.type)
        && (severityRank(event.severity) >= 2 || Number(event.details?.status || 0) >= 400));
      const slowApi = report.allEvents.filter((event) => event.category === 'network' && ['slow-fetch', 'slow-xhr'].includes(event.type));
      const runtimeErrors = report.allEvents.filter((event) => ['console', 'runtime', 'react', 'resource'].includes(event.category));
      const manualNotes = report.allEvents.filter((event) => event.category === 'manual');
      const routeHistory = report.allEvents.filter((event) => event.category === 'navigation').map((event) => `${event.timestamp}\t${event.route}\t${event.message}`).join('\n');
      const environmentText = Object.entries(report.safeSession.environment || {}).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join('\n');
      const filesToZip = [
        { name: 'REPORT_SUMMARY.md', content: report.markdown },
        { name: 'EVENT_TIMELINE.json', content: JSON.stringify(report.allEvents, null, 2) },
        { name: 'FAILED_API_REQUESTS.json', content: JSON.stringify(failedApi, null, 2) },
        { name: 'SLOW_API_REQUESTS.json', content: JSON.stringify(slowApi, null, 2) },
        { name: 'CONSOLE_AND_RUNTIME_ERRORS.json', content: JSON.stringify(runtimeErrors, null, 2) },
        { name: 'MANUAL_NOTES.md', content: manualNotes.map((event) => `## ${event.message}\n\n${JSON.stringify(event.details, null, 2)}`).join('\n\n') || '# No manual notes' },
        { name: 'ENVIRONMENT.txt', content: environmentText },
        { name: 'ROUTE_HISTORY.txt', content: routeHistory || 'No route event recorded.' },
        { name: 'REDACTION_SUMMARY.txt', content: `Sensitive fields removed: ${report.redactionStats.redactedFields || 0}\nValues masked/redacted: ${report.redactionStats.redactedValues || 0}\nRequest and response bodies were not captured.\nPasswords, tokens, cookies, OTP, payment credentials and identity documents are excluded by design.\n` },
      ];

      for (const file of report.allFiles) {
        const folder = file.kind === 'screenshot' ? 'SCREENSHOTS' : 'ATTACHMENTS';
        filesToZip.push({ name: `${folder}/${safeFilename(file.name)}`, content: file.blob });
      }
      const checksumLines = [];
      for (const file of filesToZip) checksumLines.push(`${await sha256Hex(file.content)}  ${file.name}`);
      filesToZip.push({ name: 'CHECKSUMS_SHA256.txt', content: checksumLines.join('\n') });
      const zip = await createStoredZip(filesToZip);
      downloadBlob(zip, `NST_QA_Report_${stamp}.zip`);
      showToast('Sanitized QA report ZIP downloaded');
    } catch (error) {
      setStorageError(error?.message || 'QA report could not be generated');
    } finally {
      setBusy(false);
    }
  };

  const counts = sessionTotals;
  const currentRoute = `${location.pathname}${location.search}`;
  const currentPageEvents = useMemo(() => events.filter((event) => event.route === currentRoute), [events, currentRoute]);
  const currentPageCounts = useMemo(() => summarizeEvents(currentPageEvents), [currentPageEvents]);
  const visualStatus = statusFromCounts(counts, session?.status);
  const visibleEvents = useMemo(() => events.slice().reverse().slice(0, 60), [events]);
  const issueTotal = counts.critical + counts.high + counts.medium + counts.low;
  const panelWidth = expanded ? Math.min(720, window.innerWidth - 24) : Math.min(390, window.innerWidth - 24);
  const panelLeft = Math.min(Math.max(12, position.x - panelWidth + 54), Math.max(12, window.innerWidth - panelWidth - 12));
  const estimatedHeight = expanded ? Math.min(720, window.innerHeight - 100) : Math.min(620, window.innerHeight - 100);
  const panelTop = Math.min(Math.max(74, position.y - estimatedHeight - 10), Math.max(74, window.innerHeight - estimatedHeight - 12));

  if (!authorized) return null;

  return (
    <div className="nst-qa-root" data-qa-ignore="true">
      {open && (
        <aside className={`nst-qa-panel ${expanded ? 'is-expanded' : ''}`} style={{ left: panelLeft, top: panelTop, width: panelWidth }} aria-label="NST Live Test and Error Tracker">
          <header className="nst-qa-panel__header">
            <div>
              <div className="nst-qa-panel__title"><Bug size={18} /><strong>QA-01 Live Tracker</strong><span className={`nst-qa-status-dot is-${visualStatus}`} /></div>
              <p>{session?.name || 'Preparing local session…'}</p>
            </div>
            <div className="nst-qa-panel__header-actions">
              <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? 'Compact tracker' : 'Expand tracker'}>{expanded ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close tracker"><X size={17} /></button>
            </div>
          </header>

          <div className="nst-qa-controls">
            {session?.status !== 'recording' && <button type="button" onClick={() => ['stopped', 'completed'].includes(session?.status) ? startNewSession().then(() => showToast('New tracking session started')) : changeStatus('recording')}><Play size={15} /> {['stopped', 'completed'].includes(session?.status) ? 'New Session' : 'Resume'}</button>}
            {session?.status === 'recording' && <button type="button" onClick={() => changeStatus('paused')}><Pause size={15} /> Pause</button>}
            {session?.status !== 'stopped' && <button type="button" onClick={() => changeStatus('stopped')}><CircleStop size={15} /> Stop</button>}
            <button type="button" onClick={captureScreenshot} disabled={busy}><Camera size={15} /> Screenshot</button>
            <button type="button" onClick={clearCurrentSession} disabled={busy}><RotateCcw size={15} /> Fresh</button>
          </div>

          <nav className="nst-qa-tabs">
            {['summary', 'events', 'manual', 'report'].map((item) => <button type="button" key={item} className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)}>{item}</button>)}
          </nav>

          <div className="nst-qa-panel__body">
            {storageError && <div className="nst-qa-alert is-error"><AlertTriangle size={17} /><span>{storageError}</span></div>}
            {tab === 'summary' && (
              <div className="nst-qa-summary">
                <div className="nst-qa-score-grid">
                  <div><span className="is-critical">{counts.critical + counts.high}</span><small>Critical/High</small></div>
                  <div><span className="is-warning">{counts.medium + counts.low}</span><small>Warnings</small></div>
                  <div><span className="is-success">{counts.pass}</span><small>Manual Pass</small></div>
                  <div><span>{counts.fail + counts.review}</span><small>Fail/Review</small></div>
                </div>
                <section className="nst-qa-card">
                  <div className="nst-qa-card__title"><Bug size={16} /> Current page vs full session</div>
                  <dl>
                    <div><dt>Session issues</dt><dd>{issueTotal}</dd></div>
                    <div><dt>This page critical/high</dt><dd>{currentPageCounts.critical + currentPageCounts.high}</dd></div>
                    <div><dt>This page warnings</dt><dd>{currentPageCounts.medium + currentPageCounts.low}</dd></div>
                    <div><dt>Counting rule</dt><dd>Badge always shows full-session total</dd></div>
                  </dl>
                </section>
                <section className="nst-qa-card">
                  <div className="nst-qa-card__title"><Activity size={16} /> Current session</div>
                  <dl>
                    <div><dt>Status</dt><dd>{session?.status || 'initializing'}</dd></div>
                    <div><dt>Route</dt><dd>{location.pathname}{location.search}</dd></div>
                    <div><dt>Session events</dt><dd>{counts.total}</dd></div><div><dt>This page events</dt><dd>{currentPageEvents.length}</dd></div>
                    <div><dt>Evidence files</dt><dd>{files.length}</dd></div>
                    <div><dt>Role</dt><dd>{roleList(auth).join(', ') || 'unknown'}</dd></div>
                    <div><dt>Theme</dt><dd>{getThemeSnapshot().mode}</dd></div>
                  </dl>
                </section>
                <section className="nst-qa-card is-safe">
                  <div className="nst-qa-card__title"><ShieldCheck size={16} /> Privacy guard</div>
                  <p>No keystrokes or raw form values are recorded. Passwords, tokens, cookies, OTP and payment credentials are excluded. Phone, email and IMEI-like values are masked in exported reports.</p>
                </section>
              </div>
            )}

            {tab === 'events' && (
              <div className="nst-qa-events">
                {visibleEvents.length === 0 && <div className="nst-qa-empty">No event has been recorded yet.</div>}
                {visibleEvents.map((event) => (
                  <article key={event.id || `${event.timestamp}-${event.message}`} className={`nst-qa-event is-${event.severity || 'info'}`}>
                    <div className="nst-qa-event__top"><span>{event.category}</span><time>{formatTime(event.timestamp)}</time></div>
                    <strong>{event.message}</strong>
                    <small>{event.route}</small>
                    {event.result && <em>{event.result}</em>}
                  </article>
                ))}
              </div>
            )}

            {tab === 'manual' && (
              <form className="nst-qa-manual" onSubmit={addManualEntry}>
                <label><span>Issue title *</span><input value={manual.title} onChange={(event) => setManual({ ...manual, title: event.target.value })} placeholder="Example: Save button did not update the record" /></label>
                <div className="nst-qa-form-grid">
                  <label><span>Type</span><select value={manual.category} onChange={(event) => setManual({ ...manual, category: event.target.value })}><option value="ui">UI</option><option value="data">Data</option><option value="permission">Permission</option><option value="performance">Performance</option><option value="error">Error</option><option value="pass">Pass check</option></select></label>
                  <label><span>Severity</span><select value={manual.severity} onChange={(event) => setManual({ ...manual, severity: event.target.value })}><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="info">Info</option></select></label>
                  <label><span>Result</span><select value={manual.result} onChange={(event) => setManual({ ...manual, result: event.target.value })}><option value="pass">Pass</option><option value="fail">Fail</option><option value="needs-review">Needs Review</option></select></label>
                </div>
                <label><span>Expected result</span><textarea value={manual.expected} onChange={(event) => setManual({ ...manual, expected: event.target.value })} /></label>
                <label><span>Actual result</span><textarea value={manual.actual} onChange={(event) => setManual({ ...manual, actual: event.target.value })} /></label>
                <label><span>Steps performed</span><textarea value={manual.steps} onChange={(event) => setManual({ ...manual, steps: event.target.value })} /></label>
                <label><span>Manual note</span><textarea value={manual.note} onChange={(event) => setManual({ ...manual, note: event.target.value })} /></label>
                <label className="nst-qa-file"><FilePlus2 size={16} /><span>{pendingFiles.length ? `${pendingFiles.length} file(s) selected` : 'Attach screenshot/log/file (max 15 MB each)'}</span><input type="file" multiple onChange={(event) => setPendingFiles([...event.target.files])} /></label>
                <button className="nst-qa-primary" type="submit" disabled={busy}>Save manual QA entry</button>
              </form>
            )}

            {tab === 'report' && (
              <div className="nst-qa-report">
                <section className="nst-qa-card">
                  <div className="nst-qa-card__title"><FileArchive size={16} /> Shareable diagnostic report</div>
                  <p>The ZIP contains sanitized timelines, failed API requests, console/runtime errors, manual notes, environment, route history, screenshots, attachments, redaction summary and SHA-256 checksums.</p>
                </section>
                <button className="nst-qa-primary" type="button" onClick={() => exportReport('zip')} disabled={busy}><Download size={16} /> Generate Report ZIP</button>
                <div className="nst-qa-report__secondary">
                  <button type="button" onClick={() => exportReport('md')} disabled={busy}>Markdown</button>
                  <button type="button" onClick={() => exportReport('html')} disabled={busy}>HTML</button>
                </div>
                <button className="nst-qa-danger" type="button" onClick={clearEverything} disabled={busy}><Trash2 size={15} /> Delete all local QA sessions</button>
              </div>
            )}
          </div>
          {toast && <div className="nst-qa-toast"><CheckCircle2 size={16} /> {toast}</div>}
        </aside>
      )}

      <button
        type="button"
        className={`nst-qa-fab is-${visualStatus}`}
        style={{ left: position.x, top: position.y }}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={(event) => { const moved = dragRef.current?.moved; endDrag(); if (!moved) setOpen((value) => !value); event.currentTarget.releasePointerCapture?.(event.pointerId); }}
        onPointerCancel={endDrag}
        aria-label="Open NST QA Tracker"
        title="Drag to move · Click to open QA Tracker"
      >
        <GripVertical size={13} className="nst-qa-fab__grip" />
        <Bug size={19} />
        <strong>QA</strong>
        {issueTotal > 0 && <span title={`${issueTotal} issues in this QA session`}>{issueTotal > 999 ? '999+' : issueTotal}</span>}
      </button>
    </div>
  );
}
