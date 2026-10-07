import { useEffect, useState } from 'react';
import { Activity, Database, Server, HardDrive, Cpu, Mail, CalendarClock, Archive, ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import dashboardOperatingService from '../../services/dashboardOperatingService';
import { NstPageHeader } from '../../components/ui/nst-page-header';

const icons = { application:Activity, database:Database, api:Server, storage:HardDrive, cache:Cpu, queue:Cpu, scheduler:CalendarClock, mail:Mail, backup:Archive, environment:ShieldCheck };
const tones = { pass:'text-emerald-500 bg-emerald-500/10 border-emerald-500/25', warning:'text-amber-500 bg-amber-500/10 border-amber-500/25', fail:'text-rose-500 bg-rose-500/10 border-rose-500/25' };

export default function BusinessHealthPage() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => { setLoading(true); setError(''); try { const res = await dashboardOperatingService.businessHealth(); setHealth(res?.data?.data || null); } catch (err) { setError(err?.response?.data?.message || 'Business Health could not be checked.'); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const overall = health?.overall_status || 'unknown';
  return <main className="min-h-full bg-[var(--nst-dashboard-bg)] p-4 text-[var(--nst-dashboard-text)] md:p-6"><div className="mx-auto max-w-[1500px] space-y-5">
    <NstPageHeader icon={Activity} title={<>Business Health</>} subtitle={<>No static “healthy” label—every card reflects a real server-side check.</>} actions={<><button onClick={load} className="flex items-center gap-2 rounded-xl border border-[var(--nst-dashboard-border)] px-4 py-3 text-sm font-black"><RefreshCw className={loading?'animate-spin':''} size={17}/>Run Checks</button></>}/>
    {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-500">{error}</div>}
    {health && <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-[26px] border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5 shadow-[var(--nst-dashboard-shadow)]"><p className="text-xs font-bold text-[var(--nst-dashboard-muted)]">Overall Status</p><p className="mt-2 text-2xl font-black uppercase">{health.overall_status}</p></div><div className="rounded-[26px] border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5 shadow-[var(--nst-dashboard-shadow)]"><p className="text-xs font-bold text-[var(--nst-dashboard-muted)]">Warnings</p><p className="mt-2 text-2xl font-black text-amber-500">{health.warnings || 0}</p></div><div className="rounded-[26px] border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5 shadow-[var(--nst-dashboard-shadow)]"><p className="text-xs font-bold text-[var(--nst-dashboard-muted)]">Failed Checks</p><p className="mt-2 text-2xl font-black text-rose-500">{health.failed || 0}</p></div></div>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Object.entries(health?.checks || {}).map(([key, check]) => { const Icon=icons[key]||Activity; const StatusIcon=check.status==='pass'?CheckCircle2:check.status==='warning'?AlertTriangle:XCircle; return <article key={key} className={`rounded-[26px] border p-5 ${tones[check.status] || tones.warning}`}><div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-current/10"><Icon size={21}/></span><StatusIcon size={20}/></div><h2 className="mt-4 font-black capitalize">{key.replaceAll('_',' ')}</h2><p className="mt-2 text-sm leading-6 text-[var(--nst-dashboard-text)]">{check.message}</p><p className="mt-4 text-[10px] font-black uppercase tracking-[.15em]">{check.status}</p></article>; })}</div>
    {!health && loading && <div className="grid min-h-[420px] place-items-center"><RefreshCw className="animate-spin text-[var(--nst-dashboard-primary)]" size={38}/></div>}
    {health?.checked_at && <p className="text-center text-xs text-[var(--nst-dashboard-muted)]">Last checked: {new Date(health.checked_at).toLocaleString('en-BD')}</p>}
  </div></main>;
}
