import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NstPageHeader, NstIconButton } from '../../components/ui';
import { LayoutDashboard as NstHdrLayoutDashboard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { t as translate, useI18n } from '../../i18n';
import {
  Activity, ArrowUpRight, Bell, Boxes, Building2, CalendarDays, CheckCircle2,
  Clock3, Database, GripVertical, Inbox, LayoutGrid, Maximize2, MessageCircle, PackageCheck, Plus,
  RefreshCw, ShieldCheck, ShoppingBag, TrendingUp, Truck, Users,
  WalletCards, Wrench, XCircle, Settings2, X, Save, RotateCcw, Eye, EyeOff, Gauge, BarChart3, Globe2,
  Undo2, Redo2, Lock, Unlock, Download, Upload, Search, CopyPlus, Trash2, Monitor, Tablet, Smartphone, History,
  Target, Megaphone, Pencil,
} from 'lucide-react';
import corporateOpsService from '../../services/corporateOpsService';
import dashboardOperatingService from '../../services/dashboardOperatingService';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import accessRules from '../../utils/accessRules';
import DashboardThemeControl from '../../components/dashboard/DashboardThemeControl';
import NstDashboardDock from '../../components/dashboard/NstDashboardDock';
import { SwapyLayout, SwapySlot, SwapyItem } from '../../components/ui/swapy-draggable-card';
import useDashboardWorkspace from '../../hooks/useDashboardWorkspace';
import { permittedSidebarRegistry, flattenSidebarRegistry } from '../../config/sidebarRegistry';
import { DashboardWidgetIdentityIcon, getDashboardWidget } from '../../config/dashboardWidgetRegistry';

const amountFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function money(value) {
  const amount = amountFormatter.format(Number(value || 0));
  return <span className="nst-money-value" aria-label={`BDT ${amount}`}><span className="nst-money-symbol" aria-hidden="true">৳</span><span>{amount}</span></span>;
}
const dataOf = (res) => res?.data?.data || res?.data || {};
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const initialDate = today();
const initialFilters = { range: 'daily', date: initialDate, start_date: initialDate, end_date: initialDate, branch_id: '' };
const DASHBOARD_SUMMARY_CACHE_PREFIX = 'nst-dashboard-summary:v2';

function dashboardSummaryCacheKey(userKey, filters) {
  return `${DASHBOARD_SUMMARY_CACHE_PREFIX}:${userKey}:${filters?.branch_id || 'all'}:${filters?.range || 'daily'}:${filters?.date || ''}:${filters?.start_date || ''}:${filters?.end_date || ''}`;
}

function readDashboardSummaryCache(key) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) || localStorage.getItem(key) || 'null');
    if (!cached || typeof cached !== 'object' || !cached.data) return null;
    return cached;
  } catch {
    return null;
  }
}

function writeDashboardSummaryCache(key, data) {
  const payload = JSON.stringify({ data, savedAt: Date.now() });
  try { sessionStorage.setItem(key, payload); } catch {}
  try { localStorage.setItem(key, payload); } catch {}
}

const QUICK_ACTION_CATALOG = [
  { id:'new-sale', to:'/sales/create', icon:ShoppingBag, label:'New Sale', tone:'violet' },
  { id:'used-purchase', to:'/used-purchase/create', icon:PackageCheck, label:'Add Used / Pre-Owned', tone:'orange' },
  { id:'purchase', to:'/purchases/create', icon:Boxes, label:'Add Purchase', tone:'blue' },
  { id:'customer', to:'/customers/create', icon:Users, label:'Add Customer', tone:'cyan' },
  { id:'stock-transfer', to:'/stock-transfer', icon:Building2, label:'Stock Transfer', tone:'violet' },
  { id:'service', to:'/warranty-service', icon:Wrench, label:'Service Center', tone:'green' },
  { id:'web-sales', to:'/web-sales', icon:Globe2, label:'Web Sales', tone:'blue' },
  { id:'reports', to:'/reports', icon:BarChart3, label:'Reports', tone:'green' },
];

const MODULE_SHORTCUT_CATALOG = [
  {id:'dashboard',label:'Dashboard',path:'/dashboard',icon:Gauge},
  {id:'products',label:'Products',path:'/products',icon:Boxes},
  {id:'device-stock',label:'Device Stock',path:'/device-stock',icon:PackageCheck},
  {id:'sales',label:'Sales List',path:'/sales',icon:ShoppingBag},
  {id:'web-sales',label:'Web Sales',path:'/web-sales',icon:Globe2},
  {id:'purchases',label:'Purchases',path:'/purchases',icon:Truck},
  {id:'stock-transfer',label:'Stock Transfer',path:'/branch-stock-requests',icon:Building2},
  {id:'accounts',label:'Accounts & Finance',path:'/accounts',icon:WalletCards},
  {id:'customers',label:'Customers',path:'/customers',icon:Users},
  {id:'service',label:'Service & Repair',path:'/warranty-service',icon:Wrench},
  {id:'website',label:'Website Builder',path:'/website-control-center',icon:Globe2},
  {id:'app-studio',label:'App Studio',path:'/app-center-manager',icon:LayoutGrid},
  {id:'marketing',label:'Marketing Center',path:'/marketing',icon:Inbox},
  {id:'reports',label:'Reports & Analytics',path:'/reports',icon:BarChart3},
  {id:'settings',label:'Settings',path:'/settings',icon:Settings2},
];

function Surface({ children, className = '', ...props }) {
  return <section {...props} className={`nst-dashboard-surface nst-premium-card ${className}`}>{children}</section>;
}

function PanelHeading({ icon: Icon, title, subtitle = '', action = null }) {
  return <div className="flex min-w-0 items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-3">
      <span className="nst-dashboard-panel-icon"><Icon size={18}/></span>
      <div className="min-w-0"><h2 className="truncate font-black">{title}</h2>{subtitle && <p className="truncate text-[11px] text-[var(--nst-dashboard-muted)]">{subtitle}</p>}</div>
    </div>
    {action}
  </div>;
}

function MetricCard({ icon: Icon, label, value, trend = '', tone = 'violet', note }) {
  return <Surface className="nst-metric-card p-4" data-tone={tone}>
    <div className="nst-metric-card-top">
      <span className="nst-premium-icon"><Icon size={19} strokeWidth={1.8}/></span>
      {trend ? <span className={`nst-metric-trend ${String(trend).startsWith('-') ? 'is-negative' : 'is-positive'}`}>{trend}</span> : null}
    </div>
    <div className="nst-metric-copy">
      <p className="nst-metric-label">{label}</p>
      <p className="nst-metric-value">{value}</p>
      <p className="nst-metric-note">{note || 'Live operational summary'}</p>
    </div>
  </Surface>;
}

function LineChart({ value, points = [] }) {
  const clean = Array.isArray(points) ? points.filter((item) => Number.isFinite(Number(item?.value))) : [];
  if (!clean.length) return <div className="mt-4 grid h-56 place-items-center text-center text-xs text-[var(--nst-dashboard-muted)]">No completed sales trend is available for this selected period.</div>;
  const max = Math.max(1, ...clean.map((item) => Number(item.value || 0)));
  const width = 476; const height = 180; const pad = 18;
  const coords = clean.map((item, index) => {
    const x = clean.length === 1 ? width / 2 : (index / (clean.length - 1)) * width;
    const y = height - pad - (Number(item.value || 0) / max) * (height - pad * 2);
    return { x, y, ...item };
  });
  const pts = coords.map((item) => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(' ');
  const last = coords.at(-1);
  return <div className="relative mt-4 h-56 overflow-hidden">
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none">
      {[30,70,110,150].map(y => <line key={y} x1="0" x2={width} y1={y} y2={y} stroke="var(--nst-dashboard-border)" strokeWidth="1"/>)}
      <defs><linearGradient id="nst-real-sales-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--nst-dashboard-primary)" stopOpacity=".45"/><stop offset="100%" stopColor="var(--nst-dashboard-primary)" stopOpacity="0"/></linearGradient></defs>
      <polygon points={`${pts} ${last.x},${height} ${coords[0].x},${height}`} fill="url(#nst-real-sales-area)"/>
      <polyline points={pts} fill="none" stroke="var(--nst-dashboard-primary)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      {coords.map((item, index) => <circle key={`${item.label}-${index}`} cx={item.x} cy={item.y} r="3.5" fill="var(--nst-dashboard-primary)" stroke="var(--nst-dashboard-surface)" strokeWidth="2"><title>{item.label}: {Number(item.value || 0)}</title></circle>)}
    </svg>
    <div className="absolute right-5 top-4 rounded-lg border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] px-3 py-2 text-xs font-bold text-[var(--nst-dashboard-text)]">{last.label}<br/><span className="mt-1 block text-sm">{money(last.value ?? value)}</span></div>
  </div>;
}

function Donut({ value, label, items = [] }) {
  const clean = Array.isArray(items) ? items.filter((item) => Number(item?.value || 0) > 0) : [];
  if (!clean.length) return <div className="grid h-40 place-items-center rounded-xl border border-dashed border-[var(--nst-dashboard-border)] text-center text-xs text-[var(--nst-dashboard-muted)]">No verified breakdown is available for this period.</div>;
  const palette = ['#22c55e','#f59e0b','#3b82f6','#ef4444','var(--nst-dashboard-accent)','#06b6d4','#ec4899','#84cc16'];
  const total = clean.reduce((sum, item) => sum + Number(item.value || 0), 0);
  let cursor = 0;
  const gradient = clean.map((item, index) => { const start = cursor; cursor += (Number(item.value || 0) / total) * 100; return `${palette[index % palette.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`; }).join(', ');
  return <div className="flex items-center gap-5">
    <div className="relative h-32 w-32 shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }}><div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-[var(--nst-dashboard-surface)]"><strong className="max-w-[85px] truncate text-sm text-[var(--nst-dashboard-text)]">{value}</strong><span className="text-[10px] text-[var(--nst-dashboard-muted)]">{label}</span></div></div>
    <div className="nst-widget-scroll-region max-h-36 space-y-2 text-xs text-[var(--nst-dashboard-muted)]">{clean.map((item,index)=><div key={`${item.label}-${index}`} className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{background:palette[index%palette.length]}}/><span className="truncate capitalize">{String(item.label).replaceAll('_',' ')}</span></span><strong className="text-[var(--nst-dashboard-text)]">{item.value}</strong></div>)}</div>
  </div>;
}

function QuickAction({ to, icon: Icon, label, tone='violet' }) {
  return <Link to={to} data-tone={tone} className="nst-quick-action group">
    <span className="flex min-w-0 items-center gap-3"><span className="nst-premium-icon nst-premium-icon-sm"><Icon size={17} strokeWidth={1.8}/></span><span className="truncate">{label}</span></span><Plus size={16} className="shrink-0 text-[var(--nst-dashboard-muted)] transition group-hover:text-[var(--nst-dashboard-primary)]"/>
  </Link>;
}


function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clampRect(rect, columns = 12) {
  const w = Math.max(2, Math.min(columns, Number(rect?.w || 4)));
  return {
    ...rect,
    x: Math.max(0, Math.min(columns - w, Number(rect?.x || 0))),
    y: Math.max(0, Number(rect?.y || 0)),
    w,
    h: Math.max(2, Math.min(28, Number(rect?.h || 5))),
  };
}

function resolveDashboardPositions(basePositions, movingId, targetRect, order, columns = 12) {
  const source = Object.fromEntries(Object.entries(basePositions || {}).map(([id,rect])=>[id,{...rect}]));
  const locked = order.filter(id=>id!==movingId && source[id]?.locked).sort((a,b)=>(source[a].y-source[b].y)||(source[a].x-source[b].x));
  const unlocked = order.filter(id=>id!==movingId && !source[id]?.locked).sort((a,b)=>(source[a].y-source[b].y)||(source[a].x-source[b].x));
  const result = {};
  const placed = [];
  const placeBelowCollisions = (id, input) => {
    const rect = clampRect(input, columns);
    let guard = 0;
    while (guard < 200) {
      const overlaps = placed.filter(item=>rectsOverlap(rect,item.rect));
      if (!overlaps.length) break;
      rect.y = Math.max(...overlaps.map(item=>item.rect.y + item.rect.h));
      guard += 1;
    }
    result[id] = rect;
    placed.push({id,rect});
  };
  locked.forEach(id=>{const rect=clampRect(source[id],columns);result[id]=rect;placed.push({id,rect})});
  placeBelowCollisions(movingId,{...(source[movingId]||{}),...targetRect});
  unlocked.forEach(id=>placeBelowCollisions(id,source[id]));
  return {...source,...result};
}


function compactDashboardPositions(positions, order, columns = 12) {
  const source = Object.fromEntries(Object.entries(positions || {}).map(([id, rect]) => [id, clampRect(rect, columns)]));
  const result = {};
  const placed = [];
  const ordered = (order || []).filter(id => source[id]).sort((a,b)=>(source[a].y-source[b].y)||(source[a].x-source[b].x));

  // Locked widgets stay exactly where the user pinned them. Every other widget
  // gets vertical gravity inside its current columns, so stale grid rows cannot
  // leave large dead-space bands between cards.
  ordered.filter(id => source[id].locked).forEach((id) => {
    const rect = { ...source[id] };
    result[id] = rect;
    placed.push({ id, rect });
  });

  ordered.filter(id => !source[id].locked).forEach((id) => {
    const rect = { ...source[id] };
    let bestY = 0;
    while (bestY < rect.y) {
      const candidate = { ...rect, y: bestY };
      const collision = placed.filter(item => rectsOverlap(candidate, item.rect));
      if (!collision.length) { rect.y = bestY; break; }
      bestY = Math.min(rect.y, Math.max(...collision.map(item => item.rect.y + item.rect.h)));
    }
    result[id] = rect;
    placed.push({ id, rect });
  });

  return { ...source, ...result };
}

/* A card is never shorter than its content: rows needed by the content (fitRows) raise the
   saved height, and cards below that now collide are pushed down in reading order. */
function fitDashboardPositions(positions, order, fitRows = {}, columns = 12) {
  const result = {};
  const placed = [];
  const ids = (order || []).filter(id => positions[id]).sort((a,b)=>(positions[a].y-positions[b].y)||(positions[a].x-positions[b].x));
  ids.forEach((id) => {
    const rect = clampRect({ ...positions[id], h: Math.max(Number(positions[id].h || 0), Number(fitRows[id] || 0)) }, columns);
    let guard = 0;
    while (guard < 200) {
      const overlaps = placed.filter(item => rectsOverlap(rect, item));
      if (!overlaps.length) break;
      rect.y = Math.max(...overlaps.map(item => item.y + item.h));
      guard += 1;
    }
    result[id] = rect;
    placed.push(rect);
  });
  return { ...positions, ...result };
}

function useDashboardContentFit(active, resetKey) {
  const [fitRows, setFitRows] = useState({});
  useEffect(() => { setFitRows({}); }, [resetKey]);
  /* Zoom or window resize: measure again from the saved size, so space added at another width does not stay. */
  useEffect(() => {
    let timer = 0;
    const refit = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        document.querySelectorAll('.nst-business-dashboard .nst-dashboard-widget > .nst-widget-content, .nst-business-dashboard .nst-dashboard-widget > .nst-widget-content > *').forEach((node) => {
          node.scrollLeft = 0;
          node.scrollTop = 0;
        });
        setFitRows({});
      }, 180);
    };
    window.addEventListener('resize', refit);
    return () => { clearTimeout(timer); window.removeEventListener('resize', refit); };
  }, []);
  useEffect(() => {
    if (!active || typeof ResizeObserver === 'undefined') return undefined;
    const grid = document.querySelector('.nst-business-dashboard .nst-dashboard-widget-grid');
    if (!grid) return undefined;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const styles = window.getComputedStyle(grid);
        if (styles.display !== 'grid') return;
        const row = parseFloat(styles.gridAutoRows) || 22;
        const gap = parseFloat(styles.rowGap || styles.gap) || 12;
        const updates = {};
        grid.querySelectorAll('.nst-dashboard-widget[data-widget-id]').forEach((widget) => {
          if (widget.classList.contains('is-resizing') || widget.classList.contains('is-dragging')) return;
          const content = widget.querySelector(':scope > .nst-widget-content');
          const card = content?.firstElementChild;
          if (!content || !card) return;
          const overflow = Math.max(card.scrollHeight - card.clientHeight, content.scrollHeight - content.clientHeight);
          if (overflow <= 2) return;
          const chrome = widget.getBoundingClientRect().height - content.getBoundingClientRect().height;
          const needed = Math.ceil((Math.max(card.scrollHeight, content.scrollHeight) + chrome + gap) / (row + gap));
          updates[widget.dataset.widgetId] = needed;
        });
        setFitRows((current) => {
          const changed = Object.entries(updates).filter(([id, rows]) => rows > Number(current[id] || 0));
          return changed.length ? { ...current, ...Object.fromEntries(changed) } : current;
        });
      });
    };
    const observer = new ResizeObserver(measure);
    grid.querySelectorAll('.nst-dashboard-widget > .nst-widget-content > *').forEach((node) => observer.observe(node));
    observer.observe(grid);
    measure();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  });
  return fitRows;
}

function createDashboardSlotMap(order = []) {
  return order.map((item, index) => ({ slot: `slot-${index}`, item }));
}

function normalizeDashboardSlotMap(pairs, fallbackOrder = []) {
  const fallback = createDashboardSlotMap(fallbackOrder);
  if (!Array.isArray(pairs) || !pairs.length) return fallback;
  const seen = new Set();
  const normalized = pairs
    .map((pair) => ({ slot: String(pair?.slot || ''), item: String(pair?.item || '') }))
    .filter((pair) => pair.slot && pair.item && !seen.has(pair.item) && (seen.add(pair.item) || true));
  const missing = fallback.filter((pair) => !seen.has(pair.item));
  return [...normalized, ...missing].sort((a, b) => Number(a.slot.replace('slot-', '')) - Number(b.slot.replace('slot-', '')));
}

function dashboardOrderFromSlotMap(pairs, fallbackOrder = []) {
  const allowed = new Set(fallbackOrder);
  const next = normalizeDashboardSlotMap(pairs, fallbackOrder).map((pair) => pair.item).filter((id) => allowed.has(id));
  return [...new Set([...next, ...fallbackOrder])];
}

function isInteractiveDashboardTarget(target) {
  return Boolean(target?.closest?.('a,button,input,select,textarea,label,[contenteditable="true"],[data-dashboard-no-drag="true"],.nst-widget-resize-handle,.nst-widget-editor-bar'));
}

function DashboardHydrationSkeleton() {
  return <div className="min-h-screen bg-[var(--nst-dashboard-bg)] p-3 text-[var(--nst-dashboard-text)] md:p-5" aria-busy="true" aria-label="Loading live dashboard">
    <div className="mx-auto max-w-[1900px] animate-pulse">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-2"><div className="h-9 w-80 rounded-2xl bg-[var(--nst-dashboard-surface)]"/><div className="h-4 w-64 rounded bg-[var(--nst-dashboard-surface)]"/></div>
        <div className="flex flex-wrap gap-2">{[0,1,2,3].map((item)=><div key={item} className="h-11 w-32 rounded-xl bg-[var(--nst-dashboard-surface)]"/>)}</div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,.8fr)]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[0,1,2,3].map((item)=><div key={item} className="h-36 rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)]"/>)}</div>
          <div className="grid gap-4 lg:grid-cols-2"><div className="h-80 rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)]"/><div className="h-80 rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)]"/></div>
          <div className="grid gap-4 md:grid-cols-3">{[0,1,2].map((item)=><div key={item} className="h-32 rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)]"/>)}</div>
        </div>
        <div className="space-y-4"><div className="h-[420px] rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)]"/><div className="h-72 rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)]"/></div>
      </div>
    </div>
  </div>;
}

function DashboardWidget({ id, title, children, layout, editing, locked, onToggleLock, onResize, onMove, onActionStart, onActionEnd }) {
  const { t } = useI18n();
  const widgetRef = useRef(null);
  const pos = clampRect(layout, 12);

  const readGridMetrics = () => {
    const widget = widgetRef.current;
    const grid = widget?.closest?.('.nst-dashboard-widget-grid');
    if (!widget || !grid || window.getComputedStyle(grid).display !== 'grid') return null;
    const rect = grid.getBoundingClientRect();
    const styles = window.getComputedStyle(grid);
    const columns = Math.max(1, (styles.gridTemplateColumns || '').split(/\s+/).filter(Boolean).length || 12);
    const gap = parseFloat(styles.columnGap || '12') || 12;
    const rowGap = parseFloat(styles.rowGap || '12') || 12;
    const col = (rect.width - gap * (columns - 1)) / columns;
    const row = parseFloat(styles.gridAutoRows || '22') || 22;
    return { widget, grid, rect, columns, gap, rowGap, col, row };
  };

  const beginMove = (event) => {
    if (!editing || locked || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const metrics = readGridMetrics();
    if (!metrics) return;
    event.preventDefault();
    event.stopPropagation();

    const { widget, columns, gap, rowGap, col, row } = metrics;
    const sx = event.clientX;
    const sy = event.clientY;
    const startScrollY = window.scrollY;
    const initial = clampRect(pos, columns);
    let lastClientX = sx;
    let lastClientY = sy;
    let lastTarget = { x: initial.x, y: initial.y };
    let scrollFrame = 0;

    onActionStart?.(id, 'move');
    widget.classList.add('is-dragging');
    document.body.classList.add('nst-dashboard-dragging');

    const applyPreview = () => {
      const dx = lastClientX - sx;
      const dy = lastClientY - sy + (window.scrollY - startScrollY);
      const x = Math.max(0, Math.min(columns - initial.w, initial.x + Math.round(dx / (col + gap))));
      const y = Math.max(0, initial.y + Math.round(dy / (row + rowGap)));
      lastTarget = { x, y };
      widget.style.setProperty('--nst-live-x', `${dx}px`);
      widget.style.setProperty('--nst-live-y', `${dy}px`);
    };

    const autoScroll = () => {
      const edge = Math.min(120, Math.max(72, window.innerHeight * 0.12));
      let delta = 0;
      if (lastClientY < edge) delta = -Math.ceil(((edge - lastClientY) / edge) * 18);
      else if (lastClientY > window.innerHeight - edge) delta = Math.ceil(((lastClientY - (window.innerHeight - edge)) / edge) * 18);
      if (delta) {
        window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
        applyPreview();
      }
      scrollFrame = requestAnimationFrame(autoScroll);
    };

    const move = (pointerEvent) => {
      pointerEvent.preventDefault();
      lastClientX = pointerEvent.clientX;
      lastClientY = pointerEvent.clientY;
      applyPreview();
    };

    const clearPreview = () => {
      widget.style.removeProperty('--nst-live-x');
      widget.style.removeProperty('--nst-live-y');
    };

    const end = () => {
      cancelAnimationFrame(scrollFrame);
      onMove?.(id, lastTarget, columns);
      widget.classList.remove('is-dragging');
      document.body.classList.remove('nst-dashboard-dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', end);
      requestAnimationFrame(() => requestAnimationFrame(clearPreview));
      onActionEnd?.(id, 'move');
    };

    applyPreview();
    scrollFrame = requestAnimationFrame(autoScroll);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', end, { once: true });
    window.addEventListener('blur', end, { once: true });
  };

  const beginResize = (event) => {
    if (!editing || locked || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const metrics = readGridMetrics();
    if (!metrics) return;
    event.preventDefault();
    event.stopPropagation();

    const { widget, columns, gap, rowGap, col, row } = metrics;
    const sx = event.clientX;
    const sy = event.clientY;
    const startScrollY = window.scrollY;
    const initial = clampRect(pos, columns);
    const initialPx = widget.getBoundingClientRect();
    let lastClientX = sx;
    let lastClientY = sy;
    let lastSize = { w: initial.w, h: initial.h };
    let scrollFrame = 0;

    onActionStart?.(id, 'resize');
    widget.classList.add('is-resizing');
    document.body.classList.add('nst-dashboard-dragging');

    const applyPreview = () => {
      const dx = lastClientX - sx;
      const dy = lastClientY - sy + (window.scrollY - startScrollY);
      const w = Math.max(2, Math.min(columns - initial.x, initial.w + Math.round(dx / (col + gap))));
      const h = Math.max(2, Math.min(28, initial.h + Math.round(dy / (row + rowGap))));
      lastSize = { w, h };
      widget.style.setProperty('--nst-live-width', `${Math.max(120, initialPx.width + dx)}px`);
      widget.style.setProperty('--nst-live-height', `${Math.max(76, initialPx.height + dy)}px`);
    };

    const autoScroll = () => {
      const edge = Math.min(120, Math.max(72, window.innerHeight * 0.12));
      let delta = 0;
      if (lastClientY < edge) delta = -Math.ceil(((edge - lastClientY) / edge) * 16);
      else if (lastClientY > window.innerHeight - edge) delta = Math.ceil(((lastClientY - (window.innerHeight - edge)) / edge) * 16);
      if (delta) {
        window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
        applyPreview();
      }
      scrollFrame = requestAnimationFrame(autoScroll);
    };

    const move = (pointerEvent) => {
      pointerEvent.preventDefault();
      lastClientX = pointerEvent.clientX;
      lastClientY = pointerEvent.clientY;
      applyPreview();
    };

    const clearPreview = () => {
      widget.style.removeProperty('--nst-live-width');
      widget.style.removeProperty('--nst-live-height');
    };

    const end = () => {
      cancelAnimationFrame(scrollFrame);
      onResize?.(id, lastSize, columns);
      widget.classList.remove('is-resizing');
      document.body.classList.remove('nst-dashboard-dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', end);
      requestAnimationFrame(() => requestAnimationFrame(clearPreview));
      onActionEnd?.(id, 'resize');
    };

    applyPreview();
    scrollFrame = requestAnimationFrame(autoScroll);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', end, { once: true });
    window.addEventListener('blur', end, { once: true });
  };

  return <div ref={widgetRef} className={`nst-dashboard-widget ${editing ? 'is-editing' : ''} ${editing && locked ? 'is-locked' : ''} ${editing && !locked ? 'is-unlocked' : ''}`} data-widget-id={id}>
    {editing && <div className="nst-widget-editor-bar">
      <span className="nst-widget-editor-title"><DashboardWidgetIdentityIcon id={id} size={15}/><strong>{title}</strong></span>
      <span className="nst-widget-editor-actions">
        <button type="button" data-swapy-no-drag onClick={(event)=>{event.preventDefault();event.stopPropagation();onToggleLock?.(id)}} className="nst-widget-editor-action" title={t(locked ? 'dashboard.widget.unlock' : 'dashboard.widget.lock')} aria-label={t(locked ? 'dashboard.widget.unlock_named' : 'dashboard.widget.lock_named', { name: title })}>{locked ? <Lock size={14}/> : <Unlock size={14}/>}</button>
        {!locked && <button type="button" aria-label={t('dashboard.widget.drag_named', { name: title })} title={t('dashboard.widget.drag_named', { name: title })} className="nst-widget-six-dot-handle" data-swapy-handle onPointerDown={beginMove}><GripVertical size={16}/></button>}
      </span>
    </div>}
    <div className="nst-widget-content">{children}</div>
    {editing && !locked && <button type="button" data-swapy-no-drag className="nst-widget-resize-handle" onPointerDown={beginResize} aria-label={t('dashboard.widget.resize_named', { name: title })} title={t('dashboard.widget.resize_named', { name: title })}><Maximize2 size={13}/></button>}
  </div>;
}

export default function CorporateDashboard() {
  const { user } = useAuth();
  const { language, t } = useI18n();
  const userKey = user?.user?.id || user?.id || user?.email || 'default';
  const initialSummaryCache = useMemo(() => readDashboardSummaryCache(dashboardSummaryCacheKey(userKey, initialFilters)), [userKey]);
  const [summary, setSummary] = useState(() => initialSummaryCache?.data || {});
  const [hasSummary, setHasSummary] = useState(Boolean(initialSummaryCache?.data));
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(!initialSummaryCache?.data);
  const [filterError, setFilterError] = useState('');
  // NST: remember the last welcome text so the custom greeting shows immediately (no flash of the default text)
  const WELCOME_CACHE_KEY = 'nst-dashboard-welcome-cache:v1';
  const readWelcomeCache = () => { try { return JSON.parse(localStorage.getItem(WELCOME_CACHE_KEY) || 'null'); } catch { return null; } };
  const cachedWelcome = readWelcomeCache();
  const [welcomeReady, setWelcomeReady] = useState(Boolean(cachedWelcome));
  const [operating, setOperating] = useState({ action: {}, targets: {}, bulletins: [], welcome: cachedWelcome?.welcome || {}, canManageWelcome: Boolean(cachedWelcome?.canManage) });
  const [welcomeEditorOpen, setWelcomeEditorOpen] = useState(false);
  const [welcomeDraft, setWelcomeDraft] = useState({ visible: true, icon: '👋', title_en: translate('dashboard.welcome.title', undefined, 'en'), subtitle_en: translate('dashboard.welcome.subtitle', undefined, 'en'), title_bn: translate('dashboard.welcome.title', undefined, 'bn'), subtitle_bn: translate('dashboard.welcome.subtitle', undefined, 'bn') });

  const loadOperating = async (next = filters) => {
    const [action, targets, bulletins, welcome] = await Promise.allSettled([
      dashboardOperatingService.actionSummary(),
      dashboardOperatingService.targets({ date: next.date, target_type: 'sales_amount' }),
      dashboardOperatingService.bulletins(),
      dashboardOperatingService.welcome(),
    ]);
    setOperating((current) => {
      const nextState = { ...current };
      if (action.status === 'fulfilled') nextState.action = dataOf(action.value);
      if (targets.status === 'fulfilled') nextState.targets = dataOf(targets.value);
      if (bulletins.status === 'fulfilled') nextState.bulletins = dataOf(bulletins.value) || [];
      if (welcome.status === 'fulfilled') {
        nextState.welcome = dataOf(welcome.value);
        nextState.canManageWelcome = Boolean(welcome.value?.data?.can_manage);
        try { localStorage.setItem(WELCOME_CACHE_KEY, JSON.stringify({ welcome: nextState.welcome, canManage: nextState.canManageWelcome })); } catch {}
        setWelcomeDraft((draft) => ({ ...draft, ...dataOf(welcome.value) }));
      }
      return nextState;
    });
    setWelcomeReady(true);
  };

  const welcomeText = (text) => String(text || '').replaceAll('{name}', user?.user?.name || user?.name || t('dashboard.welcome.fallback_name'));
  const localizedWelcome = (field) => {
    const welcome = operating.welcome || {};
    return (language === 'en' ? welcome[`${field}_en`] : welcome[`${field}_${language}`]) || welcome[`${field}_en`] || welcome[`${field}_bn`] || '';
  };
  const [welcomeSaving, setWelcomeSaving] = useState(false);
  const [welcomeError, setWelcomeError] = useState('');
  const saveWelcome = async () => {
    setWelcomeSaving(true); setWelcomeError('');
    try {
      await dashboardOperatingService.saveWelcome(welcomeDraft);
      const confirmedResponse = await dashboardOperatingService.welcome();
      const saved = dataOf(confirmedResponse);
      const canManage = Boolean(confirmedResponse?.data?.can_manage);
      setOperating((current) => ({ ...current, welcome: saved, canManageWelcome: canManage }));
      setWelcomeDraft((draft) => ({ ...draft, ...saved }));
      try { localStorage.setItem(WELCOME_CACHE_KEY, JSON.stringify({ welcome: saved, canManage })); } catch {}
      setWelcomeEditorOpen(false);
    } catch (error) {
      setWelcomeError(error?.response?.data?.message || error?.message || 'Save failed. Please try again.');
    } finally {
      setWelcomeSaving(false);
    }
  };

  const load = async (next = filters) => {
    const key = dashboardSummaryCacheKey(userKey, next);
    setLoading(true); setFilterError('');
    try {
      const nextSummary = dataOf(await corporateOpsService.getCorporateSummary(next));
      setSummary(nextSummary);
      setHasSummary(true);
      writeDashboardSummaryCache(key, nextSummary);
    }
    catch (e) { setFilterError(e?.response?.data?.message || 'Dashboard summary could not be loaded.'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const cached = readDashboardSummaryCache(dashboardSummaryCacheKey(userKey, initialFilters));
    if (cached?.data) { setSummary(cached.data); setHasSummary(true); setLoading(false); }
    Promise.allSettled([load(initialFilters), loadOperating(initialFilters), api.get('/dashboard-access/effective')]);
  }, [userKey]);


  const kpis = useMemo(()=>[
    {icon:ShoppingBag,label:"Today's Sales",value:hasSummary ? money(summary.today_sales) : '—',trend:summary.today_sales_trend || '',tone:'violet'},
    {icon:WalletCards,label:'Monthly Sales',value:hasSummary ? money(summary.monthly_sales ?? 0) : '—',trend:summary.monthly_sales_trend || '',tone:'violet'},
    {icon:Boxes,label:'Total Orders',value:hasSummary ? (summary.total_orders ?? 0) : '—',trend:summary.total_orders_trend || '',tone:'blue'},
    {icon:Clock3,label:'Pending Orders',value:hasSummary ? (summary.pending_orders ?? 0) : '—',trend:summary.pending_orders_trend || '',tone:'orange'},
    {icon:TrendingUp,label:"Today's Profit",value:hasSummary ? money(summary.net_profit) : '—',trend:summary.net_profit_trend || '',tone:'green'},
  ],[summary,hasSummary]);

  const secondary = [
    ['Stock Value', hasSummary ? money(summary.stock_value) : '—', Boxes], ['Customers', hasSummary ? (summary.customers ?? 0) : '—', Users], ['Suppliers', hasSummary ? (summary.suppliers ?? 0) : '—', Truck],
    ['Low Stock', hasSummary ? (summary.low_stock ?? 0) : '—', Bell], ['Pending Transfers', hasSummary ? (summary.pending_transfers ?? 0) : '—', Building2], ['Service Queue', hasSummary ? (summary.service_queue ?? 0) : '—', Wrench],
  ];
  const activities = summary.recent_activities?.length ? summary.recent_activities.slice(0,5) : [];
  const products = summary.top_products?.length ? summary.top_products.slice(0,5) : [];

  const layoutKey = `nst-dashboard-stage1:${userKey}`;
  const defaultOrder = [...kpis.map((_,i)=>`kpi-${i}`),...secondary.map((_,i)=>`secondary-${i}`),'today-target','sales-overview','top-products','recent-activities','website-orders','sales-branch','order-status','profit-overview','quick-access','module-shortcuts','notifications','business-bulletin','nst-chat','system-status'];
  const sizeFor=(id)=>({w:id.startsWith('kpi-')?3:id.startsWith('secondary-')?2:id==='sales-overview'?6:['top-products','recent-activities'].includes(id)?3:id==='system-status'?12:id==='module-shortcuts'?6:id==='today-target'?6:id==='business-bulletin'?6:3,h:id.startsWith('kpi-')?4:id.startsWith('secondary-')?4:id==='sales-overview'?9:['top-products','recent-activities'].includes(id)?9:id==='quick-access'?9:id==='module-shortcuts'?7:id==='system-status'?4:id==='today-target'?6:id==='business-bulletin'?6:['sales-branch','order-status','profit-overview','website-orders'].includes(id)?8:6});
  const buildDefaults=()=>{let x=0,y=0,rowH=0;const positions={};for(const id of defaultOrder){const {w,h}=sizeFor(id);if(x+w>12){x=0;y+=rowH;rowH=0;}positions[id]={x,y,w,h,locked:false};x+=w;rowH=Math.max(rowH,h);}return {order:defaultOrder,positions};};
  const defaultLayout=useMemo(buildDefaults,[]);
  const sidebarItems=useMemo(()=>permittedSidebarRegistry(user,accessRules),[user]);
  const moduleCatalog=useMemo(()=>flattenSidebarRegistry(sidebarItems),[sidebarItems]);
  const allowedWidgetIds=useMemo(()=>defaultOrder,[defaultOrder.join('|')]);
  const engine=useDashboardWorkspace({storageKey:layoutKey,defaultLayout,allowedWidgetIds});
  const {layout}=engine;
  const [slotItemMap,setSlotItemMap]=useState([]);
  const layoutOrderKey=(layout.order||[]).join('|');
  useEffect(()=>{
    if(!engine.editing || engine.device==='desktop'){setSlotItemMap([]);return;}
    setSlotItemMap((current)=>{
      const currentOrder=(current||[]).map((pair)=>pair.item).join('|');
      return currentOrder===layoutOrderKey?current:createDashboardSlotMap(layout.order);
    });
  },[engine.editing,engine.device,layoutOrderKey]);
  const [customizerOpen,setCustomizerOpen]=useState(false); const [savedNotice,setSavedNotice]=useState('');
  const [widgetSearch,setWidgetSearch]=useState(''); const [moduleCategory,setModuleCategory]=useState('All');
  const [importError,setImportError]=useState(''); const importRef=useRef(null);
  const quickActionIds=engine.state.quickActions?.length?engine.state.quickActions:QUICK_ACTION_CATALOG.slice(0,6).map(x=>x.id);
  const moduleShortcutIds=engine.state.moduleShortcuts?.length?engine.state.moduleShortcuts:moduleCatalog.slice(0,8).map(x=>x.id);
  const gesturePositionsRef=useRef(null);
  const beginLayoutGesture=()=>{gesturePositionsRef.current=JSON.parse(JSON.stringify(layout.positions||{}));engine.checkpoint()};
  const finishLayoutGesture=()=>{gesturePositionsRef.current=null};
  const updatePosition=(id,patch,columns=12)=>engine.mutateLayoutTransient(current=>{const before=current.positions[id];if(before?.locked)return;const base=gesturePositionsRef.current||current.positions;const original=base[id]||before||{x:0,y:0,...sizeFor(id),locked:false};const target=clampRect({...original,...patch},columns);current.positions=compactDashboardPositions(resolveDashboardPositions(base,id,target,current.order,columns),current.order,columns)});
  const saveDashboardLayout=async()=>{const result=await engine.commit();setSavedNotice(result?.remoteSaved?'Saved to Server':'Server Save Failed');setTimeout(()=>setSavedNotice(''),2600);return result};
  const resetAndAdapt=()=>engine.mutateLayout(current=>{const adapted=JSON.parse(JSON.stringify(defaultLayout));Object.keys(adapted.positions||{}).forEach(widgetId=>{adapted.positions[widgetId]={...adapted.positions[widgetId],locked:false}});adapted.positions=compactDashboardPositions(adapted.positions,adapted.order,12);Object.assign(current,adapted)});
  const unlockAllWidgets=()=>engine.mutateLayout(current=>{Object.keys(current.positions||{}).forEach(widgetId=>{current.positions[widgetId]={...current.positions[widgetId],locked:false}})});
  const toggleWidget=(id)=>engine.mutateLayout(current=>{if(current.order.includes(id)){current.order=current.order.filter(x=>x!==id);return;}const visibleBottom=Math.max(0,...current.order.map(widgetId=>{const rect=current.positions?.[widgetId];return rect?Number(rect.y||0)+Number(rect.h||0):0}));current.order.push(id);const base=current.positions?.[id]||{x:0,y:visibleBottom,...sizeFor(id),locked:false};const target=clampRect({...base,x:0,y:visibleBottom,locked:false},12);current.positions=resolveDashboardPositions(current.positions,id,target,current.order,12)});
  const toggleQuickAction=(id)=>engine.mutate(next=>{const list=next.quickActions?.length?[...next.quickActions]:QUICK_ACTION_CATALOG.slice(0,6).map(x=>x.id);next.quickActions=list.includes(id)?list.filter(x=>x!==id):[...list,id]});
  const toggleModuleShortcut=(id)=>engine.mutate(next=>{const list=next.moduleShortcuts?.length?[...next.moduleShortcuts]:moduleCatalog.slice(0,8).map(x=>x.id);next.moduleShortcuts=list.includes(id)?list.filter(x=>x!==id):[...list,id]});
  const toggleLock=(id)=>engine.mutateLayout(current=>{current.positions[id]={...current.positions[id],locked:!current.positions[id]?.locked}});
  const mobileSwapy=engine.editing&&engine.device!=='desktop';
  const renderedSlotMap=mobileSwapy&&slotItemMap.length===layout.order.length?normalizeDashboardSlotMap(slotItemMap,layout.order):createDashboardSlotMap(layout.order);
  const renderedOrder=renderedSlotMap.map((pair)=>pair.item);
  const compactedPositions=compactDashboardPositions(layout.positions,renderedOrder,12);
  const savedPositions=Object.fromEntries(renderedOrder.map((id)=>[id,clampRect(compactedPositions?.[id]||layout.positions?.[id]||{x:0,y:0,...sizeFor(id),locked:false},12)]));
  const fitRows=useDashboardContentFit(engine.device==='desktop',`${filters.date}|${filters.branch_id}|${engine.device}`);
  const renderedPositions=fitDashboardPositions(savedPositions,renderedOrder,fitRows,12);
  const categories=['All',...new Set(moduleCatalog.map(x=>x.category||'Other'))];
  const filteredModules=moduleCatalog.filter(item=>(moduleCategory==='All'||item.category===moduleCategory)&&item.name.toLowerCase().includes(widgetSearch.toLowerCase()));
  const exportLayout=()=>{const blob=new Blob([engine.exportJson()],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`nst-dashboard-${engine.workspace?.name||'workspace'}.json`;a.click();URL.revokeObjectURL(url)};
  const importLayout=async event=>{setImportError('');const file=event.target.files?.[0];if(!file)return;try{if(!engine.editing)engine.begin();engine.importJson(await file.text())}catch(error){setImportError(error.message||'Import failed.')}event.target.value=''};


  const widgetMap = {};
  kpis.forEach((item, i) => { widgetMap[`kpi-${i}`] = { title: item.label, node: <MetricCard {...item}/> }; });
  secondary.forEach(([label,value,Icon], i) => { widgetMap[`secondary-${i}`] = { title: label, node: <MetricCard icon={Icon} label={label} value={value} note="Live operational summary"/> }; });
  widgetMap['sales-overview'] = { title:'Sales Overview', node:<Surface className="h-full p-4"><PanelHeading icon={BarChart3} title="Sales Overview" subtitle="Live sales movement" action={<span className="rounded-lg border border-[var(--nst-dashboard-border)] px-3 py-2 text-xs font-bold">This Month</span>}/><p className="mt-3 text-2xl font-black">{money(summary.monthly_sales || summary.today_sales)}</p><LineChart value={summary.today_sales} points={summary.sales_trend || []}/></Surface> };
  widgetMap['top-products'] = { title:'Top Selling Products', node:<Surface className="flex h-full min-h-0 flex-col p-4"><div className="mb-3 shrink-0"><PanelHeading icon={ShoppingBag} title="Top Selling Products" subtitle="Best performing items" action={<span className="text-xs text-[var(--nst-dashboard-muted)]">This Month</span>}/></div><div className="nst-widget-scroll-region min-h-0 flex-1 space-y-2">{loading && !hasSummary ? [0,1,2,3].map((item)=><div key={item} className="h-12 animate-pulse rounded-xl bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_8%,var(--nst-dashboard-surface))]"/>) : products.length ? products.map((p,i)=>{const row=Array.isArray(p)?p:[p.name||p.product_name,money(p.amount||p.total),`${p.quantity||p.qty||p.sold_qty||0} sold`];return <div key={i} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 rounded-lg p-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_18%,transparent)] text-xs font-black">{i+1}</span><div><p className="text-sm font-bold">{row[0]}</p><p className="text-[11px] text-[var(--nst-dashboard-muted)]">{row[2]}</p></div><span className="text-xs font-black">{row[1]}</span></div>}) : <p className="rounded-xl border border-dashed border-[var(--nst-dashboard-border)] p-4 text-center text-xs text-[var(--nst-dashboard-muted)]">No completed product sales for this period.</p>}</div></Surface> };
  widgetMap['recent-activities'] = { title:'Recent Activities', node:<Surface className="flex h-full min-h-0 flex-col p-4"><div className="mb-3 shrink-0"><PanelHeading icon={Activity} title="Recent Activities" subtitle="Latest verified actions" action={<span className="text-xs font-bold text-[var(--nst-dashboard-primary)]">View All</span>}/></div><div className="nst-widget-scroll-region min-h-0 flex-1 space-y-2">{loading && !hasSummary ? [0,1,2,3,4].map((item)=><div key={item} className="h-14 animate-pulse rounded-xl bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_8%,var(--nst-dashboard-surface))]"/>) : activities.length ? activities.map((a,i)=><div key={i} className="flex gap-3 rounded-lg p-2"><span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500"><CheckCircle2 size={16}/></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{a.title}</p><p className="truncate text-[11px] text-[var(--nst-dashboard-muted)]">{a.subtitle}</p></div><span className="whitespace-nowrap text-[10px] text-[var(--nst-dashboard-muted)]">{a.time}</span></div>) : <p className="rounded-xl border border-dashed border-[var(--nst-dashboard-border)] p-4 text-center text-xs text-[var(--nst-dashboard-muted)]">No recent business activity yet.</p>}</div></Surface> };
  widgetMap['website-orders'] = { title:'Website Orders', node:<Surface className="h-full p-4"><PanelHeading icon={Globe2} title="Website Orders" subtitle="Connected storefront orders"/><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl border border-[var(--nst-dashboard-border)] p-4"><p className="text-xs text-[var(--nst-dashboard-muted)]">Orders</p><p className="mt-2 text-2xl font-black">{summary.total_orders ?? 0}</p></div><div className="rounded-xl border border-[var(--nst-dashboard-border)] p-4"><p className="text-xs text-[var(--nst-dashboard-muted)]">Verified Value</p><p className="mt-2 text-lg font-black">{money(summary.website_order_value)}</p></div></div></Surface> };
  widgetMap['sales-branch'] = { title:'Sales by Branch', node:<Surface className="h-full p-4"><div className="mb-4"><PanelHeading icon={Building2} title="Sales by Branch" subtitle="Branch contribution"/></div><Donut value={money(summary.monthly_sales || summary.today_sales)} label="Total" items={summary.branch_sales || []}/></Surface> };
  widgetMap['order-status'] = { title:'Order Status', node:<Surface className="h-full p-4"><div className="mb-4"><PanelHeading icon={Clock3} title="Order Status" subtitle="Current processing state"/></div><Donut value={summary.total_orders ?? 0} label="Orders" items={summary.order_status_breakdown || []}/></Surface> };
  widgetMap['profit-overview'] = { title:'Profit Overview', node:<Surface className="h-full p-4"><PanelHeading icon={TrendingUp} title="Profit Overview" subtitle="Permission-aware current net performance"/><p className="mt-3 text-2xl font-black">{money(summary.net_profit)}</p><div className="mt-5 rounded-xl border border-[var(--nst-dashboard-border)] p-4 text-xs text-[var(--nst-dashboard-muted)]">This widget shows only values returned by the authorized financial API. No illustrative trend line is used.</div></Surface> };
  widgetMap['quick-access'] = { title:'Quick Access', node:<Surface className="h-full p-4"><div className="mb-3"><PanelHeading icon={LayoutGrid} title="Quick Access" subtitle="Frequently used actions"/></div><div className="space-y-2">{quickActionIds.map(id=>{const item=QUICK_ACTION_CATALOG.find(x=>x.id===id);return item?<QuickAction key={id} {...item}/>:null})}{quickActionIds.length===0&&<p className="rounded-xl border border-dashed border-[var(--nst-dashboard-border)] p-4 text-center text-xs text-[var(--nst-dashboard-muted)]">Add shortcuts from Customize.</p>}</div></Surface> };
  widgetMap['module-shortcuts'] = { title:'Module Shortcuts', node:<Surface className="h-full p-4"><div className="mb-3"><PanelHeading icon={Gauge} title="Module Shortcuts" subtitle="Open any enabled NST OS module quickly."/></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{moduleShortcutIds.map(id=>{const item=MODULE_SHORTCUT_CATALOG.find(x=>x.id===id);if(!item)return null;const Icon=item.icon;return <Link key={id} to={item.path} className="flex items-center gap-3 rounded-xl border border-[var(--nst-dashboard-border)] p-3 text-sm font-bold transition hover:-translate-y-0.5 hover:border-[var(--nst-dashboard-primary)]"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_15%,transparent)] text-[var(--nst-dashboard-primary)]"><Icon size={18}/></span><span className="truncate">{item.label}</span></Link>})}</div></Surface> };
  widgetMap['notifications'] = { title:'Notifications', node:<Surface className="flex h-full min-h-0 flex-col p-4"><div className="shrink-0"><PanelHeading icon={Bell} title="Notifications" subtitle="Real sale and purchase activity" action={<span className="text-xs font-bold text-[var(--nst-dashboard-primary)]">{operating.action?.counts?.notifications || 0}</span>}/></div><div className="nst-widget-scroll-region mt-3 min-h-0 flex-1 space-y-2">{(operating.action?.notifications || []).length ? operating.action.notifications.slice(0,6).map((item)=><Link key={item.id} to={item.url || '#'} className="block rounded-xl border border-[var(--nst-dashboard-border)] p-3"><p className="text-sm font-black">{item.title}</p><p className="mt-1 truncate text-xs text-[var(--nst-dashboard-muted)]">{item.message}</p></Link>) : <p className="rounded-xl border border-dashed border-[var(--nst-dashboard-border)] p-4 text-center text-xs text-[var(--nst-dashboard-muted)]">No verified notifications.</p>}</div></Surface> };
  widgetMap['nst-chat'] = { title:'NST Chat', node:<Surface className="h-full overflow-hidden"><div className="flex items-center justify-between bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_24%,transparent)] p-4"><div className="flex items-center gap-3"><MessageCircle size={20}/><div><h2 className="font-black">NST Staff Chat</h2><p className="text-[11px] text-[var(--nst-dashboard-muted)]">Authenticated staff communication</p></div></div><span className="rounded-full bg-rose-500 px-2 py-1 text-[10px] font-black text-white">{operating.action?.counts?.unread_chat || 0}</span></div><div className="p-4"><p className="rounded-xl border border-[var(--nst-dashboard-border)] p-3 text-xs text-[var(--nst-dashboard-muted)]">Messages, typing status and secure attachments are available in the Staff Chat portal.</p><Link to="/staff-chat" className="mt-4 block w-full rounded-xl bg-[var(--nst-dashboard-primary)] py-3 text-center text-sm font-black text-white">Open Staff Chat</Link></div></Surface> };
  widgetMap['today-target'] = { title:"Today's Target", node:<Surface className="h-full p-4"><PanelHeading icon={Target} title="Today's Target" subtitle="Branch-wise and separate combined target" action={<Link to="/dashboard-targets" className="text-xs font-black text-[var(--nst-dashboard-primary)]">Manage</Link>}/>{operating.targets?.combined ? <><div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-xs text-[var(--nst-dashboard-muted)]">All Branches / Combined</p><p className="mt-1 text-xl font-black">{money(operating.targets.combined.actual_value)} / {money(operating.targets.combined.target_value)}</p></div><strong className="text-2xl">{operating.targets.combined.percentage || 0}%</strong></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_12%,transparent)]"><span className="block h-full rounded-full bg-[var(--nst-dashboard-primary)]" style={{width:`${Math.min(100,Number(operating.targets.combined.percentage||0))}%`}}/></div><p className="mt-3 text-xs text-[var(--nst-dashboard-muted)]">Mode: {operating.targets.combined.combined_mode === 'manual' ? 'Manual Combined Target' : 'Auto Total'} · Remaining {money(operating.targets.combined.remaining_value)}</p></> : <p className="mt-4 rounded-xl border border-dashed border-[var(--nst-dashboard-border)] p-4 text-center text-xs text-[var(--nst-dashboard-muted)]">No target is configured for today.</p>}</Surface> };
  widgetMap['business-bulletin'] = { title:'Business Bulletin', node:<Surface className="flex h-full min-h-0 flex-col p-4"><div className="shrink-0"><PanelHeading icon={Megaphone} title="Business Bulletin" subtitle="Role and branch-visible notices" action={<Link to="/business-bulletins" className="text-xs font-black text-[var(--nst-dashboard-primary)]">Open Center</Link>}/></div><div className="nst-widget-scroll-region mt-3 min-h-0 flex-1 space-y-2">{(operating.bulletins || []).slice(0,3).map((item)=><div key={item.id} className="rounded-xl border border-[var(--nst-dashboard-border)] p-3"><div className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{item.title}</strong><span className="rounded-full border px-2 py-0.5 text-[10px] font-black capitalize">{item.priority}</span></div><p className="mt-1 line-clamp-2 text-xs text-[var(--nst-dashboard-muted)]">{item.body}</p></div>)}{!(operating.bulletins || []).length&&<p className="rounded-xl border border-dashed border-[var(--nst-dashboard-border)] p-4 text-center text-xs text-[var(--nst-dashboard-muted)]">No active bulletin for your role and branch.</p>}</div></Surface> };
  widgetMap['system-status'] = { title:'System Status', node:<Surface className="h-full p-4"><div className="mb-3"><PanelHeading icon={ShieldCheck} title="System Status" subtitle="Live platform health" action={<Link to="/business-health" className="text-xs font-black text-[var(--nst-dashboard-primary)]">Details</Link>}/></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{Object.entries(operating.action?.health?.checks || {}).map(([key,check])=><div key={key} className="rounded-xl border border-[var(--nst-dashboard-border)] p-3"><div className="flex items-center justify-between gap-2"><strong className="truncate text-xs capitalize">{key}</strong><span className={`h-2.5 w-2.5 rounded-full ${check.status==='pass'?'bg-emerald-500':check.status==='fail'?'bg-rose-500':'bg-amber-500'}`}/></div><p className="mt-1 truncate text-[10px] text-[var(--nst-dashboard-muted)]">{check.message}</p></div>)}{!Object.keys(operating.action?.health?.checks || {}).length&&<div className="col-span-full rounded-xl border border-dashed border-[var(--nst-dashboard-border)] p-4 text-center text-xs text-[var(--nst-dashboard-muted)]">Health endpoint has not responded yet.</div>}</div></Surface> };

  if (loading && !hasSummary) return <DashboardHydrationSkeleton/>;

  return <div className="nst-business-dashboard min-h-screen bg-[var(--nst-dashboard-bg)] p-3 text-[var(--nst-dashboard-text)] md:p-5">
    <div className="mx-auto max-w-[1900px]">
      <NstPageHeader
        editable={false}
        icon={NstHdrLayoutDashboard}
        title={!welcomeReady ? <span style={{visibility:'hidden'}}>{t('dashboard.title')}</span> : operating.welcome?.visible !== false ? <>{welcomeText(localizedWelcome('title')) || welcomeText(t('dashboard.welcome.title'))} {operating.welcome?.icon || '👋'}</> : <>{t('dashboard.title')}</>}
        subtitle={welcomeReady && operating.welcome?.visible !== false ? <>{welcomeText(localizedWelcome('subtitle')) || t('dashboard.welcome.subtitle')}</> : null}
        actions={<>
          {operating.canManageWelcome&&<NstIconButton label={t('dashboard.welcome_editor.open')} icon={Pencil} onClick={()=>setWelcomeEditorOpen(true)}/>}
          <select value={filters.branch_id} onChange={e=>setFilters({...filters,branch_id:e.target.value})} className="rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] px-4 py-3 text-sm font-bold"><option value="">All Branches</option>{(summary.calendar?.branches||[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <label className="flex items-center gap-2 rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] px-4 py-3 text-sm font-bold"><CalendarDays size={16}/><input type="date" value={filters.date} onChange={e=>setFilters({...filters,date:e.target.value})} className="bg-transparent outline-none"/></label>
          <DashboardThemeControl enabled={accessRules.isSuperAdmin(user)} branches={summary.calendar?.branches || []}/>
          <button onClick={()=>engine.editing?saveDashboardLayout():engine.begin()} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-black transition ${engine.editing?'border-[var(--nst-dashboard-primary)] bg-[var(--nst-dashboard-primary)] text-white':'border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)]'}`}><Settings2 size={16}/>{engine.editing?'Save & Finish':'Customize'}</button>
          <button onClick={()=>setCustomizerOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] px-4 py-3 text-sm font-black"><Plus size={16}/>Add Widgets</button>
          {engine.editing&&<><button disabled={!engine.canUndo} onClick={engine.undoOnce} className="rounded-xl border border-[var(--nst-dashboard-border)] p-3 disabled:opacity-40" title="Undo"><Undo2 size={16}/></button><button disabled={!engine.canRedo} onClick={engine.redoOnce} className="rounded-xl border border-[var(--nst-dashboard-border)] p-3 disabled:opacity-40" title="Redo"><Redo2 size={16}/></button><button onClick={engine.cancel} className="inline-flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm font-black text-rose-500"><X size={16}/>Discard</button><button onClick={resetAndAdapt} className="inline-flex items-center gap-2 rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] px-4 py-3 text-sm font-black"><RotateCcw size={16}/>Reset & Adapt</button><button onClick={unlockAllWidgets} className="inline-flex items-center gap-2 rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] px-4 py-3 text-sm font-black"><Unlock size={16}/>Unlock All</button><button onClick={saveDashboardLayout} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white"><Save size={16}/>{savedNotice||'Save'}</button></>}
          <Link to="/dashboard-layout" className="hidden items-center gap-2 rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] px-4 py-3 text-sm font-black 2xl:inline-flex"><LayoutGrid size={16}/>Layout Manager</Link>
          <button onClick={()=>Promise.allSettled([load(filters),loadOperating(filters)])} className="inline-flex items-center gap-2 rounded-xl bg-[var(--nst-dashboard-primary)] px-4 py-3 text-sm font-black text-white"><RefreshCw size={16} className={loading?'animate-spin':''}/>Refresh</button>
        </>}
      />
      {filterError&&<div className="mb-4 rounded-xl bg-rose-500/10 p-3 text-sm font-bold text-rose-500">{filterError}</div>}
      {engine.lastSaveError&&<div className="mb-4 rounded-xl bg-amber-500/10 p-3 text-sm font-bold text-amber-600">{engine.lastSaveError} Layout changes are not complete until this message disappears after a successful server save.</div>}
      {engine.editing&&<div className="mb-4 rounded-2xl border border-[var(--nst-dashboard-primary)] bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_10%,var(--nst-dashboard-surface))] p-3 text-sm font-bold">Drag with the grip handle. Empty grid space is allowed; only real collisions are moved away. Resize from the bottom-right handle; locked widgets stay protected.</div>}
      <SwapyLayout
        id={`nst-dashboard-swapy-${engine.device}`}
        enable={mobileSwapy}
        className={`nst-dashboard-widget-grid ${engine.editing ? 'is-editing' : ''} ${engine.hydrating ? 'is-hydrating' : ''}`}
        updateKey={`${engine.device}:${(layout.order||[]).join('|')}`}
        config={{ animation:'spring', swapMode:'hover', autoScrollOnDrag:true, manualSwap:true }}
        onSwap={(event)=>{
          if(!engine.editing)return;
          setSlotItemMap(normalizeDashboardSlotMap(event?.newSlotItemMap?.asArray,layout.order));
        }}
        onSwapEnd={(event)=>{
          if(!engine.editing||event?.hasChanged===false)return;
          const nextOrder=dashboardOrderFromSlotMap(event?.slotItemMap?.asArray,layout.order);
          if(nextOrder.join('|')===layout.order.join('|'))return;
          engine.mutateLayout((nextLayout)=>{
            nextLayout.order=nextOrder;
          });
        }}
      >
        {renderedSlotMap.map(({slot,item:id})=>{
          if(!widgetMap[id])return null;
          const rect=clampRect(renderedPositions[id],12);
          const locked=Boolean(layout.positions[id]?.locked);
          return <SwapySlot key={slot} id={slot} className="nst-dashboard-swapy-slot" style={engine.device!=='desktop'?undefined:{gridColumn:`${rect.x+1} / span ${rect.w}`,gridRow:`${rect.y+1} / span ${rect.h}`}}>
            <SwapyItem id={id} className="h-full">
              <DashboardWidget id={id} title={widgetMap[id].title} layout={rect} editing={engine.editing} locked={locked} onToggleLock={toggleLock} onActionStart={beginLayoutGesture} onActionEnd={finishLayoutGesture} onMove={(wid,pos)=>updatePosition(wid,pos,12)} onResize={(wid,size)=>updatePosition(wid,size,12)}>{widgetMap[id].node}</DashboardWidget>
            </SwapyItem>
          </SwapySlot>;
        })}
      </SwapyLayout>
    </div>
    {welcomeEditorOpen&&createPortal(<><button aria-label={t('dashboard.welcome_editor.close')} onClick={()=>setWelcomeEditorOpen(false)} className="fixed inset-0 z-[190] bg-slate-950/55 backdrop-blur-sm"/><div className="fixed left-1/2 top-1/2 z-[200] w-[min(92vw,680px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black">{t('dashboard.welcome_editor.title')}</h2><p className="text-xs text-[var(--nst-dashboard-muted)]">{t('dashboard.welcome_editor.hint', { token: '{name}' })}</p></div><button onClick={()=>setWelcomeEditorOpen(false)} className="rounded-xl border p-2"><X size={18}/></button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">{t('dashboard.welcome_editor.title_en')}<input value={welcomeDraft.title_en} onChange={e=>setWelcomeDraft({...welcomeDraft,title_en:e.target.value})} className="mt-1 w-full rounded-xl border bg-transparent p-3"/></label><label className="text-xs font-bold">{t('dashboard.welcome_editor.icon')}<input value={welcomeDraft.icon || ''} onChange={e=>setWelcomeDraft({...welcomeDraft,icon:e.target.value})} className="mt-1 w-full rounded-xl border bg-transparent p-3"/></label><label className="text-xs font-bold sm:col-span-2">{t('dashboard.welcome_editor.subtitle_en')}<input value={welcomeDraft.subtitle_en || ''} onChange={e=>setWelcomeDraft({...welcomeDraft,subtitle_en:e.target.value})} className="mt-1 w-full rounded-xl border bg-transparent p-3"/></label><label className="text-xs font-bold">{t('dashboard.welcome_editor.title_bn')}<input value={welcomeDraft.title_bn} onChange={e=>setWelcomeDraft({...welcomeDraft,title_bn:e.target.value})} className="mt-1 w-full rounded-xl border bg-transparent p-3"/></label><label className="flex items-center gap-2 rounded-xl border p-3 text-sm font-bold"><input type="checkbox" checked={Boolean(welcomeDraft.visible)} onChange={e=>setWelcomeDraft({...welcomeDraft,visible:e.target.checked})}/>{t('dashboard.welcome_editor.visible')}</label><label className="text-xs font-bold sm:col-span-2">{t('dashboard.welcome_editor.subtitle_bn')}<input value={welcomeDraft.subtitle_bn || ''} onChange={e=>setWelcomeDraft({...welcomeDraft,subtitle_bn:e.target.value})} className="mt-1 w-full rounded-xl border bg-transparent p-3"/></label></div>{welcomeError&&<p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-bold text-rose-500">{welcomeError}</p>}<button onClick={saveWelcome} disabled={welcomeSaving} className="mt-5 w-full rounded-xl bg-[var(--nst-dashboard-primary)] p-3 font-black text-white disabled:opacity-60">{welcomeSaving ? t('common.saving') : t('dashboard.welcome_editor.save')}</button></div></>, document.body)}
    {customizerOpen&&createPortal(<><button aria-label="Close customizer" onClick={()=>setCustomizerOpen(false)} className="fixed inset-0 z-[170] bg-slate-950/55 backdrop-blur-sm"/><aside className="fixed bottom-0 right-0 top-0 z-[180] w-full max-w-xl overflow-y-auto border-l border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-5 text-[var(--nst-dashboard-text)] shadow-2xl">
      <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-5 flex items-center justify-between border-b border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-5"><div><h2 className="text-xl font-black">Enterprise Dashboard Builder</h2><p className="text-xs text-[var(--nst-dashboard-muted)]">{engine.device} layout · permission-aware registry</p></div><button onClick={()=>setCustomizerOpen(false)} className="rounded-xl border border-[var(--nst-dashboard-border)] p-2"><X size={18}/></button></div>
      {!engine.editing&&<button onClick={engine.begin} className="mb-5 w-full rounded-xl bg-[var(--nst-dashboard-primary)] p-3 font-black text-white">Start Editing</button>}
      <section className="rounded-2xl border border-[var(--nst-dashboard-border)] p-4"><div className="flex items-center justify-between"><h3 className="font-black">Workspaces</h3><button onClick={()=>engine.addWorkspace(`Workspace ${engine.state.workspaces.length+1}`)} disabled={!engine.editing} className="rounded-lg border p-2 disabled:opacity-40"><CopyPlus size={16}/></button></div><div className="mt-3 grid gap-2">{engine.state.workspaces.map(w=><div key={w.id} className="flex gap-2"><button onClick={()=>engine.switchWorkspace(w.id)} className={`flex-1 rounded-xl border p-3 text-left text-sm font-bold ${w.id===engine.state.activeWorkspaceId?'border-[var(--nst-dashboard-primary)]':''}`}>{w.name}</button>{engine.editing&&engine.state.workspaces.length>1&&<button onClick={()=>engine.deleteWorkspace(w.id)} className="rounded-xl border p-3 text-rose-500"><Trash2 size={16}/></button>}</div>)}</div></section>
      <section className="mt-5"><h3 className="font-black">Dashboard Widgets</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(widgetMap).filter(([,item])=>item.title.toLowerCase().includes(widgetSearch.toLowerCase())).map(([id,item])=>{const visible=layout.order.includes(id);return <button disabled={!engine.editing} key={id} onClick={()=>toggleWidget(id)} className="flex items-center justify-between rounded-xl border border-[var(--nst-dashboard-border)] p-3 text-left text-sm font-bold disabled:opacity-50"><span className="flex items-center gap-3"><DashboardWidgetIdentityIcon id={id}/>{item.title}</span>{visible?<Eye size={17} className="text-emerald-500"/>:<EyeOff size={17}/>}</button>})}</div></section>
      <section className="mt-7"><h3 className="font-black">All Sidebar Pages</h3><div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--nst-dashboard-border)] px-3"><Search size={16}/><input value={widgetSearch} onChange={e=>setWidgetSearch(e.target.value)} placeholder="Search widgets or pages" className="w-full bg-transparent py-3 outline-none"/></div><div className="mt-3 flex flex-wrap gap-2">{categories.map(c=><button key={c} onClick={()=>setModuleCategory(c)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${moduleCategory===c?'bg-[var(--nst-dashboard-primary)] text-white':''}`}>{c}</button>)}</div><div className="mt-3 grid gap-2 sm:grid-cols-2">{filteredModules.map(item=><button disabled={!engine.editing} key={item.id} onClick={()=>toggleModuleShortcut(item.id)} className="flex items-center justify-between rounded-xl border border-[var(--nst-dashboard-border)] p-3 text-left text-sm font-bold disabled:opacity-50"><span className="truncate">{item.parentName?`${item.parentName} › `:''}{item.name}</span>{moduleShortcutIds.includes(item.id)?<Eye size={17} className="text-emerald-500"/>:<EyeOff size={17}/>}</button>)}</div></section>
      <section className="mt-7"><h3 className="font-black">Quick Access</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{QUICK_ACTION_CATALOG.map(item=><button disabled={!engine.editing} key={item.id} onClick={()=>toggleQuickAction(item.id)} className="flex items-center justify-between rounded-xl border p-3 text-sm font-bold disabled:opacity-50"><span>{item.label}</span>{quickActionIds.includes(item.id)?<Eye size={17} className="text-emerald-500"/>:<EyeOff size={17}/>}</button>)}</div></section>
      <section className="mt-7 rounded-2xl border border-[var(--nst-dashboard-border)] p-4"><h3 className="font-black">Layout Transfer & History</h3><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={exportLayout} className="rounded-xl border p-3 text-sm font-black"><Download size={16} className="mr-2 inline"/>Export JSON</button><button onClick={()=>importRef.current?.click()} className="rounded-xl border p-3 text-sm font-black"><Upload size={16} className="mr-2 inline"/>Import JSON</button><input ref={importRef} type="file" accept="application/json" onChange={importLayout} className="hidden"/></div>{importError&&<p className="mt-2 text-xs font-bold text-rose-500">{importError}</p>}<div className="mt-3 max-h-48 space-y-2 overflow-auto">{(engine.state.history||[]).slice().reverse().map(v=><button disabled={!engine.editing} key={v.id} onClick={()=>engine.restoreVersion(v.id)} className="flex w-full items-center justify-between rounded-xl border p-3 text-xs disabled:opacity-50"><span><History size={14} className="mr-2 inline"/>{new Date(v.savedAt).toLocaleString()}</span><span>Restore</span></button>)}</div></section>
      <div className="sticky bottom-0 -mx-5 mt-7 flex gap-2 border-t border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-5">{engine.editing?<><button onClick={engine.cancel} className="flex-1 rounded-xl border border-rose-400/40 p-3 font-black text-rose-500">Discard</button><button onClick={async()=>{const result=await saveDashboardLayout();if(result?.remoteSaved)setCustomizerOpen(false)}} className="flex-1 rounded-xl bg-[var(--nst-dashboard-primary)] p-3 font-black text-white"><Save size={16} className="mr-2 inline"/>Save</button></>:<button onClick={()=>setCustomizerOpen(false)} className="w-full rounded-xl border p-3 font-black">Close</button>}</div>
    </aside></>, document.body)}
  <NstDashboardDock />
  </div>;
}
