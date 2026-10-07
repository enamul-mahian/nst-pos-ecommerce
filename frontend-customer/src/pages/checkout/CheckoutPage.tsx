import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronRight, CreditCard, Truck, ShieldCheck, MapPin, Phone, User, Mail, FileCheck, Package } from 'lucide-react';
import toast from 'react-hot-toast';

// Store imports
import { useCartStore } from '../../store/cart/useCartStore';
import { useAuthStore } from '../../store/auth/useAuthStore';
import { apiClient, handleApiError } from '../../api/client';
import PaymentMethodsPanel from '../../components/checkout/PaymentMethodsPanel';
import { StorefrontSections } from '../../components/storefront/NstHome';

export const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { 
    items, 
    subtotal, 
    deliveryFee, 
    discount, 
    total, 
    paymentMethod, 
    shippingMethod, 
    setPaymentMethod, 
    setShippingMethod, 
    clearCart 
  } = useCartStore();

  // Delivery Address Form States
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // Sync state values on initial render if profile data is loaded
  useEffect(() => {
    if (user) {
      if (!name) setName(user.name);
      if (!phone) setPhone(user.phone);
      if (!email && user.email) setEmail(user.email);
    }
  }, [user, name, phone, email]);

  const handlePlaceOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Core Address validations
    if (!name.trim() || !phone.trim() || !addressLine.trim() || !city.trim() || !district.trim()) {
      toast.error('Please fill out all mandatory delivery address fields.');
      return;
    }

    if (['sslcommerz', 'piprapay'].includes(paymentMethod) && (!email.trim() || !postalCode.trim())) {
      toast.error('Email address and postal code are required for secure online payment.');
      return;
    }

    if (items.length === 0) {
      toast.error('Your shopping cart is empty.');
      return;
    }

    try {
      setIsPlacingOrder(true);

      const orderPayload = {
        name,
        phone,
        email: email || undefined,
        address_line: addressLine,
        city,
        district,
        postal_code: postalCode || undefined,
        payment_method: paymentMethod,
        shipping_method: shippingMethod,
        items: items.map((item) => ({
          product_id: item.productId,
          variant_id: item.selectedVariant ? item.selectedVariant.id : null,
          branch_id: item.selectedBranchId || item.selectedVariant?.branch_id || null,
          quantity: item.quantity,
          rate: item.price,
        })),
        subtotal,
        delivery_fee: deliveryFee,
        discount,
        total,
      };

      // Create Order on secure Backend POS portal endpoint
      const response = await apiClient.post('/portal/orders', orderPayload);
      const data = response.data;

      if (!data.status) {
        throw new Error(data.message || 'Order creation failed.');
      }

      const createdOrder = data.data || data.order;
      const orderNo = createdOrder?.order_no || createdOrder?.id;

      if (paymentMethod === 'sslcommerz') {
        toast.loading('Redirecting to secure SSLCOMMERZ gateway...');

        const initResponse = await apiClient.post('/payment/sslcommerz/init', {
          order_id: createdOrder.id,
        });

        if (initResponse.data?.status && initResponse.data?.GatewayPageURL) {
          window.location.href = initResponse.data.GatewayPageURL;
        } else {
          throw new Error('Unable to resolve SSLCOMMERZ initiation gateway URL.');
        }
      } else if (paymentMethod === 'piprapay') {
        toast.loading('Redirecting to secure PipraPay gateway...');

        const initResponse = await apiClient.post('/payment/piprapay/init', {
          order_id: createdOrder.id,
        });
        const paymentUrl = initResponse.data?.pp_url || initResponse.data?.payment_url;

        if (initResponse.data?.status && paymentUrl) {
          window.location.href = paymentUrl;
        } else {
          throw new Error('Unable to resolve PipraPay initiation gateway URL.');
        }
      } else {
        // Cash on Delivery direct success flow
        toast.success('Order placed successfully! Cash on Delivery confirmed.');
        clearCart();
        navigate(`/order-success?order_id=${orderNo}&total=${total}&method=cod`);
      }
    } catch (err: any) {
      const priceChanges = err?.response?.data?.price_changes;
      if (Array.isArray(priceChanges) && priceChanges.length) useCartStore.getState().syncPrices(priceChanges);
      const parsedError = handleApiError(err);
      toast.error(parsedError.message || 'An error occurred during checkout.');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  return (
    <div className="w-full bg-[#f8fafc] min-h-screen pb-16">
      <StorefrontSections pageId="checkout" placement="top" />

      <Helmet>
        <title>Secure Checkout | New Singapur Telecom</title>
        <meta name="description" content="Complete your purchase securely on New Singapur Telecom with SSLCOMMERZ, PipraPay or Cash on Delivery." />
      </Helmet>

      {/* Breadcrumbs Row */}
      <div className="bg-white border-b border-gray-150 py-3.5 px-4 text-xs sm:text-sm font-semibold text-gray-500">
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 justify-start text-left">
          <Link to="/" className="hover:text-[var(--nst-primary)]">Home</Link>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <Link to="/cart" className="hover:text-[var(--nst-primary)]">Cart</Link>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <span className="text-slate-800 font-extrabold">Checkout</span>
        </div>
      </div>

      <form onSubmit={handlePlaceOrderSubmit} className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8 text-left">
        
        {/* ==========================================
            Left Column: Delivery Address, Shipping, Payments (Layout 4)
            ========================================== */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Section 1: Delivery Address Form */}
          <div className="bg-white border border-gray-150 p-6 sm:p-8 rounded-2xl shadow-sm flex flex-col gap-4">
            <h2 className="text-sm sm:text-base font-extrabold text-slate-800 border-b border-gray-100 pb-3 flex items-center gap-2 uppercase tracking-wider">
              <MapPin className="w-4.5 h-4.5 text-[var(--nst-primary)]" />
              <span>Delivery Address</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Full Name */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-800 font-bold uppercase tracking-wider">Recipient Name</span>
                <div className="flex items-center border border-gray-200 rounded-xl px-3 h-11 bg-slate-50 focus-within:border-[var(--nst-primary)] transition-all">
                  <User className="w-4.5 h-4.5 text-gray-400 shrink-0" />
                  <input type="text" required placeholder="Enter full name" value={name} onChange={(e) => setName(e.target.value)} disabled={isPlacingOrder} className="flex-grow px-3 py-2 text-slate-800 text-sm focus:outline-none bg-transparent placeholder-gray-400 disabled:opacity-50" />
                </div>
              </div>

              {/* Phone Number */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-800 font-bold uppercase tracking-wider">Phone Number</span>
                <div className="flex items-center border border-gray-200 rounded-xl px-3 h-11 bg-slate-50 focus-within:border-[var(--nst-primary)] transition-all">
                  <Phone className="w-4.5 h-4.5 text-gray-400 shrink-0" />
                  <input type="tel" required placeholder="Enter phone number" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isPlacingOrder} className="flex-grow px-3 py-2 text-slate-800 text-sm focus:outline-none bg-transparent placeholder-gray-400 disabled:opacity-50" />
                </div>
              </div>

              {/* Email Address */}
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-xs text-slate-800 font-bold uppercase tracking-wider">Email Address {['sslcommerz', 'piprapay'].includes(paymentMethod) ? '(Required for online payment)' : '(Optional)'}</span>
                <div className="flex items-center border border-gray-200 rounded-xl px-3 h-11 bg-slate-50 focus-within:border-[var(--nst-primary)] transition-all">
                  <Mail className="w-4.5 h-4.5 text-gray-400 shrink-0" />
                  <input type="email" required={['sslcommerz', 'piprapay'].includes(paymentMethod)} placeholder="Enter email address" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isPlacingOrder} className="flex-grow px-3 py-2 text-slate-800 text-sm focus:outline-none bg-transparent placeholder-gray-400 disabled:opacity-50" />
                </div>
              </div>

              {/* Address Line */}
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-xs text-slate-800 font-bold uppercase tracking-wider">Street Address / House / Flat</span>
                <div className="flex items-center border border-gray-200 rounded-xl px-3 h-11 bg-slate-50 focus-within:border-[var(--nst-primary)] transition-all">
                  <input type="text" required placeholder="Enter house no, road no, area, flat" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} disabled={isPlacingOrder} className="flex-grow px-3 py-2 text-slate-800 text-sm focus:outline-none bg-transparent placeholder-gray-400 disabled:opacity-50" />
                </div>
              </div>

              {/* City */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-800 font-bold uppercase tracking-wider">City</span>
                <input type="text" required placeholder="Enter city" value={city} onChange={(e) => setCity(e.target.value)} disabled={isPlacingOrder} className="border border-gray-200 rounded-xl px-4 h-11 bg-slate-50 focus:outline-none focus:border-[var(--nst-primary)] text-slate-800 text-sm placeholder-gray-400 disabled:opacity-50" />
              </div>

              {/* District */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-800 font-bold uppercase tracking-wider">District</span>
                <input type="text" required placeholder="Enter district" value={district} onChange={(e) => setDistrict(e.target.value)} disabled={isPlacingOrder} className="border border-gray-200 rounded-xl px-4 h-11 bg-slate-50 focus:outline-none focus:border-[var(--nst-primary)] text-slate-800 text-sm placeholder-gray-400 disabled:opacity-50" />
              </div>

              {/* Postal Code */}
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-xs text-slate-800 font-bold uppercase tracking-wider">Postal Code {['sslcommerz', 'piprapay'].includes(paymentMethod) ? '(Required for online payment)' : '(Optional)'}</span>
                <input type="text" required={['sslcommerz', 'piprapay'].includes(paymentMethod)} placeholder={['sslcommerz', 'piprapay'].includes(paymentMethod) ? 'Enter postal code' : 'Enter postal code (optional)'} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} disabled={isPlacingOrder} className="border border-gray-200 rounded-xl px-4 h-11 bg-slate-50 focus:outline-none focus:border-[var(--nst-primary)] text-slate-800 text-sm placeholder-gray-400 disabled:opacity-50" />
              </div>
            </div>
          </div>

          {/* Section 2: Shipping Method Options (Layout 4 SPEC) */}
          <div className="bg-white border border-gray-150 p-6 sm:p-8 rounded-2xl shadow-sm flex flex-col gap-4">
            <h2 className="text-sm sm:text-base font-extrabold text-slate-800 border-b border-gray-100 pb-3 flex items-center gap-2 uppercase tracking-wider">
              <Truck className="w-4.5 h-4.5 text-[var(--nst-primary)]" />
              <span>Shipping Method</span>
            </h2>

            <div className="flex flex-col gap-3">
              {[
                { label: 'Inside Dhaka', fee: 60, time: 'Delivery in 24-48 hours', value: 'inside_dhaka' },
                { label: 'Outside Dhaka', fee: 120, time: 'Delivery in 2-4 days', value: 'outside_dhaka' },
                { label: 'Cash on Delivery', fee: 200, time: 'Delivery in 24-48 hours', value: 'cash_on_delivery' },
              ].map((method) => (
                <label
                  key={method.value}
                  className={`border rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all ${
                    shippingMethod === method.value
                      ? 'border-[var(--nst-primary)] bg-[var(--nst-primary)]/5 text-[var(--nst-primary)] ring-2 ring-[var(--nst-primary)]/20'
                      : 'border-gray-150 text-slate-700 hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="shipping_option"
                      checked={shippingMethod === method.value}
                      onChange={() => setShippingMethod(method.value)}
                      className="accent-[var(--nst-primary)] h-4 w-4"
                    />
                    <div className="flex flex-col text-left">
                      <span className="font-extrabold text-sm sm:text-base text-slate-800">{method.label}</span>
                      <span className="text-gray-400 text-xs font-semibold mt-1">{method.time}</span>
                    </div>
                  </div>
                  <span className="font-black text-sm sm:text-base text-slate-800">৳{method.fee}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Section 3: Dynamic Payment Gateway Manager options */}
          <PaymentMethodsPanel paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} />

        </div>
        {/* ==========================================
            Right Column: Order Summary Sidebar (Layout 4)
            ========================================== */}
        <div className="flex flex-col gap-6">
          <h2 className="text-sm sm:text-base font-extrabold text-slate-800 border-b border-gray-100 pb-3 flex items-center gap-2 uppercase tracking-wider">
            <FileCheck className="w-4.5 h-4.5 text-[var(--nst-primary)]" />
            <span>Order Summary</span>
          </h2>

          <div className="bg-white border border-gray-150 rounded-2xl p-6 flex flex-col gap-5 shadow-sm">
            
            {/* Small Product List Cards */}
            <div className="flex flex-col gap-3.5 border-b border-gray-100 pb-4 max-h-56 overflow-y-auto pr-1">
              {items.map((item) => (
                <div key={item.uniqueId} className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-slate-50 border border-gray-100 p-1 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
                    {item.productImage ? <img src={item.productImage} alt={item.productName} className="h-full object-contain" /> : <Package className="h-6 w-6 text-slate-300" aria-label="Product image unavailable" />}
                  </div>
                  <div className="flex-grow flex flex-col text-left leading-tight text-xs sm:text-sm">
                    <h4 className="font-extrabold text-slate-800 line-clamp-1">{item.productName}</h4>
                    <span className="text-gray-400 font-semibold text-[10px] mt-0.5 truncate block">{item.selectedStorage || 'Standard'} x {item.quantity}</span>
                  </div>
                  <span className="font-black text-slate-800 text-xs sm:text-sm shrink-0">৳{(item.price * item.quantity).toLocaleString()}</span>
                </div>
              ))}
            </div>

            {/* Calculations Row list */}
            <div className="flex flex-col gap-2.5 font-semibold text-xs sm:text-sm text-gray-500 border-b border-gray-100 pb-4">
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

            {/* Total Balance */}
            <div className="flex justify-between items-center text-slate-800 border-b border-gray-100 pb-4 select-none">
              <span className="font-extrabold text-sm sm:text-base">Total</span>
              <span className="font-black text-lg sm:text-2xl text-[var(--nst-primary)]">
                ৳{total?.toLocaleString()}
              </span>
            </div>

            {/* Terms and Conditions Legal agreement notice */}
            <p className="text-[10px] sm:text-xs text-gray-400 leading-relaxed text-center font-medium">
              By placing the order, you agree to our{' '}
              <Link to="/legal/terms" className="text-[var(--nst-primary)] hover:underline font-bold">Terms & Conditions</Link> and{' '}
              <Link to="/legal/privacy" className="text-[var(--nst-primary)] hover:underline font-bold">Privacy Policy</Link>.
            </p>

            {/* Primary Order/Pay Button trigger */}
            <button
              type="submit"
              disabled={isPlacingOrder}
              className="w-full bg-[var(--nst-primary)] hover:bg-purple-600 disabled:bg-purple-300 text-white font-black text-xs sm:text-sm py-3.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer mt-2 disabled:cursor-not-allowed"
            >
              {['sslcommerz', 'piprapay'].includes(paymentMethod) ? (
                <>
                  <CreditCard className="w-4.5 h-4.5" />
                  <span>
                    {isPlacingOrder
                      ? 'Processing Payment...'
                      : `Pay ৳${total?.toLocaleString()} with ${paymentMethod === 'piprapay' ? 'PipraPay' : 'SSLCOMMERZ'}`}
                  </span>
                </>
              ) : (
                <>
                  <Truck className="w-4.5 h-4.5" />
                  <span>{isPlacingOrder ? 'Placing Order...' : 'Place Order (Cash on Delivery)'}</span>
                </>
              )}
            </button>
            {/* Secure Payment Badge details */}
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-gray-400 font-bold tracking-wider uppercase mt-1">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>100% Secured Checkout Guarantee</span>
            </div>

          </div>
        </div>

      </form>

      <StorefrontSections pageId="checkout" placement="bottom" />
    </div>
  );
};

export default CheckoutPage;