import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageUp, Pencil, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { useNstSystemUi } from '../../context/NstSystemUiContext';
import { useI18n } from '../../i18n';
import { localizedPageText } from '../../i18n/pageText';

const LOGO_MAX_SIDE = 256;
const LOGO_MAX_BYTES = 380000;
const FAVICON_MAX_BYTES = 190000;

function brandSettings(ui) {
  const value = ui?.settings?.ui_brand;
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value) || {}; } catch { return {}; }
}

/** Brand shown in the sidebar and top bar: saved brand settings first, then the company branding. */
export function useNstBrand(branding = {}) {
  const ui = useNstSystemUi() || {};
  const { language, t } = useI18n();
  const saved = brandSettings(ui);
  const shortName = branding.shortName || 'NST';
  return {
    saved,
    title: localizedPageText(saved, 'title', language) || t('brand.title', { name: shortName }),
    subtitle: localizedPageText(saved, 'subtitle', language) || branding.adminName || branding.name || '',
    markText: saved.markText || branding.logoText || shortName,
    logoUrl: saved.logoUrl || branding.logoUrl || '',
    logoFit: saved.logoFit === 'cover' ? 'cover' : 'contain',
    style: {
      ...(saved.background ? { '--nst-brand-bg': saved.background } : {}),
      ...(saved.textColor ? { '--nst-brand-text': saved.textColor } : {}),
      ...(saved.subtitleColor ? { '--nst-brand-subtext': saved.subtitleColor } : {}),
    },
  };
}

export function useDesignMode() {
  const [designMode, setDesignMode] = useState(false);
  useEffect(() => {
    const check = () => setDesignMode(Boolean(document.querySelector('.nst-design-mode-toggle.is-on')));
    check();
    const onClick = () => window.setTimeout(check, 0);
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  return designMode;
}

export function NstBrandMark({ brand, alt }) {
  return (
    <div className={`nst-brand-mark ${brand.logoUrl ? 'has-logo' : ''}`}>
      {brand.logoUrl
        ? <img src={brand.logoUrl} alt={alt} style={{ objectFit: brand.logoFit }} onError={(event) => { event.currentTarget.style.display = 'none'; }}/>
        : brand.markText}
    </div>
  );
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        const png = canvas.toDataURL('image/png');
        resolve(png.length <= LOGO_MAX_BYTES ? png : canvas.toDataURL('image/webp', 0.85));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function NstBrandEditor({ branding, onClose }) {
  const ui = useNstSystemUi() || {};
  const { language, languages, t } = useI18n();
  const current = brandSettings(ui);
  const fileRef = useRef(null);
  const iconRef = useRef(null);
  const [active, setActive] = useState(language);
  const [draft, setDraft] = useState(() => ({
    logoUrl: current.logoUrl || '',
    logoFit: current.logoFit === 'cover' ? 'cover' : 'contain',
    markText: current.markText || '',
    background: current.background || '',
    textColor: current.textColor || '',
    subtitleColor: current.subtitleColor || '',
    faviconMode: ['logo', 'custom', 'default'].includes(current.faviconMode) ? current.faviconMode : 'logo',
    faviconUrl: current.faviconUrl || '',
    text: Object.fromEntries(languages.map((item) => [item.code, {
      title: localizedPageText(current, 'title', item.code),
      subtitle: localizedPageText(current, 'subtitle', item.code),
    }])),
  }));
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');

  const set = (field, value) => setDraft((previous) => ({ ...previous, [field]: value }));
  const setText = (field, value) => setDraft((previous) => ({
    ...previous,
    text: { ...previous.text, [active]: { ...previous.text[active], [field]: value } },
  }));

  const pickLogo = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMessage(t('brand.editor.image_only')); return; }
    try {
      const dataUrl = await readImage(file);
      if (dataUrl.length > LOGO_MAX_BYTES) { setMessage(t('brand.editor.image_too_large')); return; }
      setMessage('');
      set('logoUrl', dataUrl);
    } catch {
      setMessage(t('brand.editor.image_failed'));
    }
  };

  const pickFavicon = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMessage(t('brand.editor.image_only')); return; }
    try {
      const dataUrl = await readImage(file);
      if (dataUrl.length > FAVICON_MAX_BYTES) { setMessage(t('brand.editor.image_too_large')); return; }
      setMessage('');
      setDraft((previous) => ({ ...previous, faviconUrl: dataUrl, faviconMode: 'custom' }));
    } catch {
      setMessage(t('brand.editor.image_failed'));
    }
  };

  const persist = async (brand) => {
    setState('saving');
    setMessage('');
    try {
      await ui.save({ ...(ui.settings || {}), ui_brand: brand });
      setState('saved');
      window.setTimeout(onClose, 500);
    } catch (error) {
      setState('idle');
      setMessage(error?.response?.data?.message || t('brand.editor.save_failed'));
    }
  };

  const save = () => {
    const english = draft.text.en || {};
    const i18n = Object.fromEntries(Object.entries(draft.text)
      .filter(([code]) => code !== 'en')
      .map(([code, value]) => [code, { title: (value.title || '').trim(), subtitle: (value.subtitle || '').trim() }]));
    persist({
      logoUrl: draft.logoUrl,
      logoFit: draft.logoFit,
      markText: draft.markText.trim(),
      background: draft.background,
      textColor: draft.textColor,
      subtitleColor: draft.subtitleColor,
      faviconMode: draft.faviconMode === 'custom' && !draft.faviconUrl ? 'logo' : draft.faviconMode,
      faviconUrl: draft.faviconMode === 'custom' ? draft.faviconUrl : '',
      title: (english.title || '').trim(),
      subtitle: (english.subtitle || '').trim(),
      i18n,
    });
  };

  const preview = {
    title: draft.text[active]?.title || draft.text.en?.title || t('brand.title', { name: branding.shortName || 'NST' }),
    subtitle: draft.text[active]?.subtitle || draft.text.en?.subtitle || branding.adminName || branding.name || '',
    markText: draft.markText || branding.logoText || branding.shortName || 'NST',
    logoUrl: draft.logoUrl || branding.logoUrl || '',
    logoFit: draft.logoFit,
  };
  const faviconPreview = draft.faviconMode === 'custom' ? draft.faviconUrl : draft.faviconMode === 'logo' ? preview.logoUrl : '';
  const previewStyle = {
    ...(draft.background ? { '--nst-brand-bg': draft.background } : {}),
    ...(draft.textColor ? { '--nst-brand-text': draft.textColor } : {}),
    ...(draft.subtitleColor ? { '--nst-brand-subtext': draft.subtitleColor } : {}),
  };

  const colorField = (field, label) => (
    <label className="nst-brand-editor__color">
      <span>{label}</span>
      <span className="nst-brand-editor__color-row">
        <input type="color" value={draft[field] || '#7c3aed'} onChange={(event) => set(field, event.target.value)}/>
        <input type="text" value={draft[field]} placeholder={t('brand.editor.theme_default')} onChange={(event) => set(field, event.target.value)}/>
        {draft[field] ? <button type="button" onClick={() => set(field, '')} aria-label={t('brand.editor.clear')}><X size={14}/></button> : null}
      </span>
    </label>
  );

  return createPortal(
    <div className="nst-ph-editor" role="dialog" aria-modal="true" aria-label={t('brand.editor.title')}>
      <button type="button" className="nst-ph-editor__backdrop" onClick={onClose} aria-label={t('common.close')}/>
      <div className="nst-ph-editor__panel nst-brand-editor">
        <div className="nst-ph-editor__head">
          <div><h2>{t('brand.editor.title')}</h2><p>{t('brand.editor.hint')}</p></div>
          <button type="button" className="nst-ph-editor__close" onClick={onClose} aria-label={t('common.close')}><X/></button>
        </div>

        <div className="nst-sidebar-brand nst-brand-editor__preview" style={previewStyle}>
          <NstBrandMark brand={preview} alt={preview.title}/>
          <div className="nst-brand-copy">
            <strong>{preview.title}</strong>
            <span>{preview.subtitle}</span>
          </div>
        </div>

        <div className="nst-brand-editor__logo">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={pickLogo}/>
          <button type="button" className="nst-brand-editor__button" onClick={() => fileRef.current?.click()}><ImageUp size={16}/>{t('brand.editor.upload_logo')}</button>
          {draft.logoUrl ? <button type="button" className="nst-brand-editor__button" onClick={() => set('logoUrl', '')}><Trash2 size={16}/>{t('brand.editor.remove_logo')}</button> : null}
          <label className="nst-brand-editor__inline">
            <span>{t('brand.editor.logo_fit')}</span>
            <select value={draft.logoFit} onChange={(event) => set('logoFit', event.target.value)}>
              <option value="contain">{t('brand.editor.fit_contain')}</option>
              <option value="cover">{t('brand.editor.fit_cover')}</option>
            </select>
          </label>
        </div>

        <label>{t('brand.editor.mark_text')}
          <input value={draft.markText} maxLength={12} placeholder={branding.logoText || branding.shortName || 'NST'} onChange={(event) => set('markText', event.target.value)}/>
        </label>

        <div className="nst-ph-editor__langs" role="tablist">
          {languages.map((item) => (
            <button key={item.code} type="button" role="tab" aria-selected={active === item.code} className={active === item.code ? 'is-active' : ''} onClick={() => setActive(item.code)}>{item.nativeLabel}</button>
          ))}
        </div>
        <label>{t('brand.editor.brand_title')}
          <input dir="auto" value={draft.text[active]?.title || ''} maxLength={120} placeholder={t('brand.title', { name: branding.shortName || 'NST' })} onChange={(event) => setText('title', event.target.value)}/>
        </label>
        <label>{t('brand.editor.brand_subtitle')}
          <input dir="auto" value={draft.text[active]?.subtitle || ''} maxLength={120} placeholder={branding.adminName || branding.name || ''} onChange={(event) => setText('subtitle', event.target.value)}/>
        </label>

        <div className="nst-brand-editor__favicon">
          <span className="nst-brand-editor__favicon-preview" aria-hidden="true">{faviconPreview ? <img src={faviconPreview} alt=""/> : <b>{preview.markText.slice(0, 2)}</b>}</span>
          <label className="nst-brand-editor__inline">
            <span>{t('brand.editor.favicon')}</span>
            <select value={draft.faviconMode} onChange={(event) => set('faviconMode', event.target.value)}>
              <option value="logo">{t('brand.editor.favicon_logo')}</option>
              <option value="custom">{t('brand.editor.favicon_custom')}</option>
              <option value="default">{t('brand.editor.favicon_default')}</option>
            </select>
          </label>
          <input ref={iconRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon" hidden onChange={pickFavicon}/>
          {draft.faviconMode === 'custom' ? <button type="button" className="nst-brand-editor__button" onClick={() => iconRef.current?.click()}><ImageUp size={16}/>{t('brand.editor.favicon_upload')}</button> : null}
          <small>{t('brand.editor.favicon_help')}</small>
        </div>

        <div className="nst-brand-editor__colors">
          <div className="nst-brand-editor__color-with-action">
            {colorField('background', t('brand.editor.background'))}

            <button
              type="button"
              className="nst-brand-editor__button"
              onClick={() => set('background', 'transparent')}
              title="Remove logo tile background"
            >
              Transparent
            </button>
          </div>
          {colorField('textColor', t('brand.editor.text_color'))}
          {colorField('subtitleColor', t('brand.editor.subtitle_color'))}
        </div>

        {message ? <p className="nst-ph-editor__msg is-error">{message}</p> : null}
        <div className="nst-ph-editor__actions">
          <button type="button" className="nst-btn nst-btn--secondary" onClick={() => persist({ logoUrl: '', title: '', subtitle: '', markText: '' })} disabled={state === 'saving'}><RotateCcw/>{t('common.reset')}</button>
          <button type="button" className="nst-btn nst-btn--primary" onClick={save} disabled={state === 'saving'}><Save/>{state === 'saving' ? t('common.saving') : state === 'saved' ? t('brand.editor.saved') : t('common.save')}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function NstBrandEditButton({ onClick }) {
  const { t } = useI18n();
  return (
    <button type="button" className="nst-brand-edit" onClick={onClick} aria-label={t('brand.editor.open')} title={t('brand.editor.open')}>
      <Pencil size={14}/>
    </button>
  );
}

