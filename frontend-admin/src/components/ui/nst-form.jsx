function FieldFrame({ label, hint, error, required, children, className = '' }) {
  return (
    <label className={`block text-sm font-bold text-[var(--nst-dashboard-text)] ${className}`}>
      {label ? <span className="mb-1.5 block">{label}{required ? <span className="ml-1 text-rose-500">*</span> : null}</span> : null}
      {children}
      {error ? <span className="mt-1.5 block text-xs font-semibold text-rose-500">{error}</span> : hint ? <span className="mt-1.5 block text-xs font-medium text-[var(--nst-dashboard-muted)]">{hint}</span> : null}
    </label>
  );
}

const controlClass = 'w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] px-3.5 py-2.5 text-sm text-[var(--nst-dashboard-text)] outline-none transition placeholder:text-[var(--nst-dashboard-muted)] focus:border-[var(--nst-dashboard-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-60';

export function NstInput({ label, hint, error, required, className = '', inputClassName = '', ...props }) {
  return <FieldFrame label={label} hint={hint} error={error} required={required} className={className}><input className={`${controlClass} ${inputClassName}`} {...props}/></FieldFrame>;
}

export function NstTextarea({ label, hint, error, required, className = '', textareaClassName = '', rows = 5, ...props }) {
  return <FieldFrame label={label} hint={hint} error={error} required={required} className={className}><textarea rows={rows} className={`${controlClass} resize-y ${textareaClassName}`} {...props}/></FieldFrame>;
}

export function NstSelect({ label, hint, error, required, className = '', selectClassName = '', children, ...props }) {
  return <FieldFrame label={label} hint={hint} error={error} required={required} className={className}><select className={`${controlClass} ${selectClassName}`} {...props}>{children}</select></FieldFrame>;
}

export function NstCheckbox({ label, description, checked, onChange, className = '', ...props }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] px-4 py-3 ${className}`}>
      <input type="checkbox" checked={Boolean(checked)} onChange={onChange} className="mt-0.5 h-4 w-4 accent-[var(--nst-dashboard-primary)]" {...props}/>
      <span className="min-w-0"><span className="block text-sm font-black text-[var(--nst-dashboard-text)]">{label}</span>{description ? <span className="mt-0.5 block text-xs text-[var(--nst-dashboard-muted)]">{description}</span> : null}</span>
    </label>
  );
}
