import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import type { BuilderPage, BuilderSite } from '../schema/website.schema';
import DynamicBlockRenderer from './DynamicBlockRenderer';
import DynamicSiteShell from './DynamicSiteShell';

const routeMatches = (route: string, pathname: string): boolean => {
  const normalizedRoute = route === '/' ? '/' : route.replace(/\/$/, '');
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
  if (!normalizedRoute.includes(':')) return normalizedRoute === normalizedPath;
  const expression = normalizedRoute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[^/]+/g, '[^/]+');
  return new RegExp(`^${expression}$`).test(normalizedPath);
};

interface Props {
  website: BuilderSite;
  page?: BuilderPage;
  includeGlobals?: boolean;
}

export default function DynamicPageRenderer({ website, page: providedPage, includeGlobals = true }: Props) {
  const location = useLocation();
  const page = useMemo(
    () => providedPage || website.pages.find((candidate) => routeMatches(candidate.route, location.pathname)),
    [providedPage, website.pages, location.pathname],
  );
  if (!page) return null;

  const body = (
    <>
      <Helmet>
        {page.seo?.title ? <title>{page.seo.title}</title> : null}
        {page.seo?.description ? <meta name="description" content={page.seo.description} /> : null}
        {page.seo?.canonicalUrl ? <link rel="canonical" href={page.seo.canonicalUrl} /> : null}
        {page.seo?.robots ? <meta name="robots" content={page.seo.robots} /> : null}
      </Helmet>
      <div data-page-id={page.id} data-page-template={page.template || undefined}>
        <DynamicBlockRenderer blocks={page.blocks} />
      </div>
    </>
  );

  return includeGlobals ? <DynamicSiteShell website={website}>{body}</DynamicSiteShell> : body;
}
