import React, { lazy, Suspense, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';
import { useCompareStore } from '../../store/compare/useCompareStore';
import { GitCompareArrows } from 'lucide-react';
import TopBar from '../../components/layout/TopBar';
import Header from '../../components/layout/Header';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import MobileBottomNav from '../../components/layout/MobileBottomNav';
import NstTracking from '../../components/layout/NstTracking';
import NstCustomCode from '../../components/layout/NstCustomCode';
import { StorefrontSections } from '../../components/storefront/NstHome';
import PageMeta from '../../components/layout/PageMeta';
import { pageIdForPath } from '../../cms/sitePages';

const LivePurchasePopup = lazy(() => import('../../components/layout/LivePurchasePopup'));

const StorefrontBootstrap = () => (
  <div className="min-h-screen bg-slate-50" aria-busy="true" aria-label="Loading website">
    <div className="h-8 animate-pulse bg-slate-900" />
    <div className="border-b border-violet-950/10 bg-violet-950">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <div className="h-9 w-40 animate-pulse rounded-lg bg-white/15" />
        <div className="h-10 flex-1 animate-pulse rounded-xl bg-white/10" />
        <div className="h-9 w-24 animate-pulse rounded-lg bg-white/10" />
      </div>
    </div>
    <div className="h-12 animate-pulse border-b border-violet-900/10 bg-violet-900" />
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="h-[360px] animate-pulse rounded-3xl bg-violet-100" />
        <div className="grid gap-4">
          <div className="animate-pulse rounded-3xl bg-violet-50" />
          <div className="animate-pulse rounded-3xl bg-amber-50" />
        </div>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="mb-4 h-8 w-56 animate-pulse rounded bg-slate-100" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-64 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
    </main>
  </div>
);

export const PublicLayout: React.FC = () => {
  const cms = useWebsiteStore((state) => state.cms);
  const hasLoaded = useWebsiteStore((state) => state.hasLoaded);
  const isPreviewMode = useWebsiteStore((state) => state.isPreviewMode);
  const fetchCMS = useWebsiteStore((state) => state.fetchCMS);
  const applyPreviewCMS = useWebsiteStore((state) => state.applyPreviewCMS);
  const leavePreviewMode = useWebsiteStore((state) => state.leavePreviewMode);
  const location = useLocation();
  const editorPreview = new URLSearchParams(location.search).get('nst-editor-preview') === '1';
  const compareCount = useCompareStore((state) => state.items.length);
  const pageId = pageIdForPath(cms, location.pathname);
  const sectionPage = pageId.startsWith('page-') ? '' : pageId;

  useEffect(() => {
    if (editorPreview) return;

    if (isPreviewMode) leavePreviewMode();
    fetchCMS().catch(() => undefined);

    const refreshWhenStale = () => {
      const state = useWebsiteStore.getState();
      if (state.isPreviewMode) return;
      if (!state.hasLoaded || Date.now() - state.lastLoadedAt > 60_000) {
        state.fetchCMS({ force: true }).catch(() => undefined);
      }
    };
    const refreshAfterPublish = () => {
      useWebsiteStore.getState().fetchCMS({ force: true }).catch(() => undefined);
    };

    window.addEventListener('focus', refreshWhenStale);
    window.addEventListener('nst-website-published', refreshAfterPublish as EventListener);
    return () => {
      window.removeEventListener('focus', refreshWhenStale);
      window.removeEventListener('nst-website-published', refreshAfterPublish as EventListener);
    };
  }, [editorPreview, isPreviewMode, fetchCMS, leavePreviewMode]);

  useEffect(() => {
    if (!editorPreview) return;

    const receivePreview = (event: MessageEvent) => {
      if (event.source !== window.parent) return; // only the Website Control Center that hosts this preview
      const message = event.data;
      if (!message || message.type !== 'NST_WEBSITE_EDITOR_PREVIEW' || typeof message.content !== 'object') return;
      applyPreviewCMS(message.content);
      // Selected section outline (theme-driven), driven by the editor
      const id = typeof message.selectedSectionId === 'string' ? message.selectedSectionId : '';
      let tag = document.getElementById('nst-editor-selected-style');
      if (!tag) { tag = document.createElement('style'); tag.id = 'nst-editor-selected-style'; document.head.appendChild(tag); }
      tag.textContent = id ? `[data-nst-section-id="${id.replace(/["\\]/g, '')}"]{outline:2px solid var(--nst-primary);outline-offset:3px;border-radius:12px}` : '';
    };

    window.addEventListener('message', receivePreview);
    window.parent?.postMessage({ type: 'NST_WEBSITE_PREVIEW_READY', path: location.pathname }, '*');

    return () => window.removeEventListener('message', receivePreview);
  }, [editorPreview, applyPreviewCMS, location.pathname]);

  if (!hasLoaded) return <StorefrontBootstrap />;

  return (
    <div
      data-nst-editor-preview={editorPreview ? 'true' : 'false'}
      className="flex min-h-screen flex-col overflow-x-hidden bg-slate-50 text-slate-900"
    >
      <TopBar />
      <Header />
      <Navbar />

      <main className="safe-area-bottom flex-grow pb-12 pt-0">
        <NstTracking />
        <NstCustomCode />
        {sectionPage ? <StorefrontSections pageId={sectionPage} placement="top" /> : null}
        <Outlet />
        <PageMeta pageId={pageId} />
        {sectionPage ? <StorefrontSections pageId={sectionPage} placement="bottom" /> : null}
      </main>

      <Link
        to="/compare"
        className="nst-floating-compare"
        aria-label={`Open compare page with ${compareCount} products`}
      >
        <GitCompareArrows className="h-5 w-5" />
        <span>Compare</span>
        <b>{compareCount}</b>
      </Link>

      <Suspense fallback={null}>
        <LivePurchasePopup />
      </Suspense>

      <Footer />
      {/* Spacer so the footer is not hidden behind the phone bottom bar */}
      <div className="h-[calc(4rem+env(safe-area-inset-bottom))] lg:hidden" aria-hidden="true" />
      <MobileBottomNav />
    </div>
  );
};

export default PublicLayout;
