import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  BadgeCheck, CalendarClock, ChevronDown, ChevronRight, GitCompareArrows, Heart, MessageCircle, Minus, Plus, RefreshCw,
  Search, ShieldAlert, ShieldCheck, ShoppingCart, Truck, Wallet, Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { apiClient, handleApiError } from '../../api/client';
import { useCartStore } from '../../store/cart/useCartStore';
import { useCompareStore } from '../../store/compare/useCompareStore';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';
import { useWishlistStore } from '../wishlist/WishlistPage';
import { Product, ProductVariant } from '../../types';
import SocialShareBar from '../../components/common/SocialShareBar';
import { inEditorPreview, usePageText } from '../../cms/pageTexts';
import {
  isUsedProduct, productImage, productOldPrice, productPrice, readRecentlyViewed, rememberProduct, type RecentProduct,
} from './recentlyViewed';

const taka = (value: unknown) => `৳${Number(value || 0).toLocaleString('en-IN')}`;
const rowsOf = (payload: any): any[] => [payload?.data?.data, payload?.data, payload].find(Array.isArray) || [];

/** Best-effort swatch colour from a variant colour name ("Titanium Blue" -> a blue). */
const SWATCHES: Array<[RegExp, string]> = [
  [/black|midnight|graphite|phantom|onyx/i, '#1f2937'], [/white|starlight|silver|cream/i, '#f1f5f9'], [/gold|champagne/i, '#e5c07b'],
  [/titanium|natural|grey|gray/i, '#a8a29e'], [/blue|navy|sierra|ocean/i, '#3b82f6'], [/green|mint|alpine|olive/i, '#22c55e'],
  [/burgundy|maroon|wine|cosmic orange/i, '#6b2138'], [/purple|violet|lavender|lilac/i, '#8b5cf6'], [/pink|rose/i, '#f9a8d4'], [/red/i, '#ef4444'], [/glacier|sky|light blue/i, '#8fb3de'], [/yellow/i, '#facc15'],
  [/orange|coral/i, '#fb923c'], [/desert|sand|beige|bronze/i, '#c8a97e'],
];
const swatchOf = (name: string) => SWATCHES.find(([re]) => re.test(name))?.[1] || '#cbd5e1';

const OptionCard: React.FC<{
  label: string; options: string[]; value: string | null; onChange: (value: string) => void; labels?: Record<string, string>; swatch?: boolean;
  wide?: boolean;
}> = ({ label, options, value, onChange, labels = {}, swatch, wide }) => (
  /* Compact option box (Apple Gadgets style): label on top, small pills; two boxes sit side by side. */
  <fieldset className={`min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 sm:px-3.5 sm:py-3 ${wide || options.length > 5 ? 'sm:col-span-2' : ''}`}>
    <legend className="sr-only">{label}</legend>
    <p className="mb-2 truncate text-[13px] font-medium text-slate-800">{label}:{value && <span className="ml-1 font-normal text-slate-500">{labels[value] || value}</span>}</p>
    <div className="flex flex-wrap gap-1.5 sm:gap-2">
      {options.map((option) => {
        const active = value === option;
        return (
          <button key={option} type="button" onClick={() => onChange(option)} aria-pressed={active}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition ${active ? 'border-[var(--nst-primary)] bg-[var(--nst-primary-soft)] text-[var(--nst-primary-dark)]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}>
            {swatch && <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10" style={{ background: swatchOf(option) }} />}
            {labels[option] || option}
          </button>
        );
      })}
    </div>
  </fieldset>
);

/** Compact option line: label on the left, small chips on the right; all lines share one box. */
const OptionRow: React.FC<{
  label: string; options: string[]; value: string | null; onChange: (value: string) => void; labels?: Record<string, string>; swatch?: boolean;
}> = ({ label, options, value, onChange, labels = {}, swatch }) => (
  <fieldset className="flex min-w-0 items-start gap-3 py-2">
    <legend className="sr-only">{label}</legend>
    <span className="w-[84px] shrink-0 pt-[7px] text-[12.5px] font-medium leading-tight text-slate-500 sm:w-24">{label}</span>
    <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
      {options.map((option) => {
        const active = value === option;
        return (
          <button key={option} type="button" onClick={() => onChange(option)} aria-pressed={active}
            className={`inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition ${active ? 'border-[var(--nst-primary)] bg-[var(--nst-primary-soft)] text-[var(--nst-primary-dark)] ring-1 ring-[var(--nst-primary)]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}>
            {swatch && <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10" style={{ background: swatchOf(option) }} />}
            <span className="truncate">{labels[option] || option}</span>
          </button>
        );
      })}
    </div>
  </fieldset>
);

/** Main product image with hover zoom (mouse / pen). Touch devices keep the plain image so scrolling is not blocked. */
const ZoomImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const box = event.currentTarget.getBoundingClientRect();
    setZoom({ x: ((event.clientX - box.left) / box.width) * 100, y: ((event.clientY - box.top) / box.height) * 100 });
  };
  return (
    <div className={`relative h-full w-full overflow-hidden ${zoom ? 'cursor-zoom-in' : ''}`}
      onPointerEnter={move} onPointerMove={move} onPointerLeave={() => setZoom(null)}>
      <img src={src} alt={alt} draggable={false}
        className="h-full w-full select-none object-contain transition-transform duration-150 ease-out"
        style={zoom ? { transform: 'scale(2.2)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined} />
    </div>
  );
};

const MiniProductCard: React.FC<{ item: RecentProduct | Product; compact?: boolean }> = ({ item, compact }) => {
  const price = productPrice(item);
  const old = productOldPrice(item);
  const off = old > price && price > 0 ? old - price : 0;
  return (
    <Link to={`/product/${encodeURIComponent(item.slug)}`} className={`group flex rounded-xl border border-slate-200 bg-white p-3 transition hover:border-violet-300 hover:shadow-md ${compact ? 'items-center gap-3' : 'flex-col'}`}>
      <span className={`grid shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-50 ${compact ? 'h-16 w-16' : 'mb-3 aspect-square w-full'}`}>
        <img src={productImage(item)} alt="" loading="lazy" className="h-full w-full object-contain p-1.5 transition group-hover:scale-105" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[13px] font-medium leading-snug text-slate-800 group-hover:text-[var(--nst-primary)]">{item.name}</span>
        <span className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-bold text-slate-900">{price > 0 ? taka(price) : 'Price on request'}</span>
          {off > 0 && <span className="text-xs text-slate-400 line-through">{taka(old)}</span>}
        </span>
        {off > 0 && <span className="mt-1.5 inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">{taka(off)} OFF</span>}
      </span>
    </Link>
  );
};

type DetailTab = 'specification' | 'description' | 'warranty';

export const ProductDetailsPage: React.FC = () => {
  const addCompareItem = useCompareStore((state) => state.addItem);
  const compareItems = useCompareStore((state) => state.items);
  const wishlistItems = useWishlistStore((state) => state.items);
  const addWishlist = useWishlistStore((state) => state.addItem);
  const removeWishlist = useWishlistStore((state) => state.removeItem);
  const whatsappPhone = useWebsiteStore((state) => (state.cms?.site as any)?.whatsappPhone || (state.cms as any)?.social?.whatsapp || '');
  const pageDesign = useWebsiteStore((state) => state.cms?.productPage?.design);
  const text = usePageText('product-details', 'product');
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const addItemToCart = useCartStore((state) => state.addItem);

  // API State
  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [usedSuggestions, setUsedSuggestions] = useState<Product[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<RecentProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Gallery State
  const [activeImage, setActiveImage] = useState<string>('');

  // Mandatory Option Selection States
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedStorage, setSelectedStorage] = useState<string | null>(null);
  const [selectedSimNetwork, setSelectedSimNetwork] = useState<string | null>(null);
  const [selectedRam, setSelectedRam] = useState<string | null>(null);
  const [selectedCountryRegion, setSelectedCountryRegion] = useState<string | null>(null);
  const [selectedSimType, setSelectedSimType] = useState<string | null>(null);
  const [selectedNetworkCarrier, setSelectedNetworkCarrier] = useState<string | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [detailTab, setDetailTab] = useState<DetailTab>('specification');
  const [specQuery, setSpecQuery] = useState<string>('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Fetch Product Details
  useEffect(() => {
    let isMounted = true;
    const fetchProductDetails = async () => {
      if (!slug) return;
      try {
        setIsLoading(true);
        setError(null);
        setRelatedProducts([]);
        setUsedSuggestions([]);
        const response = await apiClient.get(`/public/products/slug/${slug}`);

        if (isMounted && response.data?.status && response.data?.data) {
          const prod: Product = response.data.data;
          setProduct(prod);
          setActiveImage(prod.image_url || prod.image || prod.images?.[0]?.url || '');
          setRecentlyViewed(readRecentlyViewed().filter((r) => r.slug !== prod.slug));
          rememberProduct(prod);

          // Reset Selections
          setSelectedColor(null);
          setSelectedStorage(null);
          setSelectedSimNetwork(null);
          setSelectedRam(null);
          setSelectedCountryRegion(null);
          setSelectedSimType(null);
          setSelectedNetworkCarrier(null);
          setSelectedCondition(null);
          setSelectedBranchId(null);
          setQuantity(1);
          setDetailTab('specification');
          setOpenFaq(0);

          // Used phone pages: suggest OTHER USED devices closest to this price (never new ones).
          if (isUsedProduct(prod)) {
            const usedOnly = await apiClient.get('/public/products', { params: { condition: 'used', limit: 48 } }).catch(() => null);
            if (!isMounted || !usedOnly) return;
            const base = Number(productPrice(prod)) || 0;
            const near = rowsOf(usedOnly.data)
              .filter((p: Product) => p.id !== prod.id && isUsedProduct(p))
              .sort((a: Product, b: Product) => Math.abs((Number(productPrice(a)) || 0) - base) - Math.abs((Number(productPrice(b)) || 0) - base));
            setUsedSuggestions(near.slice(0, 6));
            return;
          }

          const [relResponse, usedResponse] = await Promise.allSettled([
            apiClient.get('/public/products', { params: { category: prod.category, limit: 8 } }),
            apiClient.get('/public/products', { params: { condition: 'used', limit: 24 } }),
          ]);
          if (!isMounted) return;
          if (relResponse.status === 'fulfilled') {
            setRelatedProducts(rowsOf(relResponse.value.data).filter((p: Product) => p.id !== prod.id && !isUsedProduct(p)).slice(0, 6));
          }
          if (usedResponse.status === 'fulfilled') {
            const used = rowsOf(usedResponse.value.data).filter((p: Product) => p.id !== prod.id && isUsedProduct(p));
            const sameBrand = (p: Product) => String(p.brand || '').toLowerCase() === String(prod.brand || '').toLowerCase();
            setUsedSuggestions([...used.filter(sameBrand), ...used.filter((p) => !sameBrand(p))].slice(0, 6));
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(handleApiError(err).message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchProductDetails();
    return () => {
      isMounted = false;
    };
  }, [slug]);

  // ==========================================
  // 1. Mandatory Selections Analysis
  // ==========================================
  // Extracts unique options dynamically from available variants
  const availableOptions = useMemo(() => {
    if (!product?.variants) return { colors: [], storages: [], sims: [], rams: [], countries: [], simTypes: [], networks: [], conditions: [], branches: [] as Array<{id:number;name:string}> };
    const colors = new Set<string>(); const storages = new Set<string>(); const sims = new Set<string>(); const rams = new Set<string>();
    const countries = new Set<string>(); const simTypes = new Set<string>(); const networks = new Set<string>(); const conditions = new Set<string>();
    const branches = new Map<number,string>();
    product.variants.forEach((v) => {
      if (v.color) colors.add(v.color); if (v.storage) storages.add(v.storage); if (v.sim_network) sims.add(v.sim_network); if (v.ram) rams.add(v.ram);
      if (v.country_region) countries.add(v.country_region); if (v.sim_type) simTypes.add(v.sim_type); if (v.network_carrier) networks.add(v.network_carrier);
      if (v.condition) conditions.add(v.condition); if (v.branch_id) branches.set(v.branch_id, v.branch_name || `Branch #${v.branch_id}`);
    });
    return { colors:[...colors], storages:[...storages], sims:[...sims], rams:[...rams], countries:[...countries], simTypes:[...simTypes], networks:[...networks], conditions:[...conditions], branches:[...branches].map(([id,name]) => ({id,name})) };
  }, [product]);

  const hasStorage = availableOptions.storages.length > 0;
  const hasRam = availableOptions.rams.length > 0;
  const hasColor = availableOptions.colors.length > 0;
  const hasCountry = availableOptions.countries.length > 0;
  const hasSimType = availableOptions.simTypes.length > 0;
  const hasNetwork = availableOptions.networks.length > 0;
  const hasCondition = availableOptions.conditions.length > 0;
  // The product edit page can hide the branch: the shopper then sees only "available" and the best branch is picked automatically.
  const showBranch = (product as any)?.page_options?.show_branch !== false;
  const hasBranch = showBranch && availableOptions.branches.length > 0;

  // A choice with a single value is selected for the shopper.
  useEffect(() => {
    const only = (values: string[]) => (values.length === 1 ? values[0] : null);
    if (only(availableOptions.colors)) setSelectedColor((current) => current ?? only(availableOptions.colors));
    if (only(availableOptions.storages)) setSelectedStorage((current) => current ?? only(availableOptions.storages));
    if (only(availableOptions.rams)) setSelectedRam((current) => current ?? only(availableOptions.rams));
    if (only(availableOptions.countries)) setSelectedCountryRegion((current) => current ?? only(availableOptions.countries));
    if (only(availableOptions.simTypes)) setSelectedSimType((current) => current ?? only(availableOptions.simTypes));
    if (only(availableOptions.networks)) setSelectedNetworkCarrier((current) => current ?? only(availableOptions.networks));
    if (only(availableOptions.conditions)) setSelectedCondition((current) => current ?? only(availableOptions.conditions));
    if (showBranch && availableOptions.branches.length === 1) setSelectedBranchId((current) => current ?? availableOptions.branches[0].id);
  }, [availableOptions, showBranch]);

  // Variant identity order: Storage → RAM → Color → Country/Region → SIM Type → Network/Carrier → Condition → Branch Availability.
  const isAllOptionsSelected = useMemo(() => (
    (!hasStorage || selectedStorage !== null) && (!hasRam || selectedRam !== null) && (!hasColor || selectedColor !== null) &&
    (!hasCountry || selectedCountryRegion !== null) && (!hasSimType || selectedSimType !== null) && (!hasNetwork || selectedNetworkCarrier !== null) &&
    (!hasCondition || selectedCondition !== null) && (!hasBranch || selectedBranchId !== null)
  ), [hasStorage,hasRam,hasColor,hasCountry,hasSimType,hasNetwork,hasCondition,hasBranch,selectedStorage,selectedRam,selectedColor,selectedCountryRegion,selectedSimType,selectedNetworkCarrier,selectedCondition,selectedBranchId]);

  const resolvedVariant = useMemo((): ProductVariant | null => {
    if (!product?.variants || !isAllOptionsSelected) return null;
    const matches = product.variants.filter((v) =>
      (!hasStorage || v.storage === selectedStorage) && (!hasRam || v.ram === selectedRam) && (!hasColor || v.color === selectedColor) &&
      (!hasCountry || v.country_region === selectedCountryRegion) && (!hasSimType || v.sim_type === selectedSimType) &&
      (!hasNetwork || v.network_carrier === selectedNetworkCarrier) && (!hasCondition || v.condition === selectedCondition) &&
      (!hasBranch || Number(v.branch_id) === Number(selectedBranchId))
    );
    // With the branch hidden, the branch holding the most stock serves the order.
    return [...matches].sort((a, b) => Number(b.available_quantity || 0) - Number(a.available_quantity || 0))[0] || null;
  }, [product,isAllOptionsSelected,hasStorage,hasRam,hasColor,hasCountry,hasSimType,hasNetwork,hasCondition,hasBranch,selectedStorage,selectedRam,selectedColor,selectedCountryRegion,selectedSimType,selectedNetworkCarrier,selectedCondition,selectedBranchId]);

  const resolvedInStock = Boolean(resolvedVariant && Number(resolvedVariant.available_quantity || 0) > 0);
  const resolvedCanPreorder = Boolean(resolvedVariant && !resolvedInStock && (resolvedVariant.allow_preorder || product?.allow_preorder));

  const groupedSpecifications = useMemo(() => {
    const groups = product?.specification_groups || [];
    const needle = specQuery.trim().toLowerCase();
    if (!needle) return groups;
    return groups.map((group) => ({
      ...group,
      rows: (group.rows || []).filter((row) => `${group.name} ${row.label} ${row.value}`.toLowerCase().includes(needle)),
    })).filter((group) => group.rows.length > 0);
  }, [product, specQuery]);

  const legacySpecifications = useMemo(() => {
    const raw: any = product?.specifications || [];
    if (Array.isArray(raw)) {
      return raw.map((item: any, index: number) => ({
        label: String(item?.name || item?.label || item?.key || `Specification ${index + 1}`),
        value: String(item?.value ?? ''),
      })).filter((item: any) => (item.label.trim() || item.value.trim()) && !/imei|serial/i.test(item.label));
    }
    if (raw && typeof raw === 'object') {
      return Object.entries(raw).map(([label, value]) => ({ label, value: String(value ?? '') })).filter((item) => !/imei|serial/i.test(item.label));
    }
    return [];
  }, [product]);

  const activeGallery = useMemo(() => {
    if (resolvedVariant?.images?.length) return resolvedVariant.images;
    return product?.images || [];
  }, [resolvedVariant, product]);

  // Update Main Image automatically when Color/Variant is changed (Premium UX)
  useEffect(() => {
    if (resolvedVariant && resolvedVariant.image) {
      setActiveImage(resolvedVariant.image);
    }
  }, [resolvedVariant]);

  // Quick Quantity Controllers
  const incrementQty = () => {
    const maxQty = resolvedVariant ? resolvedVariant.available_quantity : (product?.available_quantity || 10);
    if (quantity < maxQty) setQuantity(quantity + 1);
  };

  const decrementQty = () => {
    if (quantity > 1) setQuantity(quantity - 1);
  };

  // Add to Cart handler
  const handleAddToCart = (showToast = true): boolean => {
    if (!product) return false;
    if (!isAllOptionsSelected) {
      toast.error(text('select_all_options'));
      document.getElementById('nst-product-options')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    if (!resolvedVariant) {
      toast.error(text('config_unavailable'));
      return false;
    }
    const branchId = resolvedVariant.branch_id ? Number(resolvedVariant.branch_id) : selectedBranchId;
    if (!resolvedInStock) {
      if (resolvedCanPreorder) { navigate(`/preorder?product=${product.id}&variant=${resolvedVariant.id}&branch=${branchId || ''}`); return false; }
      toast.error(text('variant_out')); return false;
    }

    addItemToCart(
      product,
      resolvedVariant,
      quantity,
      selectedStorage,
      selectedRam,
      selectedSimNetwork,
      selectedColor,
      selectedCountryRegion,
      selectedSimType,
      selectedNetworkCarrier,
      selectedCondition,
      branchId,
      resolvedVariant?.branch_name || null
    );

    if (showToast) {
      toast.success(text('added_to_cart', { name: [product.name, selectedStorage].filter(Boolean).join(' ') }));
    }
    return true;
  };

  // Buy Now immediate checkout handler
  const handleBuyNow = () => {
    if (handleAddToCart(false)) navigate('/checkout');
  };

  const design = {
    optionStyle: pageDesign?.optionStyle === 'boxes' ? 'boxes' : 'compact',
    galleryRight: pageDesign?.galleryPosition === 'right',
    stickyBar: pageDesign?.mobileStickyBar !== false,
    trustRow: pageDesign?.showTrustRow !== false,
    share: pageDesign?.showShare !== false,
    whatsapp: pageDesign?.showWhatsapp !== false,
    emi: pageDesign?.showEmi !== false,
  };

  // The phone buy bar sits above the bottom navigation; floating buttons move up while it is shown.
  useEffect(() => {
    if (!design.stickyBar || !product) return undefined;
    document.body.classList.add('nst-has-buybar');
    return () => document.body.classList.remove('nst-has-buybar');
  }, [design.stickyBar, product]);

  const openDesignPanel = (event: React.MouseEvent) => {
    if (!inEditorPreview()) return;
    event.preventDefault();
    event.stopPropagation();
    window.parent?.postMessage({ type: 'NST_WEBSITE_SECTION_SELECTED', pageId: 'product-details', sectionId: 'product-design', sectionType: 'product_design' }, '*');
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1320px] animate-pulse px-4 py-8 lg:px-6">
        <div className="mb-6 h-4 w-48 rounded bg-slate-200" />
        <div className="grid gap-6 md:grid-cols-2 lg:gap-10">
          <div className="aspect-square rounded-2xl bg-slate-100" />
          <div className="flex flex-col gap-4">
            <div className="h-8 w-3/4 rounded bg-slate-200" />
            <div className="h-6 w-40 rounded bg-slate-200" />
            <div className="h-24 w-full rounded-xl bg-slate-100" />
            <div className="h-24 w-full rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <ShieldAlert className="mx-auto mb-3 h-12 w-12 text-red-500" />
        <h3 className="text-base font-bold text-slate-800">Error Loading Product</h3>
        <p className="mt-1 text-sm text-slate-500">{error || 'Product not found.'}</p>
        <Link to="/products" className="mt-4 inline-block rounded-lg bg-[var(--nst-primary)] px-4 py-2 text-sm font-semibold text-white">Go Back to Products</Link>
      </div>
    );
  }

  const usedPage = isUsedProduct(product);
  const inCompare = compareItems.some((item) => item.id === product.id);
  const inWishlist = wishlistItems.some((item: any) => item.id === product.id);
  const basePrice = productPrice(product);
  const baseOld = productOldPrice(product);
  const shownPrice = resolvedVariant ? Number(resolvedVariant.price || 0) : basePrice;
  const shownOld = resolvedVariant ? Number(resolvedVariant.old_price || 0) : baseOld;
  const isPreorderLike = resolvedCanPreorder || (!resolvedVariant && Boolean(product.allow_preorder) && Number(product.available_quantity || 0) <= 0);
  const availabilityKey = resolvedVariant
    ? (resolvedInStock ? 'in_stock' : resolvedCanPreorder ? 'pre_order' : 'out_of_stock')
    : (Number(product.available_quantity || 0) > 0 ? 'in_stock' : product.allow_preorder ? 'pre_order' : 'out_of_stock');
  const gallery = activeGallery.length ? activeGallery : (activeImage ? [{ id: 'main', url: activeImage } as any] : []);
  const mainImage = activeImage || productImage(product);
  const warrantyRows = [
    ['Warranty', product.warranty], ['Official Warranty', product.official_warranty], ['Shop Warranty', product.shop_warranty], ["What's in the Box", product.whats_in_box],
  ].filter(([, value]) => value && String(value).trim()) as [string, string][];
  const ctaLabel = text(!resolvedVariant ? (isAllOptionsSelected ? 'cta_unavailable' : 'cta_select') : resolvedInStock ? 'cta_add' : resolvedCanPreorder ? 'cta_preorder' : 'cta_out');
  const ctaDisabled = isAllOptionsSelected && (!resolvedVariant || (!resolvedInStock && !resolvedCanPreorder));
  const whatsappDigits = String(whatsappPhone).replace(/\D/g, '');
  const whatsappHref = `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(text('whatsapp_message', { name: `${product.name}${selectedStorage ? ` (${selectedStorage})` : ''}`, url: window.location.href }))}`;
  const stockMessage = resolvedVariant
    ? (resolvedInStock
      ? (!showBranch ? text('stock_available') : resolvedVariant.branch_name ? text('stock_count_branch', { count: resolvedVariant.available_quantity, branch: resolvedVariant.branch_name }) : text('stock_count', { count: resolvedVariant.available_quantity }))
      : text(resolvedCanPreorder ? 'variant_preorder' : 'variant_unavailable'))
    : '';
  const optionGroups = [
    hasColor && { key: 'color', label: text('option_color'), options: availableOptions.colors, value: selectedColor, onChange: setSelectedColor, swatch: true },
    hasStorage && { key: 'storage', label: text('option_storage'), options: availableOptions.storages, value: selectedStorage, onChange: setSelectedStorage },
    hasRam && { key: 'ram', label: text('option_ram'), options: availableOptions.rams, value: selectedRam, onChange: setSelectedRam },
    hasCountry && { key: 'region', label: text('option_region'), options: availableOptions.countries, value: selectedCountryRegion, onChange: setSelectedCountryRegion },
    hasSimType && { key: 'sim', label: text('option_sim_type'), options: availableOptions.simTypes, value: selectedSimType, onChange: setSelectedSimType },
    hasNetwork && { key: 'network', label: text('option_network'), options: availableOptions.networks, value: selectedNetworkCarrier, onChange: setSelectedNetworkCarrier },
    hasCondition && { key: 'condition', label: text('option_condition'), options: availableOptions.conditions, value: selectedCondition, onChange: setSelectedCondition },
    hasBranch && {
      key: 'branch', label: text('option_branch'), options: availableOptions.branches.map((b) => String(b.id)),
      labels: Object.fromEntries(availableOptions.branches.map((b) => [String(b.id), b.name])),
      value: selectedBranchId ? String(selectedBranchId) : null, onChange: (value: string) => setSelectedBranchId(Number(value)), wide: true,
    },
  ].filter(Boolean) as Array<{ key: string; label: string; options: string[]; value: string | null; onChange: (value: string) => void; swatch?: boolean; labels?: Record<string, string>; wide?: boolean }>;
  const priceText = shownPrice > 0 ? taka(shownPrice) : text('price_on_request');
  const runCta = () => { handleAddToCart(true); };

  const tabButton = (tab: DetailTab, label: string) => (
    <button key={tab} type="button" role="tab" aria-selected={detailTab === tab} onClick={() => setDetailTab(tab)}
      className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition sm:px-5 ${detailTab === tab ? 'bg-[var(--nst-primary)] text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-violet-50 hover:text-[var(--nst-primary)]'}`}>
      {label}
    </button>
  );

  return (
    <div className="w-full bg-white pb-12 text-slate-800">
      {/* Dynamic SEO metadata */}
      <Helmet>
        <title>{`${product.name} | New Singapur Telecom`}</title>
        <meta name="description" content={product.short_description || `Order genuine ${product.name} on New Singapur Telecom with official warranty and secure EMI.`} />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      <div className="mx-auto max-w-[1320px] px-4 lg:px-6">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 overflow-hidden py-3 text-[13px] text-slate-500">
          <Link to="/" className="shrink-0 hover:text-[var(--nst-primary)]">Home</Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
          {usedPage
            ? <Link to="/used-products" className="shrink-0 hover:text-[var(--nst-primary)]">Used Phones</Link>
            : <Link to={`/products?category=${encodeURIComponent(product.category || '')}`} className="shrink-0 capitalize hover:text-[var(--nst-primary)]">{product.category || 'Products'}</Link>}
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
          <span className="truncate text-slate-700">{product.name}</span>
        </nav>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
          {/* Gallery */}
          <div className={`min-w-0 md:sticky md:top-32 md:self-start ${design.galleryRight ? 'md:order-2' : ''}`}>
            <div className="relative grid aspect-square place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              {usedPage && <span className="absolute left-3 top-3 z-10 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">{text('used_badge')}</span>}
              <button type="button" onClick={() => (inWishlist ? removeWishlist(product.id) : addWishlist(product as any))} aria-label={text(inWishlist ? 'wishlist_remove' : 'wishlist_add')}
                className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-rose-500">
                <Heart className={`h-[18px] w-[18px] ${inWishlist ? 'fill-rose-500 text-rose-500' : ''}`} />
              </button>
              <ZoomImage src={mainImage} alt={product.name} />
            </div>
            <p className="mt-2 hidden text-center text-[11px] text-slate-400 [@media(hover:hover)]:block">{text('hover_zoom')}</p>
            {gallery.length > 1 && (
              <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
                {gallery.map((img: any, index: number) => (
                  <button key={img.id || index} type="button" onClick={() => setActiveImage(img.url)} aria-label={text('image_n', { n: index + 1 })}
                    className={`grid h-16 w-16 shrink-0 place-items-center rounded-xl border bg-white p-1.5 transition sm:h-[76px] sm:w-[76px] ${activeImage === img.url ? 'border-[var(--nst-primary)] ring-1 ring-[var(--nst-primary)]' : 'border-slate-200 hover:border-slate-400'}`}>
                    <img src={img.url} alt="" className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Buy box */}
          <div className={`relative flex min-w-0 flex-col gap-4 ${inEditorPreview() ? 'cursor-pointer rounded-2xl outline-dashed outline-1 outline-offset-4 outline-[var(--nst-primary)]' : ''}`} onClickCapture={openDesignPanel}>
            {inEditorPreview() && <span className="pointer-events-none absolute -top-3 right-2 z-10 rounded-full bg-[var(--nst-primary)] px-2.5 py-0.5 text-[10px] font-black text-white">{text('edit_badge')}</span>}
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">{text('brand')} <Link to={`/brand/${encodeURIComponent(String(product.brand || '').toLowerCase())}`} className="font-semibold text-[var(--nst-primary)] hover:underline">{product.brand || 'NST'}</Link></span>
              <button type="button" onClick={() => addCompareItem(product)} className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${inCompare ? 'text-emerald-600' : 'text-slate-600 hover:text-[var(--nst-primary)]'}`}>
                <GitCompareArrows className="h-4 w-4" />{text(inCompare ? 'added_to_compare' : 'add_to_compare')}
              </button>
            </div>

            <h1 className="text-xl font-semibold leading-snug text-slate-900 sm:text-2xl lg:text-[28px]">{product.name}</h1>

            {/* Price | Availability | Code on one line (wraps on phones) */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 text-[13px] text-slate-600 sm:text-sm">
              <span className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 sm:text-[26px]">{priceText}</span>
                {shownOld > shownPrice && shownPrice > 0 && <del className="text-sm text-slate-400">{taka(shownOld)}</del>}
                {isPreorderLike && <span className="text-slate-500">{text('booking_price')}</span>}
              </span>
              <span className="hidden h-4 w-px bg-slate-300 sm:block" aria-hidden="true" />
              <span>{text('availability')} <b className={availabilityKey === 'in_stock' ? 'text-emerald-600' : availabilityKey === 'pre_order' ? 'text-[var(--nst-primary)]' : 'text-rose-600'}>{text(availabilityKey)}</b></span>
              {usedPage && product.condition && <><span className="hidden h-4 w-px bg-slate-300 sm:block" aria-hidden="true" /><span>{text('condition')} <b className="text-amber-700">{product.condition}</b></span></>}
            </div>
            {!resolvedVariant && availableOptions.storages.length + availableOptions.colors.length > 0 && <p className="-mt-2 text-xs text-slate-500">{text('starting_price_note')}</p>}

            {product.short_description && <p className="text-sm leading-relaxed text-slate-600">{product.short_description}</p>}
            {usedPage && (product as any)?.page_options?.used_notes ? (
              <div className="rounded-xl border border-[color-mix(in_oklab,var(--nst-primary)_25%,white)] bg-[var(--nst-primary-soft)] p-3 text-sm leading-relaxed text-slate-700">
                <b className="mb-1 block text-[13px] text-[var(--nst-primary-deep)]">{text('used_notes')}</b>
                <span className="whitespace-pre-line">{String((product as any).page_options.used_notes)}</span>
              </div>
            ) : null}

            {/* Mandatory selections */}
            {optionGroups.length > 0 && (design.optionStyle === 'compact' ? (
              <div id="nst-product-options" className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3 py-0.5 sm:px-4">
                {optionGroups.map((group) => <OptionRow key={group.key} label={group.label} options={group.options} value={group.value} onChange={group.onChange} labels={group.labels} swatch={group.swatch} />)}
              </div>
            ) : (
              <div id="nst-product-options" className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                {optionGroups.map((group) => <OptionCard key={group.key} label={group.label} options={group.options} value={group.value} onChange={group.onChange} labels={group.labels} swatch={group.swatch} wide={group.wide} />)}
              </div>
            ))}
            {stockMessage && (
              <div className={`-mt-1 rounded-xl border px-4 py-2.5 text-[13px] font-medium ${resolvedInStock ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                {stockMessage}
              </div>
            )}

            {isPreorderLike && product.minimum_booking_value && (
              <p className="flex items-start gap-2 text-[13px] font-semibold text-slate-800 sm:text-sm">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--nst-primary)]" />
                <span>{text('preorder_min', { amount: product.minimum_booking_type === 'percentage' ? `${product.minimum_booking_value}%` : taka(product.minimum_booking_value) })}</span>
              </p>
            )}

            <div className="flex items-center gap-3">
              <p className="text-[13px] font-medium text-slate-800 sm:text-sm">{text('select_quantity')}</p>
              <div className="inline-flex h-10 items-center gap-1 rounded-full bg-slate-100 p-1">
                <button type="button" onClick={decrementQty} aria-label={text('decrease_qty')} className="grid h-8 w-8 place-items-center rounded-full bg-white text-slate-700 shadow-sm hover:text-slate-900"><Minus className="h-4 w-4" /></button>
                <span className="w-9 text-center text-sm font-semibold" aria-live="polite">{quantity}</span>
                <button type="button" onClick={incrementQty} aria-label={text('increase_qty')} className="grid h-8 w-8 place-items-center rounded-full bg-white text-slate-700 shadow-sm hover:text-slate-900"><Plus className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="grid gap-2.5">
              {/* One big action like the reference; Buy Now appears only when the item can be bought right away */}
              <div className={`grid gap-2.5 ${resolvedVariant && resolvedInStock ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <button type="button" onClick={runCta} disabled={ctaDisabled}
                  className="flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--nst-primary)] px-3 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[var(--nst-primary-dark)] disabled:cursor-not-allowed disabled:opacity-60">
                  {resolvedCanPreorder ? <CalendarClock className="h-5 w-5" /> : <ShoppingCart className="h-5 w-5" />}{ctaLabel}
                </button>
                {resolvedVariant && resolvedInStock && (
                  <button type="button" onClick={handleBuyNow}
                    className="flex h-12 items-center justify-center gap-1.5 rounded-full bg-[var(--nst-ink)] px-3 text-[15px] font-semibold text-white transition hover:opacity-90">
                    <Zap className="h-4 w-4 fill-amber-400 text-amber-400" />{text('buy_now')}
                  </button>
                )}
              </div>
              {(design.emi || design.whatsapp) && (
                <div className={`grid gap-2.5 ${design.emi && design.whatsapp ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {design.emi && (
                    <button type="button" onClick={() => navigate(`/emi-calculator?price=${encodeURIComponent(String(shownPrice || 0))}`)}
                      className="flex min-h-11 items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--nst-primary)_18%,white)] bg-[var(--nst-primary-soft)] px-3 text-left text-[13px] leading-tight text-slate-700 transition hover:border-[var(--nst-primary)]">
                      <Wallet className="h-4 w-4 shrink-0 text-[var(--nst-primary)]" />
                      <span>{text('emi_available')} <b className="font-semibold text-slate-900 underline underline-offset-2">{text('emi_view')}</b></span>
                    </button>
                  )}
                  {design.whatsapp && (
                    <a href={whatsappHref} target="_blank" rel="noopener noreferrer"
                      className="flex min-h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-[13px] font-medium leading-tight text-emerald-800 transition hover:border-emerald-400">
                      <MessageCircle className="h-4 w-4 shrink-0 text-[#25d366]" /><span>{text('whatsapp')}</span>
                    </a>
                  )}
                </div>
              )}
            </div>

            {design.trustRow && (
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-[12.5px] text-slate-600 sm:grid-cols-4 md:grid-cols-2 xl:grid-cols-4">
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 shrink-0 text-[var(--nst-primary)]" />{text('trust_authentic')}</span>
                <span className="flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 shrink-0 text-[var(--nst-primary)]" />{text(usedPage ? 'trust_checked' : 'trust_warranty')}</span>
                <span className="flex items-center gap-1.5"><RefreshCw className="h-4 w-4 shrink-0 text-[var(--nst-primary)]" />{text('trust_replacement')}</span>
                <span className="flex items-center gap-1.5"><Truck className="h-4 w-4 shrink-0 text-[var(--nst-primary)]" />{text('trust_delivery')}</span>
              </div>
            )}

            {design.share && <SocialShareBar title={product.name} text={product.short_description || product.name} label={text('share')} />}
          </div>
        </div>

        {/* Details + sidebar */}
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div role="tablist" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {tabButton('specification', 'Specification')}
              {tabButton('description', 'Description')}
              {tabButton('warranty', 'Warranty')}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 p-4 sm:p-6">
              {detailTab === 'specification' && (
                <div className="space-y-5">
                  <h2 className="text-lg font-semibold">Specification</h2>
                  {!!product.specification_groups?.length && (
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5">
                      <Search className="h-4 w-4 text-slate-400" />
                      <input value={specQuery} onChange={(event) => setSpecQuery(event.target.value)} placeholder="Search display, camera, battery, network..." className="w-full bg-transparent text-base outline-none sm:text-sm" />
                    </label>
                  )}
                  {groupedSpecifications.map((group) => (
                    <section key={`${group.id || group.name}`} className="overflow-hidden rounded-xl border border-slate-200">
                      <h3 className="bg-violet-50 px-4 py-2.5 text-sm font-semibold text-[var(--nst-primary-deep)]">{group.name}</h3>
                      <dl>
                        {group.rows.map((row, idx) => (
                          <div key={`${row.id || row.label}-${idx}`} className="grid grid-cols-[38%_1fr] border-t border-slate-200 text-[13px] sm:grid-cols-[30%_1fr] sm:text-sm">
                            <dt className="border-r border-slate-200 bg-slate-50/70 px-3 py-2.5 text-slate-600 sm:px-4">{row.label}</dt>
                            <dd className="min-w-0 break-words px-3 py-2.5 text-slate-800 sm:px-4" dangerouslySetInnerHTML={{ __html: row.value || '-' }} />
                          </div>
                        ))}
                      </dl>
                    </section>
                  ))}
                  {!product.specification_groups?.length && legacySpecifications.length > 0 && (
                    <dl className="overflow-hidden rounded-xl border border-slate-200">
                      {legacySpecifications.map((item, idx) => (
                        <div key={`${item.label}-${idx}`} className={`grid grid-cols-[38%_1fr] text-[13px] sm:grid-cols-[30%_1fr] sm:text-sm ${idx ? 'border-t border-slate-200' : ''}`}>
                          <dt className="border-r border-slate-200 bg-slate-50/70 px-3 py-2.5 capitalize text-slate-600 sm:px-4">{item.label.replace(/_/g, ' ')}</dt>
                          <dd className="min-w-0 break-words px-3 py-2.5 text-slate-800 sm:px-4">{item.value || '-'}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {!groupedSpecifications.length && legacySpecifications.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">{specQuery ? 'No specification matches your search.' : 'No specifications published for this product.'}</div>
                  )}
                </div>
              )}

              {detailTab === 'description' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Description</h2>
                  {!!product.key_features?.length && (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {product.key_features.map((feature, index) => <li key={`${feature}-${index}`} className="flex gap-2 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />{feature}</li>)}
                    </ul>
                  )}
                  {product.description
                    ? <div className="nst-rich-text max-w-none text-sm leading-relaxed text-slate-600 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h3]:mt-3 [&_h3]:font-semibold [&_h3]:text-slate-900 [&_img]:h-auto [&_img]:max-w-full [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2 [&_table]:block [&_table]:overflow-x-auto" dangerouslySetInnerHTML={{ __html: product.description }} />
                    : <p className="text-sm text-slate-400">No description published for this product.</p>}
                </div>
              )}

              {detailTab === 'warranty' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Warranty</h2>
                  {warrantyRows.length ? (
                    <dl className="overflow-hidden rounded-xl border border-slate-200">
                      {warrantyRows.map(([label, value], idx) => (
                        <div key={label} className={`grid grid-cols-[38%_1fr] text-sm sm:grid-cols-[30%_1fr] ${idx ? 'border-t border-slate-200' : ''}`}>
                          <dt className="border-r border-slate-200 bg-slate-50/70 px-3 py-2.5 text-slate-600 sm:px-4">{label}</dt>
                          <dd className="whitespace-pre-line px-3 py-2.5 text-slate-800 sm:px-4">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : <p className="text-sm text-slate-500">Warranty details are confirmed on the invoice. Ask us on WhatsApp for this exact unit.</p>}
                </div>
              )}
            </div>

            {!!product.faqs?.length && (
              <section className="mt-8">
                <h2 className="mb-3 text-lg font-semibold">Frequently Asked Questions</h2>
                <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
                  {product.faqs.map((faq, index) => (
                    <div key={`${faq.question}-${index}`}>
                      <button type="button" onClick={() => setOpenFaq(openFaq === index ? null : index)} aria-expanded={openFaq === index}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50">
                        {faq.question}<ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${openFaq === index ? 'rotate-180' : ''}`} />
                      </button>
                      {openFaq === index && <p className="px-4 pb-4 text-sm leading-relaxed text-slate-600">{faq.answer}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="min-w-0" aria-label="Recently viewed">
            <h2 className="mb-3 text-lg font-semibold">Recently Viewed</h2>
            {recentlyViewed.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {recentlyViewed.slice(0, 5).map((item) => (
                  <React.Fragment key={item.slug}>
                    <span className="hidden lg:block"><MiniProductCard item={item} compact /></span>
                    <span className="lg:hidden"><MiniProductCard item={item} /></span>
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">Products you open will show up here.</p>
            )}
          </aside>
        </div>

        {/* New phones only: used phone suggestions and related products. Used phone pages show Recently Viewed only. */}
        {usedSuggestions.length > 0 && (
          <section className="mt-10">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold sm:text-xl">{usedPage ? 'Similar Used Phones' : 'Used Phone Suggestions'}</h2>
                <p className="text-[13px] text-slate-500">{usedPage ? 'Checked pre-owned phones close to this price.' : `Checked pre-owned phones that cost less${product.brand ? `, ${product.brand} first` : ''}.`}</p>
              </div>
              <Link to="/used-products" className="shrink-0 text-sm font-medium text-[var(--nst-primary)] hover:underline">View all</Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {usedSuggestions.map((item) => <MiniProductCard key={item.id} item={item} />)}
            </div>
          </section>
        )}

        {!usedPage && relatedProducts.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-semibold sm:text-xl">Related Products</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {relatedProducts.map((item) => <MiniProductCard key={item.id} item={item} />)}
            </div>
          </section>
        )}
      </div>

      {design.stickyBar && (
        <>
          <div className="nst-product-buybar lg:hidden" role="region" aria-label={product.name}>
            <div className="min-w-0 flex-1 leading-tight">
              <b className="block truncate text-[15px] font-bold text-slate-900">{priceText}</b>
              <span className={`block truncate text-[11px] font-medium ${availabilityKey === 'in_stock' ? 'text-emerald-600' : availabilityKey === 'pre_order' ? 'text-[var(--nst-primary)]' : 'text-rose-600'}`}>{text(availabilityKey)}</span>
            </div>
            {resolvedVariant && resolvedInStock ? (
              <>
                <button type="button" onClick={runCta} className="nst-product-buybar__btn is-soft" aria-label={ctaLabel}><ShoppingCart className="h-[18px] w-[18px]" /></button>
                <button type="button" onClick={handleBuyNow} className="nst-product-buybar__btn"><Zap className="h-4 w-4 fill-amber-300 text-amber-300" />{text('buy_now')}</button>
              </>
            ) : (
              <button type="button" onClick={runCta} disabled={ctaDisabled} className="nst-product-buybar__btn">{ctaLabel}</button>
            )}
          </div>
          <div className="h-16 lg:hidden" aria-hidden="true" />
        </>
      )}
    </div>
  );
};

export default ProductDetailsPage;
