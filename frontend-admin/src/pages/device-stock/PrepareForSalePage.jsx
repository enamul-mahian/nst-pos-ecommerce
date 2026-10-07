import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ClipboardCheck as NstHdrClipboardCheck } from 'lucide-react';
import deviceUnitService from '../../services/deviceUnitService';
import usedPurchaseService from '../../services/usedPurchaseService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import {
  AddonRowsFields,
  DescriptionSeoFields,
  FeaturesFaqFields,
  Field,
  Select,
  SpecificationRowsFields,
  Textarea,
  VideoFields,
} from '../../components/product-content/ProductContentFields';
import { buildSeoSuggestion, contentListHelpers } from '../../components/product-content/productContentUtils';
import { productFormStyles } from '../../components/product-content/productFormStyles';
import { useT } from '../../i18n';

const CONTENT_KEYS = [
  'short_description', 'description', 'meta_title', 'meta_description', 'seo_keywords', 'slug',
  'key_features', 'specifications', 'faqs', 'add_ons', 'youtube_video_url', 'video_watermark',
];
const LIST_KEYS = ['key_features', 'specifications', 'faqs', 'add_ons'];
const ACTIVATION_STATUSES = ['active', 'activated', 'open_box', 'inactive', 'not_activated', 'boxed'];
const LOCKED_BATTERY = ['inactive', 'not_activated', 'boxed'];
const MAX_IMAGES = 5;

const pageStyles = `
.sale-prep-grid{display:grid;gap:14px}
.sale-prep-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0}
.sale-prep-facts div{border:1px solid var(--nst-dashboard-border);border-radius:14px;padding:10px 12px;background:var(--nst-dashboard-surface)}
.sale-prep-facts dt{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--nst-dashboard-muted)}
.sale-prep-facts dd{margin:4px 0 0;font-weight:800;color:var(--nst-dashboard-text);word-break:break-word}
.sale-prep-match{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px;padding:10px 12px;border-radius:14px;background:var(--nst-dashboard-primary-soft);color:var(--nst-dashboard-text);font-weight:700;font-size:13px}
.sale-prep-match b{color:var(--nst-dashboard-primary)}
.sale-prep-note{margin:0 0 12px;color:var(--nst-dashboard-muted);font-size:13px;font-weight:600}
.sale-prep-result p{margin:6px 0;font-size:13px;font-weight:700;color:var(--nst-dashboard-text)}
.sale-prep-files{display:flex;flex-direction:column;gap:8px}
.sale-prep-done{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
.sale-prep-done a{font-weight:800;color:var(--nst-dashboard-primary)}
`;

const toBool = (value) => (value ? '1' : '0');

export default function PrepareForSalePage() {
  const t = useT();
  const navigate = useNavigate();
  const { deviceId, purchaseId } = useParams();
  const fromPurchase = Boolean(purchaseId);
  const backPath = fromPurchase ? '/used-purchase' : '/device-stock';

  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [newImages, setNewImages] = useState([]);
  const [productVideo, setProductVideo] = useState(null);
  const [productVideoPreview, setProductVideoPreview] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const fetchPreparation = useCallback((params = {}) => {
    const config = { params };
    return fromPurchase
      ? usedPurchaseService.salePreparation(purchaseId, config)
      : deviceUnitService.salePreparation(deviceId, config);
  }, [fromPurchase, purchaseId, deviceId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchPreparation();
      const payload = response?.data?.data || {};
      setData(payload);
      setForm(normalizeForm(payload.form || {}));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || t('sale_prep.errors.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [fetchPreparation, t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => () => {
    if (productVideoPreview) URL.revokeObjectURL(productVideoPreview);
  }, [productVideoPreview]);

  const updateForm = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  const listHelpers = useMemo(() => contentListHelpers(setForm), []);

  const categoryName = useMemo(
    () => (data?.options?.categories || []).find((row) => String(row.id) === String(form?.category_id))?.name || '',
    [data, form?.category_id],
  );

  const seoSuggestion = useMemo(() => (form ? buildSeoSuggestion({
    brandName: data?.device?.brand || '',
    categoryName,
    name: form.product_name,
    ram: form.ram,
    storage: form.storage,
    region: form.region,
    colorName: form.color_name,
    simNetwork: form.sim_network,
    condition: data?.device?.condition,
  }) : null), [data, form, categoryName]);

  const generateSeoNow = () => {
    if (!seoSuggestion) return;
    setForm((previous) => ({
      ...previous,
      meta_title: seoSuggestion.title || previous.meta_title,
      slug: seoSuggestion.slug || previous.slug,
      meta_description: seoSuggestion.description || previous.meta_description,
      seo_keywords: seoSuggestion.keywords || previous.seo_keywords,
    }));
  };

  // Content belongs to the catalog product, so picking another product shows that product's content.
  const changeCatalogProduct = async (mode, productId) => {
    setForm((previous) => ({ ...previous, product_mode: mode, product_id: productId }));
    try {
      const response = await fetchPreparation(mode === 'new' ? { product_mode: 'new' } : { product_id: productId });
      const payload = response?.data?.data || {};
      const next = normalizeForm(payload.form || {});
      setData((previous) => ({ ...previous, match: payload.match }));
      setForm((previous) => ({
        ...previous,
        ...Object.fromEntries(CONTENT_KEYS.map((key) => [key, next[key]])),
        product_mode: mode,
        product_id: mode === 'new' ? '' : next.product_id,
        product_name: mode === 'new' ? previous.product_name : next.product_name,
        category_id: next.category_id || previous.category_id,
      }));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || t('sale_prep.errors.load_failed'));
    }
  };

  const handleVideo = (file) => {
    setProductVideo(file || null);
    setProductVideoPreview(file ? URL.createObjectURL(file) : '');
  };

  const existingImages = form?.use_existing_images ? (data?.purchase?.image_urls || []) : [];
  const imageRoom = Math.max(0, MAX_IMAGES - existingImages.length);

  const submit = async (event) => {
    event.preventDefault();
    if (saving || !form) return;
    setSaving(true);
    setError('');
    setResult(null);

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (key === 'product_id' && form.product_mode === 'new') return;
      if (LIST_KEYS.includes(key)) {
        payload.append(key, JSON.stringify(value || []));
      } else if (typeof value === 'boolean') {
        payload.append(key, toBool(value));
      } else if (value !== null && value !== undefined) {
        payload.append(key, String(value));
      }
    });
    newImages.slice(0, imageRoom).forEach((file) => payload.append('variant_images[]', file));
    if (productVideo) payload.append('product_video', productVideo);

    try {
      const response = fromPurchase
        ? await usedPurchaseService.markReadyForSale(purchaseId, payload)
        : await deviceUnitService.readyForSale(deviceId, payload);
      setResult({ message: response?.data?.message || t('sale_prep.done_title'), links: response?.data?.links || {} });
      setNewImages([]);
      handleVideo(null);
      await load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const errors = err?.response?.data?.errors;
      const validation = errors ? Object.values(errors).flat().join(' ') : '';
      setError(validation || err?.response?.data?.message || err?.message || t('sale_prep.errors.save_failed'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !form) {
    return <div className="nst-product-shell reference-ui-shell"><style>{productFormStyles}</style>{t('sale_prep.loading')}</div>;
  }

  if (!form) {
    return (
      <div className="nst-product-shell reference-ui-shell">
        <style>{productFormStyles}</style>
        <div className="alert danger">{error || t('sale_prep.errors.load_failed')}</div>
        <Link to={backPath}>{t('sale_prep.actions.back')}</Link>
      </div>
    );
  }

  const device = data?.device || {};
  const purchase = data?.purchase || null;
  const match = data?.match || {};
  const isUsed = device.condition !== 'new';
  const batteryLocked = LOCKED_BATTERY.includes(form.activation_status);
  const candidates = match.candidates || [];
  const conditionLabel = t(`product_form.condition.${device.condition || 'used'}`, { defaultValue: String(device.condition || '').replace('_', ' ') });

  return (
    <div className="nst-product-shell reference-ui-shell">
      <style>{productFormStyles}</style>
      <style>{pageStyles}</style>

      {error && <div className="alert danger">{error}</div>}
      {result && (
        <div className="alert success">
          <strong>{result.message}</strong>
          <div className="sale-prep-done">
            {result.links.product_id ? <Link to={`/products/${result.links.product_id}/edit`}>{t('sale_prep.actions.open_product')}</Link> : null}
            <Link to="/device-stock">{t('sale_prep.actions.open_device_stock')}</Link>
            <Link to={backPath}>{t('sale_prep.actions.back')}</Link>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="product-reference-form" onKeyDown={(event) => { if (event.key === 'Enter' && event.target?.tagName !== 'TEXTAREA') event.preventDefault(); }}>
        <header className="reference-page-header">
          <NstPageHeader icon={NstHdrClipboardCheck} title={device.is_ready ? t('sale_prep.title_update') : t('sale_prep.title')} subtitle={t('sale_prep.subtitle')} />
          <div className="reference-header-actions">
            <button type="button" className="reference-cancel" onClick={() => navigate(backPath)}>{t('common.cancel')}</button>
            <button type="submit" className="reference-save" disabled={saving}>{saving ? t('sale_prep.actions.saving') : t('sale_prep.actions.save_ready')}</button>
          </div>
        </header>

        <div className="reference-content-grid">
          <main className="sale-prep-grid">
            <section className="reference-main-card">
              <div className="reference-section-heading">
                <div><h2>{t('sale_prep.device.title')}</h2><p>{t('sale_prep.device.summary')}</p></div>
                <span>{t(`sale_prep.status.${device.status}`, { defaultValue: String(device.status || '').replaceAll('_', ' ') })}</span>
              </div>
              <dl className="sale-prep-facts">
                <div><dt>{t('sale_prep.device.product')}</dt><dd>{device.product_name || '—'}</dd></div>
                <div><dt>{t('sale_prep.device.brand')}</dt><dd>{device.brand || '—'}</dd></div>
                <div><dt>{t('sale_prep.device.model')}</dt><dd>{device.model || '—'}</dd></div>
                <div><dt>IMEI 1</dt><dd>{device.imei_1 || '—'}</dd></div>
                <div><dt>IMEI 2</dt><dd>{device.imei_2 || '—'}</dd></div>
                <div><dt>{t('sale_prep.device.sku')}</dt><dd>{device.sku || '—'}</dd></div>
                <div><dt>{t('sale_prep.device.branch')}</dt><dd>{device.branch_name || '—'}</dd></div>
                <div><dt>{t('sale_prep.device.condition')}</dt><dd>{conditionLabel}</dd></div>
                <div><dt>{t('sale_prep.device.battery')}</dt><dd>{device.battery_health !== null && device.battery_health !== undefined ? `${device.battery_health}%` : '—'}</dd></div>
                {device.purchase_cost !== null && device.purchase_cost !== undefined ? <div><dt>{t('sale_prep.device.purchase_cost')}</dt><dd>৳{Number(device.purchase_cost || 0).toLocaleString()}</dd></div> : null}
                {purchase ? <div><dt>{t('sale_prep.device.seller')}</dt><dd>{[purchase.seller_name, purchase.seller_phone].filter(Boolean).join(' · ') || '—'}</dd></div> : null}
                {purchase ? <div><dt>{t('sale_prep.device.purchase_ref')}</dt><dd>#{purchase.id}</dd></div> : null}
              </dl>
            </section>

            <section className="reference-main-card">
              <div className="reference-section-heading">
                <div><h2>{t('sale_prep.catalog.title')}</h2><p>{t('sale_prep.catalog.summary')}</p></div>
              </div>
              <p className="sale-prep-match">
                {match.product
                  ? <>{t(`sale_prep.catalog.source_${match.product_source}`)} <b>{match.product.name}</b> ({match.product.sku || '—'})</>
                  : t('sale_prep.catalog.no_match')}
              </p>
              <div className="grid two">
                <Select
                  label={t('sale_prep.catalog.mode')}
                  value={form.product_mode === 'new' ? 'new' : 'existing'}
                  onChange={(value) => changeCatalogProduct(value, value === 'new' ? '' : (form.product_id || match.product?.id || candidates[0]?.id || ''))}
                >
                  <option value="existing" disabled={!match.product && candidates.length === 0}>{t('sale_prep.catalog.mode_existing')}</option>
                  <option value="new">{t('sale_prep.catalog.mode_new')}</option>
                </Select>
                {form.product_mode !== 'new' ? (
                  <Select label={t('sale_prep.catalog.product')} value={form.product_id} onChange={(value) => changeCatalogProduct('existing', value)} required>
                    <option value="">{t('sale_prep.catalog.choose_product')}</option>
                    {match.product && !candidates.some((row) => String(row.id) === String(match.product.id))
                      ? <option value={match.product.id}>{match.product.name} ({match.product.sku || '—'})</option>
                      : null}
                    {candidates.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.sku || '—'})</option>)}
                  </Select>
                ) : (
                  <Field label={t('sale_prep.catalog.product_name')} value={form.product_name} onChange={(value) => updateForm('product_name', value)} required />
                )}
                <Select label={t('sale_prep.catalog.category')} value={form.category_id} onChange={(value) => updateForm('category_id', value)}>
                  <option value="">{t('sale_prep.catalog.choose_category')}</option>
                  {(data?.options?.categories || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </Select>
                <Field label={t('sale_prep.catalog.model_number')} value={form.model_number} onChange={(value) => updateForm('model_number', value)} />
              </div>
              {isUsed ? <p className="sale-prep-note">{t('sale_prep.catalog.used_rule')}</p> : null}
            </section>

            <section className="reference-main-card">
              <div className="reference-section-heading">
                <div><h2>{t('sale_prep.variant.title')}</h2><p>{t('sale_prep.variant.summary')}</p></div>
              </div>
              <p className="sale-prep-match">
                {match.variant
                  ? <>{t('sale_prep.variant.reuse')} <b>{match.variant.name}</b> · {t('sale_prep.variant.units', { count: match.variant.units })}</>
                  : t('sale_prep.variant.create')}
              </p>
              <div className="grid three">
                <Field label={t('sale_prep.variant.color')} value={form.color_name} onChange={(value) => updateForm('color_name', value)} />
                <Field label={t('sale_prep.variant.storage')} value={form.storage} onChange={(value) => updateForm('storage', value)} />
                <Field label={t('sale_prep.variant.ram')} value={form.ram} onChange={(value) => updateForm('ram', value)} />
                <Field label={t('sale_prep.variant.region')} value={form.region} onChange={(value) => updateForm('region', value)} />
                <Field label={t('sale_prep.variant.sim')} value={form.sim_network} onChange={(value) => updateForm('sim_network', value)} />
                <Select label={t('sale_prep.variant.activation')} value={form.activation_status} onChange={(value) => updateForm('activation_status', value)}>
                  {ACTIVATION_STATUSES.map((value) => <option key={value} value={value}>{t(`sale_prep.activation.${value}`)}</option>)}
                </Select>
                <Field label={t('sale_prep.variant.battery')} value={batteryLocked ? '100' : form.battery_health} onChange={(value) => updateForm('battery_health', value)} readOnly={batteryLocked} />
                <Field label={t('sale_prep.variant.physical_condition')} value={form.physical_condition} onChange={(value) => updateForm('physical_condition', value)} />
                <Field label={t('sale_prep.variant.condition_grade')} value={form.condition_grade} onChange={(value) => updateForm('condition_grade', value)} />
              </div>
              <p className="sale-prep-note">{t('sale_prep.variant.match_rule')}</p>
            </section>

            <section className="reference-main-card">
              <div className="reference-section-heading">
                <div><h2>{t('sale_prep.price.title')}</h2><p>{t('sale_prep.price.summary')}</p></div>
              </div>
              <div className="grid three">
                <Field label={t('sale_prep.price.sale_price')} value={form.sale_price} onChange={(value) => updateForm('sale_price', value)} required />
                <Field label={t('sale_prep.price.market_price')} value={form.market_price} onChange={(value) => updateForm('market_price', value)} />
                <Select label={t('sale_prep.price.booking_type')} value={form.minimum_booking_type} onChange={(value) => updateForm('minimum_booking_type', value)}>
                  <option value="percentage">{t('sale_prep.price.booking_percentage')}</option>
                  <option value="fixed">{t('sale_prep.price.booking_fixed')}</option>
                </Select>
                <Field label={t('sale_prep.price.booking_value')} value={form.minimum_booking_value} onChange={(value) => updateForm('minimum_booking_value', value)} />
                <YesNo label={t('sale_prep.price.emi')} value={form.emi_available} onChange={(value) => updateForm('emi_available', value)} />
                <YesNo label={t('sale_prep.price.preorder')} value={form.allow_preorder} onChange={(value) => updateForm('allow_preorder', value)} />
                <YesNo label={t('sale_prep.price.website')} value={form.website_published} onChange={(value) => updateForm('website_published', value)} help={t('sale_prep.price.website_help')} />
                <YesNo label={t('sale_prep.price.show_branch')} value={form.show_branch !== false} onChange={(value) => updateForm('show_branch', value)} help={t('sale_prep.price.show_branch_help')} />
              </div>
            </section>

            <section className="reference-main-card">
              <div className="reference-section-heading">
                <div><h2>{t('sale_prep.warranty.title')}</h2><p>{t('sale_prep.warranty.summary')}</p></div>
              </div>
              <div className="grid three">
                <Field label={t('sale_prep.warranty.official')} value={form.official_warranty} onChange={(value) => updateForm('official_warranty', value)} />
                <Field label={t('sale_prep.warranty.shop')} value={form.shop_warranty} onChange={(value) => updateForm('shop_warranty', value)} />
                <Field label={t('sale_prep.warranty.duration')} value={form.warranty_duration} onChange={(value) => updateForm('warranty_duration', value)} />
                <YesNo label={t('sale_prep.warranty.box_included')} value={form.box_included} onChange={(value) => updateForm('box_included', value)} />
              </div>
              <div className="grid two">
                <Textarea label={t('sale_prep.warranty.notes')} value={form.warranty_notes} onChange={(value) => updateForm('warranty_notes', value)} />
                <Textarea label={t('sale_prep.warranty.in_box')} value={form.whats_in_box} onChange={(value) => updateForm('whats_in_box', value)} />
              </div>
            </section>

            <section className="reference-main-card">
              <div className="reference-section-heading">
                <div><h2>{t('sale_prep.content.title')}</h2><p>{t('sale_prep.content.summary')}</p></div>
              </div>
              <div className="review-accordion-grid simple-content-step">
                <details open>
                  <summary>{t('product_form.content.description_seo')}</summary>
                  <Textarea label={t('sale_prep.content.short_description')} value={form.short_description} onChange={(value) => updateForm('short_description', value)} />
                  <DescriptionSeoFields form={form} updateForm={updateForm} generateSeoNow={generateSeoNow} seoSuggestion={seoSuggestion} />
                </details>
                <details>
                  <summary>{t('sale_prep.content.specs')}</summary>
                  <SpecificationRowsFields form={form} {...listHelpers} />
                </details>
                <details>
                  <summary>{t('product_form.content.features_faq')}</summary>
                  <FeaturesFaqFields form={form} {...listHelpers} />
                </details>
                <details>
                  <summary>{t('product_form.content.video_addons')}</summary>
                  <div className="simple-optional-stack">
                    <VideoFields form={form} updateForm={updateForm} productVideo={productVideo} productVideoPreview={productVideoPreview} handleVideo={handleVideo} />
                    <AddonRowsFields form={form} {...listHelpers} />
                  </div>
                </details>
              </div>
            </section>

            <section className="reference-main-card">
              <div className="reference-section-heading">
                <div><h2>{t('sale_prep.inspection.title')}</h2><p>{t('sale_prep.inspection.summary')}</p></div>
              </div>
              <Textarea label={t('sale_prep.inspection.note')} value={form.inspection_note} onChange={(value) => updateForm('inspection_note', value)} placeholder={t('sale_prep.inspection.placeholder')} />
            </section>
          </main>

          <aside className="reference-sidebar">
            <section className="reference-side-card">
              <div className="reference-side-title"><h3>{t('sale_prep.images.title')}</h3><span>{existingImages.length + Math.min(newImages.length, imageRoom)}/{MAX_IMAGES}</span></div>
              <p className="sidebar-helper-copy">{t('sale_prep.images.help')}</p>
              {purchase?.image_urls?.length ? (
                <label className="switch-line">
                  <input type="checkbox" checked={Boolean(form.use_existing_images)} onChange={(event) => updateForm('use_existing_images', event.target.checked)} />
                  <span>{t('sale_prep.images.use_existing', { count: purchase.image_urls.length })}</span>
                </label>
              ) : null}
              {existingImages.length ? <div className="reference-image-grid">{existingImages.map((url) => <div key={url}><img src={url} alt={device.product_name || ''} /></div>)}</div> : null}
              <div className="sale-prep-files">
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={imageRoom === 0} onChange={(event) => setNewImages(Array.from(event.target.files || []).slice(0, imageRoom))} />
                {newImages.map((file) => <small key={file.name}>{file.name}</small>)}
              </div>
            </section>

            <section className="reference-side-card sale-prep-result">
              <h3>{t('sale_prep.result.title')}</h3>
              <p>✓ {match.product && form.product_mode !== 'new' ? t('sale_prep.result.product_reuse', { name: match.product.name }) : t('sale_prep.result.product_create')}</p>
              <p>✓ {match.variant && form.product_mode !== 'new' ? t('sale_prep.result.variant_reuse') : t('sale_prep.result.variant_create')}</p>
              <p>✓ {t('sale_prep.result.same_device')}</p>
              <p>✓ {device.is_ready ? t('sale_prep.result.stock_same') : t('sale_prep.result.stock_add', { branch: device.branch_name || '—' })}</p>
              <p>✓ {t('sale_prep.result.cost_kept')}</p>
              <p>{form.website_published ? `✓ ${t('sale_prep.result.website_on')}` : `○ ${t('sale_prep.result.website_off')}`}</p>
            </section>
          </aside>
        </div>

        <footer className="reference-footer-actions">
          <button type="button" className="ghost-btn" onClick={() => navigate(backPath)}>← {t('sale_prep.actions.back')}</button>
          <div className="action-spacer" />
          <button type="submit" className="reference-save" disabled={saving}>{saving ? t('sale_prep.actions.saving') : t('sale_prep.actions.save_ready')}</button>
        </footer>
      </form>
    </div>
  );
}

function YesNo({ label, value, onChange, help = '' }) {
  const t = useT();
  return (
    <Select label={label} value={value ? 'yes' : 'no'} onChange={(next) => onChange(next === 'yes')} help={help}>
      <option value="yes">{t('common.yes')}</option>
      <option value="no">{t('common.no')}</option>
    </Select>
  );
}

function normalizeForm(source) {
  const form = { ...source };
  LIST_KEYS.forEach((key) => { form[key] = Array.isArray(form[key]) ? form[key] : []; });
  if (!form.key_features.length) form.key_features = [''];
  ['product_id', 'category_id', 'sale_price', 'market_price', 'battery_health', 'minimum_booking_value'].forEach((key) => {
    form[key] = form[key] === null || form[key] === undefined ? '' : String(form[key]);
  });
  form.product_mode = form.product_mode === 'new' ? 'new' : 'existing';
  return form;
}
