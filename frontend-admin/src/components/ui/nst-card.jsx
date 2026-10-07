export function NstCard({ title, description, actions, children, className = '', contentClassName = '' }) {
  return (
    <section className={`rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] text-[var(--nst-dashboard-text)] shadow-sm ${className}`}>
      {(title || description || actions) && (
        <div className="flex flex-col gap-3 border-b border-[var(--nst-dashboard-border)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title ? <h2 className="text-lg font-black">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-[var(--nst-dashboard-muted)]">{description}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      )}
      <div className={`p-5 ${contentClassName}`}>{children}</div>
    </section>
  );
}
