import { create } from 'zustand';
import { apiClient, handleApiError } from '../../api/client';
import { WebsiteCMS } from '../../types';

// ==========================================
// 1. CMS Store Interface Definitions
// ==========================================
interface WebsiteState {
  cms: WebsiteCMS | null;
  isLoading: boolean;
  error: string | null;
  hasLoaded: boolean;
  isPreviewMode: boolean;

  // Actions
  fetchCMS: (options?: { force?: boolean }) => Promise<WebsiteCMS>;
  applyPreviewCMS: (payload: unknown) => WebsiteCMS;
  leavePreviewMode: () => void;
  lastLoadedAt: number;
}

// ==========================================
// 2. Safe Initial Default Content Fallback
// ==========================================
// Aligned with customized navigation menu requirements (Login, Services & Reviews completely removed)
const defaultCMSContent = (): WebsiteCMS => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  site: {
    name: 'New Singapur Telecom',
    shortName: 'NST',
    adminName: 'NST POS',
    tagline: 'Premium mobile, gadget and telecom shopping experience',
    logoText: 'NST',
    logoUrl: '',
    mobileLogoUrl: '',
    faviconUrl: '',
    primaryColor: '#6d28d9',
    contactPhone: '+880 1XXX-XXXXXX',
    whatsappPhone: '',
    headerPhoneLabel: 'Call Now',
    headerWhatsAppLabel: 'WhatsApp',
  },
  seo: {
    title: 'New Singapur Telecom | Premium Mobile & Gadget Store',
    description: 'Shop new, used, pre-owned and premium gadgets from New Singapur Telecom with warranty, EMI, preorder and trusted service support.',
    ogImage: '',
  },
  header: {
    loginText: 'Login',
    buttonLabel: 'Shop Now',
    buttonPath: '/products',
    buttonEnabled: false,
    links: [
      { label: 'Home', path: '/', enabled: true, order: 1 },
      { label: 'Brands', path: '/brands', enabled: true, order: 2 },
      { label: 'Products', path: '/products', enabled: true, order: 3 },
      { label: 'Offers', path: '/offers', enabled: true, order: 4 },
      { label: 'Blog', path: '/blog', enabled: true, order: 5 },
      { label: 'Contact', path: '/contact', enabled: true, order: 6 },
    ],
    topLinks: [
      { label: 'Blog', path: '/blog', enabled: true, order: 1 },
      { label: 'EMI Policy', path: '/emi-calculator', enabled: true, order: 2 },
      { label: 'Order Tracking', path: '/management', enabled: true, order: 3 },
      { label: 'Store Location', path: '/contact', enabled: true, order: 4 },
    ],
    categoryLinks: [
      { label: 'Phones & Tablets', path: '/products?category=phones-tablets', enabled: true, order: 1 },
      { label: 'Audio & Headsets', path: '/products?category=audio-headsets', enabled: true, order: 2 },
      { label: 'Smart Watch', path: '/products?category=smart-watch', enabled: true, order: 3 },
      { label: 'Accessories', path: '/products?category=accessories', enabled: true, order: 4 },
    ],
  },
  footer: {
    enabled: true,
    logoUrl: '',
    logoText: 'NST',
    brandName: 'New Singapur Telecom',
    tagline: 'Premium mobile, gadget and telecom shopping experience',
    description: 'Trusted mobile phones, gadgets, accessories, EMI, preorder and after-sales support in one premium shopping experience.',
    columns: [
      {
        title: 'Explore',
        enabled: true,
        order: 1,
        links: [
          { label: 'Products', path: '/products', enabled: true, order: 1 },
          { label: 'Brands', path: '/brands', enabled: true, order: 2 },
          { label: 'Offers', path: '/offers', enabled: true, order: 3 },
          { label: 'Blog', path: '/blog', enabled: true, order: 4 },
        ],
      },
      {
        title: 'Customer Care',
        enabled: true,
        order: 2,
        links: [
          { label: 'Contact Us', path: '/contact', enabled: true, order: 1 },
          { label: 'EMI Calculator', path: '/emi-calculator', enabled: true, order: 2 },
          { label: 'IMEI Check', path: '/imei-check', enabled: true, order: 3 },
          { label: 'Customer Login', path: '/management', enabled: true, order: 4 },
        ],
      },
    ],
    address: '',
    email: '',
    phone: '',
    whatsapp: '',
    facebook: '',
    youtube: '',
    copyright: '',
    bottomText: 'Secure shopping • Authentic products • Customer-first support',
    showTrustBadge: true,
    trustBadgeText: 'Trusted & verified merchant',
    newsletter: {
      enabled: false,
      title: 'Stay Updated',
      text: 'Get product news, offers and preorder updates.',
      placeholder: 'Email address',
      buttonLabel: 'Subscribe',
    },
    badges: ['Cash on Delivery', 'bKash Agent', 'Nagad Agent', 'Nationwide Delivery'],
    backgroundStyle: 'solid',
    layout: 'classic',
    backgroundColor: '',
    surfaceColor: '',
    textColor: '',
    headingColor: '',
    accentColor: '',
    borderColor: '',
    maxWidth: 'normal',
    contactTitle: 'Contact Us',
    businessHours: '10:00 AM - 10:00 PM (Everyday)',
    showContact: true,
    showSocial: true,
    showPayments: true,
    showAppButtons: true,
    showBackToTop: true,
    instagram: '',
    tiktok: '',
    playStoreLabel: 'Google Play',
    playStoreUrl: '',
    appStoreLabel: 'App Store',
    appStoreUrl: '',
  },
  hero: {
    badge: 'New Singapur Telecom',
    headlinePrefix: ['Explore', 'the'],
    rotatingWords: ['Excellence.', 'Future.', 'Innovation.', 'Possibilities.'],
    subtitle: "Here Budget Can't Stop You to Explore the Excellence.",
    highlight: "Budget Can't Stop You",
    buttons: [
      { label: 'Used Devices', path: '/products?condition=used', variant: 'primary' },
      { label: 'New Devices', path: '/products?condition=new', variant: 'dark' },
    ],
    features: [
      { title: 'Check Your Device', text: 'Verify authenticity', path: '/imei-check' },
      { title: 'EMI', text: '0% interest options', path: '/emi-calculator' },
      { title: 'Pre Order Device', text: 'Latest releases', path: '/management' },
      { title: 'Cash Kist', text: 'Easy installments' },
    ],
    visualTitle: 'Premium Device Zone',
    visualSubtitle: 'New, used and pre-owned devices with verified support.',
    visualBadges: ['Official Warranty', 'IMEI Verified', 'Fast Delivery'],
  },
  productCard: {
    showOldPrice: true,
    showBadge: true,
    buttonLabel: 'Buy Now',
    cardStyle: 'premium',
  },
  productPage: {
    whyBuy: {
      enabled: true,
      title: 'Why Buy From NST?',
      items: [
        { title: '100% Original & Authentic', subtitle: '', icon: 'shield-check', link: '', enabled: true },
        { title: 'Official Warranty', subtitle: '', icon: 'badge-check', link: '', enabled: true },
        { title: 'Best Price in Bangladesh', subtitle: '', icon: 'tag', link: '', enabled: true },
        { title: 'Customer Support', subtitle: '', icon: 'users', link: '/contact', enabled: true },
        { title: 'Secure Payment & Easy Return', subtitle: '', icon: 'wallet-cards', link: '', enabled: true },
      ],
    },
    emiCard: {
      enabled: true,
      title: 'EMI Starts From',
      buttonLabel: 'Check EMI Plan',
      description: 'Calculated from active bank/provider rules.',
      image: '',
    },
    trustStrip: {
      enabled: true,
      items: [
        { title: '100% Original Product', subtitle: 'Official Warranty', icon: 'shield-check', link: '', enabled: true },
        { title: '7 Days', subtitle: 'Replacement', 'icon': 'refresh-cw', link: '', enabled: true },
        { title: 'Trusted Support', subtitle: '24/7 Customer Service', icon: 'headphones', link: '/contact', enabled: true },
        { title: 'Secure Payment', subtitle: 'bKash, Nagad, Card', icon: 'credit-card', link: '', enabled: true },
      ],
    },
    bottomStats: {
      enabled: true,
      items: [
        { number: 'Verified', title: 'Customer Service', icon: 'users', link: '/contact', enabled: true },
        { number: '100%', title: 'Secure Payment', icon: 'wallet-cards', link: '', enabled: true },
        { number: 'Policy Based', title: 'Return Support', icon: 'refresh-cw', link: '', enabled: true },
        { number: 'Fast Delivery', title: 'Inside Dhaka', icon: 'truck', link: '', enabled: true },
        { number: 'Nationwide', title: 'Delivery Available', icon: 'map-pin', link: '', enabled: true },
        { number: 'Support', title: "We're Here to Help", icon: 'headphones', link: '/contact', enabled: true },
      ],
    },
    usedOptions: { enabled: true, title: 'Used (Pre-Owned) Options', buttonLabel: 'View Used Options' },
    compareSimilar: { enabled: true, title: 'Compare With Similar' },
    share: { enabled: true, title: 'Share this product' },
    googleSearch: { enabled: true, label: 'Search Details in Google', openInNewTab: true },
    compareNewUsed: { enabled: true, title: 'Compare New vs Used', subtitle: 'Save more by comparing with high-quality used devices in similar condition.' },
  },
  googleMap: {
    apiKey: '',
    currentLocationLabel: 'New Singapur Telecom',
    latitude: '',
    longitude: '',
  },
  seoEntities: {
    automaticFaqSchema: true,
    automaticSlugRedirect: true,
    canonicalEnabled: true,
  },
  popup: {
    enabled: true,
    mobileFadeOnly: true,
    desktopDiagonal: true,
    intervalMs: 11500,
    visibleMs: 3300,
    items: [],
  },
  sections: [
    {
      id: 'preorder-now',
      type: 'feature_grid',
      enabled: true,
      eyebrow: 'Future Ready',
      title: 'Pre Order Now!',
      description: 'Collect preorder interest and guide customers to verified device booking.',
      layout: 'three',
      items: [
        { title: 'Upcoming iPhone', subtitle: 'Priority booking with minimum payment', actionLabel: 'Pre Order', actionPath: '/management' },
        { title: 'Flagship Samsung', subtitle: 'Reserve before official arrival', actionLabel: 'Book Now', actionPath: '/management' },
        { title: 'Gaming & Creator Gear', subtitle: 'Laptop, tablet and accessories preorder', actionLabel: 'Explore', actionPath: '/products' },
      ],
    },
    {
      id: 'seo-description',
      type: 'text_block',
      enabled: true,
      eyebrow: 'About New Singapur Telecom',
      title: 'Trusted mobile and gadget shopping destination',
      description: 'New Singapur Telecom provides a premium retail experience for new, used, pre-owned and preorder devices with verification, warranty support, EMI guidance and reliable after-sales service.',
      layout: 'two',
      items: [],
    },
  ],
});

const mergePublishedCMS = (payload: any): WebsiteCMS => {
  const fallback = defaultCMSContent();
  const incoming = payload && typeof payload === 'object' ? payload : {};

  return {
    ...fallback,
    ...incoming,
    site: { ...fallback.site, ...(incoming.site || {}) },
    seo: { ...fallback.seo, ...(incoming.seo || {}) },
    header: { ...fallback.header, ...(incoming.header || {}) },
    footer: {
      ...fallback.footer,
      ...(incoming.footer || {}),
      newsletter: {
        ...fallback.footer.newsletter,
        ...(incoming.footer?.newsletter || {}),
      },
      columns: Array.isArray(incoming.footer?.columns) ? incoming.footer.columns : fallback.footer.columns,
      badges: Array.isArray(incoming.footer?.badges) ? incoming.footer.badges : fallback.footer.badges,
    },
    hero: { ...fallback.hero, ...(incoming.hero || {}) },
    productCard: { ...fallback.productCard, ...(incoming.productCard || {}) },
    productPage: { ...fallback.productPage, ...(incoming.productPage || {}) },
    googleMap: { ...fallback.googleMap, ...(incoming.googleMap || {}) },
    seoEntities: { ...fallback.seoEntities, ...(incoming.seoEntities || {}) },
    popup: { ...fallback.popup, ...(incoming.popup || {}) },
    sections: Array.isArray(incoming.sections) ? incoming.sections : fallback.sections,
  } as WebsiteCMS;
};

const CMS_CACHE_KEY = 'nst-public-cms:v5';
const CMS_STALE_MS = 60_000;
let cmsRequest: Promise<WebsiteCMS> | null = null;

function readCMSCache(): { cms: WebsiteCMS; savedAt: number } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CMS_CACHE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object' || !parsed.cms) return null;
    return { cms: mergePublishedCMS(parsed.cms), savedAt: Number(parsed.savedAt || 0) };
  } catch {
    return null;
  }
}

function writeCMSCache(cms: WebsiteCMS) {
  try { localStorage.setItem(CMS_CACHE_KEY, JSON.stringify({ cms, savedAt: Date.now() })); } catch {}
}

const initialCMSCache = readCMSCache();

// ==========================================
// 3. Zustand Store Implementation
// ==========================================
// Note: Double curried calling create<T>()(...) is required in Zustand v4/v5 to correctly infer types
export const useWebsiteStore = create<WebsiteState>()((set, get) => ({
  cms: initialCMSCache?.cms || null,
  isLoading: !initialCMSCache,
  error: null,
  hasLoaded: Boolean(initialCMSCache),
  isPreviewMode: false,
  lastLoadedAt: initialCMSCache?.savedAt || 0,

  fetchCMS: async (options = {}): Promise<WebsiteCMS> => {
    const current = get();
    if (current.isPreviewMode && !options.force) {
      return current.cms || defaultCMSContent();
    }
    if (!options.force && current.cms && current.hasLoaded && Date.now() - current.lastLoadedAt < CMS_STALE_MS) {
      return current.cms;
    }
    if (cmsRequest) return cmsRequest;

    set({ isLoading: !current.cms, error: null });
    cmsRequest = apiClient.get('/website-builder/published', {
      params: options.force ? { _ts: Date.now() } : undefined,
    }).then((response) => {
      const envelope = response.data;
      // data is the published content itself. Older saves could carry a stale nested "published" copy
      // inside the content, so only unwrap .published when data is not already website content.
      const isContent = (value: any) => value && typeof value === 'object' && (Array.isArray(value.pages) || (value.site && typeof value.site === 'object'));
      const data = envelope?.data;
      const published = isContent(data) ? data : (data?.published || envelope?.published || data || envelope);
      if (!published || typeof published !== 'object') throw new Error('Invalid website configuration payload from server.');
      const publishedCMS = mergePublishedCMS(published);
      writeCMSCache(publishedCMS);
      set({ cms: publishedCMS, isLoading: false, error: null, hasLoaded: true, isPreviewMode: false, lastLoadedAt: Date.now() });
      return publishedCMS;
    }).catch((err: any) => {
      const parsedError = handleApiError(err);
      const cached = readCMSCache();
      if (cached) {
        set({ cms: cached.cms, isLoading: false, error: parsedError.message, hasLoaded: true, lastLoadedAt: cached.savedAt });
        return cached.cms;
      }
      const safeFallback = defaultCMSContent();
      set({ cms: safeFallback, isLoading: false, error: parsedError.message, hasLoaded: true, lastLoadedAt: Date.now() });
      return safeFallback;
    }).finally(() => { cmsRequest = null; });

    return cmsRequest;
  },

  applyPreviewCMS: (payload: unknown): WebsiteCMS => {
    const previewCMS = mergePublishedCMS(payload);
    set({ cms: previewCMS, isLoading: false, error: null, hasLoaded: true, isPreviewMode: true, lastLoadedAt: Date.now() });
    return previewCMS;
  },

  leavePreviewMode: () => {
    const cached = readCMSCache();
    set({
      cms: cached?.cms || null,
      isPreviewMode: false,
      hasLoaded: Boolean(cached),
      isLoading: !cached,
      lastLoadedAt: cached?.savedAt || 0,
    });
  },
}));
// ==========================================
// Site colour theme (Website Control Panel -> "Colors and font")
// ==========================================
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const pickColor = (...values: unknown[]) => values.find((v): v is string => typeof v === 'string' && HEX.test(v.trim()))?.trim();

/** Pushes the published theme into CSS variables so every storefront page follows it. */
export const applySiteTheme = (cms: WebsiteCMS | null | undefined) => {
  if (typeof document === 'undefined') return;
  const theme = ((cms as any)?.theme || (cms as any)?.builder?.theme || {}) as Record<string, string>;
  const root = document.documentElement.style;
  const primary = pickColor(theme.primary, cms?.site?.primaryColor);
  const deep = pickColor(theme.secondary);
  const accent = pickColor(theme.accent);
  primary ? root.setProperty('--nst-primary', primary) : root.removeProperty('--nst-primary');
  deep ? root.setProperty('--nst-primary-deep', deep) : root.removeProperty('--nst-primary-deep');
  accent ? root.setProperty('--nst-accent', accent) : root.removeProperty('--nst-accent');
  if (theme.fontFamily && theme.fontFamily !== 'Inter') root.setProperty('--nst-font', `"${theme.fontFamily}", "Noto Sans Bengali", sans-serif`);
  else root.removeProperty('--nst-font');
};

applySiteTheme(useWebsiteStore.getState().cms);
useWebsiteStore.subscribe((state, previous) => { if (state.cms !== previous.cms) applySiteTheme(state.cms); });
