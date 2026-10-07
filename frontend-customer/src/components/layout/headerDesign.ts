import { useMemo } from 'react';
import { Bell, Gift, HelpCircle, Info, MapPin, Phone, ShoppingBag, Store, Tag, Truck, type LucideIcon } from 'lucide-react';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';
import type { HeaderDesignConfig, HeaderLinkItem } from '../../types';

export const HEADER_ICONS: Record<string, LucideIcon> = {
  truck: Truck, 'map-pin': MapPin, store: Store, tag: Tag, gift: Gift, phone: Phone, bag: ShoppingBag, help: HelpCircle, info: Info, bell: Bell,
};

export const DEFAULT_TOP_LINKS: HeaderLinkItem[] = [
  { key: 'track_order', path: '/track-order', icon: 'truck', enabled: true },
  { key: 'store_locator', path: '/contact', icon: 'map-pin', enabled: true },
  { key: 'become_seller', path: '/supplier-login', icon: 'store', enabled: true },
  { key: 'offers', path: '/offers', icon: 'tag', enabled: true },
];

export const DEFAULT_NAV_LINKS: HeaderLinkItem[] = [
  { key: 'home', path: '/', enabled: true },
  { key: 'brands', path: '/brands', enabled: true },
  { key: 'phones', path: '/category/smartphones', enabled: true },
  { key: 'accessories', path: '/category/accessories', enabled: true },
  { key: 'used_phones', path: '/used-products', enabled: true },
  { key: 'preorder', path: '/preorder', enabled: true },
  { key: 'offers', path: '/offers', enabled: true, accent: true },
  { key: 'blog', path: '/blog', enabled: true },
  { key: 'support', path: '/contact', enabled: true },
];

export type ResolvedHeaderDesign = Required<Pick<HeaderDesignConfig, 'layout' | 'sticky' | 'logoHeight' | 'mobileLogoHeight' | 'showLogoSubtitle'>> & {
  topBar: NonNullable<HeaderDesignConfig['topBar']> & { links: HeaderLinkItem[] };
  main: NonNullable<HeaderDesignConfig['main']>;
  nav: NonNullable<HeaderDesignConfig['nav']> & { links: HeaderLinkItem[] };
};

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(max, Math.max(min, number)) : fallback;
};

export function resolveHeaderDesign(source?: HeaderDesignConfig | null): ResolvedHeaderDesign {
  const design = source || {};
  const topBar = design.topBar || {};
  const main = design.main || {};
  const nav = design.nav || {};
  return {
    layout: design.layout === 'centered' || design.layout === 'compact' ? design.layout : 'classic',
    sticky: design.sticky !== false,
    logoHeight: clampNumber(design.logoHeight, 24, 96, 44),
    mobileLogoHeight: clampNumber(design.mobileLogoHeight, 20, 64, 32),
    showLogoSubtitle: design.showLogoSubtitle !== false,
    topBar: {
      ...topBar,
      enabled: topBar.enabled !== false,
      showPhone: topBar.showPhone !== false,
      showEmail: topBar.showEmail !== false,
      showLanguage: topBar.showLanguage !== false,
      showCurrency: topBar.showCurrency !== false,
      links: Array.isArray(topBar.links) ? topBar.links : DEFAULT_TOP_LINKS,
    },
    main: {
      ...main,
      searchEnabled: main.searchEnabled !== false,
      showCategorySelect: main.showCategorySelect !== false,
      showCompare: main.showCompare !== false,
      showWishlist: main.showWishlist !== false,
      showCart: main.showCart !== false,
      showAccount: main.showAccount !== false,
    },
    nav: {
      ...nav,
      enabled: nav.enabled !== false,
      showAllCategories: nav.showAllCategories !== false,
      links: Array.isArray(nav.links) ? nav.links : DEFAULT_NAV_LINKS,
    },
  };
}

export function useHeaderDesign() {
  const design = useWebsiteStore((state) => state.cms?.headerDesign);
  return useMemo(() => resolveHeaderDesign(design), [design]);
}

/** Only real colours from the editor are applied; anything else keeps the theme look. */
export const colorOrUndefined = (value?: string) => (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(value || '').trim()) ? String(value).trim() : undefined);

export const isExternalPath = (path: string) => /^(https?:)?\/\//i.test(path) || /^(mailto|tel):/i.test(path);
