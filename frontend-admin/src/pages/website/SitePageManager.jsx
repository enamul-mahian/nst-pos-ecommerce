import { useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, FilePlus2, Globe2, Settings2, Trash2, X } from 'lucide-react';
import { useT } from '../../i18n';
import { STOREFRONT_PAGES, PAGE_GROUPS, isCustomPage, langField, otherLanguages, pageSupportsSections, slugify, slugProblem, withLangField } from './sitePages';

/* ---------------- Page picker (left panel) ---------------- */
export function PagePicker({ pages, pageId, onSelect, onAdd, onSettings }) {
  const t = useT();
  const groups = useMemo(() => {
    const byGroup = {};
    STOREFRONT_PAGES.forEach(([id, , group]) => { if (id === 'header') return; if (pages.some((page) => page.id === id)) (byGroup[group] = byGroup[group] || []).push({ id, label: id === 'home' ? `${t('wcc_pages.names.home')} (/)` : t(`wcc_pages.names.${id}`) }); });
    const custom = pages.filter(isCustomPage).map((page) => ({ id: page.id, label: `${page.name || page.slug} (/${String(page.slug || '').replace(/^\/+/, '')})${page.status === 'draft' ? ` · ${t('wcc_pages.draft')}` : ''}` }));
    if (custom.length) byGroup.custom = custom;
    return PAGE_GROUPS.filter((group) => byGroup[group]?.length).map((group) => ({ group, rows: byGroup[group] }));
  }, [pages, t]);

  return <>
    <div className="nst-wcc-select">
      <Globe2 size={16}/>
      <select value={pageId} onChange={(event) => onSelect(event.target.value)} aria-label={t('wcc_pages.pick')}>
        {groups.map(({ group, rows }) => <optgroup key={group} label={t(`wcc_pages.groups.${group}`)}>
          {rows.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
        </optgroup>)}
      </select>
      <ChevronDown size={16}/>
    </div>
    <div className="nst-wcc-pagebar">
      <button type="button" className="nst-wcc-btn" onClick={onSettings}><Settings2 size={15}/>{t('wcc_pages.settings')}</button>
      <button type="button" className="nst-wcc-btn is-primary" onClick={onAdd}><FilePlus2 size={15}/>{t('wcc_pages.add')}</button>
    </div>
  </>;
}

/* ---------------- Add page dialog ---------------- */
export function AddPageDialog({ pages, onClose, onCreate }) {
  const t = useT();
  const [form, setForm] = useState({ name: '', names: {}, slug: '', slugTouched: false, start: 'text', copyFrom: 'home', placement: 'header', status: 'published' });
  const slug = form.slugTouched ? form.slug : slugify(form.name);
  const problem = form.name.trim() ? slugProblem(slug, pages) : 'wcc_pages.errors.name_required';
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const submit = (event) => {
    event.preventDefault();
    if (problem) return;
    const i18n = {};
    otherLanguages().forEach(({ code }) => { const value = String(form.names[code] || '').trim(); if (value) i18n[code] = { name: value }; });
    onCreate({ name: form.name.trim(), i18n, slug, start: form.start, copyFrom: form.copyFrom, placement: form.placement, status: form.status });
  };
  const copyChoices = pages.filter((page) => pageSupportsSections(page.id, pages) && (page.blocks || []).length);

  return <div className="nst-wcc-modal" role="dialog" aria-modal="true" aria-label={t('wcc_pages.add_title')}>
    <button type="button" className="nst-wcc-modal__backdrop" onClick={onClose} aria-label={t('wcc_pages.close')}/>
    <form className="nst-wcc-modal__panel nst-wcc-addpage" onSubmit={submit}>
      <div className="nst-wcc-panel-head"><h2>{t('wcc_pages.add_title')}</h2><button type="button" className="nst-wcc-iconbtn" onClick={onClose} aria-label={t('wcc_pages.close')}><X size={18}/></button></div>
      <label className="nst-wcc-field"><span className="nst-wcc-field__label">{t('wcc_pages.fields.name_en')}</span><input autoFocus value={form.name} maxLength={80} onChange={(event) => set({ name: event.target.value })} placeholder={t('wcc_pages.fields.name_placeholder')}/></label>
      {otherLanguages().map(({ code, nativeLabel }) => <label key={code} className="nst-wcc-field"><span className="nst-wcc-field__label">{t('wcc_pages.fields.name_lang', { language: nativeLabel })}</span><input value={form.names[code] || ''} maxLength={80} onChange={(event) => set({ names: { ...form.names, [code]: event.target.value } })}/></label>)}
      <label className="nst-wcc-field"><span className="nst-wcc-field__label">{t('wcc_pages.fields.slug')}</span><input value={slug} maxLength={60} onChange={(event) => set({ slug: slugify(event.target.value), slugTouched: true })} placeholder="about-us"/><small>{t('wcc_pages.fields.slug_help', { path: `/${slug || '...'}` })}</small></label>
      <div className="nst-wcc-pair"><span>{t('wcc_pages.fields.start')}</span><select value={form.start} onChange={(event) => set({ start: event.target.value })}>
        {['text', 'blank', 'copy'].map((value) => <option key={value} value={value}>{t(`wcc_pages.start.${value}`)}</option>)}
      </select></div>
      {form.start === 'copy' && <div className="nst-wcc-pair"><span>{t('wcc_pages.fields.copy_from')}</span><select value={form.copyFrom} onChange={(event) => set({ copyFrom: event.target.value })}>
        {copyChoices.map((page) => <option key={page.id} value={page.id}>{isCustomPage(page) ? page.name : t(`wcc_pages.names.${page.id}`)}</option>)}
      </select></div>}
      <div className="nst-wcc-pair"><span>{t('wcc_pages.fields.menu')}</span><select value={form.placement} onChange={(event) => set({ placement: event.target.value })}>
        {['none', 'header', 'footer', 'both'].map((value) => <option key={value} value={value}>{t(`wcc_pages.menu.${value}`)}</option>)}
      </select></div>
      <div className="nst-wcc-pair"><span>{t('wcc_pages.fields.status')}</span><select value={form.status} onChange={(event) => set({ status: event.target.value })}>
        <option value="published">{t('wcc_pages.status.published')}</option><option value="draft">{t('wcc_pages.status.draft')}</option>
      </select></div>
      {problem && form.name.trim() ? <p className="nst-wcc-warn"><span>{t(problem)}</span></p> : null}
      <p className="nst-wcc-note">{t('wcc_pages.add_note')}</p>
      <div className="nst-wcc-pagebar"><button type="button" className="nst-wcc-btn" onClick={onClose}>{t('wcc_pages.cancel')}</button><button type="submit" className="nst-wcc-btn is-primary" disabled={Boolean(problem)}><FilePlus2 size={15}/>{t('wcc_pages.create')}</button></div>
    </form>
  </div>;
}

/* ---------------- Page settings (right panel) ---------------- */
export function PageSettingsPanel({ page, pages, siteUrl, onChange, onDelete, onClose }) {
  const t = useT();
  const custom = isCustomPage(page);
  const [slugDraft, setSlugDraft] = useState(String(page.slug || '').replace(/^\/+/, ''));
  const slugError = custom ? slugProblem(slugDraft, pages, page.id) : '';
  const languages = [{ code: 'en', nativeLabel: 'English' }, ...otherLanguages()];
  const text = (field, label, { area = false, max = 160 } = {}) => languages.map(({ code, nativeLabel }) => <label key={`${field}-${code}`} className="nst-wcc-field">
    <span className="nst-wcc-field__label">{t(label, { language: nativeLabel })}</span>
    {area
      ? <textarea rows={3} maxLength={max} value={langField(page, code, field)} onChange={(event) => onChange(withLangField(page, code, field, event.target.value))}/>
      : <input maxLength={max} value={langField(page, code, field)} onChange={(event) => onChange(withLangField(page, code, field, event.target.value))}/>}
  </label>);
  const livePath = custom ? `/${String(page.slug || '').replace(/^\/+/, '')}` : String(page.link || page.slug || '/');

  return <div className="nst-wcc-pagesettings">
    <div className="nst-wcc-panel-head">
      <h2>{custom ? page.name : t(`wcc_pages.names.${page.id}`)}</h2>
      <div className="nst-wcc-panel-actions">
        {!livePath.includes(':') && !livePath.startsWith('global:') && <a className="nst-wcc-iconbtn" href={`${siteUrl}${livePath}`} target="_blank" rel="noreferrer" title={t('wcc_pages.open_live')}><ExternalLink size={16}/></a>}
        {onClose && <button type="button" className="nst-wcc-iconbtn" onClick={onClose} aria-label={t('wcc_pages.close')}><X size={16}/></button>}
      </div>
    </div>
    <div className="nst-wcc-form">
      {!pageSupportsSections(page.id, pages) && <p className="nst-wcc-note">{t('wcc_pages.no_sections')}</p>}
      {custom && <div className="nst-wcc-group"><h3>{t('wcc_pages.section_page')}</h3>
        {text('name', 'wcc_pages.fields.name_lang', { max: 80 })}
        <label className="nst-wcc-field"><span className="nst-wcc-field__label">{t('wcc_pages.fields.slug')}</span>
          <input value={slugDraft} maxLength={60} onChange={(event) => { const next = slugify(event.target.value); setSlugDraft(next); if (!slugProblem(next, pages, page.id)) onChange({ ...page, slug: next, link: `/${next}` }); }}/>
          <small>{slugError ? t(slugError) : t('wcc_pages.fields.slug_help', { path: `/${slugDraft}` })}</small>
        </label>
        {text('intro', 'wcc_pages.fields.intro_lang', { area: true, max: 300 })}
        <div className="nst-wcc-pair"><span>{t('wcc_pages.fields.show_header')}</span><select value={page.showHeader === false ? 'no' : 'yes'} onChange={(event) => onChange({ ...page, showHeader: event.target.value === 'yes' })}><option value="yes">{t('wcc_pages.yes')}</option><option value="no">{t('wcc_pages.no')}</option></select></div>
        <div className="nst-wcc-pair"><span>{t('wcc_pages.fields.status')}</span><select value={page.status === 'draft' ? 'draft' : 'published'} onChange={(event) => onChange({ ...page, status: event.target.value })}><option value="published">{t('wcc_pages.status.published')}</option><option value="draft">{t('wcc_pages.status.draft')}</option></select></div>
      </div>}
      {custom && <div className="nst-wcc-group"><h3>{t('wcc_pages.section_menu')}</h3>
        <div className="nst-wcc-pair"><span>{t('wcc_pages.fields.menu')}</span><select value={page.menu?.placement || 'none'} onChange={(event) => onChange({ ...page, menu: { ...(page.menu || {}), placement: event.target.value } })}>
          {['none', 'header', 'footer', 'both'].map((value) => <option key={value} value={value}>{t(`wcc_pages.menu.${value}`)}</option>)}
        </select></div>
        {(page.menu?.placement || 'none') !== 'none' && <>
          {text('menuLabel', 'wcc_pages.fields.menu_label_lang', { max: 40 })}
          <div className="nst-wcc-pair"><span>{t('wcc_pages.fields.menu_order')}</span><input type="number" min="0" max="99" value={Number(page.menu?.order || 0)} onChange={(event) => onChange({ ...page, menu: { ...(page.menu || {}), order: Number(event.target.value) || 0 } })}/></div>
        </>}
      </div>}
      {!String(page.link || '').startsWith('global:') && <div className="nst-wcc-group"><h3>{t('wcc_pages.section_seo')}</h3>
        {text('metaTitle', 'wcc_pages.fields.meta_title_lang', { max: 70 })}
        {text('metaDescription', 'wcc_pages.fields.meta_description_lang', { area: true, max: 170 })}
        <p className="nst-wcc-note">{t('wcc_pages.seo_note')}</p>
      </div>}
      {custom && <button type="button" className="nst-wcc-btn is-danger is-block" onClick={onDelete}><Trash2 size={15}/>{t('wcc_pages.delete')}</button>}
      <p className="nst-wcc-note">{t('wcc_pages.publish_note')}</p>
    </div>
  </div>;
}

/* ---------------- Text Block section fields (right panel) ---------------- */
export function TextBlockFields({ section, onContent }) {
  const t = useT();
  const content = section?.content || {};
  const languages = [{ code: 'en', nativeLabel: 'English' }, ...otherLanguages()];
  const value = (code, field) => (code === 'en' ? content[field] : content.i18n?.[code]?.[field]) || '';
  const set = (code, field, next) => onContent(code === 'en' ? { [field]: next } : { i18n: { ...(content.i18n || {}), [code]: { ...(content.i18n?.[code] || {}), [field]: next } } });
  return <>
    {languages.map(({ code, nativeLabel }) => <div key={code} className="nst-wcc-group">
      <h3>{nativeLabel}</h3>
      <label className="nst-wcc-field"><span className="nst-wcc-field__label">{t('wcc_pages.text.heading')}</span><input maxLength={120} value={value(code, 'title')} onChange={(event) => set(code, 'title', event.target.value)}/></label>
      <label className="nst-wcc-field"><span className="nst-wcc-field__label">{t('wcc_pages.text.body')}</span><textarea rows={8} maxLength={6000} value={value(code, 'body')} onChange={(event) => set(code, 'body', event.target.value)}/><small>{t('wcc_pages.text.body_help')}</small></label>
    </div>)}
    <div className="nst-wcc-pair"><span>{t('wcc_pages.text.align')}</span><select value={content.align === 'center' ? 'center' : 'left'} onChange={(event) => onContent({ align: event.target.value })}><option value="left">{t('wcc_pages.text.left')}</option><option value="center">{t('wcc_pages.text.center')}</option></select></div>
  </>;
}
