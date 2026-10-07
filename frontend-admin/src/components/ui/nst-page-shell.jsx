import { NstPageHeader } from './nst-page-header';

/**
 * Page wrapper. The header is the shared NstPageHeader (locked standard).
 * `eyebrow` is accepted for backwards compatibility but NOT rendered (removed by the standard).
 */
export function NstPageShell({ eyebrow, icon, title, description, actions, filters, children, maxWidth = '1600px', className = '' }) {
  return (
    <div className={`min-h-screen bg-[var(--nst-dashboard-bg)] p-3 text-[var(--nst-dashboard-text)] md:p-5 ${className}`}>
      <div className="mx-auto space-y-5" style={{ maxWidth }}>
        {(title || description || actions) ? (
          <NstPageHeader icon={icon} title={title} subtitle={description} filters={filters} actions={actions}/>
        ) : null}
        {children}
      </div>
    </div>
  );
}
