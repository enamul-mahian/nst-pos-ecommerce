import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Copy, Download, Eye, GripVertical,
  History, ImageIcon, Link2, Monitor, Palette, Plus, Redo2, RotateCcw, Save,
  Search, Send, Settings2, Smartphone, Sparkles, Tablet, Trash2, Undo2, Upload, X,
  ArrowLeft, EyeOff, LayoutGrid, Megaphone, MoreHorizontal, Tags, Flame, ShieldCheck, PackageCheck, Image as ImgIcon, Type, Code,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import './wcc-editor.css';
import toast from 'react-hot-toast';
import {
  fetchWebsiteBuilderDraft,
  fetchWebsiteBuilderRevisions,
  publishWebsiteBuilderDraft,
  rollbackWebsiteBuilderRevision,
  saveWebsiteBuilderDraft, deleteWebsiteBuilderRevision } from '../../services/websiteBuilderService';
import { productService } from '../../services/productService';
import api from '../../services/api';
import { useT } from '../../i18n';
import BrandPageEditor from './BrandPageEditor';
import { HeaderDesigner, ProductPageDesigner, PurchasePopupSettings } from './StorefrontDesigners';
import { AddPageDialog, PagePicker, PageSettingsPanel, TextBlockFields } from './SitePageManager';
import { CustomCodeContentFields, CustomCodeDesignFields, SiteCodeFields, defaultSectionCode } from './CustomCodeFields';
import { CUSTOM_PAGE_PREFIX, PAGE_DEFINITIONS, SECTION_PAGE_IDS, isCustomPage, pageIdForPath, pageSupportsSections } from './sitePages';

const ADVANCED_BLOCKS = [
  'Header','Top Bar','Navigation Menu','Mega Menu','Hero Banner','Image Slider','Carousel','Video Banner','Announcement Bar','Search Bar','Breadcrumb',
  'Category Grid','Category Slider','Product Grid','Product Slider','Featured Products','New Arrivals','Best Sellers','Flash Sale','Deal Countdown','Brand Showcase','Brand Slider',
  'Collection Grid','Product Tabs','Product Comparison','Wishlist','Recently Viewed','Quick View','Product Recommendation','Product Bundle','Product Reviews','Testimonials',
  'Customer Stories','Statistics Counter','Icon Box','Features Grid','Services','Pricing Table','Team Members','Timeline','Portfolio','Gallery','Masonry Gallery','Before/After',
  'FAQ','Accordion','Tabs','Toggle','Progress Bar','Circular Progress','Call to Action','Contact Form','Contact Info','Google Map','Store Locator','Branch Locations',
  'Business Hours','Live Chat','WhatsApp Button','Social Icons','Blog Posts','Featured Article','News Ticker','Events','Calendar','Download Center','APK Center','File Downloads',
  'Coupon Banner','Promo Banner','Popup','Modal','Offcanvas Panel','Sidebar','Sticky Section','Floating Action Button','Divider','Spacer','Heading','Text Block','Rich Text',
  'Button','Dual Button','Image','Image with Text','Video','Audio','Lottie Animation','SVG Icon','Shape Divider','Code Block','HTML Embed','Custom CSS','Countdown Timer',
  'Table','Data Table','Comparison Table','Login Form','Registration Form','User Dashboard','Order History','Cart','Checkout','Order Tracking','Invoice','Payment Methods',
  'EMI Calculator','QR Code','Barcode','IMEI Checker','App Download','App Screenshots','Trust Badges','Certifications','Partners','Clients','Awards','Footer','Copyright',
  'Back to Top','Cookie Notice','Maintenance Notice','Blank Section','Container','Row','Column','Nested Grid','Repeater','Dynamic List','Template Block','Global Section','Reusable Block',
];

const HOME_SECTION_PRESETS = [
  { type: 'Image Slider', label: 'Hero Banner', help: 'Main offer, image and shopping buttons', source: 'manual' },
  { type: 'Deals of The Day', label: 'Deals of The Day', help: 'Current special offers and discounted products', source: 'products' },
  { type: 'Used Products', label: 'Used Products', help: 'Verified used and pre-owned devices', source: 'used-products' },
  { type: 'Things You Must Have', label: 'Things You Must Have', help: 'Popular customer categories', source: 'categories' },
  { type: 'New Products', label: 'New Products', help: 'Latest new products', source: 'products' },
  { type: 'Pre Order Now', label: 'Pre Order Now', help: 'Products available for advance booking', source: 'products' },
  { type: 'Gadget Items', label: 'Gadget Items', help: 'Accessories and useful gadgets', source: 'categories' },
  { type: 'Trending Products', label: 'Trending Products', help: 'Popular products customers are viewing', source: 'products' },
  { type: 'Top Brand Products', label: 'Top Brand Products', help: 'Products grouped by top brands', source: 'products' },
  { type: 'Brand Showcase', label: 'Our Brands', help: 'Clickable brand collection', source: 'brands' },
  { type: 'Features Grid', label: 'Services & Trust', help: 'Warranty, delivery and support promises', source: 'manual' },
  { type: 'Blog Posts', label: 'Blog Posts', help: 'Latest guides and news', source: 'blogs' },
];

const GOOGLE_FONTS = ['Inter','Roboto','Open Sans','Poppins','Montserrat','Lato','Nunito','Manrope','DM Sans','Hind Siliguri','Noto Sans Bengali'];
/** Pages whose sections the storefront renders (home layout, or above/below the page content). */
const SECTION_PAGES = SECTION_PAGE_IDS;
const isSectionPage = (id) => SECTION_PAGES.includes(id);

const defaultTheme = {
  name: 'NST Purple', primary: '#6d28d9', secondary: '#4c1d95', accent: '#f59e0b', background: '#f7f6fb', surface: '#ffffff', text: '#101828', muted: '#667085', mutedText: '#667085', border: '#e4e0ef', fontFamily:'Inter',
  dashboardPrimary:'#8d39e4', dashboardSecondary:'#111827', dashboardAccent:'#16a34a', dashboardBackground:'#f1f5f9', dashboardSidebar:'#ffffff', dashboardTopbar:'#ffffff', dashboardCard:'#ffffff', dashboardText:'#0f172a',
};

/** One-click colour themes for the storefront (Colors and font dialog). */
const THEME_PRESETS = [
  { name:'NST Purple', primary:'#6d28d9', secondary:'#4c1d95', accent:'#f59e0b' },
  { name:'Ocean Blue', primary:'#1d4ed8', secondary:'#1e3a8a', accent:'#f59e0b' },
  { name:'Emerald', primary:'#047857', secondary:'#064e3b', accent:'#f59e0b' },
  { name:'Daraz Orange', primary:'#ea580c', secondary:'#9a3412', accent:'#0ea5e9' },
  { name:'Crimson', primary:'#be123c', secondary:'#881337', accent:'#f59e0b' },
  { name:'Midnight', primary:'#0f172a', secondary:'#020617', accent:'#22c55e' },
];

/** What the colour pickers show while a footer colour is empty (= follows theme). */
const FOOTER_SWATCH = { backgroundColor:'#150b2e', surfaceColor:'#2e1065', headingColor:'#ffffff', textColor:'#c9c3dc', accentColor:'#a78bfa', borderColor:'#3b2a63' };

const FOOTER_TEMPLATE_HTML = `<div class="ft">
  <div class="ft-top">
    <div><h3>New Singapur Telecom</h3><p>Genuine phones, gadgets and accessories with official warranty.</p></div>
    <div><h4>Shop</h4><a href="/products">All Products</a><a href="/used-products">Used Phones</a><a href="/preorder">Pre-Order</a></div>
    <div><h4>Help</h4><a href="/contact">Contact</a><a href="/emi-calculator">EMI Plans</a><a href="/orders/track">Track Order</a></div>
    <div><h4>Contact</h4><p>+880 1XXX-XXXXXX<br/>support@nst.com.bd</p></div>
  </div>
  <div class="ft-bottom">© New Singapur Telecom. All rights reserved.</div>
</div>`;

const FOOTER_TEMPLATE_CSS = `.ft{background:var(--nst-ink);color:#d4d0e0;padding:48px 16px 20px}
.ft-top{max-width:1280px;margin:auto;display:grid;gap:28px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.ft h3{color:#fff;font-size:20px;font-weight:800;margin-bottom:8px}
.ft h4{color:#fff;font-weight:700;margin-bottom:10px}
.ft a{display:block;padding:4px 0;color:inherit}
.ft a:hover{color:var(--nst-primary-light)}
.ft-bottom{max-width:1280px;margin:32px auto 0;padding-top:16px;border-top:1px solid rgba(255,255,255,.12);font-size:13px}`;

const defaultSite = {
  name:'New Singapur Telecom', shortName:'NST', tagline:'Premium mobile, gadget and telecom shopping experience', logoText:'NST', logoUrl:'', mobileLogoUrl:'', primaryColor:'#6d28d9', contactPhone:'', whatsappPhone:'',
};

const defaultFooter = {
  enabled:true,
  layout:'classic',
  backgroundStyle:'solid',
  // Empty colours follow the site theme on the storefront.
  backgroundColor:'',
  surfaceColor:'',
  textColor:'',
  headingColor:'',
  accentColor:'',
  borderColor:'',
  customHtml:'',
  customCss:'',
  maxWidth:'normal',
  logoUrl:'',
  logoText:'NST',
  brandName:'New Singapur Telecom',
  tagline:'Premium mobile, gadget and telecom shopping experience',
  description:'Trusted mobile phones, gadgets, accessories, EMI, preorder and after-sales support in one premium shopping experience.',
  columns:[
    { title:'Explore', enabled:true, order:1, links:[
      { label:'Products', path:'/products', enabled:true, order:1 },
      { label:'Brands', path:'/brands', enabled:true, order:2 },
      { label:'Offers', path:'/offers', enabled:true, order:3 },
      { label:'Blog', path:'/blog', enabled:true, order:4 },
    ] },
    { title:'Customer Care', enabled:true, order:2, links:[
      { label:'Contact Us', path:'/contact', enabled:true, order:1 },
      { label:'EMI Calculator', path:'/emi-calculator', enabled:true, order:2 },
      { label:'IMEI Check', path:'/imei-check', enabled:true, order:3 },
      { label:'Customer Login', path:'/login', enabled:true, order:4 },
    ] },
  ],
  contactTitle:'Contact Us', address:'', email:'', phone:'', whatsapp:'', businessHours:'10:00 AM - 10:00 PM (Everyday)',
  facebook:'', youtube:'', instagram:'', tiktok:'',
  showContact:true, showSocial:true, showPayments:true, showAppButtons:true, showBackToTop:true,
  playStoreLabel:'Google Play', playStoreUrl:'', appStoreLabel:'App Store', appStoreUrl:'',
  copyright:'', bottomText:'Secure shopping • Authentic products • Customer-first support',
  showTrustBadge:true, trustBadgeText:'Trusted & verified merchant',
  newsletter:{ enabled:false, title:'Stay Updated', text:'Get product news, offers and preorder updates.', placeholder:'Email address', buttonLabel:'Subscribe' },
  badges:['Cash on Delivery','bKash','Nagad','Nationwide Delivery'],
};

const sectionPreset = (type, overrides = {}) => {
  const preset = HOME_SECTION_PRESETS.find((item) => item.type === type);
  const id = `${String(type).toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  return {
    id, type, name:preset?.label || type, visible:true, locked:false,
    layout:type === 'Image Slider' ? 'hero-split' : 'carousel', columns:4, gap:16, padding:24,
    animation:{ entrance:'fade-up', hover:'lift', exit:'fade', duration:500, delay:0, easing:'easeOut', intensity:1 },
    responsive:{ desktop:true, tablet:true, mobile:true },
    data:{ source:preset?.source || 'manual', limit:8, sort:'latest', filter:'' },
    schedule:{ enabled:false, start_at:'', end_at:'' },
    content:{ eyebrow:'', title:preset?.label || type, description:'', viewAllLabel:'View All', viewAllLink:'/products' },
    slides:type === 'Image Slider' ? [{ id:`hero-${Date.now()}`, title:'Premium devices. Better choices.', subtitle:'New, used and pre-owned devices with trusted support.', image:'', mobileImage:'', buttonLabel:'Shop Now', buttonLink:'/products', secondaryButtonLabel:'Used Deals', secondaryButtonLink:'/used-products', effect:'zoom-fade' }] : [],
    span:{ desktop:12, tablet:12, mobile:12 },
    minHeight:{ desktop:type === 'Image Slider' ? 360 : 240, tablet:type === 'Image Slider' ? 320 : 220, mobile:type === 'Image Slider' ? 260 : 180 },
    style:{ background:'#ffffff', text:'#101828', radius:20, shadow:'soft' },
    customHtml:'', customCss:'', customCode:'',
    ...overrides,
  };
};

const createPage = ([id,name,slug]) => {
  const blockOverrides = { name:`${name} Layout` };
  if (id === 'footer') blockOverrides.id = 'global-footer';
  if (id === 'header') blockOverrides.id = 'global-header';
  return {
    id, name, slug, link:slug, seo:{ title:name, description:'', canonical:'' },
    blocks:isSectionPage(id) ? [] : [sectionPreset(id === 'header' ? 'Header' : id === 'footer' ? 'Footer' : 'Blank Section', blockOverrides)],
  };
};

const defaultPage = {
  id:'home', name:'Home', slug:'/', link:'/',
  blocks:HOME_SECTION_PRESETS.map((item,index) => sectionPreset(item.type, {
    id:`home-section-${String(index + 1).padStart(2,'0')}`,
    name:item.label,
    content:{ eyebrow:'', title:item.label, description:'', viewAllLabel:'View All', viewAllLink:item.type === 'Used Products' ? '/used-products' : item.type === 'Pre Order Now' ? '/preorder' : item.type === 'Brand Showcase' ? '/brands' : item.type === 'Blog Posts' ? '/blog' : '/products' },
  })),
};

const normalizedType = (section) => {
  const raw = `${section?.type || ''} ${section?.name || ''}`.toLowerCase().replace(/[^a-z0-9]+/g,'_');
  if (raw.includes('image_slider') || raw.includes('hero')) return 'image_slider';
  if (raw.includes('used_product') || raw.includes('used_deal')) return 'used_products';
  if (raw.includes('deal')) return 'deals';
  if (raw.includes('category') || raw.includes('must_have')) return 'category_slider';
  if (raw.includes('new_product') || raw.includes('new_arrival')) return 'new_arrivals';
  if (raw.includes('pre_order') || raw.includes('preorder')) return 'preorder_products';
  if (raw.includes('gadget')) return 'gadget_items';
  if (raw.includes('trending')) return 'trending_products';
  if (raw.includes('top_brand')) return 'top_brand_products';
  if (raw.includes('brand')) return 'brand_showcase';
  if (raw.includes('feature') || raw.includes('trust') || raw.includes('service')) return 'features_grid';
  if (raw.includes('blog')) return 'blog_posts';
  return raw;
};

const normalizeHomeBlocks = (blocks = [], keepOrder = false) => {
  const rows = blocks.map((section,index) => ({
    ...section,
    id:section.id || `home-section-${String(index + 1).padStart(2,'0')}`,
    visible:section.visible !== false && section.enabled !== false,
    responsive:{ desktop:true, tablet:true, mobile:true, ...(section.responsive || {}) },
    data:{ source:'manual', limit:8, ...(section.data || {}), ...(section.settings?.source ? { source:section.settings.source } : {}), ...(section.settings?.limit ? { limit:section.settings.limit } : {}) },
    content:{ eyebrow:'', title:section.name || section.type || `Section ${index + 1}`, description:'', viewAllLabel:'View All', viewAllLink:'/products', ...(section.content || {}), ...(section.settings?.content || {}) },
    span:{ desktop:12, tablet:12, mobile:12, ...(section.span || section.settings?.span || {}) },
    minHeight:{ desktop:220, tablet:200, mobile:170, ...(section.minHeight || section.settings?.minHeight || {}) },
    style:{ background:'#ffffff', text:'#101828', radius:20, ...(section.style || {}) },
  }));

  if (keepOrder) return rows;
  const usedIndex = rows.findIndex((item) => normalizedType(item) === 'used_products');
  const thingsIndex = rows.findIndex((item) => normalizedType(item) === 'category_slider');
  if (usedIndex >= 0 && thingsIndex >= 0 && usedIndex !== thingsIndex - 1) {
    const [used] = rows.splice(usedIndex,1);
    const nextThings = rows.findIndex((item) => normalizedType(item) === 'category_slider');
    rows.splice(Math.max(0,nextThings),0,used);
  }
  const blogIndex = rows.findIndex((item) => normalizedType(item) === 'blog_posts');
  if (blogIndex >= 0 && blogIndex !== rows.length - 1) rows.push(rows.splice(blogIndex,1)[0]);
  return rows;
};

const normalizeDraft = (payload) => {
  // The draft API returns { draft, published, revisions }. Those envelope keys must never be saved
  // inside the website content: the storefront would read the stale nested "published" copy.
  const { draft:_draft, published:_published, revisions:_revisions, published_at:_publishedAt, ...content } = payload?.content || payload || {};
  const existingPages = Array.isArray(content.pages) && content.pages.length ? content.pages : [defaultPage];
  const ids = new Set(existingPages.map((page) => page.id));
  const pages = [...existingPages, ...PAGE_DEFINITIONS.filter((definition) => !ids.has(definition[0])).map(createPage)]
    .map((page) => {
      const blocks = Array.isArray(page.blocks) ? page.blocks : Array.isArray(page.sections) ? page.sections : [];
      if (page.id === 'home') return { ...page, blocks:normalizeHomeBlocks(blocks, Number(page.layoutVersion || 0) >= 2) };
      // Pages created before sections were supported carry an empty "<Page> Layout" placeholder.
      if (isSectionPage(page.id)) return { ...page, blocks:blocks.filter((section) => !(section?.type === 'Blank Section' && String(section?.name || '').endsWith(' Layout'))) };
      return { ...page, blocks };
    });
  return {
    ...content,
    version:5,
    site:{ ...defaultSite, ...(content.site || {}) },
    footer:{ ...defaultFooter, ...(content.footer || {}), newsletter:{ ...defaultFooter.newsletter, ...(content.footer?.newsletter || {}) }, columns:Array.isArray(content.footer?.columns) ? content.footer.columns : defaultFooter.columns, badges:Array.isArray(content.footer?.badges) ? content.footer.badges : defaultFooter.badges },
    theme:{ ...defaultTheme, ...(content.theme || {}) },
    pages,
    permissions:content.permissions || { customCode:['super_admin'], publish:['super_admin'], themeImportExport:['super_admin'] },
    settings:{ compareLimit:3, automaticResponsive:true, iosSafeArea:true, androidFriendly:true, ...(content.settings || {}) },
    library:{ globalSections:[], reusableBlocks:[], ...(content.library || {}) },
  };
};

function Field({ label, help = '', children }) {
  return <label className="grid gap-2 text-sm font-bold text-slate-700"><span>{label}</span>{children}{help ? <small className="font-medium text-slate-500">{help}</small> : null}</label>;
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100';
const smallButton = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-black hover:border-emerald-400 hover:bg-emerald-50';

const customerBaseUrl = () => {
  const configured = String(import.meta.env.VITE_CUSTOMER_URL || '').trim().replace(/\/$/,'');
  if (configured) return configured;
  if (['127.0.0.1','localhost'].includes(window.location.hostname)) return `${window.location.protocol}//${window.location.hostname}:5174`;
  return window.location.origin;
};

function LiveStorefrontFrame({ frameRef, draft, page, device, onReady, selectedId = '', previewPath = '', title = 'Live customer frontend preview' }) {
  const path = previewPath || (page?.id === 'footer' || page?.id === 'header' ? '/' : String(page?.link || page?.slug || '/').replace(/:[^/]+/g,'preview'));
  const separator = path.includes('?') ? '&' : '?';
  const src = `${customerBaseUrl()}${path}${separator}nst-editor-preview=1`;
  const frameWidth = device === 'desktop' ? '100%' : device === 'tablet' ? '768px' : '390px';

  const pushDraft = () => {
    frameRef.current?.contentWindow?.postMessage({ type:'NST_WEBSITE_EDITOR_PREVIEW', content:draft, pageId:page?.id, path, selectedSectionId:selectedId }, '*');
  };

  useEffect(() => {
    const timer = window.setTimeout(pushDraft, 70);
    return () => window.clearTimeout(timer);
  }, [draft, page?.id, path, selectedId]);

  return <div className="nst-wcc-canvas-scroll">
    <iframe
      ref={frameRef}
      src={src}
      title={title}
      onLoad={() => { pushDraft(); onReady?.(); }}
      style={{ width:frameWidth, minHeight:'1240px' }}
      className="nst-wcc-frame"
    />
  </div>;
}

function FooterDesigner({ draft, commit }) {
  const footer = draft.footer || defaultFooter;
  const updateFooter = (patch) => commit({ ...draft, footer:{ ...footer, ...patch } });
  const updateNewsletter = (patch) => updateFooter({ newsletter:{ ...(footer.newsletter || defaultFooter.newsletter), ...patch } });
  const updateColumn = (index, patch) => updateFooter({ columns:footer.columns.map((column,columnIndex) => columnIndex === index ? { ...column, ...patch } : column) });
  const removeColumn = (index) => updateFooter({ columns:footer.columns.filter((_,columnIndex) => columnIndex !== index).map((column,order) => ({ ...column, order:order + 1 })) });
  const addColumn = () => updateFooter({ columns:[...footer.columns,{ title:`Column ${footer.columns.length + 1}`, enabled:true, order:footer.columns.length + 1, links:[] }] });
  const moveColumn = (index,direction) => {
    const to = index + direction;
    if (to < 0 || to >= footer.columns.length) return;
    const columns = [...footer.columns];
    const [column] = columns.splice(index,1);
    columns.splice(to,0,column);
    updateFooter({ columns:columns.map((item,order) => ({ ...item, order:order + 1 })) });
  };
  const addLink = (columnIndex) => updateColumn(columnIndex,{ links:[...(footer.columns[columnIndex].links || []),{ label:'New Link', path:'/', enabled:true, order:(footer.columns[columnIndex].links || []).length + 1 }] });
  const updateLink = (columnIndex,linkIndex,patch) => updateColumn(columnIndex,{ links:footer.columns[columnIndex].links.map((link,index) => index === linkIndex ? { ...link, ...patch } : link) });
  const removeLink = (columnIndex,linkIndex) => updateColumn(columnIndex,{ links:footer.columns[columnIndex].links.filter((_,index) => index !== linkIndex).map((link,order) => ({ ...link, order:order + 1 })) });

  return <div className="space-y-5">
    <div className="rounded-2xl bg-emerald-50 p-4"><div className="text-xs font-black uppercase tracking-widest text-emerald-700">Global Footer Designer</div><h2 className="mt-1 text-xl font-black text-emerald-950">Design the footer your way</h2><p className="mt-2 text-sm font-medium text-emerald-800">Every change appears instantly in the real customer frontend preview. Save Draft keeps it private; Publish sends it live.</p></div>

    <div className="grid grid-cols-2 gap-2">
      {[
        ['classic','Classic columns'],['compact','Compact grid'],['centered','Centered'],['minimal','Minimal'],['light','Light modern'],['custom','Custom design (HTML/CSS)'],
      ].map(([value,label]) => <button type="button" key={value} onClick={() => updateFooter({ layout:value })} className={`rounded-xl border p-3 text-left text-xs font-black ${footer.layout === value ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white'}`}><LayoutIcon value={value}/>{label}</button>)}
    </div>

    {footer.layout === 'custom' && <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50 p-4">
      <div><h3 className="font-black">Your own footer design</h3><p className="mt-1 text-xs font-medium text-slate-600">Paste the HTML and CSS of a new footer design. It replaces the built-in footer on every storefront page. Scripts and onclick-style code are removed for safety. Use var(--nst-primary) in CSS to follow the site theme colour.</p></div>
      <Field label="Footer HTML"><textarea className={`${inputClass} min-h-48 font-mono text-xs`} value={footer.customHtml || ''} onChange={(event) => updateFooter({ customHtml:event.target.value })} placeholder="<div class=&quot;my-footer&quot;>...</div>"/></Field>
      <Field label="Footer CSS"><textarea className={`${inputClass} min-h-36 font-mono text-xs`} value={footer.customCss || ''} onChange={(event) => updateFooter({ customCss:event.target.value })} placeholder=".my-footer { ... }"/></Field>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => updateFooter({ customHtml:FOOTER_TEMPLATE_HTML, customCss:FOOTER_TEMPLATE_CSS })} className={smallButton}>Start from a template</button><button type="button" onClick={() => updateFooter({ layout:'classic' })} className={smallButton}>Back to built-in footer</button></div>
      {!String(footer.customHtml || '').trim() && <p className="text-xs font-bold text-amber-700">Until you paste HTML, the storefront keeps showing the built-in footer.</p>}
    </div>}

    <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600"><span>Empty colours follow the site theme colour.</span><button type="button" onClick={() => updateFooter({ backgroundColor:'', surfaceColor:'', headingColor:'', textColor:'', accentColor:'', borderColor:'' })} className={smallButton}>Use theme colours</button></div>

    <div className="grid grid-cols-2 gap-3">
      <Field label="Background style"><select className={inputClass} value={footer.backgroundStyle || 'solid'} onChange={(event) => updateFooter({ backgroundStyle:event.target.value })}><option value="solid">Solid</option><option value="gradient">Gradient</option><option value="glass">Glass</option></select></Field>
      <Field label="Content width"><select className={inputClass} value={footer.maxWidth || 'normal'} onChange={(event) => updateFooter({ maxWidth:event.target.value })}><option value="narrow">Narrow</option><option value="normal">Normal</option><option value="wide">Wide</option></select></Field>
      {[
        ['backgroundColor','Background'],['surfaceColor','Card/surface'],['headingColor','Heading'],['textColor','Text'],['accentColor','Accent'],['borderColor','Border'],
      ].map(([key,label]) => <Field key={key} label={label}><input type="color" className="h-11 w-full rounded-xl border border-slate-200 bg-white p-1" value={/^#[0-9a-f]{6}$/i.test(String(footer[key] || '')) ? footer[key] : FOOTER_SWATCH[key]} onChange={(event) => updateFooter({ [key]:event.target.value })}/></Field>)}
    </div>

    <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <h3 className="font-black">Brand and description</h3>
      <Field label="Footer on website"><select className={inputClass} value={footer.enabled === false ? 'hidden' : 'visible'} onChange={(event) => updateFooter({ enabled:event.target.value === 'visible' })}><option value="visible">Show footer</option><option value="hidden">Hide footer</option></select></Field>
      <Field label="Logo image URL"><input className={inputClass} value={footer.logoUrl || ''} onChange={(event) => updateFooter({ logoUrl:event.target.value })} placeholder="https://..."/></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Logo text"><input className={inputClass} value={footer.logoText || ''} onChange={(event) => updateFooter({ logoText:event.target.value })}/></Field><Field label="Brand name"><input className={inputClass} value={footer.brandName || ''} onChange={(event) => updateFooter({ brandName:event.target.value })}/></Field></div>
      <Field label="Tagline"><input className={inputClass} value={footer.tagline || ''} onChange={(event) => updateFooter({ tagline:event.target.value })}/></Field>
      <Field label="Description"><textarea className={`${inputClass} min-h-24`} value={footer.description || ''} onChange={(event) => updateFooter({ description:event.target.value })}/></Field>
    </div>

    <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between"><h3 className="font-black">Link columns</h3><button type="button" onClick={addColumn} className={smallButton}><Plus size={14}/>Add column</button></div>
      {footer.columns.map((column,columnIndex) => <div key={`${column.title}-${columnIndex}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex gap-2"><input className={`${inputClass} min-w-0 flex-1`} value={column.title} onChange={(event) => updateColumn(columnIndex,{ title:event.target.value })}/><button type="button" onClick={() => moveColumn(columnIndex,-1)} className={smallButton}><ArrowUp size={14}/></button><button type="button" onClick={() => moveColumn(columnIndex,1)} className={smallButton}><ArrowDown size={14}/></button><button type="button" onClick={() => removeColumn(columnIndex)} className={`${smallButton} text-red-600`}><Trash2 size={14}/></button></div>
        <label className="mt-2 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={column.enabled !== false} onChange={(event) => updateColumn(columnIndex,{ enabled:event.target.checked })}/>Show this column</label>
        <div className="mt-3 space-y-2">{(column.links || []).map((link,linkIndex) => <div key={`${link.label}-${linkIndex}`} className="grid grid-cols-[1fr_1fr_auto] gap-2"><input className={inputClass} value={link.label} onChange={(event) => updateLink(columnIndex,linkIndex,{ label:event.target.value })} placeholder="Link name"/><input className={inputClass} value={link.path} onChange={(event) => updateLink(columnIndex,linkIndex,{ path:event.target.value })} placeholder="/products"/><button type="button" onClick={() => removeLink(columnIndex,linkIndex)} className={`${smallButton} text-red-600`}><X size={14}/></button></div>)}</div>
        <button type="button" onClick={() => addLink(columnIndex)} className={`${smallButton} mt-3`}><Link2 size={14}/>Add link</button>
      </div>)}
    </div>

    <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <h3 className="font-black">Contact information</h3>
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={footer.showContact !== false} onChange={(event) => updateFooter({ showContact:event.target.checked })}/>Show contact section</label>
      <Field label="Contact title"><input className={inputClass} value={footer.contactTitle || ''} onChange={(event) => updateFooter({ contactTitle:event.target.value })}/></Field>
      <Field label="Address"><textarea className={`${inputClass} min-h-20`} value={footer.address || ''} onChange={(event) => updateFooter({ address:event.target.value })}/></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Phone"><input className={inputClass} value={footer.phone || ''} onChange={(event) => updateFooter({ phone:event.target.value })}/></Field><Field label="Email"><input className={inputClass} value={footer.email || ''} onChange={(event) => updateFooter({ email:event.target.value })}/></Field></div>
      <Field label="Business hours"><input className={inputClass} value={footer.businessHours || ''} onChange={(event) => updateFooter({ businessHours:event.target.value })}/></Field>
    </div>

    <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <h3 className="font-black">Social and app buttons</h3>
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={footer.showSocial !== false} onChange={(event) => updateFooter({ showSocial:event.target.checked })}/>Show social icons</label>
      {['facebook','youtube','instagram','tiktok'].map((key) => <Field key={key} label={`${key[0].toUpperCase()}${key.slice(1)} URL`}><input className={inputClass} value={footer[key] || ''} onChange={(event) => updateFooter({ [key]:event.target.value })} placeholder="https://..."/></Field>)}
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={footer.showAppButtons !== false} onChange={(event) => updateFooter({ showAppButtons:event.target.checked })}/>Show app download buttons</label>
      <div className="grid grid-cols-2 gap-3"><Field label="Play Store label"><input className={inputClass} value={footer.playStoreLabel || ''} onChange={(event) => updateFooter({ playStoreLabel:event.target.value })}/></Field><Field label="Play Store URL"><input className={inputClass} value={footer.playStoreUrl || ''} onChange={(event) => updateFooter({ playStoreUrl:event.target.value })}/></Field><Field label="App Store label"><input className={inputClass} value={footer.appStoreLabel || ''} onChange={(event) => updateFooter({ appStoreLabel:event.target.value })}/></Field><Field label="App Store URL"><input className={inputClass} value={footer.appStoreUrl || ''} onChange={(event) => updateFooter({ appStoreUrl:event.target.value })}/></Field></div>
    </div>

    <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <h3 className="font-black">Payment, newsletter and bottom line</h3>
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={footer.showPayments !== false} onChange={(event) => updateFooter({ showPayments:event.target.checked })}/>Show payment and delivery badges</label>
      <Field label="Badges" help="Write one badge per line"><textarea className={`${inputClass} min-h-24`} value={(footer.badges || []).join('\n')} onChange={(event) => updateFooter({ badges:event.target.value.split(/\n|,/).map((item) => item.trim()).filter(Boolean) })}/></Field>
      <Field label="Payment logos image (SVG / PNG / WebP)" help="Upload a small logo strip (max 300 KB) or paste an image URL. Shown in the footer Payment & Delivery row.">
        <div className="flex flex-wrap items-center gap-2">
          <input className={inputClass} value={footer.paymentImage && !String(footer.paymentImage).startsWith('data:') ? footer.paymentImage : ''} placeholder={footer.paymentImage ? 'Uploaded image in use' : 'https://.../payments.svg'} onChange={(event) => updateFooter({ paymentImage:event.target.value })}/>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold">Upload<input type="file" hidden accept="image/svg+xml,image/png,image/webp,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; event.target.value=''; if (!file) return; if (file.size > 300 * 1024) { toast.error('Image is larger than 300 KB. Please use a smaller file.'); return; } const reader = new FileReader(); reader.onload = () => updateFooter({ paymentImage:String(reader.result || '') }); reader.readAsDataURL(file); }}/></label>
          {footer.paymentImage ? <><img src={footer.paymentImage} alt="" className="h-8 max-w-[180px] rounded border bg-white object-contain p-1"/><button type="button" className="rounded-lg border px-3 py-2 text-sm font-bold text-red-600" onClick={() => updateFooter({ paymentImage:'' })}>Remove</button></> : null}
        </div>
      </Field>
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={footer.newsletter?.enabled === true} onChange={(event) => updateNewsletter({ enabled:event.target.checked })}/>Show newsletter box</label>
      {footer.newsletter?.enabled && <><Field label="Newsletter title"><input className={inputClass} value={footer.newsletter.title || ''} onChange={(event) => updateNewsletter({ title:event.target.value })}/></Field><Field label="Newsletter message"><input className={inputClass} value={footer.newsletter.text || ''} onChange={(event) => updateNewsletter({ text:event.target.value })}/></Field></>}
      <Field label="Copyright"><input className={inputClass} value={footer.copyright || ''} onChange={(event) => updateFooter({ copyright:event.target.value })} placeholder="Leave blank for automatic year"/></Field>
      <Field label="Bottom message"><input className={inputClass} value={footer.bottomText || ''} onChange={(event) => updateFooter({ bottomText:event.target.value })}/></Field>
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={footer.showBackToTop !== false} onChange={(event) => updateFooter({ showBackToTop:event.target.checked })}/>Show back-to-top button</label>
    </div>
  </div>;
}

function LayoutIcon({ value }) {
  return <span className="mb-2 grid h-8 grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1" aria-hidden="true">{Array.from({ length:value === 'minimal' ? 2 : 3 }).map((_,index) => <i key={index} className={`rounded bg-emerald-300 ${value === 'centered' ? 'mx-auto w-3/4' : ''}`}/>)}</span>;
}

/* ======================================================================
   Website Control Center - model helpers
   Only sections the real storefront renderer supports are offered
   (storefront: frontend-customer/src/components/storefront/NstHome.tsx -> HOME_BLOCK_OF_TYPE)
   ====================================================================== */
const kindOf = (section) => {
  const t = String(section?.type || '').toLowerCase();
  if (t === 'custom code') return 'code';
  if (/^(text block|rich text|text)$/.test(t)) return 'text';
  if (/blog|article/.test(t)) return 'blog';
  if (/slider|hero/.test(t)) return 'hero';
  if (/ticker/.test(t)) return 'ticker';
  if (/trust|features grid|feature/.test(t)) return 'trust';
  if (/categor|things you must have/.test(t)) return 'categories';
  if (/top brand product|used|pre.?order|gadget|accessor/.test(t)) return 'products';
  if (/deal|flash/.test(t)) return 'deals';
  if (/banner|cta|offer strip|promo banner/.test(t)) return 'offers';
  if (/brand/.test(t)) return 'brands';
  if (/product|trending|new arrival|just for you/.test(t)) return 'products';
  return '';
};

/* Default items the storefront shows for Trust & Features / Banner - CTA (frontend-customer NstHome TRUST / OFFERS). */
const ITEM_ICON_OPTIONS = [['badge','Verified'],['refresh','Return / Exchange'],['truck','Delivery'],['card','Card / Payment'],['headphones','Support'],['shield','Warranty'],['recycle','Trade in'],['banknote','Cash / EMI'],['wallet','Wallet'],['phone','Phone'],['percent','Discount'],['gift','Gift'],['tag','Tag'],['star','Star'],['zap','Flash'],['sparkles','New']];
const DEFAULT_SECTION_ITEMS = {
  trust:[
    { icon:'badge', title:'100% Authentic', text:'Official Warranty', link:'' },
    { icon:'refresh', title:'7 Days Return', text:'Easy Return Policy', link:'' },
    { icon:'truck', title:'Fast Delivery', text:'All Over Bangladesh', link:'' },
    { icon:'card', title:'Secure Payment', text:'100% Secure Checkout', link:'' },
    { icon:'headphones', title:'24/7 Support', text:"We're Here to Help", link:'' },
  ],
  offers:[
    { icon:'recycle', title:'Exchange Offer', text:'Upgrade your old phone', link:'/used-products' },
    { icon:'banknote', title:'EMI Available', text:'0% Interest Options', link:'/emi-calculator' },
    { icon:'wallet', title:'Buy Now Pay Later', text:'Flexible Payments', link:'/emi-calculator' },
    { icon:'refresh', title:'Trade In', text:'Best Value for Your Old Phone', link:'/used-products' },
    { icon:'shield', title:'NST Care+', text:'Extended Warranty', link:'/contact' },
  ],
};
/* Products sections: what each one lists on the storefront (NstHome PRODUCT_SOURCE_OF_TYPE). */
const productSourceLabel = (type) => {
  const t = String(type || '').toLowerCase();
  if (/used/.test(t)) return 'used / pre-owned products';
  if (/pre.?order/.test(t)) return 'products that allow pre-order';
  if (/gadget|accessor/.test(t)) return 'accessories and gadgets';
  if (/trending|best sell/.test(t)) return 'best-selling new products';
  if (/top brand/.test(t)) return 'new products from your biggest brands';
  return 'latest new products';
};

const SECTION_LIBRARY = [
  { type:'Image Slider', label:'Hero Banner', kind:'hero', icon:ImgIcon, help:'Big slide with title, buttons and image' },
  { type:'Promo Ticker', label:'Promo Ticker', kind:'ticker', icon:Megaphone, help:'Scrolling offers: delivery, EMI, discounts' },
  { type:'Features Grid', label:'Trust & Features', kind:'trust', icon:ShieldCheck, help:'Warranty, delivery and support promises' },
  { type:'Category Section', label:'Categories', kind:'categories', icon:Tags, help:'Shop by category tiles' },
  { type:'Deals of The Day', label:'Deals of the Day', kind:'deals', icon:Flame, help:'Discounted products with countdown' },
  { type:'Promo Banner', label:'Banner / CTA', kind:'offers', icon:LayoutGrid, help:'Offer strip with call-to-action links' },
  { type:'Brand Showcase', label:'Top Brands', kind:'brands', icon:Sparkles, help:'Clickable brand logos' },
  { type:'Products Grid', label:'Products Grid', kind:'products', icon:PackageCheck, help:'Latest products grid' },
  { type:'Used Products', label:'Used Phones', kind:'products', icon:PackageCheck, help:'Verified used / pre-owned devices' },
  { type:'Pre Order Now', label:'Pre-Order', kind:'products', icon:PackageCheck, help:'Products customers can pre-order' },
  { type:'Trending Products', label:'Trending Products', kind:'products', icon:Flame, help:'Best-selling new products' },
  { type:'Gadget Items', label:'Gadget Items', kind:'products', icon:PackageCheck, help:'Accessories and gadgets' },
  { type:'Blog Posts', label:'Blog Posts', kind:'blog', icon:Type, help:'Latest published blog articles' },
  { type:'Text Block', label:'Text Block', labelKey:'wcc_pages.text.label', helpKey:'wcc_pages.text.help', kind:'text', icon:Type, help:'' },
  { type:'Custom Code', label:'Custom Code', labelKey:'wcc_code.label', helpKey:'wcc_code.help', kind:'code', icon:Code, help:'' },
];
const libraryOf = (kind) => SECTION_LIBRARY.find((item) => item.kind === kind);
const libraryOfSection = (section) => SECTION_LIBRARY.find((item) => item.type === section?.type) || libraryOf(kindOf(section));

const TICKER_ICON_OPTIONS = [['truck','Delivery'],['percent','Discount'],['card','EMI / Card'],['return','Easy return'],['shield','Warranty'],['gift','Gift'],['tag','Tag'],['flame','Hot'],['star','Star'],['zap','Flash'],['megaphone','Announcement'],['sparkles','New']];
const defaultTicker = () => ({
  enabled:true, speed:30, pauseOnHover:true,
  items:[
    { id:`t-${Date.now()}-1`, icon:'truck', text:'Free delivery on orders over ৳2,000', link:'', enabled:true },
    { id:`t-${Date.now()}-2`, icon:'percent', text:'Up to 15% off on selected smartphones', link:'/offers', enabled:true },
    { id:`t-${Date.now()}-3`, icon:'card', text:'0% EMI up to 12 months', link:'', enabled:true },
    { id:`t-${Date.now()}-4`, icon:'shield', text:'7 days easy return', link:'', enabled:true },
  ],
});

const newSection = (type) => {
  const lib = SECTION_LIBRARY.find((item) => item.type === type);
  const base = sectionPreset(type, { name:lib?.label || type, content:{ eyebrow:'', title:lib?.kind === 'hero' || lib?.kind === 'ticker' ? '' : (lib?.label || type), description:'' } });
  if (lib?.kind === 'ticker') return { ...base, content:{ label:"Today's Highlights" }, ticker:defaultTicker() };
  if (lib?.kind === 'hero') return { ...base, slider:{ autoplay:true, interval:6 } };
  if (lib?.kind === 'text') return { ...base, content:{ title:'', body:'', align:'left' } };
  if (lib?.kind === 'code') return { ...base, content:{ title:'' }, code:defaultSectionCode() };
  return base;
};

/** First open in the new editor: build the home section list from the storefront's classic order,
    so the live website looks exactly the same after the first Publish. */
const migrateHomeLayout = (draft) => {
  const home = draft.pages.find((item) => item.id === 'home');
  if (!home || Number(home.layoutVersion || 0) >= 2) return draft;
  const old = Array.isArray(home.blocks) ? home.blocks : [];
  const take = (kind) => { const index = old.findIndex((section) => kindOf(section) === kind && !section.__used); if (index < 0) return null; old[index].__used = true; return old[index]; };
  const order = ['hero','ticker','trust','categories','deals','offers','brands','products'];
  const blocks = [];
  order.forEach((kind) => {
    const existing = take(kind);
    if (existing) { const { __used, ...clean } = existing; blocks.push(clean); return; }
    if (kind === 'ticker') return; // ticker is optional - added from the library
    const lib = libraryOf(kind);
    blocks.push(newSection(lib.type));
  });
  const unsupported = old.filter((section) => !section.__used).map(({ __used, ...section }) => ({ ...section, visible:false }));
  const pages = draft.pages.map((item) => item.id === 'home' ? { ...item, layoutVersion:2, blocks:[...blocks, ...unsupported] } : item);
  return { ...draft, pages };
};

function Switch({ checked, onChange, label }) {
  return <span role="switch" tabIndex={0} aria-checked={checked} aria-label={label} title={label}
    onClick={(event) => { event.stopPropagation(); onChange(!checked); }}
    onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); onChange(!checked); } }}
    className={`nst-wcc-switch ${checked ? 'is-on' : ''}`}><span/></span>;
}
function WField({ label, hint, children, counter }) {
  return <label className="nst-wcc-field"><span className="nst-wcc-field__label">{label}{counter ? <em>{counter}</em> : null}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

export default function WebsiteControlCenter() {
  const [draft,setDraft] = useState(normalizeDraft({}));
  const [pageId,setPageId] = useState('home');
  const [selectedId,setSelectedId] = useState('home-section-01');
  const [device,setDevice] = useState('desktop');
  const [simpleMode,setSimpleMode] = useState(true);
  const [advancedOpen,setAdvancedOpen] = useState(false);
  const [query,setQuery] = useState('');
  const [history,setHistory] = useState([]);
  const [future,setFuture] = useState([]);
  const [revisions,setRevisions] = useState([]);
  const [saving,setSaving] = useState(false);
  const [loading,setLoading] = useState(true);
  const [dirty,setDirty] = useState(false);

  useEffect(() => {
    const warn = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const [preview,setPreview] = useState(false);
  const [historyOpen,setHistoryOpen] = useState(false);
  const [themeOpen,setThemeOpen] = useState(false);
  const [mediaOpen,setMediaOpen] = useState(false);
  const [mediaLoading,setMediaLoading] = useState(false);
  const [mediaItems,setMediaItems] = useState([]);
  const [mediaSearch,setMediaSearch] = useState('');
  const frameRef = useRef(null);
  const expectedPathRef = useRef('/');
  const previewFrameRef = useRef(null);
  const importRef = useRef(null);

  const [saveState,setSaveState] = useState('saved');
  const [leftTab,setLeftTab] = useState('sections');
  const [rightTab,setRightTab] = useState('content');
  const [libraryOpen,setLibraryOpen] = useState(false);
  const [pagePanel,setPagePanel] = useState(false);
  const [addPageOpen,setAddPageOpen] = useState(false);
  const [frameNonce,setFrameNonce] = useState(0);
  const [framePath,setFramePath] = useState('');
  const [menuFor,setMenuFor] = useState('');
  const [moreOpen,setMoreOpen] = useState(false);
  const [dragIndex,setDragIndex] = useState(-1);
  const [samplePaths,setSamplePaths] = useState({});
  const [brandPanel,setBrandPanel] = useState(null);
  const [designPanel,setDesignPanel] = useState('');
  const navigate = useNavigate();
  const t = useT();

  useEffect(() => {
    const rowsOf = (response) => [response?.data?.data?.data, response?.data?.data, response?.data].find(Array.isArray) || [];
    Promise.allSettled([
      api.get('/public/products', { params:{ limit:1 } }),
      api.get('/public/categories'),
      api.get('/public/brands'),
    ]).then(([products, categories, brands]) => {
      const product = products.status === 'fulfilled' ? rowsOf(products.value)[0] : null;
      const categoryRows = categories.status === 'fulfilled' ? rowsOf(categories.value) : [];
      const category = categoryRows.find((row) => row?.slug && !['smartphones','accessories'].includes(row.slug)) || categoryRows[0] || null;
      const brand = brands.status === 'fulfilled' ? rowsOf(brands.value)[0] : null;
      setSamplePaths({
        'product-details':product?.slug ? `/product/${encodeURIComponent(product.slug)}` : '/product/preview',
        category:category?.slug ? `/category/${encodeURIComponent(category.slug)}` : '/category/preview',
        brand:brand?.slug ? `/brand/${encodeURIComponent(brand.slug)}` : '/brand/preview',
      });
    });
  }, []);

  const loadDraft = async () => {
    setLoading(true);
    try {
      const data = await fetchWebsiteBuilderDraft();
      const normalized = migrateHomeLayout(normalizeDraft(data));
      setDraft(normalized);
      setDirty(false);
      const firstPage = normalized.pages.find((item) => item.id === pageId) || normalized.pages[0];
      setPageId(firstPage?.id || 'home');
      setSelectedId(firstPage?.id === 'footer' ? 'global-footer' : firstPage?.blocks?.[0]?.id || '');
    } catch {
      toast.error('Website draft could not be loaded. Check the POS connection.');
    } finally {
      setLoading(false);
    }
  };

  const loadRevisions = async () => {
    try {
      const rows = await fetchWebsiteBuilderRevisions();
      setRevisions(Array.isArray(rows) ? rows : []);
    } catch {
      setRevisions([]);
    }
  };

  useEffect(() => { loadDraft(); loadRevisions(); }, []);

  useEffect(() => {
    const receive = (event) => {
      const message = event.data;
      if (!message || typeof message !== 'object') return;
      if (message.type === 'NST_WEBSITE_PREVIEW_READY') {
        event.source?.postMessage?.({ type:'NST_WEBSITE_EDITOR_PREVIEW', content:draft, pageId, path:message.path }, '*');
        if (event.source === frameRef.current?.contentWindow && typeof message.path === 'string') setFramePath(message.path);
        if (event.source === frameRef.current?.contentWindow && typeof message.path === 'string' && message.path !== expectedPathRef.current) {
          const shownPage = pageIdForPath(message.path, draft.pages);
          if (shownPage && shownPage !== pageId && shownPage !== 'home') {
            setSamplePaths((paths) => ({ ...paths, [shownPage]:message.path }));
            setPageId(shownPage);
          } else if (shownPage === 'home' && !['home', 'footer', 'header'].includes(pageId)) setPageId('home');
        }
      }
      if (message.type === 'NST_WEBSITE_SECTION_SELECTED' && String(message.sectionId || '').startsWith('brand-')) {
        setPageId('brand');
        setBrandPanel({ tab:message.sectionId === 'brand-texts' ? 'texts' : 'brand' });
        if (message.brandSlug) setSamplePaths((paths) => ({ ...paths, brand:`/brand/${encodeURIComponent(message.brandSlug)}` }));
        return;
      }
      if (message.type === 'NST_WEBSITE_SECTION_SELECTED' && message.sectionId === 'product-design') {
        setBrandPanel(null); setPagePanel(false);
        setPageId('product-details');
        setDesignPanel('product');
        return;
      }
      if (message.type === 'NST_WEBSITE_SECTION_SELECTED') {
        setBrandPanel(null); setDesignPanel('');
        const nextPageId = message.pageId || 'home';
        setPageId(nextPageId);
        setSelectedId(message.sectionId || '');
      }
    };
    window.addEventListener('message',receive);
    return () => window.removeEventListener('message',receive);
  },[draft,pageId]);

  // (removed) the website theme no longer overrides the admin dashboard colors

  const page = draft.pages.find((item) => item.id === pageId) || draft.pages[0];
  const selected = pageId === 'footer' ? { id:'global-footer', type:'Footer', name:'Global Footer', visible:draft.footer?.enabled !== false } : page?.blocks?.find((item) => item.id === selectedId) || page?.blocks?.[0];
  const filteredBlocks = useMemo(() => ADVANCED_BLOCKS.filter((item) => item.toLowerCase().includes(query.toLowerCase())),[query]);

  useEffect(() => { if (pageId !== 'brand') setBrandPanel(null); }, [pageId]);

  useEffect(() => {
    if (pageId === 'footer') { setSelectedId('global-footer'); return; }
    if (page && !page.blocks?.some((item) => item.id === selectedId)) setSelectedId(page.blocks?.[0]?.id || '');
  },[pageId,page?.blocks?.length,selectedId]);

  const commit = (next) => {
    setHistory((items) => [...items.slice(-39),draft]);
    setFuture([]);
    setDraft(next);
    setDirty(true);
    setSaveState('dirty');
  };
  const updatePage = (updater) => commit({ ...draft, pages:draft.pages.map((item) => item.id === page.id ? updater(item) : item) });
  const updateSelected = (patch) => updatePage((item) => ({ ...item, blocks:item.blocks.map((section) => section.id === selected.id ? { ...section, ...patch } : section) }));
  const updateNested = (key,patch) => updateSelected({ [key]:{ ...(selected?.[key] || {}), ...patch } });
  const updateHero = (patch) => {
    const slides = [...(selected?.slides || [])];
    slides[0] = { id:`hero-${Date.now()}`, ...(slides[0] || {}), ...patch };
    updateSelected({ slides });
  };

  const addSection = (type) => {
    if (pageId !== 'home' && pageId !== 'footer') toast('Section added to the selected page.');
    const section = sectionPreset(type);
    updatePage((item) => ({ ...item, blocks:[...(item.blocks || []),section] }));
    setSelectedId(section.id);
  };
  const removeSelected = () => {
    if (!selected || pageId === 'footer' || !window.confirm(`Remove “${selected.name}” from this page?`)) return;
    const remaining = page.blocks.filter((item) => item.id !== selected.id);
    updatePage((item) => ({ ...item, blocks:remaining }));
    setSelectedId(remaining[0]?.id || '');
  };
  const duplicateSelected = () => {
    if (!selected || pageId === 'footer') return;
    const copy = structuredClone(selected);
    copy.id = `${selected.id}-copy-${Date.now()}`;
    copy.name = `${selected.name} Copy`;
    updatePage((item) => ({ ...item, blocks:[...item.blocks,copy] }));
    setSelectedId(copy.id);
  };
  const moveSection = (from,to) => {
    if (from === to || to < 0 || to >= page.blocks.length) return;
    const blocks = [...page.blocks];
    const [item] = blocks.splice(from,1);
    blocks.splice(to,0,item);
    updatePage((current) => ({ ...current, blocks }));
  };
  const undo = () => {
    if (!history.length) return;
    const previous = history.at(-1);
    setFuture((items) => [draft,...items]);
    setDraft(previous);
    setHistory((items) => items.slice(0,-1));
    setDirty(true);
  };
  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setHistory((items) => [...items,draft]);
    setDraft(next);
    setFuture((items) => items.slice(1));
    setDirty(true);
  };

  const save = async (publish = false) => {
    setSaving(true); setSaveState(publish ? 'publishing' : 'saving');
    try {
      await saveWebsiteBuilderDraft(draft);
      setDirty(false);
      if (publish) {
        await publishWebsiteBuilderDraft();
        await loadRevisions();
        setSaveState('published');
        toast.success('Published. Refresh the customer website to see the same design.');
      } else {
        setSaveState('saved');
        toast.success('Draft saved. The live customer website is unchanged.');
      }
    } catch (error) {
      setSaveState('error');
      toast.error(error?.response?.data?.message || 'Save failed. Your changes remain open on this screen.');
    } finally {
      setSaving(false);
    }
  };

  const restoreRevision = async (revision) => {
    if (!window.confirm(`Restore website version “${revision.label || revision.created_at}”?`)) return;
    setSaving(true);
    try {
      await rollbackWebsiteBuilderRevision(revision.id);
      await loadDraft();
      await loadRevisions();
      setHistoryOpen(false);
      toast.success('Previous website version restored.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Website version could not be restored.');
    } finally {
      setSaving(false);
    }
  };

  const loadMedia = async (search = mediaSearch) => {
    setMediaLoading(true);
    try {
      const result = await productService.getMediaLibraryImages({ search, per_page:60 });
      const rows = result?.data?.data?.data || result?.data?.data || result?.data || [];
      setMediaItems(Array.isArray(rows) ? rows : []);
    } catch {
      setMediaItems([]);
      toast.error('Media library could not be loaded.');
    } finally {
      setMediaLoading(false);
    }
  };
  const chooseImage = (item) => {
    const url = item.image_url || item.media_url || item.thumbnail_url || '';
    if (!url) return;
    updateHero({ image:url });
    setMediaOpen(false);
  };

  const exportTheme = () => {
    const blob = new Blob([JSON.stringify({ type:'nst-theme', version:1, theme:draft.theme },null,2)],{ type:'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = 'nst-theme.json';
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };
  const importTheme = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        commit({ ...draft, theme:{ ...defaultTheme, ...(parsed.theme || parsed) } });
      } catch {
        toast.error('This is not a valid NST theme file.');
      }
    };
    reader.readAsText(file);
  };

  /* ---------------- helpers bound to state ---------------- */
  const isHome = page?.id === 'home';
  const hasSections = pageSupportsSections(page?.id, draft.pages);
  const selectedKind = pageId === 'footer' ? 'footer' : kindOf(selected);
  const duplicateSection = (section) => {
    const copy = structuredClone(section); copy.id = `${section.id}-copy-${Date.now()}`; copy.name = `${section.name} Copy`;
    const index = page.blocks.findIndex((row) => row.id === section.id);
    const blocks = [...page.blocks]; blocks.splice(index + 1, 0, copy);
    updatePage((item) => ({ ...item, blocks })); setSelectedId(copy.id);
  };
  const removeSection = (section) => {
    if (!section || !window.confirm(`Remove “${section.name}” from this page?`)) return;
    const remaining = page.blocks.filter((row) => row.id !== section.id);
    updatePage((item) => ({ ...item, blocks:remaining }));
    if (selectedId === section.id) setSelectedId(remaining[0]?.id || '');
  };
  const setVisible = (section, visible) => updatePage((item) => ({ ...item, blocks:item.blocks.map((row) => row.id === section.id ? { ...row, visible, enabled:visible } : row) }));
  const addFromLibrary = (type) => {
    const section = newSection(type);
    const blocks = [...(page.blocks || [])];
    // Promo Ticker goes directly below the Hero (approved placement)
    const heroIndex = blocks.findIndex((row) => kindOf(row) === 'hero');
    const at = kindOf(section) === 'ticker' && heroIndex >= 0 ? heroIndex + 1 : blocks.length;
    blocks.splice(at, 0, section);
    updatePage((item) => ({ ...item, layoutVersion:2, blocks }));
    setSelectedId(section.id); setRightTab('content'); setLibraryOpen(false);
  };
  const slide0 = selected?.slides?.[0] || {};
  const ticker = { ...defaultTicker(), items:[], ...(selected?.ticker || {}) };
  const updateTicker = (patch) => updateSelected({ ticker:{ ...ticker, ...patch } });
  const updateTickerItem = (index, patch) => updateTicker({ items:ticker.items.map((item, i) => i === index ? { ...item, ...patch } : item) });
  const moveTickerItem = (from, to) => { if (to < 0 || to >= ticker.items.length) return; const items = [...ticker.items]; const [row] = items.splice(from, 1); items.splice(to, 0, row); updateTicker({ items }); };
  const statusLabel = { saved:'Draft saved ✓', dirty:'Unsaved changes', saving:'Saving...', publishing:'Publishing...', published:'Published ✓', error:'Save failed' }[saveState] || 'Draft saved ✓';
  const sampleBlog = (Array.isArray(draft.blogs) ? draft.blogs : []).find((row) => row?.slug && row.enabled !== false);
  const previewPath = samplePaths[page?.id] || (page?.id === 'blog-post' ? (sampleBlog ? `/blog/${encodeURIComponent(sampleBlog.slug)}` : '/blog') : '');
  const brandSlug = page?.id === 'brand' ? decodeURIComponent(String(previewPath).split('/brand/')[1] || '') : '';
  const showBrand = (slug) => setSamplePaths((paths) => ({ ...paths, brand:`/brand/${encodeURIComponent(slug)}` }));
  const refreshBrandPreview = () => frameRef.current?.contentWindow?.postMessage({ type:'NST_WEBSITE_BRAND_UPDATED' }, '*');
  const canvasPath = previewPath || (page?.id === 'footer' || page?.id === 'header' ? '/' : isCustomPage(page) ? `/${String(page.slug || '').replace(/^\/+/, '')}` : (page?.link || page?.slug || '/'));
  expectedPathRef.current = canvasPath.split('?')[0];
  const selectPage = (id) => { setPageId(id); setLeftTab('sections'); setPagePanel(false); setBrandPanel(null); setDesignPanel(''); setFrameNonce((value) => value + 1); };
  const updatePageById = (next) => commit({ ...draft, pages:draft.pages.map((item) => item.id === next.id ? next : item) });
  const createCustomPage = ({ name, i18n, slug, start, copyFrom, placement, status }) => {
    const source = draft.pages.find((item) => item.id === copyFrom);
    const blocks = start === 'text' ? [newSection('Text Block')]
      : start === 'copy' && source ? (source.blocks || []).map((section) => ({ ...structuredClone(section), id:`${section.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,5)}` }))
      : [];
    const id = `${CUSTOM_PAGE_PREFIX}${slug}-${Date.now().toString(36)}`;
    const next = { id, custom:true, name, i18n, slug, link:`/${slug}`, status, showHeader:true, layoutVersion:2, menu:{ placement, order:0 }, seo:{ title:name, description:'', canonical:'' }, blocks };
    commit({ ...draft, pages:[...draft.pages, next] });
    setAddPageOpen(false); setPageId(id); setSelectedId(blocks[0]?.id || ''); setLeftTab('sections'); setPagePanel(!blocks.length); setFrameNonce((value) => value + 1);
    toast.success(t('wcc_pages.created'));
  };
  const deleteCustomPage = () => {
    if (!isCustomPage(page) || !window.confirm(t('wcc_pages.delete_confirm', { name:page.name }))) return;
    commit({ ...draft, pages:draft.pages.filter((item) => item.id !== page.id) });
    setPagePanel(false); setPageId('home');
  };
  const showPageSettings = pageId !== 'footer' && (pagePanel || !hasSections);

  if (loading) return createPortal(<div className="nst-wcc nst-wcc--loading"><div className="nst-wcc-spinner"/><p>Opening Website Control Center…</p></div>, document.body);

  const rowThumb = (section) => { const Icon = libraryOf(kindOf(section))?.icon || LayoutGrid; return <span className="nst-wcc-thumb"><Icon size={16}/></span>; };

  return createPortal(<div className="nst-wcc">
    {/* ---------------- TOP BAR ---------------- */}
    <header className="nst-wcc-top">
      <div className="nst-wcc-brand">
        <button type="button" className="nst-wcc-iconbtn" onClick={() => { if (!dirty || window.confirm('You have unsaved changes. Leave the editor?')) navigate(-1); }} title="Back to admin"><ArrowLeft size={18}/></button>
        <div><b>Website Control Center</b><small>NST Business OS</small></div>
        <span className="nst-wcc-live">Live Editor</span>
      </div>
      <div className="nst-wcc-devices" role="tablist" aria-label="Preview device">
        {[['desktop',Monitor,'Desktop'],['tablet',Tablet,'Tablet'],['mobile',Smartphone,'Mobile']].map(([name,Icon,label]) => <button key={name} type="button" role="tab" aria-selected={device === name} className={`nst-wcc-device ${device === name ? 'is-active' : ''}`} onClick={() => setDevice(name)}><Icon size={18}/><span>{label}</span></button>)}
      </div>
      <div className="nst-wcc-actions">
        <button type="button" className="nst-wcc-ghost" onClick={undo} disabled={!history.length}><Undo2 size={16}/>Undo</button>
        <button type="button" className="nst-wcc-ghost" onClick={redo} disabled={!future.length}><Redo2 size={16}/>Redo</button>
        <span className={`nst-wcc-status is-${saveState}`}><CheckCircle2 size={15}/>{statusLabel}</span>
        <button type="button" className="nst-wcc-btn" onClick={() => setPreview(true)}><Eye size={16}/>Preview</button>
        <button type="button" className="nst-wcc-btn" onClick={() => save(false)} disabled={saving}><Save size={16}/>Save Draft</button>
        <button type="button" className="nst-wcc-btn is-primary" onClick={() => { if (window.confirm('Publish this draft to the live customer website?')) save(true); }} disabled={saving}><Send size={16}/>Publish</button>
        <div className="nst-wcc-more">
          <button type="button" className="nst-wcc-iconbtn" onClick={() => setMoreOpen((v) => !v)} aria-label="More"><MoreHorizontal size={18}/></button>
          {moreOpen && <div className="nst-wcc-menu" onMouseLeave={() => setMoreOpen(false)}>
            <button type="button" onClick={() => { setHistoryOpen(true); setMoreOpen(false); }}><History size={15}/>Version history</button>
            <button type="button" onClick={() => { setThemeOpen(true); setMoreOpen(false); }}><Palette size={15}/>Colors & font</button>
            <button type="button" onClick={() => { exportTheme(); setMoreOpen(false); }}><Download size={15}/>Export theme</button>
            <button type="button" onClick={() => { importRef.current?.click(); setMoreOpen(false); }}><Upload size={15}/>Import theme</button>
          </div>}
          <input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) importTheme(file); event.target.value=''; }}/>
        </div>
      </div>
    </header>

    <div className="nst-wcc-body">
      {/* ---------------- LEFT: PAGES + SECTIONS ---------------- */}
      <aside className="nst-wcc-left">
        <div className="nst-wcc-panel-head"><h2>Pages</h2></div>
        <PagePicker pages={draft.pages} pageId={pageId} onSelect={selectPage} onAdd={() => setAddPageOpen(true)} onSettings={() => { setBrandPanel(null); setDesignPanel(''); setPagePanel(true); }}/>
        {hasSections && !isHome ? <p className="nst-wcc-note">Sections on this page appear above the page content, or below it when set to “Bottom of page”. The page itself (product list, cart, checkout form) keeps its standard layout.</p> : null}
        {pageId === 'header' || pageId === 'product-details' ? <div className="nst-wcc-rows"><div className={`nst-wcc-row ${(pageId === 'header' && !pagePanel) || designPanel === 'product' ? 'is-selected' : ''}`} role="button" tabIndex={0}
          onClick={() => { setPagePanel(false); setDesignPanel(pageId === 'header' ? '' : 'product'); }} onKeyDown={(event) => { if (event.key === 'Enter') { setPagePanel(false); setDesignPanel(pageId === 'header' ? '' : 'product'); } }}>
          <span className="nst-wcc-thumb"><Settings2 size={16}/></span>
          <span className="nst-wcc-row__name">{t(pageId === 'header' ? 'wcc_store.left.header' : 'wcc_store.left.product')}<small>{t(pageId === 'header' ? 'wcc_store.left.header_help' : 'wcc_store.left.product_help')}</small></span>
        </div></div> : null}
        {pageId === 'brand' ? <div className="nst-wcc-rows"><div className={`nst-wcc-row ${brandPanel ? 'is-selected' : ''}`} role="button" tabIndex={0} onClick={() => setBrandPanel({ tab:'brand' })} onKeyDown={(event) => { if (event.key === 'Enter') setBrandPanel({ tab:'brand' }); }}>
          <span className="nst-wcc-thumb"><Tags size={16}/></span>
          <span className="nst-wcc-row__name">{t('wcc_brand.left_entry')}<small>{t('wcc_brand.left_help')}</small></span>
        </div></div> : null}
        <div className="nst-wcc-segment">
          <button type="button" className={leftTab === 'sections' ? 'is-active' : ''} onClick={() => setLeftTab('sections')}>Sections <em>{hasSections ? page.blocks.length : 1}</em></button>
          <button type="button" className={leftTab === 'global' ? 'is-active' : ''} onClick={() => setLeftTab('global')}>Global</button>
        </div>

        {leftTab === 'sections' && hasSections && !page.blocks.length && <div className="nst-wcc-empty">No sections on this page yet.</div>}
        {leftTab === 'sections' && hasSections && <div className="nst-wcc-rows">
          {page.blocks.map((section, index) => {
            const supported = Boolean(kindOf(section));
            const visible = section.visible !== false;
            return <div key={section.id}
              className={`nst-wcc-row ${section.id === selected?.id ? 'is-selected' : ''} ${!visible ? 'is-hidden' : ''} ${dragIndex === index ? 'is-dragging' : ''}`}
              draggable onDragStart={() => setDragIndex(index)} onDragOver={(event) => event.preventDefault()}
              onDrop={() => { moveSection(dragIndex, index); setDragIndex(-1); }} onDragEnd={() => setDragIndex(-1)}
              onClick={() => { setBrandPanel(null); setPagePanel(false); setDesignPanel(''); setSelectedId(section.id); setRightTab('content'); }} role="button" tabIndex={0}>
              <GripVertical size={16} className="nst-wcc-grip"/>
              {rowThumb(section)}
              <span className="nst-wcc-row__name">{section.name}{!supported ? <small>Not on website</small> : !visible ? <small>Hidden</small> : null}</span>
              {supported ? <Switch checked={visible} onChange={(value) => setVisible(section, value)} label={visible ? 'Hide section' : 'Show section'}/> : <EyeOff size={16} className="nst-wcc-muted"/>}
              <span className="nst-wcc-rowmenu">
                <button type="button" className="nst-wcc-iconbtn is-sm" onClick={(event) => { event.stopPropagation(); setMenuFor(menuFor === section.id ? '' : section.id); }} aria-label="Section menu"><MoreHorizontal size={16}/></button>
                {menuFor === section.id && <div className="nst-wcc-menu is-right" onMouseLeave={() => setMenuFor('')} onClick={(event) => event.stopPropagation()}>
                  <button type="button" onClick={() => { moveSection(index, index - 1); setMenuFor(''); }} disabled={index === 0}><ArrowUp size={15}/>Move up</button>
                  <button type="button" onClick={() => { moveSection(index, index + 1); setMenuFor(''); }} disabled={index === page.blocks.length - 1}><ArrowDown size={15}/>Move down</button>
                  {supported && <button type="button" onClick={() => { setMenuFor(''); duplicateSection(section); }}><Copy size={15}/>Duplicate</button>}
                  <button type="button" className="is-danger" onClick={() => { setMenuFor(''); removeSection(section); }}><Trash2 size={15}/>Delete</button>
                </div>}
              </span>
            </div>;
          })}
        </div>}
        {leftTab === 'sections' && hasSections && <button type="button" className="nst-wcc-btn is-primary is-block" onClick={() => setLibraryOpen(true)}><Plus size={17}/>Add Section</button>}
        {leftTab === 'sections' && pageId === 'footer' && <div className="nst-wcc-rows"><div className="nst-wcc-row is-selected"><span className="nst-wcc-thumb"><LayoutGrid size={16}/></span><span className="nst-wcc-row__name">Global Footer</span></div></div>}

        {leftTab === 'global' && <div className="nst-wcc-global">
          <button type="button" className="nst-wcc-globalrow" onClick={() => setThemeOpen(true)}><Palette size={17}/><span><b>Colors & font</b><small>Storefront palette: primary, secondary, accent, font</small></span></button>
          <button type="button" className="nst-wcc-globalrow" onClick={() => selectPage('header')}><LayoutGrid size={17}/><span><b>{t('wcc_store.left.header')}</b><small>{t('wcc_store.left.header_help')}</small></span></button>
          <button type="button" className="nst-wcc-globalrow" onClick={() => { setPageId('footer'); setLeftTab('sections'); setDesignPanel(''); }}><LayoutGrid size={17}/><span><b>Footer</b><small>Columns, links, newsletter, colors</small></span></button>
          <button type="button" className="nst-wcc-globalrow" onClick={() => { setBrandPanel(null); setPagePanel(false); setDesignPanel('popup'); }}><Megaphone size={17}/><span><b>{t('wcc_store.left.popup')}</b><small>{t('wcc_store.left.popup_help')}</small></span></button>
          <div className="nst-wcc-palette">
            <span>Current storefront palette</span>
            <div>{['primary','secondary','accent'].map((key) => <i key={key} title={`${key}: ${draft.theme?.[key]}`} style={{ background:draft.theme?.[key] }}/>)}</div>
          </div>
          <div className="nst-wcc-group"><h3>Tracking & Ads</h3>
            <WField label="Google Analytics 4 ID" hint="Looks like G-XXXXXXXXXX. Counts visitors and page views."><input value={draft.site?.tracking?.ga4 || ''} onChange={(event) => commit({ ...draft, site:{ ...(draft.site || {}), tracking:{ ...(draft.site?.tracking || {}), ga4:event.target.value.trim() } } })} placeholder="G-XXXXXXXXXX"/></WField>
            <WField label="Google Ads ID" hint="Looks like AW-XXXXXXXXX. For Google ad campaigns and conversions."><input value={draft.site?.tracking?.googleAds || ''} onChange={(event) => commit({ ...draft, site:{ ...(draft.site || {}), tracking:{ ...(draft.site?.tracking || {}), googleAds:event.target.value.trim() } } })} placeholder="AW-XXXXXXXXX"/></WField>
            <WField label="Meta (Facebook) Pixel ID" hint="Numbers only. For Facebook / Instagram ads (page views, add to cart, purchase)."><input value={draft.site?.tracking?.metaPixel || ''} onChange={(event) => commit({ ...draft, site:{ ...(draft.site || {}), tracking:{ ...(draft.site?.tracking || {}), metaPixel:event.target.value.replace(/\D/g, '') } } })} placeholder="123456789012345"/></WField>
            <p className="nst-wcc-note">Active on the whole live website after Publish (not inside this editor preview). Every page view is tracked automatically.</p>
          </div>
          <SiteCodeFields value={draft.site?.customCode} onChange={(customCode) => commit({ ...draft, site:{ ...(draft.site || {}), customCode } })} Switch={Switch}/>
          <p className="nst-wcc-note">{t('wcc_store.global_note')}</p>
        </div>}
      </aside>

      {/* ---------------- CENTER: REAL STOREFRONT ---------------- */}
      <main className="nst-wcc-center">
        <div className={`nst-wcc-canvas is-${device}`}>
          <LiveStorefrontFrame key={frameNonce} frameRef={frameRef} draft={draft} page={page} device={device} previewPath={previewPath} selectedId={pageId === 'footer' ? '' : selected?.id || ''}/>
        </div>
        <p className="nst-wcc-canvas-hint">{t('wcc_pages.preview_path', { path:framePath || canvasPath })}</p>
      </main>

      {/* ---------------- RIGHT: SECTION EDITOR ---------------- */}
      <aside className="nst-wcc-right">
        {designPanel === 'popup' ? <PurchasePopupSettings draft={draft} commit={commit} onClose={() => setDesignPanel('')}/>
          : designPanel === 'product' && pageId === 'product-details' ? <ProductPageDesigner draft={draft} commit={commit} onClose={() => setDesignPanel('')}/>
          : pageId === 'header' && !pagePanel ? <HeaderDesigner draft={draft} commit={commit}/>
          : showPageSettings && !(pageId === 'brand' && brandPanel) ? <PageSettingsPanel key={page.id} page={page} pages={draft.pages} siteUrl={customerBaseUrl()} onChange={updatePageById} onDelete={deleteCustomPage} onClose={hasSections ? () => setPagePanel(false) : null}/> : pageId === 'brand' && brandPanel ? <BrandPageEditor slug={brandSlug} tab={brandPanel.tab} draft={draft} commit={commit} onBrandChange={showBrand} onBrandSaved={refreshBrandPreview} onClose={() => setBrandPanel(null)}/> : pageId === 'footer' ? <div className="nst-wcc-footer-designer"><div className="nst-wcc-panel-head"><h2>Global Footer</h2></div><FooterDesigner draft={draft} commit={commit}/></div> : !selected ? <div className="nst-wcc-empty">Click a section in the preview or in the list.</div> : <>
          <div className="nst-wcc-panel-head">
            <h2>{selected.name}</h2>
            <div className="nst-wcc-panel-actions">
              {selectedKind && <span className="nst-wcc-visible"><Switch checked={selected.visible !== false} onChange={(value) => setVisible(selected, value)} label="Visible"/>{selected.visible !== false ? 'Visible' : 'Hidden'}</span>}
              <button type="button" className="nst-wcc-iconbtn is-danger" onClick={() => removeSection(selected)} title="Delete section"><Trash2 size={16}/></button>
            </div>
          </div>
          <div className="nst-wcc-tabs" role="tablist">
            {['content','design','advanced'].map((tab) => <button key={tab} type="button" role="tab" aria-selected={rightTab === tab} className={rightTab === tab ? 'is-active' : ''} onClick={() => setRightTab(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}
          </div>

          <div className="nst-wcc-form">
            {!selectedKind && <div className="nst-wcc-warn"><AlertCircle size={16}/><span>This section type is not shown on the customer website (the storefront has no renderer for it). You can delete it; it stays hidden.</span></div>}

            {/* ---- HERO ---- */}
            {selectedKind === 'hero' && rightTab === 'content' && <>
              <WField label="Title" counter={`${(slide0.title || '').length}/80`}><input maxLength={80} value={slide0.title || ''} onChange={(event) => updateHero({ title:event.target.value })}/></WField>
              <WField label="Subtitle" counter={`${(slide0.subtitle || '').length}/80`}><input maxLength={80} value={slide0.subtitle || ''} onChange={(event) => updateHero({ subtitle:event.target.value })}/></WField>
              <WField label="Description" counter={`${(slide0.description || '').length}/160`} hint="Shown on tablet and desktop."><textarea maxLength={160} rows={3} value={slide0.description || ''} onChange={(event) => updateHero({ description:event.target.value })}/></WField>
              <div className="nst-wcc-group"><h3>Primary Button</h3>
                <div className="nst-wcc-pair"><span>Text</span><input value={slide0.buttonLabel || ''} onChange={(event) => updateHero({ buttonLabel:event.target.value })} placeholder="Shop Now"/></div>
                <div className="nst-wcc-pair"><span>Link</span><input value={slide0.buttonLink || ''} onChange={(event) => updateHero({ buttonLink:event.target.value })} placeholder="/products"/></div>
              </div>
              <div className="nst-wcc-group"><h3>Secondary Button <Switch checked={Boolean(slide0.secondaryEnabled)} onChange={(value) => updateHero({ secondaryEnabled:value })} label="Secondary button"/></h3>
                {slide0.secondaryEnabled && <>
                  <div className="nst-wcc-pair"><span>Text</span><input value={slide0.secondaryLabel || ''} onChange={(event) => updateHero({ secondaryLabel:event.target.value })} placeholder="Learn More"/></div>
                  <div className="nst-wcc-pair"><span>Link</span><input value={slide0.secondaryLink || ''} onChange={(event) => updateHero({ secondaryLink:event.target.value })} placeholder="/category/..."/></div>
                  <small className="nst-wcc-note">Shown from tablet width upward.</small>
                </>}
              </div>
              <div className="nst-wcc-group"><h3>Hero Image</h3>
                <div className="nst-wcc-image">
                  <div className="nst-wcc-image__preview">{slide0.image ? <img src={slide0.image} alt=""/> : <ImageIcon size={26}/>}</div>
                  <div className="nst-wcc-image__actions">
                    <button type="button" className="nst-wcc-btn" onClick={() => { setMediaOpen(true); loadMedia(''); }}><ImageIcon size={15}/>Replace Image</button>
                    <button type="button" className="nst-wcc-btn is-danger" disabled={!slide0.image} onClick={() => updateHero({ image:'' })}><Trash2 size={15}/>Remove</button>
                  </div>
                </div>
                <input value={slide0.image || ''} onChange={(event) => updateHero({ image:event.target.value })} placeholder="or paste an image URL"/>
                <small className="nst-wcc-note">Recommended: 1620 × 800 (JPG/PNG/WebP). Without an image the storefront shows the featured product.</small>
              </div>
            </>}
            {selectedKind === 'hero' && rightTab === 'design' && <>
              <div className="nst-wcc-group"><h3>Slider Settings</h3>
                <div className="nst-wcc-pair"><span>Auto play</span><Switch checked={selected.slider?.autoplay !== false} onChange={(value) => updateNested('slider',{ autoplay:value })} label="Auto play"/></div>
                <div className="nst-wcc-pair"><span>Change every</span><select value={selected.slider?.interval || 6} onChange={(event) => updateNested('slider',{ interval:Number(event.target.value) })}>{[3,4,5,6,8,10,15].map((s) => <option key={s} value={s}>{s} seconds</option>)}</select></div>
              </div>
              <p className="nst-wcc-note">Hero colors follow the active storefront palette (Global → Colors & font). Layout and size are fixed by the storefront design.</p>
            </>}

            {/* ---- PROMO TICKER ---- */}
            {selectedKind === 'ticker' && rightTab === 'content' && <>
              <div className="nst-wcc-pair"><span>Show ticker</span><Switch checked={ticker.enabled !== false} onChange={(value) => updateTicker({ enabled:value })} label="Ticker enabled"/></div>
              <WField label="Label (left badge)" hint="Leave empty to hide the badge."><input value={selected.content?.label ?? ''} onChange={(event) => updateNested('content',{ label:event.target.value })}/></WField>
              <div className="nst-wcc-group"><h3>Items <em>{ticker.items.length}</em></h3>
                {ticker.items.map((item, index) => <div key={item.id || index} className="nst-wcc-item">
                  <div className="nst-wcc-item__head">
                    <select value={item.icon || 'tag'} onChange={(event) => updateTickerItem(index,{ icon:event.target.value })} aria-label="Icon">{TICKER_ICON_OPTIONS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
                    <Switch checked={item.enabled !== false} onChange={(value) => updateTickerItem(index,{ enabled:value })} label="Show item"/>
                    <button type="button" className="nst-wcc-iconbtn is-sm" onClick={() => moveTickerItem(index, index - 1)} disabled={index === 0} aria-label="Move up"><ArrowUp size={14}/></button>
                    <button type="button" className="nst-wcc-iconbtn is-sm" onClick={() => moveTickerItem(index, index + 1)} disabled={index === ticker.items.length - 1} aria-label="Move down"><ArrowDown size={14}/></button>
                    <button type="button" className="nst-wcc-iconbtn is-sm is-danger" onClick={() => updateTicker({ items:ticker.items.filter((_, i) => i !== index) })} aria-label="Delete item"><Trash2 size={14}/></button>
                  </div>
                  <input value={item.text || ''} onChange={(event) => updateTickerItem(index,{ text:event.target.value })} placeholder="Text, e.g. Free delivery over ৳2,000"/>
                  <input value={item.link || ''} onChange={(event) => updateTickerItem(index,{ link:event.target.value })} placeholder="Optional link, e.g. /offers"/>
                </div>)}
                <button type="button" className="nst-wcc-btn is-block" onClick={() => updateTicker({ items:[...ticker.items, { id:`t-${Date.now()}`, icon:'tag', text:'', link:'', enabled:true }] })}><Plus size={15}/>Add item</button>
              </div>
            </>}
            {selectedKind === 'ticker' && rightTab === 'design' && <>
              <div className="nst-wcc-pair"><span>Speed</span><select value={ticker.speed || 30} onChange={(event) => updateTicker({ speed:Number(event.target.value) })}><option value={45}>Slow</option><option value={30}>Normal</option><option value={18}>Fast</option></select></div>
              <div className="nst-wcc-pair"><span>Pause on hover</span><Switch checked={ticker.pauseOnHover !== false} onChange={(value) => updateTicker({ pauseOnHover:value })} label="Pause on hover"/></div>
              <p className="nst-wcc-note">Ticker colors follow the active storefront palette automatically. Placement: directly below the Hero (move it with the section list).</p>
            </>}

            {selectedKind === 'text' && rightTab === 'content' && <TextBlockFields section={selected} onContent={(patch) => updateNested('content', patch)}/>}
            {selectedKind === 'code' && rightTab === 'content' && <CustomCodeContentFields section={selected} onCode={(patch) => updateNested('code', patch)}/>}
            {selectedKind === 'code' && rightTab === 'design' && <CustomCodeDesignFields section={selected} onCode={(patch) => updateNested('code', patch)} Switch={Switch}/>}
            {/* ---- CATALOG SECTIONS (title is really rendered) ---- */}
            {!isHome && selectedKind && selectedKind !== 'footer' && rightTab === 'content' && <div className="nst-wcc-pair"><span>Position on page</span><select value={selected.placement === 'bottom' ? 'bottom' : 'top'} onChange={(event) => updateSelected({ placement:event.target.value })}><option value="top">Top of page</option><option value="bottom">Bottom of page</option></select></div>}
            {['categories','deals','brands','products','blog'].includes(selectedKind) && rightTab === 'content' && <>
              <WField label="Section heading" hint="Shown above this section on the website."><input value={selected.content?.title || ''} onChange={(event) => updateNested('content',{ title:event.target.value })} placeholder={libraryOfSection(selected)?.label}/></WField>
              <WField label="Short description" hint="Optional line under the heading."><input maxLength={140} value={selected.content?.description || ''} onChange={(event) => updateNested('content',{ description:event.target.value })} placeholder="e.g. Checked devices with warranty"/></WField>
              <div className="nst-wcc-pair"><span>“View All” text</span><input value={selected.content?.viewAllLabel ?? 'View All'} onChange={(event) => updateNested('content',{ viewAllLabel:event.target.value })} placeholder="Empty = hide the link"/></div>
              <div className="nst-wcc-pair"><span>“View All” link</span><input value={selected.content?.viewAllLink || ''} onChange={(event) => updateNested('content',{ viewAllLink:event.target.value })} placeholder="/products"/></div>
              {selectedKind !== 'categories' && <div className="nst-wcc-pair"><span>Items to show</span><select value={Number(selected.data?.limit) || 12} onChange={(event) => updateNested('data',{ limit:Number(event.target.value) })}>{[4,6,8,12,18,24].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>}
              <p className="nst-wcc-note">{selectedKind === 'blog' ? 'Shows the latest published blog articles (Website CMS → Blogs). The section is hidden while no article is published.' : <>{selectedKind === 'products' ? `Shows ${productSourceLabel(selected.type)}, live from the POS.` : 'Products, categories and brands come live from the POS (published products). Deals show discounted products automatically.'} A section with no matching products is hidden on the website.</>}</p>
            </>}
            {['trust','offers'].includes(selectedKind) && rightTab === 'content' && (() => {
              const items = Array.isArray(selected.items) && selected.items.length ? selected.items : null;
              const setItems = (next) => updateSelected({ items:next });
              const updateItem = (index, patch) => setItems(items.map((row, i) => i === index ? { ...row, ...patch } : row));
              const moveItem = (from, to) => { if (to < 0 || to >= items.length) return; const next = [...items]; const [row] = next.splice(from, 1); next.splice(to, 0, row); setItems(next); };
              if (!items) return <>
                <p className="nst-wcc-note">The website shows the standard {selectedKind === 'trust' ? 'promises (authentic, return, delivery, payment, support)' : 'offer links (exchange, EMI, pay later, trade in, NST Care+)'}. Click below to change the text, icons and links.</p>
                <button type="button" className="nst-wcc-btn is-block" onClick={() => setItems(DEFAULT_SECTION_ITEMS[selectedKind].map((row, i) => ({ id:`i-${Date.now()}-${i}`, enabled:true, ...row })))}><Settings2 size={15}/>Edit items</button>
              </>;
              return <div className="nst-wcc-group"><h3>Items <em>{items.length}</em></h3>
                {items.map((item, index) => <div key={item.id || index} className="nst-wcc-item">
                  <div className="nst-wcc-item__head">
                    <select value={item.icon || 'tag'} onChange={(event) => updateItem(index,{ icon:event.target.value })} aria-label="Icon">{ITEM_ICON_OPTIONS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
                    <Switch checked={item.enabled !== false} onChange={(value) => updateItem(index,{ enabled:value })} label="Show item"/>
                    <button type="button" className="nst-wcc-iconbtn is-sm" onClick={() => moveItem(index, index - 1)} disabled={index === 0} aria-label="Move up"><ArrowUp size={14}/></button>
                    <button type="button" className="nst-wcc-iconbtn is-sm" onClick={() => moveItem(index, index + 1)} disabled={index === items.length - 1} aria-label="Move down"><ArrowDown size={14}/></button>
                    <button type="button" className="nst-wcc-iconbtn is-sm is-danger" onClick={() => setItems(items.filter((_, i) => i !== index))} aria-label="Delete item"><Trash2 size={14}/></button>
                  </div>
                  <input value={item.title || ''} onChange={(event) => updateItem(index,{ title:event.target.value })} placeholder="Title, e.g. 7 Days Return"/>
                  <input value={item.text || ''} onChange={(event) => updateItem(index,{ text:event.target.value })} placeholder="Small text, e.g. Easy Return Policy"/>
                  <input value={item.link || ''} onChange={(event) => updateItem(index,{ link:event.target.value })} placeholder="Optional link, e.g. /offers"/>
                </div>)}
                {items.length < 6 && <button type="button" className="nst-wcc-btn is-block" onClick={() => setItems([...items, { id:`i-${Date.now()}`, icon:'tag', title:'', text:'', link:'', enabled:true }])}><Plus size={15}/>Add item</button>}
                <button type="button" className="nst-wcc-btn is-block" onClick={() => { if (window.confirm('Go back to the standard items?')) updateSelected({ items:[] }); }}><RotateCcw size={15}/>Use standard items</button>
              </div>;
            })()}
            {['categories','deals','brands','products','trust','offers','blog'].includes(selectedKind) && rightTab === 'design' && <p className="nst-wcc-note">Colors come from the active storefront palette; layout and spacing are fixed by the storefront design (no fake options).</p>}

            {/* ---- ADVANCED (all) ---- */}
            {rightTab === 'advanced' && <>
              <WField label="Section name (editor only)"><input value={selected.name || ''} onChange={(event) => updateSelected({ name:event.target.value })}/></WField>
              <div className="nst-wcc-kv"><span>Type</span><b>{libraryOfSection(selected)?.label || selected.type}</b></div>
              <div className="nst-wcc-kv"><span>Section ID</span><code>{selected.id}</code></div>
              <p className="nst-wcc-note">Responsive behaviour is automatic (desktop, tablet, mobile). Custom code and scheduling are not supported by the storefront for these sections, so they are not shown.</p>
            </>}
          </div>
        </>}
      </aside>
    </div>

    {addPageOpen && <AddPageDialog pages={draft.pages} onClose={() => setAddPageOpen(false)} onCreate={createCustomPage}/>}

    {/* ---------------- ADD SECTION LIBRARY ---------------- */}
    {libraryOpen && <div className="nst-wcc-modal" role="dialog" aria-modal="true" aria-label="Add section">
      <button type="button" className="nst-wcc-modal__backdrop" onClick={() => setLibraryOpen(false)} aria-label="Close"/>
      <div className="nst-wcc-modal__panel">
        <div className="nst-wcc-panel-head"><h2>Add Section</h2><button type="button" className="nst-wcc-iconbtn" onClick={() => setLibraryOpen(false)} aria-label="Close"><X size={18}/></button></div>
        <p className="nst-wcc-note">Only sections the customer website can really show are listed.</p>
        <div className="nst-wcc-library">
          {SECTION_LIBRARY.map((item) => { const Icon = item.icon; return <button key={item.type} type="button" className="nst-wcc-libcard" onClick={() => addFromLibrary(item.type)}>
            <span className={`nst-wcc-libthumb is-${item.kind}`}><Icon size={22}/><i/><i/><i/></span>
            <b>{item.labelKey ? t(item.labelKey) : item.label}</b><small>{item.helpKey ? t(item.helpKey) : item.help}</small>
          </button>; })}
        </div>
      </div>
    </div>}


    {themeOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4"><div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-widest text-emerald-700">Website look</div><h2 className="text-2xl font-black">Colors and font</h2></div><button type="button" onClick={() => setThemeOpen(false)} className="rounded-xl bg-slate-100 p-2"><X/></button></div><div className="mb-4"><div className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Quick themes</div><div className="flex flex-wrap gap-2">{THEME_PRESETS.map((preset) => <button type="button" key={preset.name} onClick={() => commit({ ...draft, theme:{ ...draft.theme, ...preset }, site:{ ...draft.site, primaryColor:preset.primary } })} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black ${draft.theme.primary === preset.primary ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white'}`}><span className="h-4 w-4 rounded-full" style={{ background:preset.primary }}/>{preset.name}</button>)}</div></div><div className="grid grid-cols-2 gap-3 md:grid-cols-3">{[['primary','Main colour'],['secondary','Dark shade'],['accent','Highlight'],['background','Page background'],['surface','Section background'],['text','Text']].map(([key,label]) => <Field key={key} label={label}><input type="color" className="h-12 w-full rounded-xl" value={draft.theme[key] || defaultTheme[key]} onChange={(event) => commit({ ...draft, theme:{ ...draft.theme, [key]:event.target.value } })}/></Field>)}</div><div className="mt-5 grid gap-3 md:grid-cols-2"><Field label="Website font"><select className={inputClass} value={draft.theme.fontFamily || 'Inter'} onChange={(event) => commit({ ...draft, theme:{ ...draft.theme, fontFamily:event.target.value } })}>{GOOGLE_FONTS.map((font) => <option key={font}>{font}</option>)}</select></Field><div className="grid grid-cols-2 gap-2"><button type="button" onClick={exportTheme} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-black"><Download size={16} className="mr-2 inline"/>Export</button><button type="button" onClick={() => importRef.current?.click()} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-black"><Upload size={16} className="mr-2 inline"/>Import</button><input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => event.target.files?.[0] && importTheme(event.target.files[0])}/></div></div></div></div>}
    {preview && <div className="fixed inset-0 z-50 bg-slate-950/80 p-4"><div className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-3xl bg-white"><div className="flex items-center justify-between border-b p-4"><div><b>Private real-frontend draft preview</b><small className="ml-2 text-slate-500">Customers cannot see this until Publish</small></div><button type="button" onClick={() => setPreview(false)} className="rounded-xl bg-slate-100 p-2"><X/></button></div><div className="flex-1 overflow-auto"><LiveStorefrontFrame frameRef={previewFrameRef} draft={draft} page={page} device={device} title="Private website draft preview"/></div></div></div>}
    {historyOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4"><div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-bold">Version history</h2><p className="text-sm text-slate-500">Restore or delete previous published versions.</p></div><button type="button" onClick={() => setHistoryOpen(false)} className="rounded-xl bg-slate-100 p-2"><X/></button></div>{revisions.length ? <div className="space-y-3">{revisions.map((revision) => <div key={revision.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><b className="block truncate">{revision.label || 'Website version'}</b><small className="text-slate-500">{revision.created_at || ''}{revision.created_by ? ` • ${revision.created_by}` : ''}</small></div><div className="flex gap-2"><button type="button" onClick={() => restoreRevision(revision)} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2.5 text-sm font-bold text-white"><RotateCcw size={16}/>Restore</button><button type="button" onClick={async () => { if (!window.confirm(`Delete version “${revision.label || revision.id}”? This cannot be undone.`)) return; try { await deleteWebsiteBuilderRevision(revision.id); await loadRevisions(); toast.success('Version deleted.'); } catch (error) { toast.error(error?.response?.data?.message || 'Delete failed.'); } }} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white"><Trash2 size={16}/>Delete</button></div></div>)}</div> : <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">No previous published version is available yet.</div>}</div></div>}
    {mediaOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4"><div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl"><div className="mb-4 flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-widest text-emerald-700">Media Library</div><h2 className="text-2xl font-black">Choose an existing image</h2></div><button type="button" onClick={() => setMediaOpen(false)} className="rounded-xl bg-slate-100 p-2"><X/></button></div><div className="flex gap-2"><input value={mediaSearch} onChange={(event) => setMediaSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && loadMedia()} className={inputClass} placeholder="Search by product or file name"/><button type="button" onClick={() => loadMedia()} className="rounded-xl bg-emerald-600 px-4 py-2 font-black text-white"><Search size={17}/></button></div>{mediaLoading ? <div className="grid min-h-52 place-items-center font-bold text-slate-500">Loading images…</div> : mediaItems.length ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">{mediaItems.map((item) => <button type="button" key={item.id || item.image_url} onClick={() => chooseImage(item)} className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left hover:border-emerald-500"><img src={item.thumbnail_url || item.image_url || item.media_url} alt={item.label || item.original_name || 'Media'} className="h-28 w-full bg-slate-100 object-cover"/><span className="block truncate p-2 text-xs font-bold">{item.label || item.original_name || 'Image'}</span></button>)}</div> : <div className="mt-4 rounded-2xl bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">No image was found. You can paste an image link in the editor.</div>}</div></div>}
  </div>, document.body);
}
