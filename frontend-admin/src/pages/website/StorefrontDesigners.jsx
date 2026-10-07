import { useState } from 'react';
import { ArrowDown, ArrowUp, ImageIcon, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { t as translate, useT } from '../../i18n';
import { HEADER_TEXT_KEYS, LINK_KEYS, POPUP_TEXT_KEYS, PRODUCT_TEXT_KEYS } from './storefrontTextKeys';

/*
 * Website Control Center panels for the storefront header, the product page design and the
 * recent purchase popup. Everything is saved in the website draft and goes live with Publish.
 * Labels are saved per language in pageTexts[page][language][key]; an empty box keeps the default text.
 */

const LANGS = ['en', 'bn'];
const MAX_LOGO_BYTES = 300 * 1024;

const DEFAULT_TOP_LINKS = [
  { key: 'track_order', path: '/track-order', icon: 'truck', enabled: true },
  { key: 'store_locator', path: '/contact', icon: 'map-pin', enabled: true },
  { key: 'become_seller', path: '/supplier-login', icon: 'store', enabled: true },
  { key: 'offers', path: '/offers', icon: 'tag', enabled: true },
];

const DEFAULT_NAV_LINKS = [
  { key: 'home', path: '/', enabled: true },
  { key: 'brands', path: '/brands', enabled: true },
  { key: 'phones', path: '/category/smartphones', enabled: true },
  { key: 'accessories', path: '/category/accessories', enabled: true },
  { key: 'used_phones', path: '/used-products', enabled: true },
  { key: 'preorder', path: '/preorder', enabled: true },
  { key: 'offers', path: '/offers', enabled: true, accent: true },
  { key: 'blog', path: '/blog', enabled: true },
  { key: 'support', path: '/contact', enabled: true },
];

const LINK_ICONS = ['', 'truck', 'map-pin', 'store', 'tag', 'gift', 'phone', 'bag', 'help', 'info', 'bell'];

function Panel({ title, onClose, children }) {
  const t = useT();
  return <>
    <div className="nst-wcc-panel-head">
      <h2>{title}</h2>
      {onClose ? <div className="nst-wcc-panel-actions"><button type="button" className="nst-wcc-iconbtn" onClick={onClose} title={t('wcc_store.close')}><X size={16}/></button></div> : null}
    </div>
    <div className="nst-wcc-form">{children}</div>
  </>;
}

function Tabs({ items, value, onChange }) {
  return <div className="nst-wcc-tabs" role="tablist" style={{ gridTemplateColumns:`repeat(${items.length}, 1fr)` }}>
    {items.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={value === key} className={value === key ? 'is-active' : ''} onClick={() => onChange(key)}>{label}</button>)}
  </div>;
}

function Row({ label, hint, children }) {
  return <label className="nst-wcc-field"><span className="nst-wcc-field__label">{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

function Check({ label, checked, onChange }) {
  return <label className="nst-wcc-check"><input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)}/><span>{label}</span></label>;
}

/** Colour box; empty means "follow the site theme". */
function ColorRow({ label, value, fallback, onChange }) {
  const t = useT();
  const valid = /^#[0-9a-f]{6}$/i.test(String(value || ''));
  return <div className="nst-wcc-pair">
    <span>{label}</span>
    <span className="nst-wcc-colorrow">
      <input type="color" value={valid ? value : fallback} onChange={(event) => onChange(event.target.value)}/>
      <small>{valid ? value : t('wcc_store.theme_colour')}</small>
      {valid ? <button type="button" className="nst-wcc-iconbtn is-sm" onClick={() => onChange('')} title={t('wcc_store.use_theme')}><RotateCcw size={13}/></button> : null}
    </span>
  </div>;
}

function Choices({ value, options, onChange }) {
  return <div className="nst-wcc-choices">
    {options.map(([key, label, help]) => <button key={key} type="button" className={value === key ? 'is-active' : ''} onClick={() => onChange(key)}>
      <span className={`nst-wcc-choice-art is-${key}`} aria-hidden="true"><i/><i/><i/></span>
      <b>{label}</b>{help ? <small>{help}</small> : null}
    </button>)}
  </div>;
}

const readImage = (file, onDone) => {
  if (!file) return;
  if (file.size > MAX_LOGO_BYTES) { toast.error(translate('wcc_store.image_too_large')); return; }
  const reader = new FileReader();
  reader.onload = () => onDone(String(reader.result || ''));
  reader.readAsDataURL(file);
};

function ImageRow({ label, value, onChange }) {
  const t = useT();
  return <div className="nst-wcc-field">
    <span className="nst-wcc-field__label">{label}</span>
    <div className="nst-wcc-image">
      <div className="nst-wcc-image__preview">{value ? <img src={value} alt=""/> : <ImageIcon size={26}/>}</div>
      <div className="nst-wcc-image__actions">
        <label className="nst-wcc-btn"><ImageIcon size={15}/>{t('wcc_store.upload_image')}<input type="file" accept="image/svg+xml,image/png,image/webp,image/jpeg" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; readImage(file, onChange); }}/></label>
        <button type="button" className="nst-wcc-btn is-danger" disabled={!value} onClick={() => onChange('')}><Trash2 size={15}/>{t('wcc_store.remove_image')}</button>
      </div>
    </div>
    <input value={value && !String(value).startsWith('data:') ? value : ''} placeholder={value ? t('wcc_store.uploaded_in_use') : 'https://'} onChange={(event) => onChange(event.target.value.trim())}/>
  </div>;
}

/** Per-language label boxes for one storefront area. Placeholders show the default text. */
export function PageTextsEditor({ page, keys, draft, commit, note }) {
  const t = useT();
  const [lang, setLang] = useState('en');
  const texts = draft?.pageTexts?.[page] || {};
  const setText = (key, value) => {
    const current = draft?.pageTexts || {};
    const area = current[page] || {};
    commit({ ...draft, pageTexts:{ ...current, [page]:{ ...area, [lang]:{ ...(area[lang] || {}), [key]:value } } } });
  };
  return <div className="nst-wcc-group">
    <h3>{t('wcc_store.texts_title')}</h3>
    <p className="nst-wcc-note">{note || t('wcc_store.texts_note')}</p>
    <Tabs items={LANGS.map((code) => [code, t(`wcc_store.lang.${code}`)])} value={lang} onChange={setLang}/>
    {keys.map(([key, defaultKey]) => <Row key={`${lang}-${key}`} label={translate(defaultKey, undefined, 'en')}>
      <input value={texts[lang]?.[key] || ''} onChange={(event) => setText(key, event.target.value)} placeholder={translate(defaultKey, undefined, lang)}/>
    </Row>)}
  </div>;
}

/* ------------------------------------------------------------------ header */

function LinkList({ title, links, defaults, withIcon, withAccent, onChange }) {
  const t = useT();
  const update = (index, patch) => onChange(links.map((link, i) => i === index ? { ...link, ...patch } : link));
  const setLabel = (index, lang, value) => update(index, { label:{ ...(links[index].label || {}), [lang]:value } });
  const move = (index, step) => {
    const to = index + step;
    if (to < 0 || to >= links.length) return;
    const next = [...links]; const [row] = next.splice(index, 1); next.splice(to, 0, row); onChange(next);
  };
  const add = () => onChange([...links, { key:`custom-${Date.now().toString(36)}`, path:'/', enabled:true, label:{ en:t('wcc_store.new_link'), bn:'' } }]);
  return <div className="nst-wcc-group">
    <h3>{title}<span className="nst-wcc-inline-actions">
      <button type="button" className="nst-wcc-iconbtn is-sm" onClick={() => onChange(defaults)} title={t('wcc_store.reset_links')}><RotateCcw size={14}/></button>
      <button type="button" className="nst-wcc-iconbtn is-sm" onClick={add} title={t('wcc_store.add_link')}><Plus size={14}/></button>
    </span></h3>
    {links.map((link, index) => {
      const builtIn = LINK_KEYS.includes(link.key);
      const placeholder = (lang) => builtIn ? translate(`wcc_store.links.${link.key}`, undefined, lang) : '';
      return <div key={`${link.key}-${index}`} className={`nst-wcc-item ${link.enabled === false ? 'is-off' : ''}`}>
        <div className="nst-wcc-item__head">
          <input type="checkbox" checked={link.enabled !== false} onChange={(event) => update(index, { enabled:event.target.checked })} title={t('wcc_store.show_link')}/>
          <input value={link.label?.en || ''} onChange={(event) => setLabel(index, 'en', event.target.value)} placeholder={placeholder('en') || t('wcc_store.label_en')} aria-label={t('wcc_store.label_en')}/>
          <button type="button" className="nst-wcc-iconbtn is-sm" onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp size={13}/></button>
          <button type="button" className="nst-wcc-iconbtn is-sm" onClick={() => move(index, 1)} disabled={index === links.length - 1}><ArrowDown size={13}/></button>
          <button type="button" className="nst-wcc-iconbtn is-sm is-danger" onClick={() => onChange(links.filter((_, i) => i !== index))} title={t('wcc_store.remove_link')}><Trash2 size={13}/></button>
        </div>
        <input value={link.label?.bn || ''} onChange={(event) => setLabel(index, 'bn', event.target.value)} placeholder={placeholder('bn') || t('wcc_store.label_bn')} aria-label={t('wcc_store.label_bn')}/>
        <div className="nst-wcc-item__head">
          <input value={link.path || ''} onChange={(event) => update(index, { path:event.target.value.trim() })} placeholder="/offers" aria-label={t('wcc_store.link_path')}/>
          {withIcon ? <select value={link.icon || ''} onChange={(event) => update(index, { icon:event.target.value })} aria-label={t('wcc_store.link_icon')}>
            {LINK_ICONS.map((icon) => <option key={icon || 'none'} value={icon}>{t(`wcc_store.icons.${icon || 'none'}`)}</option>)}
          </select> : null}
          {withAccent ? <label className="nst-wcc-check is-compact"><input type="checkbox" checked={Boolean(link.accent)} onChange={(event) => update(index, { accent:event.target.checked })}/><span>{t('wcc_store.highlight')}</span></label> : null}
        </div>
      </div>;
    })}
  </div>;
}

export function HeaderDesigner({ draft, commit, onClose }) {
  const t = useT();
  const [tab, setTab] = useState('design');
  const design = draft.headerDesign || {};
  const topBar = design.topBar || {};
  const main = design.main || {};
  const nav = design.nav || {};
  const site = draft.site || {};
  const update = (patch) => commit({ ...draft, headerDesign:{ ...design, ...patch } });
  const updateTop = (patch) => update({ topBar:{ ...topBar, ...patch } });
  const updateMain = (patch) => update({ main:{ ...main, ...patch } });
  const updateNav = (patch) => update({ nav:{ ...nav, ...patch } });
  const updateSite = (patch) => commit({ ...draft, site:{ ...site, ...patch } });

  return <Panel title={t('wcc_store.header.title')} onClose={onClose}>
    <Tabs items={[['design', t('wcc_store.tabs.design')], ['menus', t('wcc_store.tabs.menus')], ['texts', t('wcc_store.tabs.texts')]]} value={tab} onChange={setTab}/>

    {tab === 'design' && <>
      <div className="nst-wcc-group">
        <h3>{t('wcc_store.header.layout')}</h3>
        <Choices value={design.layout || 'classic'} onChange={(layout) => update({ layout })} options={[
          ['classic', t('wcc_store.header.layout_classic'), t('wcc_store.header.layout_classic_help')],
          ['centered', t('wcc_store.header.layout_centered'), t('wcc_store.header.layout_centered_help')],
          ['compact', t('wcc_store.header.layout_compact'), t('wcc_store.header.layout_compact_help')],
        ]}/>
        <Check label={t('wcc_store.header.sticky')} checked={design.sticky !== false} onChange={(sticky) => update({ sticky })}/>
      </div>

      <div className="nst-wcc-group">
        <h3>{t('wcc_store.header.logo')}</h3>
        <ImageRow label={t('wcc_store.header.logo_image')} value={site.logoUrl || ''} onChange={(logoUrl) => updateSite({ logoUrl })}/>
        <ImageRow label={t('wcc_store.header.mobile_logo')} value={site.mobileLogoUrl || ''} onChange={(mobileLogoUrl) => updateSite({ mobileLogoUrl })}/>
        <Row label={t('wcc_store.header.logo_text')} hint={t('wcc_store.header.logo_text_help')}><input value={site.logoText || ''} onChange={(event) => updateSite({ logoText:event.target.value })}/></Row>
        <div className="nst-wcc-pair"><span>{t('wcc_store.header.logo_height')}</span><input type="number" min={24} max={96} value={design.logoHeight || 44} onChange={(event) => update({ logoHeight:Number(event.target.value) || 44 })}/></div>
        <div className="nst-wcc-pair"><span>{t('wcc_store.header.mobile_logo_height')}</span><input type="number" min={20} max={64} value={design.mobileLogoHeight || 32} onChange={(event) => update({ mobileLogoHeight:Number(event.target.value) || 32 })}/></div>
        <Check label={t('wcc_store.header.show_subtitle')} checked={design.showLogoSubtitle !== false} onChange={(showLogoSubtitle) => update({ showLogoSubtitle })}/>
      </div>

      <div className="nst-wcc-group">
        <h3>{t('wcc_store.header.top_bar')}</h3>
        <Check label={t('wcc_store.header.top_bar_show')} checked={topBar.enabled !== false} onChange={(enabled) => updateTop({ enabled })}/>
        <Row label={t('wcc_store.header.phone')} hint={t('wcc_store.header.phone_help')}><input value={topBar.phone || ''} onChange={(event) => updateTop({ phone:event.target.value })}/></Row>
        <Row label={t('wcc_store.header.email')}><input value={topBar.email || ''} onChange={(event) => updateTop({ email:event.target.value.trim() })}/></Row>
        <Check label={t('wcc_store.header.show_phone')} checked={topBar.showPhone !== false} onChange={(showPhone) => updateTop({ showPhone })}/>
        <Check label={t('wcc_store.header.show_email')} checked={topBar.showEmail !== false} onChange={(showEmail) => updateTop({ showEmail })}/>
        <Check label={t('wcc_store.header.show_language')} checked={topBar.showLanguage !== false} onChange={(showLanguage) => updateTop({ showLanguage })}/>
        <Check label={t('wcc_store.header.show_currency')} checked={topBar.showCurrency !== false} onChange={(showCurrency) => updateTop({ showCurrency })}/>
        <ColorRow label={t('wcc_store.colors.background')} value={topBar.background} fallback="#14171f" onChange={(background) => updateTop({ background })}/>
        <ColorRow label={t('wcc_store.colors.text')} value={topBar.text} fallback="#e2e8f0" onChange={(text) => updateTop({ text })}/>
      </div>

      <div className="nst-wcc-group">
        <h3>{t('wcc_store.header.main_bar')}</h3>
        <Check label={t('wcc_store.header.search')} checked={main.searchEnabled !== false} onChange={(searchEnabled) => updateMain({ searchEnabled })}/>
        <Check label={t('wcc_store.header.category_select')} checked={main.showCategorySelect !== false} onChange={(showCategorySelect) => updateMain({ showCategorySelect })}/>
        <Check label={t('wcc_store.header.show_compare')} checked={main.showCompare !== false} onChange={(showCompare) => updateMain({ showCompare })}/>
        <Check label={t('wcc_store.header.show_wishlist')} checked={main.showWishlist !== false} onChange={(showWishlist) => updateMain({ showWishlist })}/>
        <Check label={t('wcc_store.header.show_cart')} checked={main.showCart !== false} onChange={(showCart) => updateMain({ showCart })}/>
        <Check label={t('wcc_store.header.show_account')} checked={main.showAccount !== false} onChange={(showAccount) => updateMain({ showAccount })}/>
        <ColorRow label={t('wcc_store.colors.background')} value={main.background} fallback="#ffffff" onChange={(background) => updateMain({ background })}/>
        <ColorRow label={t('wcc_store.colors.text')} value={main.text} fallback="#475569" onChange={(text) => updateMain({ text })}/>
      </div>

      <div className="nst-wcc-group">
        <h3>{t('wcc_store.header.menu_bar')}</h3>
        <Check label={t('wcc_store.header.menu_show')} checked={nav.enabled !== false} onChange={(enabled) => updateNav({ enabled })}/>
        <Check label={t('wcc_store.header.all_categories')} checked={nav.showAllCategories !== false} onChange={(showAllCategories) => updateNav({ showAllCategories })}/>
        <ColorRow label={t('wcc_store.colors.background')} value={nav.background} fallback="#ffffff" onChange={(background) => updateNav({ background })}/>
        <ColorRow label={t('wcc_store.colors.text')} value={nav.text} fallback="#334155" onChange={(text) => updateNav({ text })}/>
        <ColorRow label={t('wcc_store.colors.active')} value={nav.active} fallback="#15803d" onChange={(active) => updateNav({ active })}/>
        <ColorRow label={t('wcc_store.colors.button')} value={nav.buttonBackground} fallback="#166534" onChange={(buttonBackground) => updateNav({ buttonBackground })}/>
        <ColorRow label={t('wcc_store.colors.button_text')} value={nav.buttonText} fallback="#ffffff" onChange={(buttonText) => updateNav({ buttonText })}/>
      </div>
      <button type="button" className="nst-wcc-btn is-block" onClick={() => { if (window.confirm(t('wcc_store.header.reset_confirm'))) commit({ ...draft, headerDesign:{} }); }}><RotateCcw size={15}/>{t('wcc_store.header.reset')}</button>
    </>}

    {tab === 'menus' && <>
      <LinkList title={t('wcc_store.header.top_links')} links={Array.isArray(topBar.links) ? topBar.links : DEFAULT_TOP_LINKS} defaults={DEFAULT_TOP_LINKS} withIcon onChange={(links) => updateTop({ links })}/>
      <LinkList title={t('wcc_store.header.menu_links')} links={Array.isArray(nav.links) ? nav.links : DEFAULT_NAV_LINKS} defaults={DEFAULT_NAV_LINKS} withAccent onChange={(links) => updateNav({ links })}/>
      <p className="nst-wcc-note">{t('wcc_store.header.menu_note')}</p>
    </>}

    {tab === 'texts' && <PageTextsEditor page="header" keys={HEADER_TEXT_KEYS} draft={draft} commit={commit}/>}
  </Panel>;
}

/* ------------------------------------------------------------ product page */

export function ProductPageDesigner({ draft, commit, onClose }) {
  const t = useT();
  const [tab, setTab] = useState('design');
  const productPage = draft.productPage || {};
  const design = productPage.design || {};
  const update = (patch) => commit({ ...draft, productPage:{ ...productPage, design:{ ...design, ...patch } } });

  return <Panel title={t('wcc_store.product.title')} onClose={onClose}>
    <Tabs items={[['design', t('wcc_store.tabs.design')], ['texts', t('wcc_store.tabs.texts')]]} value={tab} onChange={setTab}/>
    {tab === 'design' && <>
      <div className="nst-wcc-group">
        <h3>{t('wcc_store.product.options')}</h3>
        <Choices value={design.optionStyle === 'boxes' ? 'boxes' : 'compact'} onChange={(optionStyle) => update({ optionStyle })} options={[
          ['compact', t('wcc_store.product.options_compact'), t('wcc_store.product.options_compact_help')],
          ['boxes', t('wcc_store.product.options_boxes'), t('wcc_store.product.options_boxes_help')],
        ]}/>
      </div>
      <div className="nst-wcc-group">
        <h3>{t('wcc_store.product.gallery')}</h3>
        <Choices value={design.galleryPosition === 'right' ? 'right' : 'left'} onChange={(galleryPosition) => update({ galleryPosition })} options={[
          ['left', t('wcc_store.product.gallery_left')],
          ['right', t('wcc_store.product.gallery_right')],
        ]}/>
      </div>
      <div className="nst-wcc-group">
        <h3>{t('wcc_store.product.parts')}</h3>
        <Check label={t('wcc_store.product.sticky_bar')} checked={design.mobileStickyBar !== false} onChange={(mobileStickyBar) => update({ mobileStickyBar })}/>
        <Check label={t('wcc_store.product.emi')} checked={design.showEmi !== false} onChange={(showEmi) => update({ showEmi })}/>
        <Check label={t('wcc_store.product.whatsapp')} checked={design.showWhatsapp !== false} onChange={(showWhatsapp) => update({ showWhatsapp })}/>
        <Check label={t('wcc_store.product.trust_row')} checked={design.showTrustRow !== false} onChange={(showTrustRow) => update({ showTrustRow })}/>
        <Check label={t('wcc_store.product.share')} checked={design.showShare !== false} onChange={(showShare) => update({ showShare })}/>
      </div>
      <p className="nst-wcc-note">{t('wcc_store.product.branch_note')}</p>
    </>}
    {tab === 'texts' && <PageTextsEditor page="product-details" keys={PRODUCT_TEXT_KEYS} draft={draft} commit={commit}/>}
  </Panel>;
}

/* ------------------------------------------------------- purchase popup */

export function PurchasePopupSettings({ draft, commit, onClose }) {
  const t = useT();
  const [tab, setTab] = useState('settings');
  const popup = draft.popup || {};
  const items = Array.isArray(popup.items) ? popup.items : [];
  const update = (patch) => commit({ ...draft, popup:{ ...popup, ...patch } });
  const updateItem = (index, patch) => update({ items:items.map((item, i) => i === index ? { ...item, ...patch } : item) });
  const seconds = (ms, fallback) => Math.round((Number(ms) || fallback) / 1000);

  return <Panel title={t('wcc_store.popup.title')} onClose={onClose}>
    <Tabs items={[['settings', t('wcc_store.tabs.settings')], ['texts', t('wcc_store.tabs.texts')]]} value={tab} onChange={setTab}/>
    {tab === 'settings' && <>
      <div className="nst-wcc-group">
        <Check label={t('wcc_store.popup.enabled')} checked={popup.enabled !== false} onChange={(enabled) => update({ enabled })}/>
        <Choices value={popup.source === 'manual' ? 'manual' : 'sales'} onChange={(source) => update({ source })} options={[
          ['sales', t('wcc_store.popup.source_sales'), t('wcc_store.popup.source_sales_help')],
          ['manual', t('wcc_store.popup.source_manual'), t('wcc_store.popup.source_manual_help')],
        ]}/>
        {popup.source !== 'manual' ? <>
          <div className="nst-wcc-pair"><span>{t('wcc_store.popup.days')}</span><input type="number" min={1} max={365} value={popup.days || 30} onChange={(event) => update({ days:Number(event.target.value) || 30 })}/></div>
          <div className="nst-wcc-pair"><span>{t('wcc_store.popup.limit')}</span><input type="number" min={1} max={30} value={popup.limit || 12} onChange={(event) => update({ limit:Number(event.target.value) || 12 })}/></div>
          <Check label={t('wcc_store.popup.show_time')} checked={popup.showTime !== false} onChange={(showTime) => update({ showTime })}/>
          <p className="nst-wcc-note">{t('wcc_store.popup.privacy_note')}</p>
        </> : null}
        <div className="nst-wcc-pair"><span>{t('wcc_store.popup.every')}</span><input type="number" min={4} max={120} value={seconds(popup.intervalMs, 11500)} onChange={(event) => update({ intervalMs:Math.max(4, Number(event.target.value) || 12) * 1000 })}/></div>
        <div className="nst-wcc-pair"><span>{t('wcc_store.popup.visible')}</span><input type="number" min={2} max={60} value={seconds(popup.visibleMs, 4500)} onChange={(event) => update({ visibleMs:Math.max(2, Number(event.target.value) || 5) * 1000 })}/></div>
        <div className="nst-wcc-pair"><span>{t('wcc_store.popup.position')}</span><select value={popup.position === 'right' ? 'right' : 'left'} onChange={(event) => update({ position:event.target.value })}><option value="left">{t('wcc_store.popup.left')}</option><option value="right">{t('wcc_store.popup.right')}</option></select></div>
        <Check label={t('wcc_store.popup.mobile')} checked={popup.showOnMobile !== false} onChange={(showOnMobile) => update({ showOnMobile })}/>
      </div>
      {popup.source === 'manual' ? <div className="nst-wcc-group">
        <h3>{t('wcc_store.popup.items')}<span className="nst-wcc-inline-actions"><button type="button" className="nst-wcc-iconbtn is-sm" onClick={() => update({ items:[...items, { name:'', district:'', item:'', action:'' }] })} title={t('wcc_store.popup.add_item')}><Plus size={14}/></button></span></h3>
        {items.map((item, index) => <div key={index} className="nst-wcc-item">
          <div className="nst-wcc-item__head">
            <input value={item.name || ''} onChange={(event) => updateItem(index, { name:event.target.value })} placeholder={t('wcc_store.popup.item_name')}/>
            <input value={item.district || ''} onChange={(event) => updateItem(index, { district:event.target.value })} placeholder={t('wcc_store.popup.item_city')}/>
            <button type="button" className="nst-wcc-iconbtn is-sm is-danger" onClick={() => update({ items:items.filter((_, i) => i !== index) })}><Trash2 size={13}/></button>
          </div>
          <input value={item.item || ''} onChange={(event) => updateItem(index, { item:event.target.value })} placeholder={t('wcc_store.popup.item_product')}/>
          <input value={item.action || ''} onChange={(event) => updateItem(index, { action:event.target.value })} placeholder={t('wcc_store.popup.item_action')}/>
        </div>)}
        {!items.length ? <p className="nst-wcc-note">{t('wcc_store.popup.no_items')}</p> : null}
      </div> : null}
    </>}
    {tab === 'texts' && <PageTextsEditor page="popup" keys={POPUP_TEXT_KEYS} draft={draft} commit={commit}/>}
  </Panel>;
}
