import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, Plus, Minus, ShoppingBag, Tag, ChevronRight, Gift, Percent } from 'lucide-react';
import toast from 'react-hot-toast';
import { Helmet } from 'react-helmet-async';
import { useCartStore } from '../../store/cart/useCartStore';
import { useAuthStore } from '../../store/auth/useAuthStore';
import { apiClient } from '../../api/client';

export const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { 
    items, 
    subtotal, 
    deliveryFee, 
    discount, 
    total, 
    updateQuantity, 
    removeItem, 
    recalculateTotals 
  } = useCartStore();

  const [couponCode, setCouponCode] = useState('');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  // Layout 8 Specification Dynamic Reward Points Calculator
  // Subtotal of ৳166,000 matches 415 reward points exactly (৳400 spent = 1 point)
  const earnedRewardPoints = Math.floor(subtotal / 400);

  // Apply Coupon code from backend validation routes
  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) {
      toast.error('Please enter a coupon code.');
      return;
    }

    try {
      setIsApplyingCoupon(true);
      // Calls secure coupon validation api endpoint
      const response = await apiClient.get('/coupons/validate', {
        params: { code: couponCode },
      });

      if (response.data?.status) {
        toast.success(`Coupon "${couponCode}" applied successfully!`);
        // Recalculate cart totals (Zustand will handle dynamic update)
        recalculateTotals();
      } else {
        throw new Error(response.data?.message || 'Invalid coupon code.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Coupon code not found or expired.');
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleProceedToCheckout = () => {
    if (items.length === 0) {
      toast.error('Your cart is empty.');
      return;
    }

    if (!isAuthenticated) {
      // Saved state trigger which redirects customer back to checkout after auth
      toast.error('Registration/Login is required to complete checkout.');
      navigate('/login', { state: { from: '/checkout' } });
    } else {
      navigate('/checkout');
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center flex flex-col items-center justify-center min-h-[50vh]">
        <div className="bg-purple-50 p-6 rounded-full mb-4">
          <ShoppingBag className="w-12 h-12 text-[var(--nst-primary)]" />
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight leading-none">Your Cart is Empty</h2>
        <p className="text-gray-400 text-xs sm:text-sm font-semibold mt-2 max-w-sm">Explore our smartphones and premium accessories collections to add items.</p>
        <Link to="/products" className="mt-6 bg-[var(--nst-primary)] hover:bg-purple-600 text-white font-extrabold text-xs sm:text-sm px-6 py-3 rounded-xl shadow-md cursor-pointer transition-colors">
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#f8fafc] min-h-screen pb-16">
      
      {/* Dynamic SEO metadata */}
      <Helmet>
        <title>{`My Cart (${items.length} Items) | New Singapur Telecom`}</title>
        <meta name="description" content="View items in your shopping cart, apply coupons and proceed to secure checkout on New Singapur Telecom." />
      </Helmet>

      {/* Breadcrumbs Row */}
      <div className="bg-white border-b border-gray-150 py-3.5 px-4 text-xs sm:text-sm font-semibold text-gray-500">
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 justify-start text-left">
          <Link to="/" className="hover:text-[var(--nst-primary)]">Home</Link>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <span className="text-slate-800 font-extrabold">My Cart</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        
        {/* ==========================================
            Left Column: Cart Items List (Layout 8)
            ========================================== */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <h1 className="text-lg sm:text-xl font-black text-slate-800 text-left border-b border-gray-150 pb-3">
            My Cart <span className="text-[var(--nst-primary)] font-black font-extrabold">({items.length} items)</span>
          </h1>

          <div className="flex flex-col gap-4">
            {items.map((item) => {
              // Retrieve matching variant specs description
              const variantSpecs = [item.selectedStorage, item.selectedColor, item.selectedSimNetwork]
                .filter(Boolean)
                .join(', ');

              return (
                <div
                  key={item.uniqueId}
                  className="bg-white border border-gray-150 rounded-2xl p-4 sm:p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-all relative"
                >
                  {/* Item Image */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-50 border border-gray-100 p-2 rounded-xl flex items-center justify-center shrink-0 overflow-hidden select-none">
                    <img src={item.productImage || '/images/product-placeholder.svg'} alt={item.productName} className="h-full object-contain" />
                  </div>

                  {/* Item Meta details */}
                  <div className="flex-grow flex flex-col justify-between text-left">
                    <div className="pr-6">
                      <h3 className="font-extrabold text-slate-800 text-sm sm:text-base line-clamp-1">
                        {item.productName}
                      </h3>
                      {variantSpecs && (
                        <p className="text-gray-400 text-[10px] sm:text-xs font-semibold mt-1 line-clamp-1">
                          {variantSpecs}
                        </p>
                      )}
                    </div>

                    {/* Quantity controls */}
                    <div className="flex items-center gap-3.5 mt-3 sm:mt-4">
                      <div className="flex items-center border border-gray-200 rounded-lg px-2 py-1 h-8 shrink-0">
                        <button type="button" onClick={() => updateQuantity(item.uniqueId, item.quantity - 1)} className="text-gray-400 hover:text-slate-800 cursor-pointer">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-black text-slate-800 px-3.5">{item.quantity}</span>
                        <button type="button" onClick={() => updateQuantity(item.uniqueId, item.quantity + 1)} className="text-gray-400 hover:text-slate-800 cursor-pointer">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Display Unit Price multiplier */}
                      <span className="text-xs text-gray-400 font-semibold hidden sm:inline">
                        ৳{item.price?.toLocaleString()} x {item.quantity}
                      </span>
                    </div>
                  </div>

                  {/* Right: Item Pricing & Delete button */}
                  <div className="flex flex-col justify-between items-end self-stretch shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        removeItem(item.uniqueId);
                        toast.success(`${item.productName} removed from cart.`);
                      }}
                      className="p-1 text-gray-300 hover:text-red-500 rounded-full transition-colors cursor-pointer"
                      title="Remove Item"
                    >
                      <Trash2 className="w-4 h-4 sm:w-5 h-5 stroke-[2]" />
                    </button>

                    <span className="text-slate-800 font-black text-sm sm:text-base tracking-tight">
                      ৳{(item.price * item.quantity).toLocaleString()}
                    </span>
                  </div>

                </div>
              );
            })}
          </div>
        </div>

        {/* ==========================================
            Right Column: Cart Summary Sidebar (Layout 8)
            ========================================== */}
        <div className="flex flex-col gap-6">
          <h2 className="text-lg sm:text-xl font-black text-slate-800 text-left border-b border-gray-150 pb-3">
            Cart Summary
          </h2>

          <div className="bg-white border border-gray-150 rounded-2xl p-6 flex flex-col gap-5 shadow-sm text-left">
            {/* Break-down row details */}
            <div className="flex flex-col gap-3 font-semibold text-xs sm:text-sm text-gray-500 border-b border-gray-100 pb-4">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="text-slate-800 font-extrabold">৳{subtotal?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery Fee</span>
                <span className="text-slate-800 font-extrabold">৳{deliveryFee?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-red-500 font-bold">
                <span>Discount</span>
                <span>- ৳{discount?.toLocaleString()}</span>
              </div>
            </div>

            {/* Grand Total */}
            <div className="flex justify-between items-center text-slate-800 border-b border-gray-100 pb-4">
              <span className="font-extrabold text-sm sm:text-base">Total</span>
              <span className="font-black text-lg sm:text-2xl text-[var(--nst-primary)]">
                ৳{total?.toLocaleString()}
              </span>
            </div>

            {/* Have a coupon code input form */}
            <form onSubmit={handleApplyCoupon} className="flex flex-col gap-2.5">
              <span className="text-xs text-slate-800 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-[#ffb800] stroke-[2.5]" />
                <span>Have a coupon code?</span>
              </span>
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden h-11 bg-slate-50">
                <input
                  type="text"
                  placeholder="Enter coupon code"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  disabled={isApplyingCoupon}
                  className="flex-grow px-3 py-2 text-slate-800 text-xs sm:text-sm focus:outline-none placeholder-gray-400 bg-transparent disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isApplyingCoupon}
                  className="bg-[var(--nst-ink)] hover:bg-[var(--nst-primary)] text-white font-extrabold text-xs h-full px-5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </form>

            {/* Checkout proceed CTA button */}
            <button
              type="button"
              onClick={handleProceedToCheckout}
              className="w-full bg-[var(--nst-primary)] hover:bg-purple-600 text-white font-black text-xs sm:text-sm py-3.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-md cursor-pointer mt-2"
            >
              <span>Proceed to Checkout</span>
              <ChevronRight className="w-4.5 h-4.5" />
            </button>

            {/* Aligned Reward Points notification bar (Layout 8 spec) */}
            {earnedRewardPoints > 0 && (
              <div className="bg-[var(--nst-primary)]/5 border border-purple-500/10 p-3 rounded-xl flex items-center gap-2.5 text-[11px] sm:text-xs font-bold text-[var(--nst-primary)] shadow-inner mt-1">
                <Gift className="w-5 h-5 text-[#ffb800] fill-current animate-bounce shrink-0" />
                <span>You will earn <strong className="font-extrabold text-[#ffb800] bg-[var(--nst-ink)] px-1.5 py-0.5 rounded shadow-sm">{earnedRewardPoints}</strong> Reward Points on this order!</span>
              </div>
            )}

          </div>
        </div>

      </div>

    </div>
  );
};

export default CartPage;