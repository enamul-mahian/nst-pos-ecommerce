import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { 
  ChevronRight, 
  GitCompare, 
  Trash2, 
  ShoppingCart, 
  ShieldCheck, 
  ArrowRight, 
  Sparkles, 
  X, 
  ShieldAlert 
} from 'lucide-react';
import { useCompareStore } from '../../store/compare/useCompareStore';
import toast from 'react-hot-toast';
import type { Product } from '../../types';
import { useCartStore } from '../../store/cart/useCartStore';

// ==========================================
// 2. Main Comparison Page Component
// ==========================================
export const ComparePage: React.FC = () => {
  const { items, removeItem, clear } = useCompareStore();
  const addItemToCart = useCartStore((state) => state.addItem);

  // Quick Cart Add helper from Compare Cards
  const handleQuickAddToCart = (product: Product) => {
    // Falls back to first active variant if available, otherwise standard
    const targetVariant = product.variants?.[0] || null;
    addItemToCart(
      product,
      targetVariant,
      1,
      targetVariant ? targetVariant.storage : null,
      targetVariant ? targetVariant.ram : null,
      targetVariant ? targetVariant.sim_network : null,
      targetVariant ? targetVariant.color : null
    );
    toast.success(`${product.name} added to cart.`);
  };

  // ==========================================
  // 3. Dynamic Specifications Union Matrix Generator
  // ==========================================
  // Dynamically extracts unique specification fields across compared products (no hardcoded rows)
  const dynamicSpecKeys = useMemo(() => {
    const keysSet = new Set<string>();
    
    // Add default core properties first for nice layout order
    keysSet.add('brand');
    keysSet.add('category');
    keysSet.add('condition');
    keysSet.add('warranty');

    items.forEach((prod) => {
      if (prod.specifications) {
        if (Array.isArray(prod.specifications)) {
          // If specs stored as array of objects
          prod.specifications.forEach((spec: any) => {
            if (spec && typeof spec === 'object' && 'key' in spec) {
              keysSet.add(spec.key.toLowerCase());
            }
          });
        } else if (typeof prod.specifications === 'object') {
          // If specs stored as JSON key-value records
          Object.keys(prod.specifications).forEach((key) => {
            keysSet.add(key.toLowerCase());
          });
        }
      }
    });

    return Array.from(keysSet);
  }, [items]);

  // Specifications value extractor matching index matrices
  const getSpecValue = (product: Product, key: string): string => {
    const lowerKey = key.toLowerCase();
    
    // Handle core model properties
    if (lowerKey === 'brand') return product.brand || 'Standard';
    if (lowerKey === 'category') return product.category || 'Standard';
    if (lowerKey === 'condition') return product.condition || 'New';
    if (lowerKey === 'warranty') return product.warranty || 'No Warranty';

    // Handle nested technical specifications
    if (product.specifications) {
      if (Array.isArray(product.specifications)) {
        const found = product.specifications.find(
          (spec: any) => spec && typeof spec === 'object' && spec.key?.toLowerCase() === lowerKey
        );
        return found ? String(found.value) : '—';
      } else if (typeof product.specifications === 'object') {
        const foundKey = Object.keys(product.specifications).find(
          (k) => k.toLowerCase() === lowerKey
        );
        return foundKey ? String((product.specifications as any)[foundKey]) : '—';
      }
    }

    return '—';
  };

  return (
    <div className="w-full bg-[#f8fafc] min-h-screen pb-16 text-left select-none">
      
      {/* Dynamic SEO metadata */}
      <Helmet>
        <title>Compare Premium Gadget Specifications | New Singapur Telecom</title>
        <meta name="description" content="Compare genuine smartphones, tablets, used devices and premium accessories side-by-side with dynamic specifications matrix at New Singapur Telecom." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      {/* Breadcrumbs Row */}
      <div className="bg-white border-b border-gray-150 py-3.5 px-4 text-xs sm:text-sm font-semibold text-gray-500">
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 justify-start text-left">
          <Link to="/" className="hover:text-[var(--nst-primary)]">Home</Link>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <span className="text-slate-800 font-extrabold">Compare Products</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-8 flex flex-col gap-8">
        
        {/* Header Title with Clear List trigger */}
        <div className="flex items-center justify-between border-b border-gray-150 pb-3">
          <div className="flex items-center gap-2 font-black text-slate-800 text-lg sm:text-2xl tracking-tight">
            <GitCompare className="w-6 h-6 text-[var(--nst-primary)]" />
            <span>Compare Products <strong className="text-[var(--nst-primary)]">({items.length} items)</strong></span>
          </div>
          {items.length > 0 && (
            <button
              type="button"
              onClick={clear}
              className="text-xs text-red-500 hover:text-red-700 font-black flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear List</span>
            </button>
          )}
        </div>

        {items.length > 0 ? (
          <div className="w-full flex flex-col gap-6 bg-white border border-gray-150 rounded-3xl p-6 sm:p-8 shadow-sm">
            
            {/* ==========================================
                Part A: Product Cards Matrix (Layout 13)
                ========================================== */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end pb-6 border-b border-gray-100">
              {/* Empty corner block of matrix */}
              <div className="hidden md:flex flex-col text-left">
                <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Features Details</span>
                <span className="text-slate-800 font-black text-sm mt-1">Unified Specifications Matrix</span>
              </div>

              {/* Item Card loop (Up to 3 columns) */}
              <div className="col-span-1 md:col-span-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {items.map((prod) => (
                  <div key={prod.id} className="border border-gray-100 rounded-2xl p-4 flex flex-col justify-between text-center relative group shadow-sm hover:shadow-md transition-shadow">
                    
                    {/* Delete comparison node trigger button */}
                    <button
                      type="button"
                      onClick={() => removeItem(prod.id)}
                      className="absolute top-3 right-3 p-1.5 bg-slate-50 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-full border border-gray-100 transition-colors cursor-pointer"
                      title="Remove from comparison"
                    >
                      <X className="w-4 h-4" />
                    </button>

                    {/* Image */}
                    <div className="w-full h-32 flex items-center justify-center mb-3.5 select-none bg-white rounded-lg">
                      <img src={prod.image || '/images/product-placeholder.svg'} alt={prod.name} loading="lazy" decoding="async" className="h-full object-contain" />
                    </div>

                    <h3 className="font-extrabold text-slate-800 text-sm sm:text-base line-clamp-1 mb-1 tracking-tight">
                      {prod.name}
                    </h3>
                    
                    <span className="text-[var(--nst-primary)] font-black text-sm mb-4 block">
                      ৳{prod.price?.toLocaleString()}
                    </span>

                    {/* Add to Cart directly from compare list */}
                    <button
                      type="button"
                      onClick={() => handleQuickAddToCart(prod)}
                      className="w-full bg-[var(--nst-primary)] hover:bg-purple-600 text-white font-extrabold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      <span>Add to Cart</span>
                    </button>

                  </div>
                ))}

                {/* Grid placeholder if compared is less than 3 */}
                {items.length < 3 && (
                  <div className="border-2 border-dashed border-gray-150 rounded-2xl p-6 flex flex-col items-center justify-center text-center min-h-[220px] select-none">
                    <Sparkles className="w-8 h-8 text-purple-200 mb-2 animate-pulse" />
                    <span className="text-gray-400 font-bold text-xs">Add more products to compare</span>
                    <Link to="/products" className="text-[var(--nst-primary)] hover:text-purple-700 font-extrabold text-xs flex items-center gap-0.5 mt-2">
                      <span>Browse Products</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* ==========================================
                Part B: Dynamic Specs Matrix Rows (Layout 13 spec)
                ========================================== */}
            <div className="w-full overflow-x-auto scrollbar-none">
              <div className="min-w-[650px] flex flex-col text-xs sm:text-sm font-semibold">
                {dynamicSpecKeys.map((key, idx) => (
                  <div
                    key={key}
                    className={`flex items-start p-3.5 border-b border-gray-50 ${
                      idx % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'
                    }`}
                  >
                    {/* Feature Label Name */}
                    <div className="w-1/4 text-slate-500 font-extrabold capitalize truncate select-none pr-4">
                      {key.replace(/_/g, ' ')}
                    </div>

                    {/* Matrix Column Values */}
                    <div className="w-3/4 grid grid-cols-3 gap-6">
                      {items.map((prod) => (
                        <div key={prod.id} className="text-slate-800 leading-snug pr-2">
                          {getSpecValue(prod, key)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Verification badge */}
            <div className="flex items-center gap-1.5 text-[9px] text-gray-400 font-bold uppercase select-none border-t border-gray-50 pt-4">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Verified POS specifications matching complete</span>
            </div>

          </div>
        ) : (
          <div className="bg-white border border-gray-150 rounded-3xl p-16 text-center flex flex-col items-center justify-center min-h-[40vh] animate-fade-in">
            <GitCompare className="w-12 h-12 text-gray-300 mb-3" />
            <h3 className="text-slate-800 font-extrabold text-base">Comparison List is Empty</h3>
            <p className="text-gray-400 text-xs font-semibold mt-1">Please select products from shop lists to compare their specifications side-by-side.</p>
            <Link to="/products" className="mt-5 bg-[var(--nst-primary)] hover:bg-purple-600 text-white font-extrabold text-xs sm:text-sm px-6 py-3 rounded-xl shadow-md cursor-pointer transition-all">
              Browse Devices
            </Link>
          </div>
        )}

      </div>
    </div>
  );
};

export default ComparePage;