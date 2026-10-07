import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import DynamicPageRenderer from '../../builder/renderer/DynamicPageRenderer';
import type { BuilderSite } from '../../builder/schema/website.schema';
import { fetchPublishedWebsitePage } from '../../cms/builderClient';
import { apiClient } from '../../api/client';

interface DynamicWebsitePageProps { includeGlobals?: boolean; }
type CmsSection = { component_id?: string; component_type?: string; title?: string; content?: { html?: string; text?: string; [key: string]: unknown } | string; is_visible?: boolean; sort_order?: number; effect_settings?: Record<string, unknown> };
type CmsPage = {
  id?: number; title: string; route: string; content?: { html?: string; text?: string; sections?: CmsSection[] } | string;
  sections?: CmsSection[];
  component_map?: Array<{ component_id?: string; component_type?: string; display_name?: string; editable_fields?: string[] }>;
  cms_preview?: boolean;
  preview_token?: string;
  seo?: { meta_title?: string; meta_description?: string; canonical?: string; robots?: string; featured_image?: string; og?: Record<string, string>; twitter?: Record<string, string>; structured_data?: unknown };
  faq?: Array<{ question?: string; answer?: string; is_visible?: boolean }>;
};
const CMS_NOT_FOUND_ROUTE = '/404';

export default function DynamicWebsitePage({ includeGlobals = true }: DynamicWebsitePageProps) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const previewToken = searchParams.get('preview_token') || '';
  const previewPath = searchParams.get('path') || location.pathname;
  const [website, setWebsite] = useState<BuilderSite | null>(null);
  const [cmsPage, setCmsPage] = useState<CmsPage | null>(null);
  const [state, setState] = useState<'loading' | 'ready-builder' | 'ready-cms' | 'not-found' | 'unavailable'>('loading');

  useEffect(() => {
    let active = true; setState('loading'); setWebsite(null); setCmsPage(null);
    const loadPage = async () => {
      if (previewToken) {
        try {
          const response = await apiClient.get('/public/cms/page', { params: { path: previewPath, preview_token: previewToken, edit_mode: 1 } });
          if (!active) return; setCmsPage(response.data?.data ?? null); setState('ready-cms'); return;
        } catch { if (active) setState('unavailable'); return; }
      }

      try {
        const result = await fetchPublishedWebsitePage(location.pathname);
        if (!active) return; setWebsite(result); setState('ready-builder'); return;
      } catch (error: unknown) {
        const status = typeof error === 'object' && error !== null && 'response' in error ? (error as { response?: { status?: number } }).response?.status : undefined;
        if (status !== 404) { if (active) setState('unavailable'); return; }
      }

      try {
        const response = await apiClient.get('/public/cms/page', { params: { path: location.pathname } });
        if (!active) return; setCmsPage(response.data?.data ?? null); setState('ready-cms'); return;
      } catch (error: unknown) {
        const status = typeof error === 'object' && error !== null && 'response' in error ? (error as { response?: { status?: number } }).response?.status : undefined;
        if (status !== 404 || location.pathname === CMS_NOT_FOUND_ROUTE) { if (active) setState(status === 404 ? 'not-found' : 'unavailable'); return; }
      }

      try {
        const notFoundWebsite = await fetchPublishedWebsitePage(CMS_NOT_FOUND_ROUTE);
        if (!active) return; setWebsite(notFoundWebsite); setState('ready-builder');
      } catch { if (active) setState('not-found'); }
    };
    loadPage(); return () => { active = false; };
  }, [location.pathname, previewPath, previewToken]);

  if (state === 'loading') return <main data-cms-state="loading" aria-busy="true" className="min-h-[50vh]" />;
  if (state === 'ready-builder' && website) return <DynamicPageRenderer website={website} includeGlobals={includeGlobals} />;
  if (state === 'ready-cms' && cmsPage) return <CmsPageRenderer page={cmsPage} />;
  if (state === 'not-found') return <SimplePageFallback title="Page is not published yet" subtitle="This page has no published frontend content. Please go back to the shop homepage." />;
  return <SimplePageFallback title="Page content is not published yet" subtitle="No live CMS content was found for this link. Your main shop pages are still available." />;
}

function SimplePageFallback({ title, subtitle }: { title: string; subtitle: string }) {
  return <main data-cms-state="simple-fallback" className="mx-auto max-w-4xl px-4 py-20 text-center">
    <div className="rounded-3xl border border-emerald-100 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-black text-slate-900">{title}</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">{subtitle}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/" className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-black text-white">Go to Home</Link>
        <Link to="/products" className="rounded-full border border-emerald-100 px-5 py-3 text-sm font-black text-emerald-700">Browse Products</Link>
      </div>
    </div>
  </main>;
}

function CmsPageRenderer({ page }: { page: CmsPage }) {
  const seo = page.seo || {};
  const pageId = String(page.id || page.route || 'cms-page');
  const sections = useMemo<CmsSection[]>(() => {
    if (Array.isArray(page.sections) && page.sections.length) return page.sections;
    if (typeof page.content === 'object' && Array.isArray(page.content?.sections)) return page.content.sections;
    return [{ component_id: 'main-content', component_type: 'rich_text', title: page.title, is_visible: true, content: typeof page.content === 'string' ? { text: page.content } : (page.content || {}) }];
  }, [page]);
  const visibleFaq = (page.faq || []).filter(item => item.is_visible !== false && item.question && item.answer);
  return <main className="mx-auto w-full max-w-5xl px-4 py-10" data-cms-page-id={pageId} data-cms-route={page.route} data-cms-preview-token={page.preview_token || ''} data-cms-preview={page.cms_preview ? 'true' : 'false'}>
    <Helmet><title>{seo.meta_title || page.title}</title>{seo.meta_description && <meta name="description" content={seo.meta_description}/>}<meta name="robots" content={seo.robots || 'index,follow'}/>{seo.canonical && <link rel="canonical" href={seo.canonical}/>} {seo.featured_image && <meta property="og:image" content={seo.featured_image}/>} {seo.structured_data && <script type="application/ld+json">{JSON.stringify(seo.structured_data)}</script>}</Helmet>
    {page.cms_preview && <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">Preview mode: this draft is isolated and not publicly published.</div>}
    <article className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-10" data-cms-component-id="page-shell" data-cms-component-type="page" data-cms-editable-field="title">
      <h1 className="text-3xl font-black text-slate-900 sm:text-4xl" data-cms-component-id="page-title" data-cms-component-type="text" data-cms-editable-field="title">{page.title}</h1>
      <div className="mt-6 space-y-5">{sections.filter(section => section.is_visible !== false).map((section, index) => <CmsSectionRenderer key={section.component_id || index} section={section} index={index}/>)}</div>
    </article>
    {visibleFaq.length > 0 && <section className="mt-8 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-10" data-cms-component-id="faq-section" data-cms-component-type="faq" data-cms-editable-field="faq"><h2 className="text-2xl font-black text-slate-900">Frequently Asked Questions</h2><div className="mt-5 divide-y divide-gray-100">{visibleFaq.map((item,index)=><details key={`${item.question}-${index}`} className="py-4" data-cms-component-id={`faq-${index + 1}`} data-cms-component-type="faq_item" data-cms-editable-field="faq"><summary className="cursor-pointer font-black text-slate-800">{item.question}</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">{item.answer}</p></details>)}</div></section>}
  </main>;
}

function CmsSectionRenderer({ section, index }: { section: CmsSection; index: number }) {
  const content = typeof section.content === 'string' ? { text: section.content } : (section.content || {});
  const html = typeof content.html === 'string' ? content.html : '';
  const text = typeof content.text === 'string' ? content.text : '';
  const componentId = section.component_id || `section-${index + 1}`;
  return <section data-cms-component-id={componentId} data-cms-component-type={section.component_type || 'section'} data-cms-editable-field="content" className="rounded-2xl border border-slate-100 p-5">
    {section.title && <h2 className="text-xl font-black text-slate-900" data-cms-editable-field="title">{section.title}</h2>}
    {html ? <div className="mt-3 text-base leading-8 text-slate-700" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="mt-3 whitespace-pre-wrap text-base leading-8 text-slate-700">{text}</p>}
  </section>;
}
