import RichTextEditor from '../RichTextEditor';
import { t } from '../../i18n';
import { youtubeEmbedUrl } from './productContentUtils';

/*
 * Catalog content sections shared by the New Product form and the device Prepare For Sale form.
 * Every section edits one `form` object through updateForm / list helpers, so both screens save
 * the same product fields: description, SEO, specifications, key features, FAQ, add-ons and video.
 */

export function DescriptionSeoFields({ form, updateForm, generateSeoNow, seoSuggestion }) {
  return (
    <div className="grid two">
      <div className="span-2 rich-panel seo-helper-panel">
        <div className="seo-helper-head">
          <div>
            <label>{t('product_form.labels.description')}</label>
            <p>{t('product_form.help.table_paste')}</p>
          </div>
          <button type="button" className="soft-btn" onClick={generateSeoNow}>{t('product_form.buttons.generate_seo')}</button>
        </div>
        <RichTextEditor value={form.description} onChange={(value) => updateForm('description', value)} placeholder={t('product_form.placeholders.description')} />
      </div>

      <Field
        label={t('product_form.labels.seo_title')}
        value={form.meta_title}
        onChange={(value) => updateForm('meta_title', value)}
        placeholder={seoSuggestion?.title || t('product_form.placeholders.seo_title')}
        help={t('product_form.help.auto_generated')}
      />
      <Field
        label={t('product_form.labels.slug')}
        value={form.slug}
        onChange={(value) => updateForm('slug', value)}
        placeholder={seoSuggestion?.slug || 'iphone-17-pro-max'}
        help={t('product_form.help.slug')}
      />
      <Textarea
        label={t('product_form.labels.meta_description')}
        value={form.meta_description}
        onChange={(value) => updateForm('meta_description', value)}
        placeholder={seoSuggestion?.description || t('product_form.placeholders.meta_description')}
      />
      <Textarea
        label={t('product_form.labels.meta_keywords')}
        value={form.seo_keywords}
        onChange={(value) => updateForm('seo_keywords', value)}
        placeholder={seoSuggestion?.keywords || t('product_form.placeholders.keywords')}
      />
    </div>
  );
}

export function FeaturesFaqFields({ form, updateListItem, addListItem, removeListItem }) {
  return (
    <div className="grid two">
      <div className="list-panel">
        <h3>{t('product_form.content.key_features')}</h3>
        {(form.key_features || []).map((feature, index) => (
          <div className="inline-row" key={`feature_${index}`}>
            <input value={feature} onChange={(event) => updateListItem('key_features', index, null, event.target.value)} placeholder="A19 Pro chip with 6-core CPU" />
            <button type="button" onClick={() => removeListItem('key_features', index)}>×</button>
          </div>
        ))}
        <button type="button" className="soft-btn" onClick={() => addListItem('key_features', '')}>+ {t('product_form.buttons.add_feature')}</button>
      </div>

      <div className="list-panel">
        <h3>FAQ</h3>
        {(form.faqs || []).map((faq, index) => (
          <div className="faq-row" key={`faq_${index}`}>
            <input value={faq.question} onChange={(event) => updateListItem('faqs', index, 'question', event.target.value)} placeholder={t('product_form.placeholders.question')} />
            <textarea value={faq.answer} onChange={(event) => updateListItem('faqs', index, 'answer', event.target.value)} placeholder={t('product_form.placeholders.answer')} />
            <button type="button" onClick={() => removeListItem('faqs', index)}>{t('product_form.buttons.remove')}</button>
          </div>
        ))}
        <button type="button" className="soft-btn" onClick={() => addListItem('faqs', { question: '', answer: '' })}>+ {t('product_form.buttons.add_faq')}</button>
      </div>
    </div>
  );
}

export function SpecificationRowsFields({ form, updateListItem, addListItem, removeListItem }) {
  return (
    <div className="list-panel simple-manual-specs">
      <div className="simple-block-title">
        <div><h3>{t('product_form.specs.quick_title')}</h3><p>{t('product_form.specs.quick_help')}</p></div>
      </div>
      {(form.specifications || []).map((spec, index) => (
        <div className="spec-row" key={`spec_${index}`}>
          <input value={spec.name} onChange={(event) => updateListItem('specifications', index, 'name', event.target.value)} placeholder="Display" />
          <input value={spec.value} onChange={(event) => updateListItem('specifications', index, 'value', event.target.value)} placeholder="6.7 inch Super Retina XDR" />
          <button type="button" onClick={() => removeListItem('specifications', index)}>×</button>
        </div>
      ))}
      <button type="button" className="soft-btn" onClick={() => addListItem('specifications', { name: '', value: '' })}>+ {t('product_form.buttons.add_specification')}</button>
    </div>
  );
}

export function AddonRowsFields({ form, updateListItem, addListItem, removeListItem }) {
  return (
    <div className="list-panel">
      <h3>{t('product_form.content.optional_addons')}</h3>
      {(form.add_ons || []).map((addon, index) => (
        <div className="spec-row" key={`addon_${index}`}>
          <input value={addon.name} onChange={(event) => updateListItem('add_ons', index, 'name', event.target.value)} placeholder="Charger" />
          <input value={addon.price} onChange={(event) => updateListItem('add_ons', index, 'price', event.target.value)} placeholder={t('product_form.placeholders.price')} />
          <button type="button" onClick={() => removeListItem('add_ons', index)}>×</button>
        </div>
      ))}
      <button type="button" className="soft-btn" onClick={() => addListItem('add_ons', { name: '', price: '', status: 'active' })}>+ {t('product_form.buttons.add_addon')}</button>
    </div>
  );
}

export function VideoFields({ form, updateForm, productVideo, productVideoPreview, handleVideo }) {
  const embedUrl = youtubeEmbedUrl(form.youtube_video_url);

  return (
    <div className="grid two">
      <div className="video-upload-card">
        <h3>{t('product_form.video.upload_title')}</h3>
        <p>{t('product_form.help.video_shared')}</p>
        <input type="file" accept="video/*" onChange={(event) => handleVideo(event.target.files?.[0])} />
        {productVideo && <strong>{productVideo.name}</strong>}
        {productVideoPreview && <video src={productVideoPreview} controls className="video-preview" />}
      </div>

      <div className="video-upload-card">
        <h3>{t('product_form.video.youtube_title')}</h3>
        <Field label={t('product_form.labels.youtube_link')} value={form.youtube_video_url} onChange={(value) => updateForm('youtube_video_url', value)} placeholder="https://www.youtube.com/watch?v=..." />
        <label className="switch-line">
          <input type="checkbox" checked={form.video_watermark} onChange={(event) => updateForm('video_watermark', event.target.checked)} />
          <span>{t('product_form.video.watermark')}</span>
        </label>
        {embedUrl && (
          <iframe className="youtube-preview" src={embedUrl} title={t('product_form.video.preview_title')} allowFullScreen />
        )}
      </div>
    </div>
  );
}

export function Field({ label, value, onChange, placeholder = '', required = false, help = '', readOnly = false }) {
  return (
    <label className="form-field">
      <span>{label}{required && <b>*</b>}</span>
      <input value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} readOnly={readOnly} />
      {help && <small>{help}</small>}
    </label>
  );
}

export function Textarea({ label, value, onChange, placeholder = '' }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <textarea value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function Select({ label, value, onChange, children, required = false, help = '' }) {
  return (
    <label className="form-field">
      <span>{label}{required && <b>*</b>}</span>
      <select value={value || ''} onChange={(event) => onChange(event.target.value)} required={required}>{children}</select>
      {help && <small>{help}</small>}
    </label>
  );
}
