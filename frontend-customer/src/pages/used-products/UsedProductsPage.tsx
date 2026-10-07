import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { 
  SlidersHorizontal, 
  ChevronDown, 
  ChevronRight, 
  X, 
  ShieldAlert, 
  Sparkles, 
  Battery, 
  Calendar, 
  ShieldCheck 
} from 'lucide-react';

import { apiClient, handleApiError } from '../../api/client';
import { Product } from '../../types';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';

export const UsedProductsPage: React.FC = () => {
  const { cms } = useWebsiteStore();
  const usedPageSettings = (cms as any)?.usedProductsPage || {};
  const usedBannerUrl = usedPageSettings.bannerUrl || usedPageSettings.banner_url || '';
  const [searchParams] = useSearchParams();
  const searchBrand = searchParams.get('brand') || '';

  // API State
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter Selection States
  const [selectedBrands, setSelectedBrands] = useState<string[]>(searchBrand ? [searchBrand] : []);
  const [selectedRams, setSelectedRam] = useState<string[]>([]);
  const [selectedStorages, setSelectedStorage] = useState<string[]>([]);
  const [selectedConditions, setSelectedCondition] = useState<string[]>([]);
  const [selectedPriceRange, setSelectedPriceRange] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('popular');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Fetch Pre-owned/Used Products from live POS backend
  useEffect(() => {
    let isMounted = true;
    const fetchUsedProductsList = async () => {
      try {
        setIsLoading(true);
        const response = await apiClient.get('/public/products', {
          params: {
            condition: 'used',
            limit: 100, // Fetch a large batch to generate deep dynamic checklists
          },
        });

        if (isMounted && response.data?.status && Array.isArray(response.data?.data)) {
          setProducts(response.data.data);
        }
      } catch (err) {
        // Safe fallback handled gracefully
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchUsedProductsList();
    setCurrentPage(1);

    return () => {
      isMounted = false;
    };
  }, []);

  // ==========================================
  // 1. Dynamic Filters Generator
  // ==========================================
  // Dynamically extracts unique options directly from the fetched used dataset
  const dynamicFilters = useMemo(() => {
    const brandsSet = new Set<string>();
    const ramsSet = new Set<string>();
    const storagesSet = new Set<string>();
    const conditionsSet = new Set<string>();

    products.forEach((prod) => {
      if (prod.brand) brandsSet.add(prod.brand);
      
      // Determine physical device cosmetics/condition grade if defined
      const firstVariant = prod.variants?.[0];
      const conditionGrade = firstVariant?.activation_status || prod.condition || 'Excellent';
      if (conditionGrade) conditionsSet.add(conditionGrade);

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

    // Apply Brand filter
    if (selectedBrands.length > 0) {
      result = result.filter((p) => selectedBrands.includes(p.brand));
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

    // Apply Price Range bracket filter (Layout 7 spec bounds)
    if (selectedPriceRange) {
      result = result.filter((p) => {
        const price = p.price;
        if (selectedPriceRange === 'under_30k') return price < 30000;
        if (selectedPriceRange === '30k_50k') return price >= 30000 && price < 50000;
        if (selectedPriceRange === '50k_80k') return price >= 50000 && price < 80000;
        if (selectedPriceRange === 'above_80k') return price >= 80000;
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
  }, [products, selectedBrands, selectedRams, selectedStorages, selectedPriceRange, sortBy]);

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
    setCurrentPage(1);
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
      
      {/* Dynamic SEO metadata */}
      <Helmet>
        <title>Used & Pre-Owned Phones Store | New Singapur Telecom</title>
        <meta name="description" content="Shop verified pre-owned smartphones and premium gadgets at New Singapur Telecom. 100% quality checked used devices with replacement warranty." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      {/* Large Used Category Banner (Layout 7) */}
      <div className="w-full h-[150px] sm:h-[260px] bg-gradient-to-r from-[#170a2e] to-[#0c051a] relative overflow-hidden flex items-center px-6 sm:px-12 select-none border-b border-purple-950/30">
        {!!usedBannerUrl && (
          <div
            className="absolute inset-0 bg-cover bg-right bg-no-repeat opacity-35"
            style={{ backgroundImage: `url("${usedBannerUrl}")`, backgroundSize: 'cover' }}
          />
        )}
        <div className="max-w-7xl mx-auto w-full z-10 relative text-left">
          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full text-white text-[10px] sm:text-xs font-black uppercase tracking-wider max-w-max mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Verified Used Devices</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-none uppercase">
            Used Products Store
          </h1>
        </div>
      </div>

      {/* Breadcrumbs Row */}
      <div className="bg-white border-b border-gray-150 py-3.5 px-4 text-xs sm:text-sm font-semibold text-gray-500">
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 justify-start text-left">
          <Link to="/" className="hover:text-[var(--nst-primary)]">Home</Link>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <span className="text-slate-800 font-extrabold">Used Products (with Age)</span>
        </div>
      </div>

      {/* Main Catalog Layout Body */}
      <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-4 gap-8 mt-8">
        
        {/* ==========================================
            Left Filters Sidebar (Desktop Only)
            ========================================== */}
        <aside className="hidden lg:flex flex-col gap-6 bg-white border border-gray-150 p-6 rounded-2xl shadow-sm text-left h-max">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <span className="font-extrabold text-slate-800 text-sm sm:text-base">Filters</span>
            <button type="button" onClick={clearAllFilters} className="text-xs text-red-500 hover:text-red-700 font-black cursor-pointer">
              Clear All
            </button>
          </div>

          {/* Price Range Filter Bracket */}
          <div className="flex flex-col gap-2.5">
            <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">Price Range</h4>
            <div className="flex flex-col gap-2 text-xs sm:text-sm font-semibold text-gray-500">
              {[
                { label: 'Under ৳30,000', value: 'under_30k' },
                { label: '৳30,000 - ৳50,000', value: '30k_50k' },
                { label: '৳50,000 - ৳80,000', value: '50k_80k' },
                { label: 'Above ৳80,000', value: 'above_80k' },
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

        </aside>

        {/* ==========================================
            Right Grid Catalog Area
            ========================================== */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          
          {/* Catalog Top Sorting Row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-gray-150 p-4 rounded-2xl shadow-sm">
            <div className="flex flex-col text-left leading-tight shrink-0">
              <span className="text-gray-400 text-xs font-semibold">Showing {filteredProducts.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}-{Math.min(currentPage * itemsPerPage, filteredProducts.length)} of {filteredProducts.length} used devices</span>
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

          {/* Used Products Items Grid Layout (3-columns wide desktop, 2-columns on mobile) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 w-full">
            {paginatedProducts.map((prod) => {
              // Extract variants detail for high-fidelity used product presentation
              const firstVariant = prod.variants?.[0];
              const storage = firstVariant?.storage || '';
              const color = firstVariant?.color || '';
              const specMeta = [storage, color].filter(Boolean).join(' • ');
              const deviceAge = firstVariant?.activation_status || '9 Months';
              const batteryHealth = firstVariant?.battery_health || null;

              return (
                <div
                  key={prod.id}
                  className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col justify-between shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group"
                >
                  <Link to={`/product/${prod.slug}`} className="flex flex-col cursor-pointer">
                    
                    {/* Visual Card Top Header Badges */}
                    <div className="flex items-center justify-between mb-3.5">
                      <span className="bg-emerald-500/10 text-emerald-600 font-black text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-md border border-emerald-500/20">
                        Excellent
                      </span>
                      {batteryHealth && (
                        <span className="flex items-center gap-1 text-[10px] text-gray-400 font-bold">
                          <Battery className="w-3.5 h-3.5 text-emerald-500" />
                          <span>{batteryHealth}%</span>
                        </span>
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
                    {specMeta && (
                      <p className="text-gray-400 text-[10px] sm:text-xs font-semibold text-left line-clamp-1 mt-1">
                        {specMeta}
                      </p>
                    )}

                    {/* Device Used Age Badge */}
                    <div className="flex items-center gap-1 text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-100 rounded-md py-1 px-2.5 max-w-max mt-2.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{deviceAge} used</span>
                    </div>
                  </Link>

                  {/* Card Pricing and details footer */}
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
              );
            })}

            {paginatedProducts.length === 0 && (
              <div className="col-span-full py-16 flex flex-col items-center justify-center text-center bg-white border border-gray-150 rounded-2xl shadow-sm">
                <ShieldAlert className="w-12 h-12 text-gray-300 mb-3" />
                <h3 className="text-slate-800 font-extrabold text-base">No Used Devices Found</h3>
                <p className="text-gray-400 text-xs font-semibold mt-1">Try resetting selected filters to view used product listings.</p>
              </div>
            )}
          </div>

          {/* Catalog Pagination controls (Layout 7) */}
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
                <span className="font-extrabold text-slate-800 text-base">Filter Used Products</span>
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
                    { label: 'Under ৳30,000', value: 'under_30k' },
                    { label: '৳30,000 - ৳50,000', value: '30k_50k' },
                    { label: '৳50,000 - ৳80,000', value: '50k_80k' },
                    { label: 'Above ৳80,000', value: 'above_80k' },
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

            </div>

            {/* Clear Filters CTA inside Mobile Drawer */}
            <div className="border-t border-gray-100 pt-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={clearAllFilters}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs py-3 rounded-xl cursor-pointer text-center"
              >
                Clear All
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

export default UsedProductsPage;