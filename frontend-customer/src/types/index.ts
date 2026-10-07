/**
 * New Singapur Telecom - Frontend TypeScript Definitions
 * Dynamic types aligned with Laravel POS live sync and CMS schema.
 */

// ==========================================
// 1. Core Media & Image Types
// ==========================================
export interface ProductImage {
  id: number;
  url: string;
  thumbnail_url: string | null;
  is_primary: boolean;
  sort_order: number;
  media_type: string | null;
  title: string | null;
}

// ==========================================
// 2. Product Variant Model
// ==========================================
export interface ProductVariant {
  id: number;
  name: string; // variant_name
  sku: string;
  barcode: string | null;
  color: string; // color_name or standard
  storage: string | null;
  region: string | null;
  sim_network: string | null;
  country_region: string | null;
  sim_type: string | null;
  network_carrier: string | null;
  condition: string | null;
  branch_id: number | null;
  branch_name: string | null;
  ram: string | null;
  price: number; // resolved sale_price or discount_price
  sale_price: number;
  old_price: number | null;
  available_quantity: number;
  image: string | null;
  images: ProductImage[];
  status: string | null;
  stock_state: string | null;
  minimum_booking_type: string | null;
  minimum_booking_value: string | null;
  emi_available: boolean;
  allow_preorder: boolean;
  warranty: string | null;
  activation_status: string | null;
  battery_health: string | null;
}

export interface ProductSpecificationRow {
  id?: number;
  label: string;
  value: string;
  is_searchable?: boolean;
}

export interface ProductSpecificationGroup {
  id?: number;
  name: string;
  rows: ProductSpecificationRow[];
}

// ==========================================
// 3. Main Product Model
// ==========================================
export interface Product {
  id: number;
  name: string;
  slug: string;
  sku: string;
  barcode: string | null;
  price: number; // resolved lowest price of variant or product price
  sale_price: number;
  old_price: number | null;
  regular_price: number | null;
  market_price: number | null;
  status: string; // In Stock, Pre Order, Out of Stock
  condition: string | null; // used (pre-owned) or new
  brand: string;
  category: string;
  image: string | null;
  image_url: string | null;
  stock_quantity: number;
  available_quantity: number;
  variants: ProductVariant[];
  minimum_booking_type: string | null;
  minimum_booking_value: string | null;
  allow_preorder: boolean;
  website_published: boolean;
  show_price_at_zero_stock: boolean;
  description: string | null;
  short_description: string | null;
  specifications: Record<string, string> | Array<{ key: string; value: string }> | any;
  specification_groups?: ProductSpecificationGroup[];
  faqs: Array<{ question: string; answer: string }>;
  key_features: string[];
  page_options: Record<string, any>;
  images: ProductImage[];
  warranty: string | null;
  official_warranty: string | null;
  shop_warranty: string | null;
  whats_in_box: string | null;
  meta_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  updated_at: string;
}

// ==========================================
// 4. CMS (Website Builder) Config Types
// ==========================================
export interface SiteConfig {
  name: string;
  shortName: string;
  adminName: string;
  tagline: string;
  logoText: string;
  logoUrl: string;
  mobileLogoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  contactPhone: string;
  whatsappPhone: string;
  headerPhoneLabel: string;
  headerWhatsAppLabel: string;
}

export interface SeoConfig {
  title: string;
  description: string;
  ogImage: string;
}

export interface LinkItem {
  label: string;
  path: string;
  enabled: boolean;
  order: number;
}

export interface HeaderConfig {
  loginText: string;
  buttonLabel: string;
  buttonPath: string;
  buttonEnabled: boolean;
  links: LinkItem[];
  topLinks: LinkItem[];
  categoryLinks: LinkItem[];
}

export interface FooterColumn {
  title: string;
  enabled: boolean;
  order: number;
  links: LinkItem[];
}

export interface FooterConfig {
  enabled: boolean;
  logoUrl: string;
  logoText: string;
  brandName: string;
  tagline: string;
  description: string;
  columns: FooterColumn[];
  address: string;
  email: string;
  phone: string;
  whatsapp: string;
  facebook: string;
  youtube: string;
  instagram?: string;
  tiktok?: string;
  copyright: string;
  bottomText: string;
  showTrustBadge: boolean;
  trustBadgeText: string;
  newsletter: {
    enabled: boolean;
    title: string;
    text: string;
    placeholder: string;
    buttonLabel: string;
  };
  badges: string[];
  backgroundStyle: string;
  layout?: 'classic' | 'compact' | 'centered' | 'minimal' | 'light' | 'custom';
  customHtml?: string;
  customCss?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textColor?: string;
  headingColor?: string;
  accentColor?: string;
  borderColor?: string;
  maxWidth?: 'narrow' | 'normal' | 'wide';
  contactTitle?: string;
  businessHours?: string;
  showContact?: boolean;
  showSocial?: boolean;
  showPayments?: boolean;
  showAppButtons?: boolean;
  showBackToTop?: boolean;
  playStoreLabel?: string;
  playStoreUrl?: string;
  appStoreLabel?: string;
  appStoreUrl?: string;
}

export interface HeroConfig {
  badge: string;
  headlinePrefix: string[];
  rotatingWords: string[];
  subtitle: string;
  highlight: string;
  buttons: Array<{ label: string; path: string; variant: string }>;
  features: Array<{ title: string; text: string; path?: string }>;
  visualTitle: string;
  visualSubtitle: string;
  visualBadges: string[];
}

export interface ProductCardConfig {
  showOldPrice: boolean;
  showBadge: boolean;
  buttonLabel: string;
  cardStyle: string;
}

export interface TrustItem {
  title: string;
  subtitle: string;
  icon: string;
  link: string;
  enabled: boolean;
}

export interface BottomStatItem {
  number: string;
  title: string;
  icon: string;
  link: string;
  enabled: boolean;
}

export interface ProductPageConfig {
  whyBuy: {
    enabled: boolean;
    title: string;
    items: TrustItem[];
  };
  emiCard: {
    enabled: boolean;
    title: string;
    buttonLabel: string;
    description: string;
    image: string;
  };
  trustStrip: {
    enabled: boolean;
    items: TrustItem[];
  };
  bottomStats: {
    enabled: boolean;
    items: BottomStatItem[];
  };
  usedOptions: { enabled: boolean; title: string; buttonLabel: string };
  compareSimilar: { enabled: boolean; title: string };
  share: { enabled: boolean; title: string };
  googleSearch: { enabled: boolean; label: string; openInNewTab: boolean };
  compareNewUsed: { enabled: boolean; title: string; subtitle: string };
  design?: ProductPageDesignConfig;
}

export interface PopupItem {
  name: string;
  district: string;
  item: string;
  action: string;
}

export interface PopupConfig {
  enabled: boolean;
  mobileFadeOnly: boolean;
  desktopDiagonal: boolean;
  intervalMs: number;
  visibleMs: number;
  items: PopupItem[];
  /** 'sales' = real recent sales (online + POS), 'manual' = the items above. */
  source?: 'sales' | 'manual';
  days?: number;
  limit?: number;
  showTime?: boolean;
  showOnMobile?: boolean;
  position?: 'left' | 'right';
}

/** One link of the storefront header (utility bar or main menu). Empty label = default text of `key`. */
export interface HeaderLinkItem {
  key: string;
  path: string;
  enabled?: boolean;
  accent?: boolean;
  icon?: string;
  label?: Record<string, string>;
}

/** Header look and content from Website Control Center > Header. Empty colours follow the theme. */
export interface HeaderDesignConfig {
  layout?: 'classic' | 'centered' | 'compact';
  sticky?: boolean;
  logoHeight?: number;
  mobileLogoHeight?: number;
  showLogoSubtitle?: boolean;
  topBar?: {
    enabled?: boolean; background?: string; text?: string; phone?: string; email?: string;
    showPhone?: boolean; showEmail?: boolean; showLanguage?: boolean; showCurrency?: boolean; links?: HeaderLinkItem[];
  };
  main?: {
    background?: string; text?: string; searchEnabled?: boolean; showCategorySelect?: boolean;
    showCompare?: boolean; showWishlist?: boolean; showCart?: boolean; showAccount?: boolean;
  };
  nav?: {
    enabled?: boolean; background?: string; text?: string; active?: string; buttonBackground?: string; buttonText?: string;
    showAllCategories?: boolean; links?: HeaderLinkItem[];
  };
}

/** Product page look from Website Control Center > Product details > Page design. */
export interface ProductPageDesignConfig {
  optionStyle?: 'compact' | 'boxes';
  galleryPosition?: 'left' | 'right';
  mobileStickyBar?: boolean;
  showTrustRow?: boolean;
  showShare?: boolean;
  showWhatsapp?: boolean;
  showEmi?: boolean;
}

export interface CMSSectionItem {
  title: string;
  subtitle: string;
  actionLabel?: string;
  actionPath?: string;
}

export interface CMSSection {
  id: string;
  type: string;
  enabled: boolean;
  eyebrow: string;
  title: string;
  description: string;
  layout: string;
  items: CMSSectionItem[];
}

export interface WebsiteCMS {
  version: number;
  updatedAt: string;
  site: SiteConfig;
  seo: SeoConfig;
  header: HeaderConfig;
  footer: FooterConfig;
  hero: HeroConfig;
  productCard: ProductCardConfig;
  productPage: ProductPageConfig;
  googleMap: {
    apiKey: string;
    currentLocationLabel: string;
    latitude: string;
    longitude: string;
  };
  seoEntities: {
    automaticFaqSchema: boolean;
    automaticSlugRedirect: boolean;
    canonicalEnabled: boolean;
  };
  popup: PopupConfig;
  headerDesign?: HeaderDesignConfig;
  sections: CMSSection[];
  theme?: Record<string, string>;
  pages?: Array<Record<string, any>>;
  builder?: { theme?: Record<string, string>; pages?: Array<Record<string, any>> };
  settings?: Record<string, any>;
  library?: Record<string, any>;
  /** Per-page label overrides from the Website Control Center: pageTexts[page][language][key]. */
  pageTexts?: Record<string, Record<string, Record<string, string>>>;
}

// ==========================================
// 5. Customer & Authentication Types
// ==========================================
export interface User {
  id: number;
  name: string;
  email: string | null;
  phone: string;
  status: string;
  created_at: string;
  token?: string;
}

// ==========================================
// 6. Shopping Cart Types
// ==========================================
export interface CartItem {
  uniqueId: string; // product_id + variant_id combinations to avoid conflicts
  productId: number;
  productName: string;
  productImage: string | null;
  selectedStorage: string | null;
  selectedRam: string | null;
  selectedVariant: ProductVariant | null;
  selectedSimNetwork: string | null;
  selectedCountryRegion: string | null;
  selectedSimType: string | null;
  selectedNetworkCarrier: string | null;
  selectedCondition: string | null;
  selectedBranchId: number | null;
  selectedBranchName: string | null;
  selectedColor: string | null;
  quantity: number;
  price: number; // resolved price for variant selection
  oldPrice: number | null;
  stockState: string | null;
}

// ==========================================
// 7. Order & Checkout Types
// ==========================================
export interface DeliveryAddress {
  name: string;
  phone: string;
  email?: string;
  addressLine: string;
  city: string;
  district: string;
  postalCode?: string;
}

export interface OrderItem {
  id: number;
  product_id: number;
  product_name: string;
  sku: string;
  quantity: number;
  rate: number;
  total: number;
  variant_id: number | null;
  variant_details?: string | null;
}

export interface TrackingHistory {
  status: string;
  timestamp: string;
  description: string;
  completed: boolean;
}

export interface Order {
  id: number;
  order_no: string;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  items: OrderItem[];
  subtotal: number;
  delivery_fee: number;
  discount: number;
  total: number;
  payment_method: 'cash_on_delivery' | 'sslcommerz' | string;
  payment_status: 'pending' | 'completed' | 'failed' | 'cancelled' | string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | string;
  delivery_address: DeliveryAddress;
  tracking_history: TrackingHistory[];
  created_at: string;
  updated_at: string;
}