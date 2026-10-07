import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';

export function NstLoadingState({ label = 'Loading…', className = '' }) {
  return <div className={`flex min-h-36 items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-6 text-sm font-bold text-[var(--nst-dashboard-muted)] ${className}`}><Loader2 size={18} className="animate-spin"/>{label}</div>;
}

export function NstEmptyState({ title = 'Nothing here yet', description = '', action = null, icon: Icon = Inbox, className = '' }) {
  return <div className={`grid min-h-40 place-items-center rounded-2xl border border-dashed border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-6 text-center ${className}`}><div><span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_12%,transparent)] text-[var(--nst-dashboard-primary)]"><Icon size={20}/></span><h3 className="mt-3 font-black text-[var(--nst-dashboard-text)]">{title}</h3>{description ? <p className="mx-auto mt-1 max-w-xl text-sm text-[var(--nst-dashboard-muted)]">{description}</p> : null}{action ? <div className="mt-4">{action}</div> : null}</div></div>;
}

export function NstNotice({ tone = 'info', children, className = '' }) {
  const tones = {
    info: 'border-[var(--nst-dashboard-border)] bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_8%,var(--nst-dashboard-surface))] text-[var(--nst-dashboard-text)]',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
    danger: 'border-rose-500/30 bg-rose-500/10 text-rose-500',
  };
  return <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${tones[tone] || tones.info} ${className}`}>{tone === 'warning' || tone === 'danger' ? <AlertTriangle size={17} className="mt-0.5 shrink-0"/> : null}<div>{children}</div></div>;
}
