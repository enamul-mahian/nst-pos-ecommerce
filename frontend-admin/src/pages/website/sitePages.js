import { LANGUAGES, t as translate } from '../../i18n';

/* Every storefront page: [id, route, group, supports sections]. Routes with :slug use a real sample in the preview. */
export const STOREFRONT_PAGES = [
  ['home', '/', 'shop', true],
  ['products', '/products', 'shop', true],
  ['categories', '/categories', 'shop', true],
  ['category', '/category/:slug', 'shop', true],
  ['phones', '/category/smartphones', 'shop', true],
  ['accessories', '/category/accessories', 'shop', true],
  ['brands', '/brands', 'shop', true],
  ['brand', '/brand/:slug', 'shop', true],
  ['product-details', '/product/:slug', 'shop', true],
  ['used-products', '/used-products', 'shop', true],
  ['preorder', '/preorder', 'shop', true],
  ['offers', '/offers', 'shop', true],
  ['compare', '/compare', 'shop', true],
  ['wishlist', '/wishlist', 'shop', true],
  ['search', '/search', 'shop', true],
  ['cart', '/cart', 'order', true],
  ['checkout', '/checkout', 'order', false],
  ['track-order', '/track-order', 'order', true],
  ['blog', '/blog', 'content', true],
  ['blog-post', '/blog/:slug', 'content', true],
  ['contact', '/contact', 'content', true],
  ['downloads', '/downloads', 'content', true],
  ['emi-calculator', '/emi-calculator', 'content', true],
  ['legal', '/legal/terms', 'content', true],
  ['login', '/login', 'account', false],
  ['register', '/register', 'account', false],
  ['customer-dashboard', '/portal/dashboard', 'account', false],
  ['orders', '/portal/orders', 'account', false],
  ['header', 'global:header', 'global', false],
  ['footer', 'global:footer', 'global', false],
];
export const PAGE_GROUPS = ['shop', 'order', 'content', 'account', 'custom', 'global'];

export const CUSTOM_PAGE_PREFIX = 'page-';
export const isCustomPage = (page) => Boolean(page?.custom) || String(page?.id || '').startsWith(CUSTOM_PAGE_PREFIX);
export const builtInPageName = (id, language) => translate(`wcc_pages.names.${id}`, { defaultValue: id }, language);

/** [id, English name, route] rows used to create missing pages in a draft. */
export const PAGE_DEFINITIONS = STOREFRONT_PAGES.map(([id, route]) => [id, builtInPageName(id, 'en'), route]);
export const SECTION_PAGE_IDS = STOREFRONT_PAGES.filter((row) => row[3]).map((row) => row[0]);
export const pageSupportsSections = (id, pages = []) => SECTION_PAGE_IDS.includes(id) || isCustomPage(pages.find((page) => page.id === id) || { id });

const RESERVED_SLUGS = ['products', 'categories', 'category', 'brands', 'brand', 'product', 'used-products', 'offers', 'blog', 'contact', 'legal', 'search', 'cart', 'compare', 'wishlist', 'preorder', 'track-order', 'apps', 'downloads', 'emi-calculator', '404', 'login', 'register', 'checkout', 'order-success', 'portal', 'supplier', 'supplier-login', 'admin', 'api', 'pos', 'storage', 'sanctum', 'build', 'assets'];
export const slugify = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9ঀ-৿]+/g, '-').replace(/[ঀ-৿]+/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export const slugProblem = (slug, pages, ownId = '') => {
  if (!slug) return 'wcc_pages.errors.slug_required';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return 'wcc_pages.errors.slug_format';
  if (RESERVED_SLUGS.includes(slug)) return 'wcc_pages.errors.slug_reserved';
  if (pages.some((page) => page.id !== ownId && isCustomPage(page) && String(page.slug || '').replace(/^\/+/, '') === slug)) return 'wcc_pages.errors.slug_taken';
  return '';
};

/** Which editor page a storefront path belongs to (used when the preview navigates by itself). */
export const pageIdForPath = (path, pages = []) => {
  const clean = String(path || '/').split('?')[0].replace(/\/+$/, '') || '/';
  if (clean === '/') return 'home';
  const has = (id) => pages.some((page) => page.id === id);
  const rules = [
    [/^\/category\/smartphones$/, 'phones'], [/^\/category\/accessories$/, 'accessories'], [/^\/category\/[^/]+$/, 'category'],
    [/^\/brand\/[^/]+$/, 'brand'], [/^\/product\/[^/]+$/, 'product-details'], [/^\/blog\/[^/]+$/, 'blog-post'], [/^\/legal\/[^/]+$/, 'legal'],
    [/^\/track-order(\/[^/]+)?$/, 'track-order'],
  ];
  const rule = rules.find(([pattern, id]) => pattern.test(clean) && (!['phones', 'accessories'].includes(id) || has(id)));
  if (rule) return rule[1];
  const exact = STOREFRONT_PAGES.find(([, route]) => route === clean);
  if (exact) return exact[0];
  const custom = pages.find((page) => isCustomPage(page) && `/${String(page.slug || '').replace(/^\/+/, '')}` === clean);
  return custom?.id || '';
};

export const otherLanguages = () => LANGUAGES.filter((item) => item.code !== 'en');
export const langField = (page, code, field) => (code === 'en' ? (field.includes('.') ? field.split('.').reduce((acc, key) => acc?.[key], page) : page?.[field]) : page?.i18n?.[code]?.[field]) || '';
export const withLangField = (page, code, field, value) => (code === 'en'
  ? { ...page, [field]: value }
  : { ...page, i18n: { ...(page.i18n || {}), [code]: { ...(page.i18n?.[code] || {}), [field]: value } } });
