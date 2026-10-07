import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, Banknote, ChevronLeft, ChevronRight, CreditCard, Flame, Grid2X2, Headphones, Heart, LayoutGrid,
  MoreHorizontal, Recycle, RefreshCcw, ShieldCheck, Smartphone, Star, Tag, Timer, Truck, Wallet, Zap, Apple, Clock3,
} from 'lucide-react';

import { apiClient } from '../../api/client';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';
import { useWishlistStore } from '../../pages/wishlist/WishlistPage';
import type { Product } from '../../types';
import { BRAND_STYLES, CATEGORY_PRESETS, categoryIcon } from './catalogPresets';
import { PromoTicker, TICKER_ICONS } from './PromoTicker';
import { CustomCodeBlock } from './CustomCodeBlock';
import { useI18n } from '../../i18n';

/* ------------------------------------------------------------------ helpers */

const taka = (v: unknown) => `৳${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;
const imageOf = (p: any): string => p?.image_url || p?.image || p?.images?.[0]?.url || p?.images?.[0]?.image_url || '';
const priceOf = (p: any) => Number(p?.sale_price || p?.price || 0);
const oldPriceOf = (p: any) => Number(p?.old_price || p?.regular_price || p?.market_price || 0);
const discountOf = (p: any) => { const o = oldPriceOf(p), n = priceOf(p); return o > n && n > 0 ? Math.round(((o - n) / o) * 100) : 0; };
const productPath = (p: any) => (p?.slug ? `/product/${encodeURIComponent(p.slug)}` : '/products');
const variantLabel = (p: any) => p?.storage || p?.variants?.[0]?.storage || [p?.ram, p?.storage].filter(Boolean).join('/') || '';
const rowsOf = (payload: any): any[] => [payload?.data?.data, payload?.data, payload].find(Array.isArray) || [];
const isUsed = (p: any) => /used|pre.?owned|refurb/i.test(String(p?.condition || ''));

/* Website Control Center: a real, clickable section in the editor preview */
const SectionBlock: React.FC<{ id: string; kind: string; pageId: string; children: React.ReactNode }> = ({ id, kind, pageId, children }) => {
  if (!children) return null;
  const select = (event: React.MouseEvent) => {
    if (typeof document === 'undefined' || !document.querySelector('[data-nst-editor-preview="true"]')) return;
    event.preventDefault();
    event.stopPropagation();
    window.parent?.postMessage({ type: 'NST_WEBSITE_SECTION_SELECTED', pageId, sectionId: id, sectionType: kind }, '*');
  };
  return <div data-nst-section-id={id} data-nst-section-kind={kind} onClickCapture={select}>{children}</div>;
};

/* Text Block section: heading + paragraphs, per language (English on the section, others in content.i18n[code]). */
const TextBlock: React.FC<{ section: any; language: string }> = ({ section, language }) => {
  const content = section?.content || {};
  const own = content.i18n?.[language] || {};
  const title = String(own.title || content.title || '').trim();
  const body = String(own.body || content.body || '').trim();
  if (!title && !body) return null;
  const align = content.align === 'center' ? 'text-center' : 'text-left';
  return (
    <Container className="mt-5">
      <div className={`rounded-xl border border-slate-200 bg-white p-5 sm:p-7 ${align}`}>
        {title ? <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h2> : null}
        {body ? body.split(/\n{2,}/).map((para, index) => <p key={index} className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600 sm:text-[15px]">{para}</p>) : null}
      </div>
    </Container>
  );
};

const Container: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`mx-auto w-full max-w-[1320px] px-3 sm:px-4 lg:px-6 ${className}`}>{children}</div>
);

const SectionHead: React.FC<{ title: string; to?: string; label?: string; subtitle?: string; children?: React.ReactNode }> = ({ title, to, label, subtitle, children }) => (
  <div className="mb-3 flex items-center justify-between gap-3">
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-3">
        <h2 className="text-[15px] font-bold text-slate-900 sm:text-lg">{title}</h2>
        {children}
      </div>
      {subtitle ? <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 sm:text-[13px]">{subtitle}</p> : null}
    </div>
    {to && label !== '' && <Link to={to} className="shrink-0 text-xs font-semibold text-[var(--nst-primary)] hover:underline">{label || 'View All'}</Link>}
  </div>
);

/** Neutral device illustration used only when neither the CMS nor the product has an image. */
const DeviceArt: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 120 220" className={className} aria-hidden="true">
    <defs><linearGradient id="nst-dev" x1="0" x2="1"><stop offset="0" stopColor="#d4d4d8" /><stop offset=".5" stopColor="#f4f4f5" /><stop offset="1" stopColor="#a1a1aa" /></linearGradient></defs>
    <rect x="6" y="4" width="108" height="212" rx="20" fill="url(#nst-dev)" stroke="#71717a" strokeWidth="2" />
    <rect x="14" y="12" width="92" height="196" rx="14" fill="#18181b" />
    <circle cx="36" cy="38" r="12" fill="#27272a" stroke="#52525b" strokeWidth="3" /><circle cx="36" cy="66" r="12" fill="#27272a" stroke="#52525b" strokeWidth="3" />
    <circle cx="62" cy="52" r="12" fill="#27272a" stroke="#52525b" strokeWidth="3" />
  </svg>
);

const ProductImage: React.FC<{ product: any; className?: string }> = ({ product, className = '' }) => {
  const [failed, setFailed] = useState(false);
  const src = imageOf(product);
  return src && !failed
    ? <img src={src} alt={product?.name || ''} loading="lazy" onError={() => setFailed(true)} className={`object-contain ${className}`} />
    : <DeviceArt className={className} />;
};

/* ------------------------------------------------------------------ data */

function useStorefrontData(enabled = true) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    Promise.allSettled([
      apiClient.get('/public/products', { params: { limit: 48 } }),
      apiClient.get('/public/categories'),
      apiClient.get('/public/brands'),
    ]).then(([p, c, b]) => {
      if (!alive) return;
      if (p.status === 'fulfilled') setProducts(rowsOf(p.value.data));
      if (c.status === 'fulfilled') setCategories(rowsOf(c.value.data));
      if (b.status === 'fulfilled') setBrands(rowsOf(b.value.data));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [enabled]);

  return { products, categories, brands, loading };
}

function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => { const end = new Date(); end.setHours(23, 59, 59, 999); setLeft(Math.max(0, end.getTime() - Date.now())); };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  const s = Math.floor(left / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0'));
}

/* ------------------------------------------------------------------ hero */

interface Slide { eyebrow: string; title: string; subtitle: string; note?: string; image?: string; product?: any; link: string; button: string; secondaryButton?: string; secondaryLink?: string }

/* The Website Control Center saves its pages at cms.pages. Old content can still carry a legacy
   cms.builder.pages tree (default "home-hero", "home-deals"...): it must never hide the editor's pages. */
const homePageOf = (cms: any) => {
  const isHome = (p: any) => p && (p.slug === '/' || p.id === 'home');
  const editorHome = (Array.isArray(cms?.pages) ? cms.pages : []).find(isHome);
  if (editorHome) return editorHome;
  return (Array.isArray(cms?.builder?.pages) ? cms.builder.pages : []).find(isHome);
};
const pageOf = (cms: any, pageId: string) => (pageId === 'home'
  ? homePageOf(cms)
  : (Array.isArray(cms?.pages) ? cms.pages : []).find((p: any) => p && p.id === pageId));
const sectionsOf = (page: any): any[] => (page?.blocks || page?.sections || []).filter((s: any) => s && typeof s === 'object');
const heroSectionOf = (sections: any[]) => sections.find((s: any) => /slider|hero/i.test(String(s?.type)));

const sectionSlides = (section: any): Slide[] => {
  return (section?.slides || [])
    .filter((s: any) => s && (s.title || s.image) && s.enabled !== false)
    .map((s: any) => ({
      eyebrow: s.eyebrow || s.badge || '', title: s.title || '', subtitle: s.subtitle || '', note: s.description || '', image: s.image,
      link: s.buttonLink || '/products', button: s.buttonLabel || 'Shop Now',
      secondaryButton: s.secondaryEnabled ? (s.secondaryLabel || '') : '', secondaryLink: s.secondaryLink || '',
    }));
};

/* Website Control Center section types -> storefront blocks this renderer really supports */
export const HOME_BLOCK_OF_TYPE = (type: unknown): string => {
  const t = String(type || '').toLowerCase();
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

/** Which products a "products" section lists, from its type (Used Products, Pre Order Now, Trending...). */
export const PRODUCT_SOURCE_OF_TYPE = (type: unknown): 'used' | 'preorder' | 'gadgets' | 'trending' | 'top-brands' | 'new' => {
  const t = String(type || '').toLowerCase();
  if (/used/.test(t)) return 'used';
  if (/pre.?order/.test(t)) return 'preorder';
  if (/gadget|accessor/.test(t)) return 'gadgets';
  if (/trending|best sell/.test(t)) return 'trending';
  if (/top brand/.test(t)) return 'top-brands';
  return 'new';
};
const SOURCE_DEFAULTS: Record<string, { title: string; link: string }> = {
  used: { title: 'Used Phones', link: '/used-products' },
  preorder: { title: 'Pre-Order Now', link: '/preorder' },
  gadgets: { title: 'Gadget Items', link: '/category/accessories' },
  trending: { title: 'Trending Products', link: '/products' },
  'top-brands': { title: 'Top Brand Products', link: '/brands' },
  new: { title: 'Just For You', link: '/products' },
};

/** Editable item lists (Trust & Features, Banner / CTA). Empty -> storefront defaults. */
const sectionItems = <T extends { title: string }>(section: any, fallback: T[]): (T & { link?: string })[] => {
  const rows = Array.isArray(section?.items) ? section.items : [];
  const live = rows.filter((row: any) => row && row.enabled !== false && String(row.title || '').trim());
  if (!live.length) return fallback;
  return live.map((row: any, index: number) => {
    const base: any = fallback[index % fallback.length] || fallback[0];
    return { ...base, icon: ITEM_ICONS[String(row.icon || '')] || base.icon, title: String(row.title), text: String(row.text ?? ''), to: row.link || base.to, link: row.link || '' };
  });
};

const HeroSlider: React.FC<{ slides: Slide[]; autoplay?: boolean; interval?: number }> = ({ slides, autoplay = true, interval = 6 }) => {
  const [index, setIndex] = useState(0);
  const count = slides.length;
  const seconds = Math.min(30, Math.max(2, Number(interval) || 6));
  useEffect(() => {
    if (count < 2 || !autoplay) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), seconds * 1000);
    return () => window.clearInterval(id);
  }, [count, autoplay, seconds]);
  const slide = slides[Math.min(index, count - 1)];
  if (!slide) return null;
  const go = (d: number) => setIndex((i) => (i + d + count) % count);

  return (
    <div className="relative h-[168px] overflow-hidden rounded-xl bg-gradient-to-br from-[color-mix(in_oklab,var(--nst-primary)_14%,white)] via-[var(--nst-primary-soft)] to-[color-mix(in_oklab,var(--nst-primary)_24%,white)] sm:h-[230px] md:h-[300px] lg:h-[340px]">
      <div className="relative z-10 flex h-full max-w-[58%] flex-col justify-center px-4 sm:px-8 md:pl-16 lg:px-16">
        {slide.eyebrow && <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-900 sm:text-sm">{slide.eyebrow}</p>}
        <h2 className="mt-1 text-lg font-bold leading-tight text-slate-900 sm:mt-3 sm:text-3xl lg:text-[40px]">{slide.title}</h2>
        {slide.subtitle && <p className="mt-0.5 text-sm text-slate-800 sm:mt-2 sm:text-xl lg:text-2xl">{slide.subtitle}</p>}
        {slide.note && <p className="mt-3 hidden text-sm text-slate-600 md:block lg:mt-6 lg:text-base">{slide.note}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-5 lg:mt-7">
          <Link to={slide.link} className="inline-flex w-fit items-center rounded-md bg-[var(--nst-primary)] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[var(--nst-primary-deep)] sm:px-5 sm:py-2.5 sm:text-sm">{slide.button}</Link>
          {slide.secondaryButton ? <Link to={slide.secondaryLink || slide.link} className="hidden w-fit items-center rounded-md border border-[color-mix(in_oklab,var(--nst-primary)_35%,white)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--nst-primary-deep)] hover:border-[var(--nst-primary)] sm:inline-flex">{slide.secondaryButton}</Link> : null}
        </div>
      </div>
      <div className="absolute inset-y-0 right-0 flex w-[48%] items-center justify-center p-3 sm:p-6">
        {slide.image
          ? <img src={slide.image} alt={slide.title} className="max-h-full max-w-full object-contain drop-shadow-2xl" />
          : <ProductImage product={slide.product} className="h-[92%] max-w-full drop-shadow-2xl" />}
      </div>
      {count > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} className="absolute left-3 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white text-slate-700 shadow-md hover:text-[var(--nst-primary)] md:grid" aria-label="Previous slide"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => go(1)} className="absolute right-3 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white text-slate-700 shadow-md hover:text-[var(--nst-primary)] md:grid" aria-label="Next slide"><ChevronRight className="h-5 w-5" /></button>
          <div className="absolute bottom-2.5 left-1/2 z-20 flex -translate-x-1/2 gap-1.5 sm:bottom-4">
            {slides.map((_, i) => <button key={i} type="button" onClick={() => setIndex(i)} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-[var(--nst-primary)]' : 'w-1.5 bg-slate-400/60'}`} aria-label={`Slide ${i + 1}`} />)}
          </div>
        </>
      )}
    </div>
  );
};

const PromoCard: React.FC<{ title: string; lines: string[]; highlight?: string; product?: any; to: string }> = ({ title, lines, highlight, product, to }) => (
  <Link to={to} className="group relative flex min-h-[150px] overflow-hidden rounded-xl bg-gradient-to-br from-[color-mix(in_oklab,var(--nst-primary)_14%,white)] to-[color-mix(in_oklab,var(--nst-primary)_24%,white)] p-4 lg:min-h-0 lg:p-5">
    <div className="relative z-10 flex max-w-[60%] flex-col">
      <h3 className="text-base font-bold text-slate-900 lg:text-lg">{title}</h3>
      {lines.map((l) => <p key={l} className="text-xs text-slate-600 lg:text-[13px]">{l}</p>)}
      {highlight && <p className="mt-3 text-xs font-semibold text-slate-800 lg:text-[13px]">{highlight}</p>}
      <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-[var(--nst-primary)] group-hover:gap-2">Shop Now <ArrowRight className="h-3.5 w-3.5" /></span>
    </div>
    <div className="absolute inset-y-2 right-2 flex w-[42%] items-center justify-center">
      <ProductImage product={product} className="max-h-full max-w-full drop-shadow-xl transition group-hover:scale-105" />
    </div>
  </Link>
);

/* ------------------------------------------------------------------ cards */

const DealCard: React.FC<{ product: any; className?: string }> = ({ product, className = '' }) => {
  const addToWishlist = useWishlistStore((s) => s.addItem);
  const wished = useWishlistStore((s) => s.items.some((i) => i.id === product.id));
  const off = discountOf(product);
  const sold = Number(product.sold_count || 0);
  const stock = Number(product.available_quantity ?? product.stock_quantity ?? 0);
  const soldShare = sold > 0 ? Math.min(100, Math.round((sold / (sold + Math.max(stock, 1))) * 100)) : 0;

  return (
    <article className={`group relative flex flex-col rounded-lg border border-slate-200 bg-white p-2.5 transition hover:border-[color-mix(in_oklab,var(--nst-primary)_35%,white)] hover:shadow-lg sm:p-3 ${className}`}>
      {off > 0 && <span className="absolute left-2 top-2 z-10 rounded bg-[var(--nst-accent,var(--nst-primary))] px-1.5 py-0.5 text-[10px] font-bold text-white">-{off}%</span>}
      <button type="button" onClick={() => addToWishlist(product)} className={`absolute right-2 top-2 z-10 hidden rounded-full p-1 sm:block ${wished ? 'text-[var(--nst-accent,var(--nst-primary))]' : 'text-slate-400 hover:text-[var(--nst-accent,var(--nst-primary))]'}`} aria-label="Add to wishlist">
        <Heart className="h-4 w-4" fill={wished ? 'currentColor' : 'none'} />
      </button>
      <Link to={productPath(product)} className="flex flex-1 flex-col">
        <div className="mx-auto mb-2 flex aspect-square w-full items-center justify-center p-1.5 sm:p-3">
          <ProductImage product={product} className="h-full max-h-full w-full transition group-hover:scale-105" />
        </div>
        <h3 className="line-clamp-2 text-[11px] font-medium leading-snug text-slate-800 sm:text-[13px]">{product.name}</h3>
        {variantLabel(product) && <p className="mt-0.5 hidden text-xs text-slate-500 sm:block">{variantLabel(product)}</p>}
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-bold text-[var(--nst-accent,var(--nst-primary))] sm:text-[15px]">{taka(priceOf(product))}</span>
          {off > 0 && <del className="text-[10px] text-slate-400 sm:text-xs">{taka(oldPriceOf(product))}</del>}
        </div>
        {sold > 0 && (
          <div className="mt-2 hidden sm:block">
            <p className="text-[11px] text-slate-500">Sold: {sold}</p>
            <div className="mt-1 h-1.5 rounded-full bg-[color-mix(in_oklab,var(--nst-accent,var(--nst-primary))_16%,white)]"><div className="h-full rounded-full bg-[var(--nst-accent,var(--nst-primary))]" style={{ width: `${Math.max(8, soldShare)}%` }} /></div>
          </div>
        )}
      </Link>
    </article>
  );
};

/* ------------------------------------------------------------------ page */

const ITEM_ICONS: Record<string, any> = {
  ...TICKER_ICONS, badge: BadgeCheck, refresh: RefreshCcw, headphones: Headphones, recycle: Recycle, banknote: Banknote, wallet: Wallet, phone: Smartphone,
};

const TRUST = [
  { icon: BadgeCheck, title: '100% Authentic', text: 'Official Warranty' },
  { icon: RefreshCcw, title: '7 Days Return', text: 'Easy Return Policy' },
  { icon: Truck, title: 'Fast Delivery', text: 'All Over Bangladesh' },
  { icon: CreditCard, title: 'Secure Payment', text: '100% Secure Checkout' },
  { icon: Headphones, title: '24/7 Support', text: "We're Here to Help" },
];

const OFFERS = [
  { icon: Recycle, title: 'Exchange Offer', text: 'Upgrade your old phone', to: '/used-products' },
  { icon: Banknote, title: 'EMI Available', text: '0% Interest Options', to: '/emi-calculator' },
  { icon: Wallet, title: 'Buy Now Pay Later', text: 'Flexible Payments', to: '/emi-calculator' },
  { icon: RefreshCcw, title: 'Trade In', text: 'Best Value for Your Old Phone', to: '/used-products' },
  { icon: ShieldCheck, title: 'NST Care+', text: 'Extended Warranty', to: '/contact' },
];

const QUICK = [
  { icon: LayoutGrid, label: 'Categories', to: '/categories', tone: 'text-[var(--nst-primary)] bg-[var(--nst-primary-soft)]' },
  { icon: Smartphone, label: 'Phones', to: '/category/smartphones', tone: 'text-slate-800 bg-slate-100' },
  { icon: Headphones, label: 'Accessories', to: '/category/accessories', tone: 'text-slate-800 bg-slate-100' },
  { icon: Recycle, label: 'Used Phones', to: '/used-products', tone: 'text-emerald-600 bg-emerald-50' },
  { icon: Timer, label: 'Pre-Order', to: '/preorder', tone: 'text-orange-500 bg-orange-50' },
  { icon: Apple, label: 'Brands', to: '/brands', tone: 'text-slate-900 bg-slate-100' },
  { icon: Tag, label: 'Offers', to: '/offers', tone: 'text-[var(--nst-accent,var(--nst-primary))] bg-[color-mix(in_oklab,var(--nst-accent,var(--nst-primary))_10%,white)]' },
  { icon: Zap, label: 'Flash Deals', to: '/offers', tone: 'text-[var(--nst-accent,var(--nst-primary))] bg-[color-mix(in_oklab,var(--nst-accent,var(--nst-primary))_10%,white)]' },
  { icon: Star, label: 'Top Rated', to: '/products', tone: 'text-amber-500 bg-amber-50' },
  { icon: MoreHorizontal, label: 'More', to: '/categories', tone: 'text-slate-700 bg-slate-100' },
];

const BrandMark: React.FC<{ brand: any; round?: boolean }> = ({ brand, round }) => {
  const key = String(brand.name || '').toLowerCase().split(' ')[0];
  const style = BRAND_STYLES[key];
  const logo = brand.logo_url || brand.logo || brand.image;
  return (
    <Link to={`/brand/${encodeURIComponent(brand.slug || key)}`} title={brand.name}
      className={`flex shrink-0 items-center justify-center border border-slate-200 bg-white px-3 transition hover:border-[color-mix(in_oklab,var(--nst-primary)_35%,white)] hover:shadow-md ${round ? 'h-14 w-14 rounded-full' : 'h-14 min-w-[120px] flex-1 rounded-lg lg:h-16'}`}>
      {logo
        ? <img src={logo} alt={brand.name} className="max-h-8 max-w-full object-contain" loading="lazy" />
        : <span className={`truncate ${round ? 'text-[10px]' : 'text-base lg:text-xl'}`} style={{ color: style?.color || '#1e1b4b', fontWeight: style?.weight || 700, textTransform: (style?.transform as any) || 'none' }}>{brand.name}</span>}
    </Link>
  );
};

type BlogCard = { id: string | number; slug?: string; path?: string; title: string; summary?: string; imageUrl?: string; category?: string; publishDate?: string; enabled?: boolean };
const blogLink = (blog: BlogCard) => `/${encodeURIComponent(blog.slug || String(blog.path || '').split('/').filter(Boolean).pop() || String(blog.id))}`;

const BlogPostsBlock: React.FC<{ blogs: BlogCard[]; head: { title: string; to?: string; label?: string; subtitle?: string }; limit: number }> = ({ blogs, head, limit }) => {
  if (!blogs.length) return null;
  return (
    <Container className="mt-3 md:mt-8">
      <div className="rounded-xl bg-white p-3 md:p-0">
        <SectionHead {...head} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {blogs.slice(0, limit).map((blog) => (
            <Link key={String(blog.id)} to={blogLink(blog)} className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:border-[color-mix(in_oklab,var(--nst-primary)_35%,white)] hover:shadow-lg">
              <div className="aspect-[16/9] overflow-hidden bg-[var(--nst-primary-soft)]">
                {blog.imageUrl
                  ? <img src={blog.imageUrl} alt={blog.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  : <div className="grid h-full place-items-center text-[var(--nst-primary)]"><LayoutGrid className="h-8 w-8" /></div>}
              </div>
              <div className="flex flex-1 flex-col p-3">
                {blog.category ? <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--nst-primary)]">{blog.category}</span> : null}
                <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">{blog.title}</h3>
                {blog.summary ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{blog.summary}</p> : null}
                {blog.publishDate ? <span className="mt-auto pt-2 text-[11px] text-slate-400">{blog.publishDate}</span> : null}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Container>
  );
};

/**
 * Sections saved for a storefront page in the Website Control Center.
 * Home uses the full layout; other pages show their sections above or below the page content.
 */
export const StorefrontSections: React.FC<{ pageId?: string; placement?: 'top' | 'bottom' }> = ({ pageId = 'home', placement = 'top' }) => {
  const cms = useWebsiteStore((state) => state.cms);
  const isPreviewMode = useWebsiteStore((state) => state.isPreviewMode);
  const isHomePage = pageId === 'home';
  const page = pageOf(cms, pageId);
  const builderSections = sectionsOf(page);
  const pageSections = isHomePage
    ? builderSections
    : builderSections.filter((sec: any) => sec.visible !== false && HOME_BLOCK_OF_TYPE(sec.type) && (sec.placement === 'bottom' ? 'bottom' : 'top') === placement);
  const needsCatalog = isHomePage || pageSections.some((sec: any) => !['ticker', 'trust', 'blog', 'text', 'code'].includes(HOME_BLOCK_OF_TYPE(sec.type)));
  const { products, categories, brands, loading } = useStorefrontData(needsCatalog);
  const [hh, mm, ss] = useCountdown();
  const { language } = useI18n();

  const flash = useMemo(() => {
    const discounted = products.filter((p) => discountOf(p) > 0).sort((a, b) => discountOf(b) - discountOf(a));
    return (discounted.length >= 4 ? discounted : products).slice(0, 12);
  }, [products]);
  const newest = products.filter((p) => !isUsed(p));
  const used = products.filter(isUsed);
  const flagship = [...newest].sort((a, b) => priceOf(b) - priceOf(a))[0];
  const usedSave = Math.max(0, ...used.map(discountOf));

  const slides: Slide[] = useMemo(() => {
    const fromCms = sectionSlides(heroSectionOf(builderSections));
    if (fromCms.length) return fromCms;
    const picks = [...newest].sort((a, b) => priceOf(b) - priceOf(a)).slice(0, 3);
    if (!picks.length) return [{ eyebrow: cms?.site?.shortName || 'NST', title: cms?.site?.name || 'New Singapur Telecom', subtitle: cms?.site?.tagline || 'Smart Devices. Better Deals.', link: '/products', button: 'Shop Now' }];
    return picks.map((p) => ({ eyebrow: String(p.brand || 'NST'), title: p.name, subtitle: p.short_description ? String(p.short_description).slice(0, 60) : `From ${taka(priceOf(p))}`, note: discountOf(p) ? `Save ${discountOf(p)}% today` : 'Official warranty at NST', product: p, link: productPath(p), button: 'Shop Now' }));
  }, [cms, newest]);

  const categoryTiles = (categories.length
    ? categories.slice(0, 7).map((c) => ({ label: c.name, to: `/category/${c.slug}`, image: c.image_url || c.image || c.icon_url }))
    : CATEGORY_PRESETS.slice(0, 7).map((c) => ({ label: c.label, to: `/category/${c.slug}`, image: '' })));

  /* ---- Website Control Center driven layout ----
     layoutVersion >= 2 (saved by the new editor): builder order + visibility + titles.
     Otherwise: the classic storefront order (nothing changes until a new-editor draft is published). */
  const builderControlsLayout = !isHomePage || Number(page?.layoutVersion || 0) >= 2;
  const heroBuilder = heroSectionOf(builderSections);
  const heroSettings = { autoplay: heroBuilder?.slider?.autoplay !== false, interval: Number(heroBuilder?.slider?.interval) || 6 };
  const tickerSection = builderSections.find((sec: any) => HOME_BLOCK_OF_TYPE(sec?.type) === 'ticker');
  const sectionFor = (kind: string) => builderSections.find((sec: any) => HOME_BLOCK_OF_TYPE(sec?.type) === kind);
  /* Heading, description and "View All" come from the section being rendered (each section has its own). */
  const headOf = (kind: string, section: any, fallbackTitle: string, fallbackLink: string) => {
    const sec = builderControlsLayout ? (section || sectionFor(kind)) : null;
    const content = sec?.content || {};
    // Old drafts named sections "Slide 03 — Shop by Category": never show that editor prefix to customers.
    const title = String(content.title || '').replace(/^\s*slide\s*\d+\s*[—–-]\s*/i, '').trim() || fallbackTitle;
    const link = String(content.viewAllLink || '').trim() || fallbackLink;
    const label = content.viewAllLabel === undefined ? 'View All' : String(content.viewAllLabel).trim();
    return { title, to: link, label, subtitle: String(content.description || '').trim() };
  };
  const limitOf = (section: any, fallback: number) => {
    const n = Number(builderControlsLayout ? section?.data?.limit : 0);
    return Number.isFinite(n) && n > 0 ? Math.min(24, Math.round(n)) : fallback;
  };
  const productsFor = (section: any) => {
    const source = PRODUCT_SOURCE_OF_TYPE(section?.type);
    const brandCount = new Map<string, number>();
    newest.forEach((p) => { const b = String(p.brand || ''); if (b) brandCount.set(b, (brandCount.get(b) || 0) + 1); });
    switch (source) {
      case 'used': return used;
      case 'preorder': return products.filter((p: any) => p.allow_preorder || /pre.?order/i.test(String(p.status || '')));
      case 'gadgets': return newest.filter((p: any) => /accessor|gadget|audio|watch|headphone|earbud|charger|power ?bank|cable/i.test(`${p.category || ''} ${p.name || ''}`));
      case 'trending': return [...newest].sort((a: any, b: any) => Number(b.sold_count || 0) - Number(a.sold_count || 0));
      case 'top-brands': return [...newest].sort((a: any, b: any) => (brandCount.get(String(b.brand || '')) || 0) - (brandCount.get(String(a.brand || '')) || 0));
      default: return newest;
    }
  };
  const blogs: BlogCard[] = (Array.isArray((cms as any)?.blogs) ? (cms as any).blogs : []).filter((blog: any) => blog && blog.enabled !== false && blog.title);
  const renderBlock = (kind: string, section?: any): React.ReactNode => {
    if (kind === 'hero' && !isHomePage) {
      const own = sectionSlides(section);
      if (!own.length) return null;
      return <Container className="pt-3 md:pt-4"><HeroSlider slides={own} autoplay={section?.slider?.autoplay !== false} interval={Number(section?.slider?.interval) || 6} /></Container>;
    }
    switch (kind) {
      case 'text': return <TextBlock section={section} language={language} />;
      case 'code': return section ? <CustomCodeBlock section={section} preview={isPreviewMode} /> : null;
      case 'blog': return <BlogPostsBlock blogs={blogs} head={headOf('blog', section, 'Latest From Our Blog', '/blog')} limit={limitOf(section, 4)} />;
      case 'hero': return (<>
<Container className="pt-3 md:pt-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
          <HeroSlider slides={slides} autoplay={heroSettings.autoplay} interval={heroSettings.interval} />
          <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-1 lg:grid-rows-2 lg:gap-4">
            <PromoCard title={flagship?.name || 'Latest Flagships'} lines={[flagship?.brand ? `${flagship.brand} official` : 'Official warranty', flagship ? `From ${taka(priceOf(flagship))}` : 'Reserve before arrival']} product={flagship} to={flagship ? productPath(flagship) : '/preorder'} />
            <PromoCard title="Used Phones" lines={['Best Quality', 'Great Prices']} highlight={usedSave ? `Save up to ${usedSave}%` : 'Verified pre-owned'} product={used[0]} to="/used-products" />
          </div>
        </div>
      </Container></>);
      case 'ticker': return section ? <Container className="mt-3"><PromoTicker section={section} /></Container> : null;
      case 'trust': return (<>
<Container className="mt-4 hidden md:block">
        {(() => { const rows = sectionItems(builderControlsLayout ? section : null, TRUST); return (
        <div className="grid grid-cols-3 gap-y-3 rounded-xl border border-slate-200 bg-white py-3 lg:grid-cols-[repeat(var(--nst-trust-cols),minmax(0,1fr))] lg:divide-x lg:divide-slate-100" style={{ ['--nst-trust-cols' as any]: Math.min(rows.length, 6) }}>
          {rows.map(({ icon: Icon, title, text, link }, index) => {
            const body = (<>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--nst-primary-soft)] text-[var(--nst-primary)]"><Icon className="h-[18px] w-[18px]" /></span>
              <span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-slate-800">{title}</span><span className="block truncate text-[11px] text-slate-500">{text}</span></span>
            </>);
            return link
              ? <Link key={`${title}-${index}`} to={link} className="flex items-center justify-center gap-3 px-2 hover:opacity-80">{body}</Link>
              : <div key={`${title}-${index}`} className="flex items-center justify-center gap-3 px-2">{body}</div>;
          })}
        </div>); })()}
      </Container></>);
      case 'categories': return (<>
<><Container className="mt-3 md:hidden">
        <div className="grid grid-cols-5 gap-y-3 rounded-xl bg-white px-1 py-3">
          {QUICK.map(({ icon: Icon, label, to, tone }) => (
            <Link key={label} to={to} className="flex flex-col items-center gap-1.5 text-center">
              <span className={`grid h-11 w-11 place-items-center rounded-full ${tone}`}><Icon className="h-5 w-5" /></span>
              <span className="text-[10px] leading-tight text-slate-700">{label}</span>
            </Link>
          ))}
        </div>
      </Container>
<Container className="mt-7 hidden md:block">
        <SectionHead {...headOf('categories', section, 'Shop By Category', '/categories')} />
        <div className="grid grid-cols-4 gap-3 lg:grid-cols-8">
          {categoryTiles.map((c) => {
            const Icon = categoryIcon(c.label);
            return (
              <Link key={c.to} to={c.to} className="group flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 pb-3 pt-4 transition hover:border-[color-mix(in_oklab,var(--nst-primary)_35%,white)] hover:shadow-md">
                <span className="grid h-16 w-16 place-items-center">
                  {c.image ? <img src={c.image} alt="" className="max-h-full max-w-full object-contain" loading="lazy" /> : <Icon className="h-11 w-11 text-slate-800 transition group-hover:scale-110 group-hover:text-[var(--nst-primary)]" strokeWidth={1.4} />}
                </span>
                <span className="truncate text-xs font-medium text-slate-700">{c.label}</span>
              </Link>
            );
          })}
          <Link to="/categories" className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 pb-3 pt-4 hover:border-[color-mix(in_oklab,var(--nst-primary)_35%,white)] hover:shadow-md">
            <span className="grid h-16 w-16 place-items-center"><span className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-700"><MoreHorizontal className="h-5 w-5" /></span></span>
            <span className="text-xs font-medium text-slate-700">More</span>
          </Link>
        </div>
      </Container></></>);
      case 'deals': return (<>
{(loading || flash.length > 0) && (
        <Container className="mt-3 md:mt-7">
          <div className="rounded-xl bg-white p-3 md:p-0">
            <SectionHead {...headOf('deals', section, 'Flash Deals', '/offers')}>
              <span className="flex items-center gap-1.5 text-[11px] text-slate-500 sm:text-xs">
                <span className="hidden sm:inline">Ends in</span><Clock3 className="h-3.5 w-3.5 sm:hidden" />
                {[hh, mm, ss].map((v, i) => (
                  <React.Fragment key={i}>{i > 0 && <b className="text-[var(--nst-primary)]">:</b>}<span className="rounded border border-[color-mix(in_oklab,var(--nst-primary)_25%,white)] bg-[var(--nst-primary-soft)] px-1.5 py-0.5 font-semibold tabular-nums text-[var(--nst-primary)]">{v}</span></React.Fragment>
                ))}
              </span>
            </SectionHead>
            {loading ? (
              <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <div key={i} className={`h-56 animate-pulse rounded-lg bg-slate-100 sm:h-72 ${i > 2 ? 'hidden lg:block' : ''}`} />)}</div>
            ) : (
              <div className="-mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:gap-3 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 lg:grid-cols-6">
                {flash.slice(0, limitOf(section, 12)).map((p, i) => <DealCard key={p.id} product={p} className={`w-[31%] shrink-0 snap-start sm:w-[30%] md:w-auto ${i >= 6 ? 'md:hidden' : ''} ${i >= 4 ? 'md:max-lg:hidden' : ''}`} />)}
              </div>
            )}
          </div>
        </Container>
      )}</>);
      case 'offers': return (<>
<><Container className="mt-7 hidden md:block">
        <div className="grid grid-cols-3 gap-y-4 rounded-xl bg-gradient-to-r lg:grid-cols-5 lg:divide-x lg:divide-white/15 from-[var(--nst-primary-deep)] via-[var(--nst-primary-deep)] to-[var(--nst-primary-deep)] py-4 text-white">
          {sectionItems(builderControlsLayout ? section : null, OFFERS).map(({ icon: Icon, title, text, to }, index) => (
            <Link key={`${title}-${index}`} to={to} className="flex items-center justify-center gap-3 px-3 hover:opacity-90">
              <Icon className="h-6 w-6 shrink-0" strokeWidth={1.6} />
              <span className="min-w-0"><span className="block truncate text-[13px] font-semibold">{title}</span><span className="block truncate text-[11px] text-[color-mix(in_oklab,var(--nst-primary)_30%,white)]">{text}</span></span>
            </Link>
          ))}
        </div>
      </Container>
<Container className="mt-3 md:hidden">
        <Link to="/used-products" className="relative flex h-[118px] overflow-hidden rounded-xl bg-gradient-to-br from-[color-mix(in_oklab,var(--nst-primary)_14%,white)] to-[color-mix(in_oklab,var(--nst-primary)_24%,white)] p-4">
          <div className="relative z-10 flex flex-col">
            <p className="text-base font-bold text-slate-900">Used Phones</p>
            <p className="text-xs text-slate-600">Best Quality</p>
            <p className="text-xs font-semibold text-slate-700">{usedSave ? `Save up to ${usedSave}%` : 'Verified pre-owned'}</p>
            <span className="mt-auto w-fit rounded-md bg-[var(--nst-primary-deep)] px-3 py-1 text-[11px] font-semibold text-white">Shop Now</span>
          </div>
          <div className="absolute inset-y-2 right-3 flex w-[45%] items-center justify-center"><ProductImage product={used[0]} className="max-h-full max-w-full drop-shadow-xl" /></div>
        </Link>
      </Container></></>);
      case 'brands': return (<>
{brands.length > 0 && (
        <Container className="mt-3 md:mt-7">
          <div className="rounded-xl bg-white p-3 md:p-0">
            <SectionHead {...headOf('brands', section, 'Top Brands', '/brands')} />
            <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
              {brands.slice(0, limitOf(section, 12)).map((b) => (
                <React.Fragment key={b.id || b.slug || b.name}>
                  <span className="md:hidden"><BrandMark brand={b} round /></span>
                  <span className="hidden min-w-[120px] flex-1 md:flex"><BrandMark brand={b} /></span>
                </React.Fragment>
              ))}
            </div>
          </div>
        </Container>
      )}</>);
      case 'products': {
        const source = PRODUCT_SOURCE_OF_TYPE(section?.type);
        const rows = builderControlsLayout ? productsFor(section) : newest;
        // Classic layout keeps its old rule (only when there are enough products); editor sections show whenever they have products.
        if (builderControlsLayout ? rows.length === 0 : rows.length <= 6) return null;
        const fallback = builderControlsLayout ? SOURCE_DEFAULTS[source] : SOURCE_DEFAULTS.new;
        return (
        <Container className="mt-3 md:mt-8">
          <div className="rounded-xl bg-white p-3 md:p-0">
            <SectionHead {...headOf('products', section, fallback.title, fallback.link)} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-6">
              {rows.slice(0, limitOf(section, 12)).map((p) => <DealCard key={`${source}-${p.id}`} product={p} />)}
            </div>
          </div>
        </Container>);
      }
      default: return null;
    }
  };
  const CLASSIC_ORDER = ['hero', 'ticker', 'trust', 'categories', 'deals', 'offers', 'brands', 'products'];
  const plan: { key: string; kind: string; section?: any }[] = builderControlsLayout
    ? pageSections
        .filter((sec: any) => sec.visible !== false && HOME_BLOCK_OF_TYPE(sec.type))
        .map((sec: any) => ({ key: String(sec.id), kind: HOME_BLOCK_OF_TYPE(sec.type), section: sec }))
    : CLASSIC_ORDER
        .map((kind) => ({ key: kind, kind, section: kind === 'ticker' ? tickerSection : sectionFor(kind) }))
        .filter((item) => item.kind !== 'ticker' || (item.section && item.section.visible !== false));

  if (!isHomePage) {
    if (!plan.length) return null;
    return (
      <div className={placement === 'bottom' ? 'pb-4 pt-2' : 'pb-2'}>
        {plan.map((item) => (
          <SectionBlock key={item.key} id={item.section?.id || item.kind} kind={item.kind} pageId={pageId}>
            {renderBlock(item.kind, item.section)}
          </SectionBlock>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-[var(--nst-primary-soft)] pb-6 md:bg-white">
      {plan.map((item) => (
        <SectionBlock key={item.key} id={item.section?.id || item.kind} kind={item.kind} pageId={pageId}>
          {renderBlock(item.kind, item.section)}
        </SectionBlock>
      ))}

      {!loading && products.length === 0 && (
        <Container className="mt-6">
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            <Grid2X2 className="mx-auto mb-2 h-6 w-6 text-slate-400" />Products will appear here once they are published from the POS.
            <div className="mt-3"><Link to="/categories" className="font-semibold text-[var(--nst-primary)]">Browse categories</Link> <Flame className="inline h-4 w-4 text-[var(--nst-accent,var(--nst-primary))]" /></div>
          </div>
        </Container>
      )}
    </div>
  );
};

export const NstHome: React.FC = () => <StorefrontSections pageId="home" />;

export default NstHome;
