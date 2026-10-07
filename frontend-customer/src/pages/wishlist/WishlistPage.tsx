import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ChevronRight,
  Heart,
  Trash2,
  ShoppingCart,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  X,
  ShieldAlert
} from 'lucide-react';
import toast from 'react-hot-toast';

import { Product } from '../../types';
import { useCartStore } from '../../store/cart/useCartStore';
import { useWishlistStore } from '../../store/wishlist/useWishlistStore';

export const WishlistPage: React.FC = () => {
  const { items, removeItem, clear } = useWishlistStore();
  const addItemToCart = useCartStore((state) => state.addItem);

  // Quick Cart Add helper from Wishlist Card
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

  return (
    <div className="w-full bg-[#f8fafc] min-h-screen pb-16 text-left select-none">

      {/* Dynamic SEO metadata */}
      <Helmet>
        <title>My Wishlist | New Singapur Telecom</title>
        <meta name="description" content="View your saved products, bookmarked iPhones, pre-owned smartphones and premium gadgets on your New Singapur Telecom wishlist." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      {/* Breadcrumbs Row */}
      <div className="bg-white border-b border-gray-150 py-3.5 px-4 text-xs sm:text-sm font-semibold text-gray-500">
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 justify-start text-left">
          <Link to="/" className="hover:text-[var(--nst-primary)]">Home</Link>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <span className="text-slate-800 font-extrabold">My Wishlist</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-8 flex flex-col gap-8">

        {/* Header Title with Clear List trigger */}
        <div className="flex items-center justify-between border-b border-gray-150 pb-3">
          <div className="flex items-center gap-2 font-black text-slate-800 text-lg sm:text-2xl tracking-tight">
            <Heart className="w-6 h-6 text-[var(--nst-primary)] fill-[var(--nst-primary)]/10" />
            <span>My Wishlist <strong className="text-[var(--nst-primary)]">({items.length} items)</strong></span>
          </div>
          {items.length > 0 && (
            <button
              type="button"
              onClick={clear}
              className="text-xs text-red-500 hover:text-red-700 font-black flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear Wishlist</span>
            </button>
          )}
        </div>

        {/* 4-Column Product Grid for Wishlist (Layout 11 SPEC) */}
        {items.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 w-full">
            {items.map((prod) => {
              const firstVariant = prod.variants?.[0];
              const storage = firstVariant?.storage || '';
              const color = firstVariant?.color || '';
              const specMeta = [storage, color].filter(Boolean).join(' • ');

              return (
                <div
                  key={prod.id}
                  className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col justify-between shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group relative"
                >
                  {/* Delete Bookmarked Item node trigger button */}
                  <button
                    type="button"
                    onClick={() => removeItem(prod.id)}
                    className="absolute top-3 right-3 p-1.5 bg-slate-50 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-full border border-gray-100 transition-colors cursor-pointer z-10"
                    title="Remove from wishlist"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <Link to={`/product/${prod.slug}`} className="flex flex-col cursor-pointer">

                    {/* Visual Card Top Header Badge */}
                    <div className="flex items-start mb-3.5">
                      {prod.condition && (
                        <span className="bg-purple-500/10 text-[var(--nst-primary)] font-black text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-md border border-purple-500/20 capitalize">
                          {prod.condition}
                        </span>
                      )}
                    </div>

                    {/* Image Wrapper */}
                    <div className="w-full h-32 flex items-center justify-center mb-3.5 select-none bg-white rounded-lg">
                      <img src={prod.image || '/images/product-placeholder.svg'} alt={prod.name} className="h-full object-contain group-hover:scale-103 transition-transform duration-500" />
                    </div>

                    {/* Meta Info */}
                    <h3 className="text-slate-800 group-hover:text-[var(--nst-primary)] font-extrabold text-sm line-clamp-1 text-left tracking-tight transition-colors">
                      {prod.name}
                    </h3>
                    {specMeta && (
                      <p className="text-gray-400 text-[10px] sm:text-xs font-semibold text-left mt-1 line-clamp-1">
                        {specMeta}
                      </p>
                    )}
                  </Link>

                  {/* Pricing and direct Cart adding CTA buttons footer */}
                  <div className="flex items-center justify-between border-t border-gray-50 pt-3.5 mt-4">
                    <div className="flex flex-col text-left">
                      <span className="text-slate-800 font-black text-sm">৳{prod.price?.toLocaleString()}</span>
                      {prod.old_price && (
                        <span className="text-gray-400 text-[10px] line-through">৳{prod.old_price?.toLocaleString()}</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleQuickAddToCart(prod)}
                      className="bg-[var(--nst-primary)] hover:bg-purple-600 text-white font-black text-[10px] py-2 px-3 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white border border-gray-150 rounded-3xl p-16 text-center flex flex-col items-center justify-center min-h-[40vh] animate-fade-in">
            <Heart className="w-12 h-12 text-gray-300 mb-3" />
            <h3 className="text-slate-800 font-extrabold text-base">Your Wishlist is Empty</h3>
            <p className="text-gray-400 text-xs font-semibold mt-1">Please bookmark products from shop lists to add them to your wishlist folder.</p>
            <Link to="/products" className="mt-5 bg-[var(--nst-primary)] hover:bg-purple-600 text-white font-extrabold text-xs sm:text-sm px-6 py-3 rounded-xl shadow-md cursor-pointer transition-all">
              Browse Devices
            </Link>
          </div>
        )}

      </div>
    </div>
  );
};

export default WishlistPage;