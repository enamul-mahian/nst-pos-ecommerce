import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { apiClient, handleApiError } from '../../api/client';
import { Product } from '../../types';
import ProductCard from '../../components/catalog/ProductCard';
import { useI18n } from '../../i18n';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';

type BrandProfile = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  website?: string | null;
  page_settings?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    founded?: string | null;
    headquarters?: string | null;
    meta_title?: string | null;
    meta_description?: string | null;
    show_stats?: boolean;
    show_categories?: boolean;
    show_filters?: boolean;
  };
};

type BrandResponse = {
  brand: BrandProfile;
  stats?: { products?: number; categories?: number };
  products?: Product[];
};

export const BrandPage: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  const [data, setData] = useState<BrandResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mobileFilters, setMobileFilters] = useState(false);
  const [condition, setCondition] = useState('');
  const [category, setCategory] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const { language, t } = useI18n();
  const pageTexts = useWebsiteStore((state) => state.cms?.pageTexts?.brand);
  const text = (key: string, params?: Record<string, string | number>) => {
    const custom = pageTexts?.[language]?.[key];
    if (typeof custom === 'string' && custom.trim() !== '') {
      return custom.replace(/\{(\w+)\}/g, (whole, name) => (params?.[name] === undefined ? whole : String(params[name])));
    }
    return t(`brand.${key}`, params);
  };
  const editorPreview = typeof document !== 'undefined' && Boolean(document.querySelector('[data-nst-editor-preview="true"]'));
  const selectInEditor = (sectionId: string) => (event: React.MouseEvent) => {
    if (!document.querySelector('[data-nst-editor-preview="true"]')) return;
    event.preventDefault();
    event.stopPropagation();
    window.parent?.postMessage({ type: 'NST_WEBSITE_SECTION_SELECTED', pageId: 'brand', sectionId, sectionType: sectionId.replace('-', '_'), brandSlug: slug }, '*');
  };

  useEffect(() => {
    const refresh = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      if (event.data?.type === 'NST_WEBSITE_BRAND_UPDATED') setReloadKey((value) => value + 1);
    };
    window.addEventListener('message', refresh);
    return () => window.removeEventListener('message', refresh);
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await apiClient.get(`/public/brands/${encodeURIComponent(slug)}`, {
          params: { limit: 100 },
        });

        if (active) {
          setData(response.data?.data || null);
        }
      } catch (requestError) {
        if (active) {
          setData(null);
          setError(handleApiError(requestError).message);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    if (slug) void load();
    return () => {
      active = false;
    };
  }, [slug, reloadKey]);

  const brand = data?.brand;
  const settings = brand?.page_settings || {};
  const products = Array.isArray(data?.products) ? data.products : [];
  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category).filter(Boolean))),
    [products],
  );
  const filteredProducts = useMemo(
    () => products.filter((product) => {
      const conditionMatch = !condition || String(product.condition || '').toLowerCase() === condition;
      const categoryMatch = !category || product.category === category;
      return conditionMatch && categoryMatch;
    }),
    [category, condition, products],
  );

  if (loading) {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-7xl place-items-center px-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--nst-primary)] border-t-transparent" />
      </div>
    );
  }

  if (error || !brand) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
        <h1 className="mt-4 text-xl font-black text-slate-800">{text('unavailable_title')}</h1>
        <p className="mt-2 text-sm text-slate-500">{error || text('unavailable_text')}</p>
        <Link to="/brands" className="mt-5 inline-flex rounded-xl bg-[var(--nst-primary)] px-5 py-3 text-sm font-black text-white">
          {text('back_to_brands')}
        </Link>
      </div>
    );
  }

  const primary = settings.primary || '#6d28d9';
  const secondary = settings.secondary || '#4c1d95';
  const accent = settings.accent || '#f59e0b';
  const showFilters = settings.show_filters !== false;
  const showStats = settings.show_stats !== false;

  return (
    <div
      className="min-h-screen bg-[#f8fafc] pb-16"
      style={{
        '--brand-primary': primary,
        '--brand-secondary': secondary,
        '--brand-accent': accent,
      } as React.CSSProperties}
    >
      <Helmet>
        <title>{settings.meta_title || text('meta_title', { brand: brand.name })}</title>
        <meta
          name="description"
          content={settings.meta_description || brand.description || text('meta_description', { brand: brand.name })}
        />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      <div className="border-b border-gray-200 bg-white px-4 py-3 text-xs font-semibold text-gray-500 sm:text-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-1.5">
          <Link to="/">{text('breadcrumb_home')}</Link>
          <ChevronRight className="h-4 w-4 text-gray-300" />
          <Link to="/brands">{text('breadcrumb_brands')}</Link>
          <ChevronRight className="h-4 w-4 text-gray-300" />
          <span className="font-extrabold text-slate-800">{brand.name}</span>
        </div>
      </div>

      <section
        data-nst-section-id="brand-hero"
        onClickCapture={editorPreview ? selectInEditor('brand-hero') : undefined}
        className="mx-auto mt-8 max-w-7xl overflow-hidden rounded-3xl px-6 py-8 text-white shadow-xl sm:px-10"
        style={{
          background: brand.banner_url
            ? `linear-gradient(135deg, ${primary}e8, ${secondary}e8), url("${brand.banner_url}") center/cover`
            : `linear-gradient(135deg, ${primary}, ${secondary})`,
        }}
      >
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="grid h-24 w-24 shrink-0 place-items-center rounded-2xl bg-white p-4 shadow-lg">
              {brand.logo_url ? (
                <img src={brand.logo_url} alt={`${brand.name} logo`} className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-2xl font-black" style={{ color: primary }}>{brand.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[.24em]" style={{ color: accent }}>{text('official_catalog')}</p>
              <h1 className="mt-2 text-3xl font-black sm:text-4xl">{brand.name}</h1>
              {brand.description && <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80">{brand.description}</p>}
              {brand.website && (
                <a href={brand.website} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-bold underline">
                  {text('official_website')}
                </a>
              )}
            </div>
          </div>

          {showStats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={text('stats_products')} value={String(data?.stats?.products ?? products.length)} />
              <Stat label={text('stats_categories')} value={String(data?.stats?.categories ?? categories.length)} />
              <Stat label={text('stats_founded')} value={settings.founded || '—'} />
              <Stat label={text('stats_headquarters')} value={settings.headquarters || '—'} />
            </div>
          )}
        </div>
      </section>

      <section
        data-nst-section-id="brand-texts"
        onClickCapture={editorPreview ? selectInEditor('brand-texts') : undefined}
        className={`mx-auto mt-8 grid max-w-7xl gap-6 px-4 ${showFilters ? 'lg:grid-cols-[260px_1fr]' : ''}`}
      >
        {showFilters && (
          <aside className={`${mobileFilters ? 'block' : 'hidden'} h-max rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:block`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-black text-slate-800">{text('filter_title')}</h2>
              <button type="button" className="text-xs font-bold text-[var(--nst-primary)] lg:hidden" onClick={() => setMobileFilters(false)}>{text('close')}</button>
            </div>

            <label className="block text-xs font-black uppercase text-slate-500">
              {text('condition')}
              <select value={condition} onChange={(event) => setCondition(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-800">
                <option value="">{text('all_conditions')}</option>
                <option value="new">{text('cond_new')}</option>
                <option value="used">{text('cond_used')}</option>
                <option value="pre_owned">{text('cond_pre_owned')}</option>
                <option value="refurbished">{text('cond_refurbished')}</option>
              </select>
            </label>

            {settings.show_categories !== false && (
              <label className="mt-4 block text-xs font-black uppercase text-slate-500">
                {text('category')}
                <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-800">
                  <option value="">{text('all_categories')}</option>
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            )}
          </aside>
        )}

        <div>
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wider" style={{ color: primary }}>{text('catalog_label')}</p>
              <h2 className="mt-1 text-2xl font-black text-slate-800">{text('products_title', { brand: brand.name })}</h2>
              <p className="mt-1 text-sm text-slate-500">{text('products_count', { count: filteredProducts.length })}</p>
            </div>
            {showFilters && (
              <button type="button" onClick={() => setMobileFilters(true)} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-black text-slate-700 lg:hidden">
                <SlidersHorizontal className="h-4 w-4" />
                {text('filters')}
              </button>
            )}
          </div>

          {filteredProducts.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <h3 className="font-black text-slate-800">{text('empty_title')}</h3>
              <p className="mt-2 text-sm text-slate-500">{text('empty_text')}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <span className="min-w-28 rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur">
    <small className="block text-[10px] font-bold uppercase text-white/60">{label}</small>
    <strong className="mt-1 block max-w-36 truncate text-sm font-black">{value}</strong>
  </span>
);

export default BrandPage;
