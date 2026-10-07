import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Inbox, Loader2, type LucideIcon } from 'lucide-react';
import { humanize, statusTone, type Tone } from './portalUtils';

const toneClasses: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-sky-50 text-sky-600',
  red: 'bg-rose-50 text-rose-600',
  violet: 'bg-violet-50 text-violet-700',
  slate: 'bg-slate-100 text-slate-600',
};

export const StatusBadge: React.FC<{ status: unknown; className?: string }> = ({ status, className = '' }) => (
  <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${toneClasses[statusTone(status)]} ${className}`}>
    {humanize(status)}
  </span>
);

export const StatCard: React.FC<{ icon: LucideIcon; label: string; value: React.ReactNode; tone?: Tone; to?: string }> = ({ icon: Icon, label, value, tone = 'violet', to }) => {
  const body = (
    <>
      <span className={`hidden h-10 w-10 shrink-0 place-items-center rounded-xl min-[400px]:grid sm:h-11 sm:w-11 ${toneClasses[tone]}`}><Icon className="h-5 w-5" /></span>
      <span className="min-w-0">
        <span className="line-clamp-2 block text-[11px] font-medium leading-tight text-slate-500 sm:text-xs">{label}</span>
        <span className="mt-0.5 block truncate text-base font-bold text-slate-900 min-[400px]:text-lg sm:text-xl">{value}</span>
      </span>
    </>
  );
  const cls = 'flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm transition hover:border-violet-200 hover:shadow-md sm:p-4';
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
};

export const Panel: React.FC<{ title: string; action?: { label: string; to: string }; right?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, action, right, children, className = '' }) => (
  <section className={`min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-bold text-slate-900 sm:text-base">{title}</h2>
      {right}
      {action && (
        <Link to={action.to} className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-violet-700 hover:text-violet-900">
          {action.label}<ChevronRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
    {children}
  </section>
);

export const EmptyState: React.FC<{ title?: string; note?: string; icon?: LucideIcon }> = ({ title = 'Nothing here yet', note, icon: Icon = Inbox }) => (
  <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-600"><Icon className="h-6 w-6" /></span>
    <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
    {note && <p className="mt-1 max-w-sm text-xs text-slate-500">{note}</p>}
  </div>
);

export const LoadingBlock: React.FC = () => (
  <div className="flex items-center justify-center py-10 text-violet-600"><Loader2 className="h-6 w-6 animate-spin" /></div>
);

export const ErrorNote: React.FC<{ message: string }> = ({ message }) => (
  <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</p>
);

export const PageHeading: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode }> = ({ title, subtitle, right }) => (
  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">
      <h1 className="text-lg font-bold text-slate-900 sm:text-xl">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
    </div>
    {right}
  </div>
);

export const Tabs: React.FC<{ tabs: string[]; active: string; onChange: (tab: string) => void }> = ({ tabs, active, onChange }) => (
  <div className="-mx-4 mb-4 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
    <div className="flex min-w-max gap-5">
      {tabs.map((tab) => (
        <button key={tab} type="button" onClick={() => onChange(tab)}
          className={`-mb-px border-b-2 px-1 pb-2.5 text-sm font-semibold transition ${active === tab ? 'border-violet-700 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          {tab}
        </button>
      ))}
    </div>
  </div>
);

export interface Column {
  key: string;
  label: string;
  render?: (row: any) => React.ReactNode;
  /** The column shown as the card title on phones */
  primary?: boolean;
  align?: 'right';
}

/** Table on tablet/desktop, stacked cards on phones. */
export const RecordList: React.FC<{ rows: any[]; columns: Column[]; isLoading?: boolean; error?: string | null; empty?: string; emptyNote?: string }> = ({ rows, columns, isLoading, error, empty, emptyNote }) => {
  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorNote message={error} />;
  if (!rows.length) return <EmptyState title={empty || 'No records found'} note={emptyNote} />;
  const cell = (row: any, col: Column) => (col.render ? col.render(row) : (row?.[col.key] ?? '-'));
  const primary = columns.find((c) => c.primary) || columns[0];
  const rest = columns.filter((c) => c !== primary);
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
              {columns.map((c) => <th key={c.key} className={`px-3 py-2.5 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, i) => (
              <tr key={row?.id ?? i} className="hover:bg-slate-50/70">
                {columns.map((c) => <td key={c.key} className={`whitespace-nowrap px-3 py-3 text-slate-700 ${c.align === 'right' ? 'text-right' : ''}`}>{cell(row, c)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {rows.map((row, i) => (
          <li key={row?.id ?? i} className="rounded-xl border border-slate-200 p-3.5">
            <div className="mb-2 text-sm font-semibold text-slate-900">{cell(row, primary)}</div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              {rest.map((c) => (
                <div key={c.key} className="min-w-0">
                  <dt className="text-slate-500">{c.label}</dt>
                  <dd className="mt-0.5 truncate font-medium text-slate-800">{cell(row, c)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
};

/** Responsive SVG donut. */
export const DonutChart: React.FC<{ segments: { label: string; value: number; color: string }[]; centerLabel: string }> = ({ segments, centerLabel }) => {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-around">
      <svg viewBox="0 0 120 120" className="h-40 w-40 shrink-0 -rotate-90 sm:h-44 sm:w-44" role="img" aria-label={`${total} ${centerLabel}`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#f1f5f9" strokeWidth="14" />
        {total > 0 && segments.map((s) => {
          const len = (s.value / total) * c;
          const el = <circle key={s.label} cx="60" cy="60" r={r} fill="none" stroke={s.color} strokeWidth="14" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />;
          offset += len;
          return el;
        })}
        <g className="rotate-90" style={{ transformOrigin: '60px 60px' }}>
          <text x="60" y="60" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 22, fontWeight: 700 }}>{total}</text>
          <text x="60" y="76" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 8 }}>{centerLabel}</text>
        </g>
      </svg>
      <ul className="w-full max-w-[220px] space-y-2.5 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span>
            <span className="font-medium text-slate-800">{s.value} <span className="text-xs text-slate-400">({total ? Math.round((s.value / total) * 100) : 0}%)</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Responsive SVG area/line chart. */
export const LineChart: React.FC<{ points: { label: string; value: number }[]; format?: (v: number) => string }> = ({ points, format = (v) => String(v) }) => {
  const W = 320, H = 170, L = 38, B = 22, T = 10, R = 18;
  const max = Math.max(1, ...points.map((p) => p.value)) * 1.1;
  const x = (i: number) => L + (points.length <= 1 ? 0 : (i * (W - L - R)) / (points.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  const ticks = [0, 1, 2, 3].map((k) => (max / 3) * k);
  if (!points.length) return <EmptyState title="No supply data yet" />;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Supply summary chart">
      <defs><linearGradient id="nst-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7c3aed" stopOpacity=".25" /><stop offset="1" stopColor="#7c3aed" stopOpacity="0" /></linearGradient></defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#eef2f7" />
          <text x={L - 6} y={y(t) + 3} textAnchor="end" style={{ fontSize: 8 }} className="fill-slate-400">{format(t)}</text>
        </g>
      ))}
      <path d={`${line} L${x(points.length - 1)},${H - B} L${x(0)},${H - B} Z`} fill="url(#nst-area)" />
      <path d={line} fill="none" stroke="#6d28d9" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="3.2" fill="#6d28d9" stroke="#fff" strokeWidth="1.5" />
          <text x={x(i)} y={H - 6} textAnchor="middle" style={{ fontSize: 8 }} className="fill-slate-500">{p.label}</text>
        </g>
      ))}
    </svg>
  );
};
