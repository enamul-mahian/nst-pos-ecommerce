import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { 
  SlidersHorizontal, 
  ChevronDown, 
  ChevronRight, 
  X, 
  ShoppingBag, 
  ShieldAlert, 
  Sparkles 
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Product } from '../../types';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';

export const CategoryPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { cms } = useWebsiteStore();
  const [searchParams] = useSearchParams();
  const categorySlug = slug || searchParams.get('category') || '';
  const categoryPageSettings = ((cms as any)?.categoryPages || {})[categorySlug] || {};
  const categoryBannerUrl = categoryPageSettings.bannerUrl || categoryPageSettings.banner_url || ''; 

  // API State
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter Selection States
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedRams, setSelectedRam] = useState<string[]>([]);
  const [selectedStorages, setSelectedStorage] = useState<string[]>([]);
  const [selectedConditions, setSelectedCondition] = useState<string[]>([]);
  const [selectedPriceRange, setSelectedPriceRange] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('popular');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Capitalize first letter of category name for UI breadcrumbs
  const categoryName = useMemo(() => {
    return categorySlug.charAt(0).toUpperCase() + categorySlug.slice(1);
  }, [categorySlug]);

  // Fetch Category Products from live API
  useEffect(() => {
    let isMounted = true;
    const fetchCategoryProducts = async () => {
      try {
        setIsLoading(true);
        const response = await apiClient.get('/public/products', {
          params: {
            category: categorySlug,
            limit: 80, // fetch a robust batch to build dynamic filters
          },
        });

        if (isMounted && response.data?.status && Array.isArray(response.data?.data)) {
          setProducts(response.data.data);
        }
      } catch (err) {
        // Safe fallback
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchCategoryProducts();
    setCurrentPage(1); // Reset page on category shift

    return () => {
      isMounted = false;
    };
  }, [categorySlug]);

  // ==========================================
  // 1. Dynamic Filters Generator
  // ==========================================
  // Extracts unique values directly from live product/variant dataset (zero hardcoding)
  const dynamicFilters = useMemo(() => {
    const brandsSet = new Set<string>();
    const ramsSet = new Set<string>();
    const storagesSet = new Set<string>();
    const conditionsSet = new Set<string>();

    products.forEach((prod) => {
      if (prod.brand) brandsSet.add(prod.brand);
      if (prod.condition) conditionsSet.add(prod.condition);
      
      prod.variants?.forEach((v) => {
        if (v.ram) ramsSet.add(v.ram);
        if (v.storage) storagesSet.add(v.storage);
      });
    });

    return {
      brands: Array.from(brandsSet).sort(),
      rams: Array.from(ramsSet).sort((a, b) => parseInt(a) - parseInt(b)),
      storages: Array.from(storagesSet).sort((a, b) => parseInt(a) - parseInt(b)),
      conditions: Array.from(conditionsSet).sort(),
    };
  }, [products]);

  // ==========================================
  // 2. Client-Side Multi-Filter Logic
  // ==========================================
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // Apply Brand checkboxes filter
    if (selectedBrands.length > 0) {
      result = result.filter((p) => selectedBrands.includes(p.brand));
    }

    // Apply Pre-owned / New Conditions checkbox filter
    if (selectedConditions.length > 0) {
      result = result.filter((p) => selectedConditions.includes(p.condition || ''));
    }

    // Apply Variant specific RAM & Storage filters
    if (selectedRams.length > 0 || selectedStorages.length > 0) {
      result = result.filter((p) => {
        return p.variants?.some((v) => {
          const matchRam = selectedRams.length === 0 || selectedRams.includes(v.ram || '');
          const matchStorage = selectedStorages.length === 0 || selectedStorages.includes(v.storage || '');
          return matchRam && matchStorage;
        });
      });
    }

    // Apply Price Range bracket filter (Layout 2 spec bounds)
    if (selectedPriceRange) {
      result = result.filter((p) => {
        const price = p.price;
        if (selectedPriceRange === 'under_20k') return price < 20000;
        if (selectedPriceRange === '20k_40k') return price >= 20000 && price < 40000;
        if (selectedPriceRange === '40k_60k') return price >= 40000 && price < 60000;
        if (selectedPriceRange === '60k_80k') return price >= 60000 && price < 80000;
        if (selectedPriceRange === '80k_100k') return price >= 80000 && price < 100000;
        if (selectedPriceRange === 'above_100k') return price >= 100000;
        return true;
      });
    }

    // Apply Sorting logic
    if (sortBy === 'low_to_high') {
      result.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'high_to_low') {
      result.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'latest') {
      result.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }

    return result;
  }, [products, selectedBrands, selectedConditions, selectedRams, selectedStorages, selectedPriceRange, sortBy]);

  // Pagination Logic
  const itemsPerPage = 12;
  const paginatedProducts = useMemo(() => {
    const offset = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(offset, offset + itemsPerPage);
  }, [filteredProducts, currentPage]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  const toggleFilter = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, val: string) => {
    if (list.includes(val)) {
      setList(list.filter((x) => x !== val));
    } else {
      setList([...list, val]);
    }
    setCurrentPage(1); // Reset page on filter toggle
  };

  const clearAllFilters = () => {
    setSelectedBrands([]);
    setSelectedRam([]);
    setSelectedStorage([]);
    setSelectedCondition([]);
    setSelectedPriceRange(null);
    setCurrentPage(1);
  };

  return (
    <div className="w-full bg-[#f8fafc] min-h-screen pb-12">
      {/* ==========================================
          Dynamic SEO Helmet metadata
          ========================================== */}
      <Helmet>
        <title>{`${categoryName} Store | New Singapur Telecom`}</title>
        <meta name="description" content={`Explore genuine premium ${categoryName} at New Singapur Telecom with official warranty and secure EMI payment support.`} />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      {/* ==========================================
          Only One Large Category Banner (Slide 01)
          ========================================== */}
      <div className="w-full h-[150px] sm:h-[260px] bg-gradient-to-r from-[#170a2e] to-[#0c051a] relative overflow-hidden flex items-center px-6 sm:px-12 select-none border-b border-purple-950/30">
        {!!categoryBannerUrl && (
          <div
            className="absolute inset-0 bg-cover bg-right bg-no-repeat opacity-35"
            style={{ backgroundImage: `url("${categoryBannerUrl}")`, backgroundSize: 'cover' }}
          />
        )}
        <div className="max-w-7xl mx-auto w-full z-10 relative text-left">
          <div className="flex items-center gap-1.5 bg-[var(--nst-primary)]/20 border border-purple-500/30 px-3 py-1 rounded-full text-white text-[10px] sm:text-xs font-black uppercase tracking-wider max-w-max mb-2">
            <Sparkles className="w-3.5 h-3.5 text-[#ffb800] fill-current" />
            <span>Premium Hub</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-none uppercase">
            {categoryName}
          </h1>
        </div>
      </div>

      {/* ==========================================
          eCommerce Breadcrumbs Bar
          ========================================== */}
      <div className="bg-white border-b border-gray-150 py-3.5 px-4 text-xs sm:text-sm font-semibold text-gray-500">
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 justify-start text-left">
          <Link to="/" className="hover:text-[var(--nst-primary)]">Home</Link>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <span className="text-slate-800 font-extrabold">{categoryName}</span>
        </div>
      </div>

      {/* ==========================================
          Main Catalog Layout Body
          ========================================== */}
      <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-4 gap-8 mt-8">
        
        {/* ==========================================
            Left Filters Sidebar (Desktop Only)
            ========================================== */}
        <aside className="hidden lg:flex flex-col gap-6 bg-white border border-gray-150 p-6 rounded-2xl shadow-sm text-left h-max">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <span className="font-extrabold text-slate-800 text-sm sm:text-base">Filters</span>
            <button type="button" onClick={clearAllFilters} className="text-xs text-red-500 hover:text-red-700 font-black">
              Clear All
            </button>
          </div>

          {/* Price Range Filter Bracket */}
          <div className="flex flex-col gap-2.5">
            <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">Price Range</h4>
            <div className="flex flex-col gap-2 text-xs sm:text-sm font-semibold text-gray-500">
              {[
                { label: 'Under ৳20,000', value: 'under_20k' },
                { label: '৳20,000 - ৳40,000', value: '20k_40k' },
                { label: '৳40,000 - ৳60,000', value: '40k_60k' },
                { label: '৳60,000 - ৳80,000', value: '60k_80k' },
                { label: '৳80,000 - ৳100,000', value: '80k_100k' },
                { label: 'Above ৳100,000', value: 'above_100k' },
              ].map((bracket) => (
                <label key={bracket.value} className="flex items-center gap-2 cursor-pointer hover:text-slate-800">
                  <input
                    type="radio"
                    name="price_bracket"
                    checked={selectedPriceRange === bracket.value}
                    onChange={() => {
                      setSelectedPriceRange(bracket.value);
                      setCurrentPage(1);
                    }}
                    className="accent-[var(--nst-primary)] h-4 w-4"
                  />
                  <span>{bracket.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Dynamic Brands Filter Checklist */}
          {dynamicFilters.brands.length > 0 && (
            <div className="flex flex-col gap-2.5 border-t border-gray-50 pt-4">
              <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">Brands</h4>
              <div className="flex flex-col gap-2 text-xs sm:text-sm font-semibold text-gray-500 max-h-48 overflow-y-auto pr-1">
                {dynamicFilters.brands.map((b) => (
                  <label key={b} className="flex items-center gap-2 cursor-pointer hover:text-slate-800">
                    <input
                      type="checkbox"
                      checked={selectedBrands.includes(b)}
                      onChange={() => toggleFilter(selectedBrands, setSelectedBrands, b)}
                      className="accent-[var(--nst-primary)] h-4 w-4 rounded"
                    />
                    <span>{b}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Dynamic Storages Filter Checklist */}
          {dynamicFilters.storages.length > 0 && (
            <div className="flex flex-col gap-2.5 border-t border-gray-50 pt-4">
              <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">Storage</h4>
              <div className="flex flex-col gap-2 text-xs sm:text-sm font-semibold text-gray-500 max-h-48 overflow-y-auto pr-1">
                {dynamicFilters.storages.map((s) => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer hover:text-slate-800">
                    <input
                      type="checkbox"
                      checked={selectedStorages.includes(s)}
                      onChange={() => toggleFilter(selectedStorages, setSelectedStorage, s)}
                      className="accent-[var(--nst-primary)] h-4 w-4 rounded"
                    />
                    <span>{s}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Dynamic Conditions Filter Checklist */}
          {dynamicFilters.conditions.length > 0 && (
            <div className="flex flex-col gap-2.5 border-t border-gray-50 pt-4">
              <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">Condition</h4>
              <div className="flex flex-col gap-2 text-xs sm:text-sm font-semibold text-gray-500">
                {dynamicFilters.conditions.map((c) => (
                  <label key={c} className="flex items-center gap-2 cursor-pointer hover:text-slate-800">
                    <input
                      type="checkbox"
                      checked={selectedConditions.includes(c)}
                      onChange={() => toggleFilter(selectedConditions, setSelectedCondition, c)}
                      className="accent-[var(--nst-primary)] h-4 w-4 rounded"
                    />
                    <span className="capitalize">{c}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ==========================================
            Right Grid Catalog Area
            ========================================== */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          
          {/* Catalog Top Sorting Row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-gray-150 p-4 rounded-2xl shadow-sm">
            <div className="flex flex-col text-left leading-tight shrink-0">
              <span className="text-gray-400 text-xs font-semibold">Showing {filteredProducts.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}-{Math.min(currentPage * itemsPerPage, filteredProducts.length)} of {filteredProducts.length} products</span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end shrink-0">
              {/* Mobile Filter Toggle Button */}
              <button
                type="button"
                onClick={() => setIsMobileFilterOpen(true)}
                className="lg:hidden bg-slate-100 hover:bg-[var(--nst-primary)] hover:text-white text-slate-800 font-extrabold text-xs px-3.5 py-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>Filters</span>
              </button>

              {/* Sorting options dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-xs font-bold uppercase shrink-0">Sort By:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-slate-50 border border-gray-150 rounded-lg p-2.5 text-xs sm:text-sm font-extrabold focus:outline-none focus:border-[var(--nst-primary)]"
                >
                  <option value="popular">Popularity</option>
                  <option value="low_to_high">Price: Low to High</option>
                  <option value="high_to_low">Price: High to Low</option>
                  <option value="latest">Latest Arrivals</option>
                </select>
              </div>
            </div>
          </div>

          {/* Product Items Grid Layout (3-columns wide desktop, 2-columns on mobile) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 w-full">
            {paginatedProducts.map((prod) => (
              <div
                key={prod.id}
                className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col justify-between shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group"
              >
                <Link to={`/product/${prod.slug}`} className="flex flex-col cursor-pointer">
                  
                  {/* Category Card Header Badges */}
                  <div className="flex items-center justify-between mb-3.5">
                    {prod.condition && (
                      <span className="bg-purple-500/10 text-[var(--nst-primary)] font-black text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-md border border-purple-500/20 capitalize">
                        {prod.condition}
                      </span>
                    )}
                    {prod.variants?.[0]?.battery_health && (
                      <span className="text-[10px] text-gray-400 font-bold">BH: {prod.variants[0].battery_health}%</span>
                    )}
                  </div>

                  {/* Thumbnail Image */}
                  <div className="w-full h-36 flex items-center justify-center mb-4 relative overflow-hidden rounded-lg bg-white select-none">
                    <img
                      src={prod.image || '/images/product-placeholder.svg'}
                      alt={prod.name}
                      className="h-full object-contain group-hover:scale-103 transition-transform duration-500"
                      loading="lazy"
                    />
                  </div>

                  {/* Title and Specs Meta */}
                  <h3 className="text-slate-800 group-hover:text-[var(--nst-primary)] font-extrabold text-sm line-clamp-1 text-left tracking-tight transition-colors">
                    {prod.name}
                  </h3>
                  {prod.variants?.[0] && (
                    <p className="text-gray-400 text-[10px] sm:text-xs font-semibold text-left mt-1 line-clamp-1">
                      {[prod.variants[0].storage, prod.variants[0].color].filter(Boolean).join(' • ')}
                    </p>
                  )}
                </Link>

                {/* Card Pricing and CTA action button footer */}
                <div className="flex items-center justify-between border-t border-gray-50 pt-3.5 mt-4">
                  <div className="flex flex-col text-left">
                    <span className="text-slate-800 font-black text-sm sm:text-base">
                      ৳{prod.price?.toLocaleString()}
                    </span>
                    {prod.old_price && (
                      <span className="text-gray-400 text-[10px] sm:text-xs font-medium line-through">
                        ৳{prod.old_price?.toLocaleString()}
                      </span>
                    )}
                  </div>

                  <Link
                    to={`/product/${prod.slug}`}
                    className="bg-[var(--nst-primary)] text-white text-[11px] font-black px-3.5 py-2 rounded-lg hover:bg-purple-600 transition-colors cursor-pointer shadow-sm"
                  >
                    Details
                  </Link>
                </div>
              </div>
            ))}

            {paginatedProducts.length === 0 && (
              <div className="col-span-full py-16 flex flex-col items-center justify-center text-center bg-white border border-gray-150 rounded-2xl shadow-sm">
                <ShieldAlert className="w-12 h-12 text-gray-300 mb-3" />
                <h3 className="text-slate-800 font-extrabold text-base">No Products Found</h3>
                <p className="text-gray-400 text-xs font-semibold mt-1">Try resetting selected filters to view category models.</p>
              </div>
            )}
          </div>

          {/* Standard Catalog Pagination controls (Layout 2) */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-10">
              {Array.from({ length: totalPages }).map((_, idx) => {
                const pageNum = idx + 1;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => {
                      setCurrentPage(pageNum);
                      window.scrollTo({ top: 300, behavior: 'smooth' });
                    }}
                    className={`w-9 h-9 rounded-lg font-black text-xs sm:text-sm flex items-center justify-center transition-all cursor-pointer ${
                      currentPage === pageNum
                        ? 'bg-[var(--nst-primary)] text-white shadow-md'
                        : 'bg-white hover:bg-gray-100 text-slate-700 border border-gray-150'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
          )}

        </div>

      </div>

      {/* ==========================================
          Mobile Filter Sliding Drawer
          ========================================== */}
      {isMobileFilterOpen && (
        <div className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm transition-opacity">
          
          <div className="w-4/5 max-w-xs bg-white h-full shadow-2xl flex flex-col justify-between py-6 px-4 overflow-y-auto safe-area-top safe-area-bottom text-left">
            
            <div className="flex flex-col gap-6">
              
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-gray-100 pb-3.5">
                <span className="font-extrabold text-slate-800 text-base">Filter Models</span>
                <button
                  type="button"
                  onClick={() => setIsMobileFilterOpen(false)}
                  className="p-1 text-gray-400 hover:text-slate-800 rounded-full hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Price Range */}
              <div className="flex flex-col gap-2.5">
                <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">Price Range</h4>
                <div className="flex flex-col gap-2 text-xs sm:text-sm font-semibold text-gray-500">
                  {[
                    { label: 'Under ৳20,000', value: 'under_20k' },
                    { label: '৳20,000 - ৳40,000', value: '20k_40k' },
                    { label: '৳40,000 - ৳60,000', value: '40k_60k' },
                    { label: '৳60,000 - ৳80,000', value: '60k_80k' },
                    { label: '৳80,000 - ৳100,000', value: '80k_100k' },
                    { label: 'Above ৳100,000', value: 'above_100k' },
                  ].map((bracket) => (
                    <label key={bracket.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="price_bracket_mobile"
                        checked={selectedPriceRange === bracket.value}
                        onChange={() => {
                          setSelectedPriceRange(bracket.value);
                          setCurrentPage(1);
                        }}
                        className="accent-[var(--nst-primary)] h-4 w-4"
                      />
                      <span>{bracket.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Brands */}
              {dynamicFilters.brands.length > 0 && (
                <div className="flex flex-col gap-2.5 border-t border-gray-100 pt-4">
                  <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">Brands</h4>
                  <div className="flex flex-col gap-2 text-xs sm:text-sm font-semibold text-gray-500 max-h-48 overflow-y-auto pr-1">
                    {dynamicFilters.brands.map((b) => (
                      <label key={b} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedBrands.includes(b)}
                          onChange={() => toggleFilter(selectedBrands, setSelectedBrands, b)}
                          className="accent-[var(--nst-primary)] h-4 w-4 rounded"
                        />
                        <span>{b}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Condition */}
              {dynamicFilters.conditions.length > 0 && (
                <div className="flex flex-col gap-2.5 border-t border-gray-100 pt-4">
                  <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">Condition</h4>
                  <div className="flex flex-col gap-2 text-xs sm:text-sm font-semibold text-gray-500">
                    {dynamicFilters.conditions.map((c) => (
                      <label key={c} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedConditions.includes(c)}
                          onChange={() => toggleFilter(selectedConditions, setSelectedCondition, c)}
                          className="accent-[var(--nst-primary)] h-4 w-4 rounded"
                        />
                        <span className="capitalize">{c}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Clear Filters CTA inside Mobile Drawer */}
            <div className="border-t border-gray-100 pt-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={clearAllFilters}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs py-3 rounded-xl cursor-pointer text-center"
              >
                Clear All Filters
              </button>
              <button
                type="button"
                onClick={() => setIsMobileFilterOpen(false)}
                className="w-full bg-[var(--nst-primary)] hover:bg-purple-600 text-white font-extrabold text-xs py-3 rounded-xl cursor-pointer text-center shadow-md"
              >
                Apply Filters
              </button>
            </div>

          </div>

          <div className="flex-grow" onClick={() => setIsMobileFilterOpen(false)} />

        </div>
      )}

    </div>
  );
};

export default CategoryPage;