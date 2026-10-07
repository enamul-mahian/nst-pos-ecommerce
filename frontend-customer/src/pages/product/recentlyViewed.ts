/** Recently viewed products, kept in this browser only (no account needed). */
export interface RecentProduct {
  id: number | string;
  slug: string;
  name: string;
  image: string;
  price: number;
  old_price: number;
  condition: string | null;
}

const KEY = 'nst_recently_viewed';
const LIMIT = 12;

export const isUsedProduct = (p: any): boolean =>
  /used|pre.?owned|refurb/i.test(String(p?.condition || ''))
  || (Array.isArray(p?.variants) && p.variants.length > 0 && p.variants.every((v: any) => /used|pre.?owned|refurb/i.test(String(v?.condition || ''))));

export const productImage = (p: any): string => p?.image_url || p?.image || p?.images?.[0]?.url || '/images/product-placeholder.svg';
export const productPrice = (p: any): number => Number(p?.sale_price || p?.price || 0);
export const productOldPrice = (p: any): number => Number(p?.old_price || p?.regular_price || p?.market_price || 0);

export const readRecentlyViewed = (): RecentProduct[] => {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(rows) ? rows.filter((r) => r && r.slug) : [];
  } catch {
    return [];
  }
};

export const rememberProduct = (p: any): void => {
  if (!p?.slug) return;
  const entry: RecentProduct = {
    id: p.id, slug: p.slug, name: p.name, image: productImage(p),
    price: productPrice(p), old_price: productOldPrice(p), condition: isUsedProduct(p) ? 'used' : (p.condition || null),
  };
  try {
    const next = [entry, ...readRecentlyViewed().filter((r) => r.slug !== p.slug)].slice(0, LIMIT);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode / storage full: recently viewed is a convenience only.
  }
};
