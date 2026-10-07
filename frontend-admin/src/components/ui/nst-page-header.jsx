import { isValidElement, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { LayoutGrid, Pencil, RotateCcw, Save, X } from 'lucide-react';
import { useNstSystemUi } from '../../context/NstSystemUiContext';
import { useI18n } from '../../i18n';
import { localizedPageText } from '../../i18n/pageText';

/**
 * NST Page / Section Header - the ONLY header design for the Admin.
 *   [50px icon] -13px- [Title + Subtitle]      [Filters] [Actions]
 * Variants: standard | compact | filters | section
 * Title/subtitle can be edited per page and per language (Design mode ON -> pencil next to the title).
 * Saved in System Settings -> ui_page_content[<page path>] (same store NstPageHero uses).
 */
export function NstPageHeader({
  icon: Icon = LayoutGrid,
  title,
  subtitle,
  filters = null,
  actions = null,
  variant = 'standard',
  as: Tag = 'header',
  titleAs,
  editable = true,
  className = '',
  children = null,
  ...props
}) {
  const ui = useNstSystemUi() || {};
  const { language, t } = useI18n();
  const location = useLocation();
  const pageKey = location?.pathname || '';
  const canEdit = editable && variant !== 'section' && typeof ui.save === 'function';
  const override = canEdit ? (ui.settings?.ui_page_content?.[pageKey] || {}) : {};
  const shownTitle = localizedPageText(override, 'title', language) || title;
  const shownSubtitle = localizedPageText(override, 'subtitle', language) || subtitle;
  const [designMode, setDesignMode] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    if (!canEdit) return undefined;
    const check = () => setDesignMode(Boolean(document.querySelector('.nst-design-mode-toggle.is-on')));
    check();
    const onClick = () => window.setTimeout(check, 0);
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [canEdit]);

  const TitleTag = titleAs || (variant === 'section' ? 'h2' : 'h1');
  const iconNode = isValidElement(Icon) ? Icon : Icon ? <Icon size={24} strokeWidth={1.8} aria-hidden="true"/> : null;
  return (
    <Tag className={`nst-ph nst-ph--${variant} ${className}`.trim()} data-nst-header={variant} {...props}>
      <div className="nst-ph__lead">
        {iconNode ? <span className="nst-ph__icon" aria-hidden="true">{iconNode}</span> : null}
        <div className="nst-ph__text">
          {shownTitle ? (
            <TitleTag className="nst-ph__title">
              {shownTitle}
              {canEdit && designMode ? (
                <button type="button" className="nst-ph__edit" onClick={() => setEditorOpen(true)} aria-label={t('page_header.edit_aria')} title={t('page_header.edit_title')}><Pencil aria-hidden="true"/></button>
              ) : null}
            </TitleTag>
          ) : null}
          {shownSubtitle ? <p className="nst-ph__subtitle">{shownSubtitle}</p> : null}
          {children ? <div className="nst-ph__extra">{children}</div> : null}
        </div>
      </div>
      {filters ? <div className="nst-ph__filters">{filters}</div> : null}
      {actions ? <div className="nst-ph__actions">{actions}</div> : null}
      {editorOpen ? (
        <NstHeaderTextEditor
          pageKey={pageKey}
          ui={ui}
          defaultTitle={typeof title === 'string' ? title : ''}
          defaultSubtitle={typeof subtitle === 'string' ? subtitle : ''}
          current={override}
          onClose={() => setEditorOpen(false)}
        />
      ) : null}
    </Tag>
  );
}

function NstHeaderTextEditor({ pageKey, ui, defaultTitle, defaultSubtitle, current, onClose }) {
  const { language, languages, t } = useI18n();
  const [draft, setDraft] = useState(() => Object.fromEntries(languages.map((item) => [item.code, {
    title: localizedPageText(current, 'title', item.code),
    subtitle: localizedPageText(current, 'subtitle', item.code),
  }])));
  const [active, setActive] = useState(language);
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');
  const setField = (field, value) => setDraft((previous) => ({ ...previous, [active]: { ...previous[active], [field]: value } }));
  const persist = async (next) => {
    setState('saving'); setMessage('');
    try {
      const settings = ui.settings || {};
      const all = settings.ui_page_content && typeof settings.ui_page_content === 'object' ? settings.ui_page_content : {};
      const page = { ...(all[pageKey] || {}) };
      if (next) {
        page.title = (next.en?.title || '').trim();
        page.subtitle = (next.en?.subtitle || '').trim();
        const i18n = {};
        Object.entries(next).forEach(([code, text]) => {
          if (code === 'en') return;
          const title = (text?.title || '').trim();
          const subtitle = (text?.subtitle || '').trim();
          if (title || subtitle) i18n[code] = { title, subtitle };
        });
        page.i18n = i18n;
      } else { delete page.title; delete page.subtitle; delete page.i18n; }
      await ui.save({ ...settings, ui_page_content: { ...all, [pageKey]: page } });
      setState('saved'); setMessage(next ? t('common.saved') : t('page_header.reset_done'));
      window.setTimeout(onClose, 700);
    } catch (error) {
      setState('error'); setMessage(error?.response?.data?.message || error?.message || t('common.save_failed'));
    }
  };
  const text = draft[active] || { title: '', subtitle: '' };
  return createPortal(
    <div className="nst-ph-editor" role="dialog" aria-modal="true" aria-label={t('page_header.editor_title')}>
      <button type="button" className="nst-ph-editor__backdrop" aria-label={t('common.close')} onClick={onClose}/>
      <div className="nst-ph-editor__panel">
        <div className="nst-ph-editor__head">
          <div><h2>{t('page_header.editor_title')}</h2><p>{pageKey}</p></div>
          <button type="button" className="nst-ph-editor__close" onClick={onClose} aria-label={t('common.close')}><X/></button>
        </div>
        <div className="nst-ph-editor__langs" role="tablist" aria-label={t('common.language')}>
          {languages.map((item) => (
            <button key={item.code} type="button" role="tab" aria-selected={active === item.code} className={active === item.code ? 'is-active' : ''} onClick={() => setActive(item.code)}>{item.nativeLabel}</button>
          ))}
        </div>
        <label>{t('page_header.title_label')}<input value={text.title} dir="auto" placeholder={active === language ? (defaultTitle || t('page_header.title_placeholder')) : t('page_header.title_placeholder')} onChange={(e) => setField('title', e.target.value)}/></label>
        <label>{t('page_header.subtitle_label')}<textarea rows={3} dir="auto" value={text.subtitle} placeholder={active === language ? (defaultSubtitle || t('page_header.subtitle_placeholder')) : t('page_header.subtitle_placeholder')} onChange={(e) => setField('subtitle', e.target.value)}/></label>
        <p className="nst-ph-editor__hint">{t('page_header.hint')}</p>
        {message ? <p className={`nst-ph-editor__msg ${state === 'error' ? 'is-error' : ''}`}>{message}</p> : null}
        <div className="nst-ph-editor__actions">
          <button type="button" className="nst-btn nst-btn--secondary" onClick={() => persist(null)} disabled={state === 'saving'}><RotateCcw/>{t('common.reset')}</button>
          <button type="button" className="nst-btn nst-btn--primary" onClick={() => persist(draft)} disabled={state === 'saving'}><Save/>{state === 'saving' ? t('common.saving') : t('common.save')}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Label + input/select used inside header filters (same height as buttons). */
export function NstHeaderField({ label, children, className = '' }) {
  return <label className={`nst-ph-field ${className}`.trim()}>{label}{children}</label>;
}

export default NstPageHeader;
