export function NstTableShell({ children, className = '' }) {
  return <div className={`overflow-hidden rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] ${className}`}><div className="overflow-auto">{children}</div></div>;
}

export function NstTable({ children, className = '' }) {
  return <table className={`min-w-full border-collapse text-sm text-[var(--nst-dashboard-text)] ${className}`}>{children}</table>;
}
