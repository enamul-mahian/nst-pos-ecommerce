import { Loader2 } from 'lucide-react';

/**
 * NST Button - solid, consistent, NO gradients.
 * Spec: header standard section 5. Styles: styles/nst-design-system.css (.nst-btn)
 * variant: primary | secondary | ghost | success | danger | neutral
 * size: sm | md | lg
 * as: render as another element (e.g. react-router Link) - keeps the same look.
 */
const VARIANTS = new Set(['primary', 'secondary', 'ghost', 'success', 'danger', 'neutral']);

export function NstButton({
  as: Comp = 'button',
  type,
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  children,
  className = '',
  ...props
}) {
  const v = VARIANTS.has(variant) ? variant : 'secondary';
  const sizeClass = size === 'sm' ? ' nst-btn--sm' : size === 'lg' ? ' nst-btn--lg' : '';
  const isButton = Comp === 'button';
  const extra = isButton ? { type: type || 'button', disabled: disabled || loading } : { 'aria-disabled': disabled || loading ? 'true' : undefined };
  return (
    <Comp className={`nst-btn nst-btn--${v}${sizeClass} ${className}`.trim()} {...extra} {...props}>
      {loading ? <Loader2 className="animate-spin" aria-hidden="true"/> : Icon ? <Icon aria-hidden="true"/> : null}
      {children}
    </Comp>
  );
}

export function NstIconButton({ as: Comp = 'button', label, icon: Icon, variant = 'secondary', size = 'md', className = '', ...props }) {
  const v = VARIANTS.has(variant) ? variant : 'secondary';
  const sizeClass = size === 'sm' ? ' nst-btn--sm' : '';
  const extra = Comp === 'button' ? { type: 'button' } : {};
  return (
    <Comp aria-label={label} title={label} className={`nst-btn nst-btn--icon nst-btn--${v}${sizeClass} ${className}`.trim()} {...extra} {...props}>
      {Icon ? <Icon aria-hidden="true"/> : null}
    </Comp>
  );
}
