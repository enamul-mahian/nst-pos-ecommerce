import type { WebsiteCMS } from '../types';

export type SitePage = Record<string, any>;

/** Storefront routes and the Website Control Center page that edits each one (first match wins). */
const SECTION_PAGE_ROUTES: [RegExp, string][] = [
  [/^\/products\/?$/, 'products'],
  [/^\/categories\/?$/, 'categories'],
  [/^\/category\/smartphones\/?$/, 'phones'],
  [/^\/category\/accessories\/?$/, 'accessories'],
  [/^\/category\/[^/]+\/?$/, 'category'],
  [/^\/brands\/?$/, 'brands'],
  [/^\/brand\/[^/]+\/?$/, 'brand'],
  [/^\/product\/[^/]+\/?$/, 'product-details'],
  [/^\/used-products\/?$/, 'used-products'],
  [/^\/preorder\/?$/, 'preorder'],
  [/^\/offers\/?$/, 'offers'],
  [/^\/compare\/?$/, 'compare'],
  [/^\/wishlist\/?$/, 'wishlist'],
  [/^\/search\/?$/, 'search'],
  [/^\/blog\/?$/, 'blog'],
  [/^\/blog\/[^/]+\/?$/, 'blog-post'],
  [/^\/cart\/?$/, 'cart'],
  [/^\/contact\/?$/, 'contact'],
  [/^\/track-order(\/[^/]+)?\/?$/, 'track-order'],
  [/^\/downloads\/?$/, 'downloads'],
  [/^\/emi-calculator\/?$/, 'emi-calculator'],
  [/^\/legal\/[^/]+\/?$/, 'legal'],
];

/** Pages created with "Add page" in the Website Control Center. */
export const customPagesOf = (cms: WebsiteCMS | null | undefined): SitePage[] =>
  (Array.isArray(cms?.pages) ? cms!.pages : []).filter((page) => page && page.custom === true && page.slug);

export const slugOfPage = (page: SitePage) => String(page?.slug || '').replace(/^\/+|\/+$/g, '');

export const customPageBySlug = (cms: WebsiteCMS | null | undefined, slug: string) =>
  customPagesOf(cms).find((page) => slugOfPage(page) === String(slug || '').replace(/^\/+|\/+$/g, ''));

export const pageIdForPath = (cms: WebsiteCMS | null | undefined, pathname: string) => {
  const pages = Array.isArray(cms?.pages) ? cms!.pages : [];
  const hit = SECTION_PAGE_ROUTES.find(([pattern, id]) => pattern.test(pathname) && (!['phones', 'accessories'].includes(id) || pages.some((page) => page?.id === id)));
  if (hit) return hit[1];
  const custom = customPageBySlug(cms, pathname.split('/').filter(Boolean)[0] || '');
  return custom && pathname.split('/').filter(Boolean).length === 1 ? String(custom.id) : '';
};

export const pageById = (cms: WebsiteCMS | null | undefined, id: string) =>
  (Array.isArray(cms?.pages) ? cms!.pages : []).find((page) => page?.id === id);

/** Text saved per language: English on the page itself, other languages in page.i18n[code]. */
export const localizedField = (page: SitePage | undefined, field: string, language: string) => {
  if (!page) return '';
  const own = page.i18n?.[language]?.[field];
  if (typeof own === 'string' && own.trim()) return own;
  const value = field.includes('.') ? field.split('.').reduce((acc: any, key) => acc?.[key], page) : page[field];
  return typeof value === 'string' ? value : '';
};

export const menuPagesOf = (cms: WebsiteCMS | null | undefined, placement: 'header' | 'footer') =>
  customPagesOf(cms)
    .filter((page) => page.status !== 'draft' && (page.menu?.placement === placement || page.menu?.placement === 'both'))
    .sort((a, b) => Number(a.menu?.order || 0) - Number(b.menu?.order || 0));
