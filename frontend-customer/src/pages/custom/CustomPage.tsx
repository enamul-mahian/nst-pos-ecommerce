import React, { lazy, Suspense } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';
import { useI18n } from '../../i18n';
import { StorefrontSections } from '../../components/storefront/NstHome';
import { customPageBySlug, localizedField, type SitePage } from '../../cms/sitePages';

const BlogDetailsPage = lazy(() => import('../blog/BlogDetailsPage'));

function CustomPageView({ page }: { page: SitePage }) {
  const { language, t } = useI18n();
  const title = localizedField(page, 'name', language);
  const intro = localizedField(page, 'intro', language);
  return (
    <div data-nst-custom-page={page.id}>
      {page.showHeader !== false ? (
        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto w-full max-w-[1320px] px-3 py-6 sm:px-4 lg:px-6">
            <nav className="flex items-center gap-1.5 text-xs font-medium text-slate-500" aria-label={t('pages.breadcrumb')}>
              <Link to="/" className="hover:text-[var(--nst-primary)]">{t('pages.home')}</Link>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
              <span className="text-slate-800">{title}</span>
            </nav>
            <h1 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">{title}</h1>
            {intro ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{intro}</p> : null}
          </div>
        </div>
      ) : null}
      <StorefrontSections pageId={String(page.id)} placement="top" />
      <StorefrontSections pageId={String(page.id)} placement="bottom" />
    </div>
  );
}

/** One-segment links: a page made in the Website Control Center, otherwise a blog article. */
export default function SlugPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const location = useLocation();
  const cms = useWebsiteStore((state) => state.cms);
  const editorPreview = new URLSearchParams(location.search).get('nst-editor-preview') === '1';
  const page = customPageBySlug(cms, slug);
  if (page && (page.status !== 'draft' || editorPreview)) return <CustomPageView page={page} />;
  return <Suspense fallback={<main className="min-h-[50vh]" aria-busy="true" />}><BlogDetailsPage /></Suspense>;
}
