import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, ImageIcon, Save, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { brandService } from '../../services/brandService';
import { t as translate, useT } from '../../i18n';

/*
 * Brand page editor for the Website Control Center.
 * Brand details (logo, banner, colours, description, founded, headquarters...) are saved on the
 * brand record, so every page that shows the brand stays in sync. Page labels are saved in the
 * website draft (pageTexts.brand) per language and go live with Publish.
 */

const BRAND_TEXT_KEYS = [
  'official_catalog', 'official_website', 'stats_products', 'stats_categories', 'stats_founded', 'stats_headquarters',
  'catalog_label', 'products_title', 'products_count', 'filter_title', 'filters', 'condition', 'all_conditions',
  'cond_new', 'cond_used', 'cond_pre_owned', 'cond_refurbished', 'category', 'all_categories', 'close',
  'empty_title', 'empty_text', 'unavailable_title', 'unavailable_text', 'back_to_brands',
  'breadcrumb_home', 'breadcrumb_brands', 'meta_title', 'meta_description',
];
const LANGS = ['en', 'bn'];

const emptyForm = {
  name: '', slug: '', description: '', website: '', sort_order: 0, status: 'active',
  primary: '#15803d', secondary: '#064e3b', accent: '#f59e0b', founded: '', headquarters: '',
  meta_title: '', meta_description: '', show_stats: true, show_categories: true, show_filters: true,
};

const formFromBrand = (brand) => {
  const settings = brand?.page_settings || {};
  return {
    ...emptyForm,
    name: brand?.name || '',
    slug: brand?.slug || '',
    description: brand?.description || '',
    website: brand?.website || '',
    sort_order: brand?.sort_order ?? 0,
    status: brand?.status || 'active',
    primary: settings.primary || emptyForm.primary,
    secondary: settings.secondary || emptyForm.secondary,
    accent: settings.accent || emptyForm.accent,
    founded: settings.founded || '',
    headquarters: settings.headquarters || '',
    meta_title: settings.meta_title || '',
    meta_description: settings.meta_description || '',
    show_stats: settings.show_stats !== false,
    show_categories: settings.show_categories !== false,
    show_filters: settings.show_filters !== false,
  };
};

export default function BrandPageEditor({ slug, tab: initialTab = 'brand', draft, commit, onBrandChange, onBrandSaved, onClose }) {
  const t = useT();
  const [tab, setTab] = useState(initialTab);
  const [brands, setBrands] = useState([]);
  const [brand, setBrand] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [logoFile, setLogoFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [textLang, setTextLang] = useState('en');

  useEffect(() => { setTab(initialTab); }, [initialTab]);

  useEffect(() => {
    let active = true;
    brandService.getAllBrands({ limit: 500 })
      .then((response) => { if (active) setBrands(Array.isArray(response?.data) ? response.data : []); })
      .catch(() => { if (active) setBrands([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const match = brands.find((row) => row.slug === slug) || null;
    setBrand(match);
    setForm(formFromBrand(match));
    setLogoFile(null);
    setBannerFile(null);
    setRemoveLogo(false);
    setRemoveBanner(false);
  }, [brands, slug]);

  const logoPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : (removeLogo ? '' : brand?.logo_url || '')), [logoFile, removeLogo, brand]);
  const bannerPreview = useMemo(() => (bannerFile ? URL.createObjectURL(bannerFile) : (removeBanner ? '' : brand?.banner_url || '')), [bannerFile, removeBanner, brand]);
  useEffect(() => () => { if (logoFile) URL.revokeObjectURL(logoPreview); }, [logoFile, logoPreview]);
  useEffect(() => () => { if (bannerFile) URL.revokeObjectURL(bannerPreview); }, [bannerFile, bannerPreview]);

  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));

  const saveBrand = async () => {
    if (!brand?.id || saving) return;
    if (!form.name.trim()) { toast.error(t('wcc_brand.errors.name_required')); return; }
    setSaving(true);
    try {
      const payload = new FormData();
      payload.append('_method', 'PUT');
      ['name', 'slug', 'description', 'website', 'status'].forEach((key) => payload.append(key, String(form[key] ?? '')));
      payload.append('sort_order', String(Number(form.sort_order) || 0));
      ['primary', 'secondary', 'accent', 'founded', 'headquarters', 'meta_title', 'meta_description'].forEach((key) => payload.append(`page_settings[${key}]`, String(form[key] ?? '')));
      ['show_stats', 'show_categories', 'show_filters'].forEach((key) => payload.append(`page_settings[${key}]`, form[key] ? '1' : '0'));
      if (logoFile) payload.append('logo', logoFile); else if (removeLogo) payload.append('logo', '');
      if (bannerFile) payload.append('banner', bannerFile); else if (removeBanner) payload.append('banner', '');
      const response = await api.post(`/brands/${brand.id}`, payload, { headers: { 'Content-Type': 'multipart/form-data' } });
      const saved = response?.data?.data || null;
      if (saved) {
        setBrands((rows) => rows.map((row) => (row.id === saved.id ? saved : row)));
        if (saved.slug && saved.slug !== slug) onBrandChange?.(saved.slug);
      }
      toast.success(t('wcc_brand.saved'));
      onBrandSaved?.(saved?.slug || slug);
    } catch (error) {
      const errors = error?.response?.data?.errors;
      toast.error(errors ? Object.values(errors).flat().join(' ') : (error?.response?.data?.message || t('wcc_brand.errors.save_failed')));
    } finally {
      setSaving(false);
    }
  };

  const texts = draft?.pageTexts?.brand || {};
  const setText = (lang, key, value) => {
    const current = draft?.pageTexts || {};
    const brandTexts = current.brand || {};
    commit({ ...draft, pageTexts: { ...current, brand: { ...brandTexts, [lang]: { ...(brandTexts[lang] || {}), [key]: value } } } });
  };

  return <>
    <div className="nst-wcc-panel-head">
      <h2>{t('wcc_brand.title')}</h2>
      <div className="nst-wcc-panel-actions">
        <button type="button" className="nst-wcc-iconbtn" onClick={onClose} title={t('wcc_brand.close')}><X size={16}/></button>
      </div>
    </div>
    <div className="nst-wcc-tabs" role="tablist">
      {['brand', 'texts'].map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name} className={tab === name ? 'is-active' : ''} onClick={() => setTab(name)}>{t(`wcc_brand.tabs.${name}`)}</button>)}
    </div>

    <div className="nst-wcc-form">
      <label className="nst-wcc-field">
        <span className="nst-wcc-field__label">{t('wcc_brand.pick_brand')}</span>
        <select value={slug || ''} onChange={(event) => onBrandChange?.(event.target.value)}>
          {!brands.some((row) => row.slug === slug) ? <option value={slug || ''}>{slug || '—'}</option> : null}
          {brands.map((row) => <option key={row.id} value={row.slug}>{row.name}</option>)}
        </select>
        <small>{t('wcc_brand.pick_brand_help')}</small>
      </label>

      {tab === 'brand' && (brand ? <>
        <p className="nst-wcc-note">{t('wcc_brand.brand_note')}</p>
        <Row label={t('wcc_brand.fields.name')}><input value={form.name} onChange={(event) => update('name', event.target.value)}/></Row>
        <Row label={t('wcc_brand.fields.description')}><textarea rows={3} value={form.description} onChange={(event) => update('description', event.target.value)}/></Row>
        <Row label={t('wcc_brand.fields.website')}><input value={form.website} onChange={(event) => update('website', event.target.value)} placeholder="https://"/></Row>
        <div className="nst-wcc-pair"><span>{t('wcc_brand.fields.founded')}</span><input value={form.founded} onChange={(event) => update('founded', event.target.value)}/></div>
        <div className="nst-wcc-pair"><span>{t('wcc_brand.fields.headquarters')}</span><input value={form.headquarters} onChange={(event) => update('headquarters', event.target.value)}/></div>

        <div className="nst-wcc-group"><h3>{t('wcc_brand.fields.logo')}</h3>
          <ImagePicker preview={logoPreview} onPick={(file) => { setLogoFile(file); setRemoveLogo(false); }} onRemove={() => { setLogoFile(null); setRemoveLogo(true); }} t={t}/>
        </div>
        <div className="nst-wcc-group"><h3>{t('wcc_brand.fields.banner')}</h3>
          <ImagePicker preview={bannerPreview} onPick={(file) => { setBannerFile(file); setRemoveBanner(false); }} onRemove={() => { setBannerFile(null); setRemoveBanner(true); }} t={t}/>
        </div>

        <div className="nst-wcc-group"><h3>{t('wcc_brand.fields.colours')}</h3>
          {['primary', 'secondary', 'accent'].map((key) => <div key={key} className="nst-wcc-pair"><span>{t(`wcc_brand.fields.${key}`)}</span><input type="color" value={form[key]} onChange={(event) => update(key, event.target.value)}/></div>)}
        </div>

        <div className="nst-wcc-group"><h3>{t('wcc_brand.fields.show')}</h3>
          {['show_stats', 'show_categories', 'show_filters'].map((key) => <label key={key} className="nst-wcc-pair"><span>{t(`wcc_brand.fields.${key}`)}</span><input type="checkbox" checked={Boolean(form[key])} onChange={(event) => update(key, event.target.checked)}/></label>)}
        </div>

        <div className="nst-wcc-group"><h3>{t('wcc_brand.fields.seo')}</h3>
          <Row label={t('wcc_brand.fields.meta_title')}><input value={form.meta_title} onChange={(event) => update('meta_title', event.target.value)}/></Row>
          <Row label={t('wcc_brand.fields.meta_description')}><textarea rows={2} value={form.meta_description} onChange={(event) => update('meta_description', event.target.value)}/></Row>
        </div>

        <button type="button" className="nst-wcc-btn is-primary is-block" disabled={saving} onClick={saveBrand}><Save size={16}/>{saving ? t('wcc_brand.saving') : t('wcc_brand.save')}</button>
        <p className="nst-wcc-note">{t('wcc_brand.save_note')}</p>
        <Link to="/catalog" target="_blank" rel="noreferrer" className="nst-wcc-btn is-block"><ExternalLink size={15}/>{t('wcc_brand.open_catalog')}</Link>
      </> : <p className="nst-wcc-note">{t('wcc_brand.no_brand')}</p>)}

      {tab === 'texts' && <>
        <p className="nst-wcc-note">{t('wcc_brand.texts_note')}</p>
        <div className="nst-wcc-tabs" role="tablist">
          {LANGS.map((lang) => <button key={lang} type="button" role="tab" aria-selected={textLang === lang} className={textLang === lang ? 'is-active' : ''} onClick={() => setTextLang(lang)}>{t(`wcc_brand.lang.${lang}`)}</button>)}
        </div>
        {BRAND_TEXT_KEYS.map((key) => <Row key={`${textLang}-${key}`} label={t(`wcc_brand.labels.${key}`)}>
          <input value={texts[textLang]?.[key] || ''} onChange={(event) => setText(textLang, key, event.target.value)} placeholder={translate(`wcc_brand.defaults.${key}`, undefined, textLang)}/>
        </Row>)}
      </>}
    </div>
  </>;
}

function Row({ label, children }) {
  return <label className="nst-wcc-field"><span className="nst-wcc-field__label">{label}</span>{children}</label>;
}

function ImagePicker({ preview, onPick, onRemove, t }) {
  return <div className="nst-wcc-image">
    <div className="nst-wcc-image__preview">{preview ? <img src={preview} alt=""/> : <ImageIcon size={26}/>}</div>
    <div className="nst-wcc-image__actions">
      <label className="nst-wcc-btn"><ImageIcon size={15}/>{t('wcc_brand.replace_image')}<input type="file" accept="image/*" hidden onChange={(event) => onPick(event.target.files?.[0] || null)}/></label>
      <button type="button" className="nst-wcc-btn is-danger" disabled={!preview} onClick={onRemove}><Trash2 size={15}/>{t('wcc_brand.remove_image')}</button>
    </div>
  </div>;
}
