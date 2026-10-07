import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, ChevronDown, ChevronRight, GitCompare, Heart, LogOut, Search, ShoppingCart, Sparkles, UserRound } from 'lucide-react';

import { useWebsiteStore } from '../../store/cms/useWebsiteStore';
import { useAuthStore } from '../../store/auth/useAuthStore';
import { useCartStore } from '../../store/cart/useCartStore';
import { useCompareStore } from '../../store/compare/useCompareStore';
import { useWishlistStore } from '../../pages/wishlist/WishlistPage';
import { apiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { inEditorPreview, selectInEditor, usePageText } from '../../cms/pageTexts';
import { colorOrUndefined, useHeaderDesign } from './headerDesign';

const Badge: React.FC<{ count: number }> = ({ count }) =>
  count > 0 ? <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--nst-primary)] px-1 text-[9px] font-bold text-white ring-2 ring-white">{count > 99 ? '99+' : count}</span> : null;

export const NstLogo: React.FC<{ compact?: boolean; height?: number; showSubtitle?: boolean; subtitle?: string }> = ({ compact, height, showSubtitle = true, subtitle }) => {
  const site = useWebsiteStore((state) => state.cms?.site);
  const imageUrl = compact ? site?.mobileLogoUrl || site?.logoUrl : site?.logoUrl;
  const size = height || (compact ? 32 : 44);
  if (imageUrl) return <img src={imageUrl} alt={site?.name || site?.shortName || ''} className="w-auto max-w-44 object-contain" style={{ height: size }} />;
  return (
    <span className="flex flex-col leading-none">
      <span className="font-black tracking-tight text-[var(--nst-primary-deep)]" style={{ letterSpacing: '-0.02em', fontSize: Math.round(size * 0.78) }}>{site?.logoText || site?.shortName || 'NST'}</span>
      {!compact && showSubtitle && subtitle && <span className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-[var(--nst-header-muted,#475569)]">{subtitle}</span>}
    </span>
  );
};

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const cms = useWebsiteStore((state) => state.cms);
  const { user, isAuthenticated, logout } = useAuthStore();
  const cartCount = useCartStore((state) => state.items.reduce((sum, item) => sum + (item.quantity || 1), 0));
  const wishlistCount = useWishlistStore((state) => state.items.length);
  const compareCount = useCompareStore((state) => state.items.length);
  const { language } = useI18n();
  const text = usePageText('header');
  const design = useHeaderDesign();
  const main = design.main;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const categories = cms?.header?.categoryLinks?.filter((c) => c.enabled) || [];
  const customSubtitle = cms?.pageTexts?.header?.[language]?.logo_subtitle;
  const subtitle = (typeof customSubtitle === 'string' && customSubtitle.trim()) || cms?.site?.name || text('logo_subtitle');

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setShowSuggestions(false);
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // Debounced live suggestions from the published POS catalogue.
  useEffect(() => {
    if (!searchTerm.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiClient.get('/public/products', {
          params: { search: searchTerm.trim(), limit: 5, category: selectedCategory || undefined },
        });
        const rows = response.data?.data?.data || response.data?.data;
        if (active) { const next = Array.isArray(rows) ? rows : []; setSuggestions(next); setShowSuggestions(next.length > 0); }
      } catch {
        if (active) { setSuggestions([]); setShowSuggestions(false); }
      }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [searchTerm, selectedCategory]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setShowSuggestions(false);
    navigate(`/search?q=${encodeURIComponent(searchTerm)}${selectedCategory ? `&category=${encodeURIComponent(selectedCategory)}` : ''}`);
  };

  const openSuggestion = (slug: string) => { setSearchTerm(''); setShowSuggestions(false); navigate(`/product/${slug}`); };

  const compact = design.layout === 'compact';
  const centered = design.layout === 'centered';
  const iconLink = 'relative flex flex-col items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--nst-header-text,#475569)] hover:text-[var(--nst-primary)]';
  const labelClass = compact ? 'hidden' : 'hidden lg:block';
  const headerStyle = {
    paddingTop: 'env(safe-area-inset-top)',
    background: colorOrUndefined(main.background),
    ['--nst-header-text' as string]: colorOrUndefined(main.text),
    ['--nst-header-muted' as string]: colorOrUndefined(main.text),
  } as React.CSSProperties;

  const logo = (
    <Link to="/" className={`shrink-0 ${centered ? 'md:justify-self-center' : ''}`} aria-label={text('home_link')}>
      <span className="md:hidden"><NstLogo compact height={design.mobileLogoHeight} /></span>
      <span className="hidden md:block"><NstLogo height={compact ? Math.min(design.logoHeight, 36) : design.logoHeight} showSubtitle={design.showLogoSubtitle && !compact} subtitle={subtitle} /></span>
    </Link>
  );

  const search = main.searchEnabled ? (
    <div ref={searchRef} className={`relative hidden min-w-0 md:block ${centered ? 'mx-auto w-full max-w-[760px]' : 'flex-1 lg:max-w-[640px]'}`}>
      <form onSubmit={submitSearch} className={`flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-[var(--nst-primary)] focus-within:ring-2 focus-within:ring-[var(--nst-primary-soft)] ${compact ? 'h-10' : 'h-11'}`} role="search">
        <input
          type="text"
          placeholder={text('search_placeholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => searchTerm.trim() && setShowSuggestions(true)}
          className="h-full min-w-0 flex-1 rounded-l-lg bg-transparent px-4 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          aria-label={text('search_label')}
        />
        {main.showCategorySelect && (
          <label className="relative hidden h-full shrink-0 items-center border-l border-slate-200 lg:flex">
            <span className="sr-only">{text('category_label')}</span>
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="h-full appearance-none bg-transparent pl-4 pr-8 text-xs font-medium text-slate-700 focus:outline-none">
              <option value="">{text('all_categories_option')}</option>
              {categories.map((cat) => <option key={cat.label} value={cat.label}>{cat.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-slate-400" />
          </label>
        )}
        <button type="submit" className={`m-1 grid w-11 shrink-0 place-items-center rounded-md bg-[var(--nst-primary)] text-white hover:bg-[var(--nst-primary-dark)] ${compact ? 'h-8' : 'h-9'}`} aria-label={text('search_button')}><Search className="h-[18px] w-[18px]" /></button>
      </form>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-0 top-12 z-50 w-full rounded-lg border border-slate-100 bg-white py-2 text-slate-800 shadow-2xl">
          <div className="flex items-center gap-1 border-b border-slate-50 px-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400"><Sparkles className="h-3.5 w-3.5 text-amber-400" />{text('live_suggestions')}</div>
          {suggestions.map((prod) => (
            <button key={prod.id} type="button" onClick={() => openSuggestion(prod.slug)} className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-[var(--nst-primary-soft)]">
              <span className="flex min-w-0 items-center gap-3">
                <img src={prod.image_url || prod.image || '/images/product-placeholder.svg'} alt="" className="h-10 w-10 rounded border border-slate-100 object-contain" />
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{prod.name}</span><span className="text-xs text-slate-400">{prod.brand}</span></span>
              </span>
              <span className="shrink-0 text-sm font-bold text-[var(--nst-primary)]">৳{Number(prod.sale_price || prod.price || 0).toLocaleString('en-IN')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  ) : <div className="hidden flex-1 md:block" />;

  const actions = (
    <div className={`ml-auto flex shrink-0 items-center gap-1 lg:gap-3 ${centered ? 'md:justify-self-end' : ''}`}>
      {main.showCompare && <Link to="/compare" className={`${iconLink} hidden md:flex`}><span className="relative"><GitCompare className="h-[22px] w-[22px]" /><Badge count={compareCount} /></span><span className={labelClass}>{text('compare')}</span></Link>}
      {main.showWishlist && <Link to="/wishlist" className={`${iconLink} hidden md:flex`}><span className="relative"><Heart className="h-[22px] w-[22px]" /><Badge count={wishlistCount} /></span><span className={labelClass}>{text('wishlist')}</span></Link>}
      {main.showCart && <Link to="/cart" className={iconLink} aria-label={text('cart')}><span className="relative"><ShoppingCart className="h-[22px] w-[22px]" /><Badge count={cartCount} /></span><span className={labelClass}>{text('cart')}</span></Link>}

      {main.showAccount && (
        <div ref={userMenuRef} className="relative hidden md:block">
          {isAuthenticated ? (
            <button type="button" onClick={() => setShowUserMenu(!showUserMenu)} className={iconLink} aria-expanded={showUserMenu}>
              <UserRound className="h-[22px] w-[22px]" />
              <span className={`${labelClass} max-w-[80px] truncate`}>{user?.name?.split(' ')[0] || text('account')}</span>
            </button>
          ) : (
            <Link to="/login" className={iconLink}>
              <UserRound className="h-[22px] w-[22px]" />
              <span className={`${labelClass} text-center leading-tight`}>{text('account')}<br /><span className="text-[10px] opacity-70">{text('sign_in')}</span></span>
            </Link>
          )}
          {isAuthenticated && showUserMenu && (
            <div className="absolute right-0 z-50 mt-2 w-48 rounded-lg border border-slate-100 bg-white py-1 text-sm text-slate-800 shadow-2xl">
              {[[text('my_dashboard'), '/portal/dashboard'], [text('my_orders'), '/portal/orders'], [text('my_wishlist'), '/wishlist']].map(([label, to]) => (
                <Link key={to} to={to} onClick={() => setShowUserMenu(false)} className="block px-4 py-2 hover:bg-[var(--nst-primary-soft)] hover:text-[var(--nst-primary)]">{label}</Link>
              ))}
              <hr className="my-1 border-slate-100" />
              <button type="button" onClick={() => { setShowUserMenu(false); logout(); }} className="flex w-full items-center gap-1.5 px-4 py-2 text-left text-[var(--nst-accent,var(--nst-primary))] hover:bg-[color-mix(in_oklab,var(--nst-accent,var(--nst-primary))_10%,white)]"><LogOut className="h-3.5 w-3.5" />{text('logout')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <header onClickCapture={selectInEditor('header', 'global-header')} data-nst-section-id="global-header"
      className={`${design.sticky ? 'sticky top-0' : 'relative'} z-40 w-full border-b border-slate-200/80 bg-white text-slate-800`} style={headerStyle}>
      {centered ? (
        <div className="mx-auto max-w-[1320px] px-4 lg:px-6">
          <div className="flex items-center gap-4 py-2.5 md:grid md:grid-cols-[1fr_auto_1fr] md:py-3">
            <span className="hidden md:block" />
            {logo}
            {actions}
          </div>
          {main.searchEnabled && <div className="hidden pb-3 md:block">{search}</div>}
        </div>
      ) : (
        <div className={`mx-auto flex max-w-[1320px] items-center gap-4 px-4 lg:gap-8 lg:px-6 ${compact ? 'py-1.5 md:py-2' : 'py-2.5 md:py-3'}`}>
          {logo}
          {search}
          {actions}
        </div>
      )}

      {/* Phone search (Daraz style) */}
      {main.searchEnabled && (
        <form onSubmit={submitSearch} className="flex items-center gap-2 px-4 pb-2.5 md:hidden" role="search">
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 focus-within:border-[var(--nst-primary)]">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input type="search" enterKeyHint="search" placeholder={text('search_placeholder_mobile')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-base text-slate-800 placeholder:text-slate-400 focus:outline-none" aria-label={text('search_label')} />
            <Camera className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
          </div>
          <button type="submit" className="grid h-10 w-7 shrink-0 place-items-center text-[var(--nst-header-text,#475569)]" aria-label={text('search_button')}><ChevronRight className="h-5 w-5" /></button>
        </form>
      )}
      {inEditorPreview() && <span className="pointer-events-none absolute right-3 top-1 z-10 rounded-full bg-[var(--nst-primary)] px-2.5 py-0.5 text-[10px] font-black text-white">{text('edit_badge')}</span>}
    </header>
  );
};

export default Header;
