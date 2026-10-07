import { useNstPageContent, useNstPageLayout } from '../../context/NstSystemUiContext';
import { NstPageHeader } from '../ui/nst-page-header';

/**
 * Editable page header (title/subtitle stored in UI page content settings).
 * Renders the shared NstPageHeader - eyebrow is kept in data but NOT shown (locked standard).
 */
export default function NstPageHero({ pageKey, defaults, icon, actions = null, filters = null, className = '' }) {
  const content = useNstPageContent(pageKey, defaults);
  const layout = useNstPageLayout(pageKey);
  const pageStyle = {
    '--nst-custom-card-radius': `${layout.cardRadius}px`,
    '--nst-custom-card-padding': `${layout.cardPadding}px`,
    '--nst-custom-border-width': `${layout.borderWidth}px`,
    '--nst-custom-section-gap': `${layout.sectionGap}px`,
  };
  const extra = content.extraFields?.length > 0 ? content.extraFields.map((field, index) => {
    const key = field.id || `${field.type || 'text'}-${index}`;
    if (field.type === 'link' && field.href) return <a key={key} href={field.href} className="is-link">{field.text}</a>;
    if (field.type === 'badge') return <span key={key} className="is-badge">{field.text}</span>;
    return <span key={key}>{field.text}</span>;
  }) : null;

  return (
    <NstPageHeader
      icon={icon}
      title={content.title}
      subtitle={content.subtitle}
      filters={filters}
      actions={actions}
      className={className}
      style={pageStyle}
      data-nst-page-key={pageKey}
    >
      {extra}
    </NstPageHeader>
  );
}
