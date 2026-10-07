import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ChevronRight,
  CalendarRange,
  Clock,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  CreditCard,
  ArrowRight,
  Sparkles,
  X,
  ShieldAlert
} from 'lucide-react';
import toast from 'react-hot-toast';

import { apiClient, handleApiError } from '../../api/client';
import { useAuthStore } from '../../store/auth/useAuthStore';
import { Product, ProductVariant } from '../../types';

export const PreOrderPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAuthenticated } = useAuthStore();

  // API & Data States
  const [preOrderProducts, setPreOrderProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mandatory Selections for Booking
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedStorage, setSelectedStorage] = useState<string | null>(null);
  const [selectedSimNetwork, setSelectedSimNetwork] = useState<string | null>(null);
  const [selectedRam, setSelectedRam] = useState<string | null>(null);

  // Customer Contact Fields
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');

  // Sync profile details if logged in
  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(user.phone);
      if (user.email) setEmail(user.email);
    }
  }, [user]);

  // Fetch all Pre-Order products on mount
  useEffect(() => {
    let isMounted = true;
    const fetchPreOrders = async () => {
      try {
        setIsLoading(true);
        // Load products flagged for preorder from database
        const response = await apiClient.get('/public/products', {
          params: { limit: 50 },
        });

        if (isMounted && response.data?.status && Array.isArray(response.data?.data)) {
          // Filter items supporting preorder
          const filtered = response.data.data.filter(
            (p: Product) => p.allow_preorder || p.status?.toLowerCase().includes('pre order')
          );
          setPreOrderProducts(filtered);
        }
      } catch (err) {
        // Handled gracefully
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchPreOrders();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const requestedProduct = searchParams.get('product');
    if (!requestedProduct || !preOrderProducts.length || selectedProduct) return;
    const found = preOrderProducts.find((item) => String(item.id) === requestedProduct || item.slug === requestedProduct);
    if (found) setSelectedProduct(found);
  }, [searchParams, preOrderProducts, selectedProduct]);

  useEffect(() => {
    const requestedVariant = searchParams.get('variant');
    if (!requestedVariant || !selectedProduct?.variants?.length) return;
    const variant = selectedProduct.variants.find((item) => String(item.id) === requestedVariant);
    if (!variant) return;
    setSelectedStorage(variant.storage || null); setSelectedRam(variant.ram || null); setSelectedColor(variant.color || null); setSelectedSimNetwork(variant.sim_network || null);
  }, [searchParams, selectedProduct]);

  // Options extractor for the selected booking product
  const options = useMemo(() => {
    if (!selectedProduct?.variants) return { colors: [], storages: [], sims: [], rams: [] };

    const colors = new Set<string>();
    const storages = new Set<string>();
    const sims = new Set<string>();
    const rams = new Set<string>();

    selectedProduct.variants.forEach((v) => {
      if (v.color) colors.add(v.color);
      if (v.storage) storages.add(v.storage);
      if (v.sim_network) sims.add(v.sim_network);
      if (v.ram) rams.add(v.ram);
    });

    return {
      colors: Array.from(colors),
      storages: Array.from(storages),
      sims: Array.from(sims),
      rams: Array.from(rams),
    };
  }, [selectedProduct]);

  const hasColor = options.colors.length > 0;
  const hasStorage = options.storages.length > 0;
  const hasSim = options.sims.length > 0;
  const hasRam = options.rams.length > 0;

  const isAllOptionsSelected = useMemo(() => {
    const colorDone = !hasColor || selectedColor !== null;
    const storageDone = !hasStorage || selectedStorage !== null;
    const simDone = !hasSim || selectedSimNetwork !== null;
    const ramDone = !hasRam || selectedRam !== null;
    return colorDone && storageDone && simDone && ramDone;
  }, [hasColor, hasStorage, hasSim, hasRam, selectedColor, selectedStorage, selectedSimNetwork, selectedRam]);

  const resolvedVariant = useMemo((): ProductVariant | null => {
    if (!selectedProduct?.variants || !isAllOptionsSelected) return null;

    return selectedProduct.variants.find((v) => {
      const matchColor = !hasColor || v.color === selectedColor;
      const matchStorage = !hasStorage || v.storage === selectedStorage;
      const matchSim = !hasSim || v.sim_network === selectedSimNetwork;
      const matchRam = !hasRam || v.ram === selectedRam;
      return matchColor && matchStorage && matchSim && matchRam;
    }) || null;
  }, [selectedProduct, isAllOptionsSelected, hasColor, hasStorage, hasSim, hasRam, selectedColor, selectedStorage, selectedSimNetwork, selectedRam]);

  // Dynamic booking value calculator (e.g. Percentage vs Flat rate ৳10,000)
  const bookingAmount = useMemo(() => {
    if (!selectedProduct) return 0;
    const targetPrice = resolvedVariant ? resolvedVariant.price : selectedProduct.price;
    const val = parseFloat(selectedProduct.minimum_booking_value || '10000');
    const type = selectedProduct.minimum_booking_type || 'flat';

    if (type === 'percentage') {
      return Math.floor((targetPrice * val) / 100);
    }
    return Math.floor(val); // Flat rate (default ৳10,000)
  }, [selectedProduct, resolvedVariant]);

  const handlePreOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    if (!isAllOptionsSelected || !resolvedVariant) {
      toast.error('Please complete all required variant selections.');
      return;
    }

    if (!name.trim() || !phone.trim()) {
      toast.error('Please provide your name and contact phone number.');
      return;
    }

    try {
      setIsSubmitting(true);

      const bookingPayload = {
        product_id: selectedProduct.id,
        product_variant_id: resolvedVariant.id,
        branch_id: resolvedVariant.branch_id || (searchParams.get('branch') ? Number(searchParams.get('branch')) : null),
        customer_name: name,
        customer_phone: phone,
        customer_email: email || undefined,
        product_name: selectedProduct.name,
        product_price: resolvedVariant.price || selectedProduct.price,
        payment_method: 'cash_on_delivery',
        note: `Exact variant: ${resolvedVariant.sku || resolvedVariant.id}; Storage=${resolvedVariant.storage || '-'}; RAM=${resolvedVariant.ram || '-'}; Color=${resolvedVariant.color || '-'}; Country=${resolvedVariant.country_region || '-'}; SIM=${resolvedVariant.sim_type || '-'}; Network=${resolvedVariant.network_carrier || resolvedVariant.sim_network || '-'}; Condition=${resolvedVariant.condition || selectedProduct.condition || '-'}; Branch=${resolvedVariant.branch_name || resolvedVariant.branch_id || '-'}`,
      };

      // Submit pre-order booking to secure API endpoint
      const response = await apiClient.post('/public/bookings', bookingPayload);
      const data = response.data;

      if (!data.success) {
        throw new Error(data.message || 'Booking submission failed.');
      }

      toast.success('Your Pre-Order booking has been reserved successfully!');

      // Clear fields and redirect back to tracking
      setSelectedProduct(null);
      navigate('/portal/dashboard');

    } catch (err: any) {
      const parsedError = handleApiError(err);
      toast.error(parsedError.message || 'An error occurred during booking.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full bg-[#f8fafc] min-h-screen pb-16 text-left">

      {/* Dynamic SEO metadata */}
      <Helmet>
        <title>Pre-Order Premium Gadgets | New Singapur Telecom</title>
        <meta name="description" content="Reserve upcoming flagships, latest iPhones and Samsung Galaxy smartphones with dynamic booking and official priority delivery." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      {/* Breadcrumbs Row */}
      <div className="bg-white border-b border-gray-150 py-3.5 px-4 text-xs sm:text-sm font-semibold text-gray-500">
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 justify-start text-left">
          <Link to="/" className="hover:text-[var(--nst-primary)]">Home</Link>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <span className="text-slate-800 font-extrabold">Pre Order Now</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">

        {/* ==========================================
            Left Column: Available Pre-Orders grid
            ========================================== */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <h1 className="text-lg sm:text-xl font-black text-slate-800 border-b border-gray-150 pb-3 flex items-center gap-2">
            <CalendarRange className="w-5.5 h-5.5 text-[var(--nst-primary)]" />
            <span>Active Pre-Order Campaign</span>
          </h1>

          {isLoading ? (
            <div className="py-12 flex justify-center w-full">
              <div className="w-8 h-8 border-4 border-[var(--nst-primary)] border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
              {preOrderProducts.map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => setSelectedProduct(prod)}
                  className={`bg-white border rounded-2xl p-5 flex flex-col justify-between shadow-sm cursor-pointer hover:shadow-md transition-all ${
                    selectedProduct?.id === prod.id
                      ? 'border-[var(--nst-primary)] ring-2 ring-[var(--nst-primary)]/10 bg-purple-50/10'
                      : 'border-gray-100'
                  }`}
                >
                  <div className="flex flex-col text-left">
                    <div className="w-full h-32 flex items-center justify-center mb-4 relative overflow-hidden rounded-lg bg-white select-none">
                      <img src={prod.image || '/images/product-placeholder.svg'} alt={prod.name} className="h-full object-contain" />
                    </div>

                    <span className="text-[10px] text-purple-600 font-black uppercase tracking-widest">{prod.brand}</span>
                    <h3 className="text-slate-800 font-extrabold text-sm sm:text-base line-clamp-2 mt-1 leading-tight">{prod.name}</h3>
                  </div>

                  <div className="flex items-center justify-between border-t border-gray-50 pt-3.5 mt-4">
                    <div className="flex flex-col text-left leading-none">
                      <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Start From</span>
                      <span className="text-[var(--nst-primary)] font-black text-sm sm:text-base mt-1.5">৳{prod.price?.toLocaleString()}</span>
                    </div>
                    <button type="button" className="bg-[var(--nst-primary)] text-white text-[10px] sm:text-xs font-black py-2 px-3.5 rounded-lg">Pre Order</button>
                  </div>
                </div>
              ))}

              {preOrderProducts.length === 0 && (
                <div className="col-span-full py-16 flex flex-col items-center justify-center text-center bg-white border border-gray-150 rounded-2xl shadow-sm p-8">
                  <ShieldAlert className="w-12 h-12 text-gray-300 mb-3" />
                  <h3 className="text-slate-800 font-extrabold text-base">No Pre-Orders Available</h3>
                  <p className="text-gray-400 text-xs font-semibold mt-1">There are no active pre-order campaigns in our system at the moment.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ==========================================
            Right Column: Interactive Booking Form Card
            ========================================== */}
        <div className="flex flex-col gap-6">
          <h2 className="text-lg sm:text-xl font-black text-slate-800 border-b border-gray-150 pb-3 flex items-center gap-2">
            <CreditCard className="w-5.5 h-5.5 text-[var(--nst-primary)]" />
            <span>Secure Device Booking</span>
          </h2>

          {selectedProduct ? (
            <form onSubmit={handlePreOrderSubmit} className="bg-white border border-gray-150 rounded-2xl p-6 flex flex-col gap-5 shadow-sm text-left animate-fade-in">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <span className="font-extrabold text-slate-800 text-xs sm:text-sm truncate max-w-[180px]">{selectedProduct.name}</span>
                <button type="button" onClick={() => setSelectedProduct(null)} className="p-1 hover:bg-slate-100 rounded-full text-gray-400 hover:text-slate-800">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Selections Option Stack */}
              <div className="flex flex-col gap-3.5">
                {/* Storage */}
                {hasStorage && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Select Storage</span>
                    <select required value={selectedStorage || ''} onChange={(e) => setSelectedStorage(e.target.value || null)} className="border border-gray-200 rounded-xl px-3.5 h-11 bg-slate-50 focus:outline-none focus:border-[var(--nst-primary)] text-slate-800 text-xs sm:text-sm font-extrabold">
                      <option value="">-- Choose Storage --</option>
                      {options.storages.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}

                {/* Color */}
                {hasColor && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Select Color</span>
                    <select required value={selectedColor || ''} onChange={(e) => setSelectedColor(e.target.value || null)} className="border border-gray-200 rounded-xl px-3.5 h-11 bg-slate-50 focus:outline-none focus:border-[var(--nst-primary)] text-slate-800 text-xs sm:text-sm font-extrabold">
                      <option value="">-- Choose Color --</option>
                      {options.colors.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}

                {/* SIM */}
                {hasSim && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Select SIM Network</span>
                    <select required value={selectedSimNetwork || ''} onChange={(e) => setSelectedSimNetwork(e.target.value || null)} className="border border-gray-200 rounded-xl px-3.5 h-11 bg-slate-50 focus:outline-none focus:border-[var(--nst-primary)] text-slate-800 text-xs sm:text-sm font-extrabold">
                      <option value="">-- Choose SIM --</option>
                      {options.sims.map((sim) => <option key={sim} value={sim}>{sim}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Booking Values */}
              <div className="bg-slate-50 border border-gray-100 p-4 rounded-xl flex items-center justify-between text-xs sm:text-sm font-semibold">
                <div className="flex flex-col text-left leading-none">
                  <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Min Booking Amount</span>
                  <span className="text-[var(--nst-primary)] font-black text-lg sm:text-2xl mt-1.5">৳{bookingAmount?.toLocaleString()}</span>
                </div>
                <div className="flex flex-col items-end text-right leading-none">
                  <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Estimated Price</span>
                  <span className="text-slate-800 font-extrabold text-xs sm:text-sm mt-1.5">
                    ৳{resolvedVariant ? resolvedVariant.price?.toLocaleString() : selectedProduct.price?.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Contact Information Fields */}
              <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 text-xs sm:text-sm font-semibold">
                <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider block mb-1">Customer Information</span>

                {/* Recipient Name */}
                <input type="text" required placeholder="Enter full name" value={name} onChange={(e) => setName(e.target.value)} disabled={isSubmitting} className="border border-gray-200 rounded-xl px-4 h-11 bg-slate-50 focus:outline-none focus:border-[var(--nst-primary)] text-slate-800 text-sm placeholder-gray-400 disabled:opacity-50" />

                {/* Phone */}
                <input type="tel" required placeholder="Enter valid phone number" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isSubmitting} className="border border-gray-200 rounded-xl px-4 h-11 bg-slate-50 focus:outline-none focus:border-[var(--nst-primary)] text-slate-800 text-sm placeholder-gray-400 disabled:opacity-50" />
              </div>

              {/* Terms Checkbox */}
              <p className="text-[10px] text-gray-400 leading-snug mt-2">
                By clicking Submit Pre-Order, you agree to New Singapur Telecom's dynamic pre-order Terms & Conditions.
              </p>

              {/* Submit trigger button */}
              <button
                type="submit"
                disabled={isSubmitting || !resolvedVariant}
                className="w-full bg-[var(--nst-primary)] hover:bg-purple-600 disabled:bg-purple-300 text-white font-black text-xs sm:text-sm py-3.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-md cursor-pointer disabled:cursor-not-allowed mt-2"
              >
                <span>{isSubmitting ? 'Reserving Booking...' : 'Submit Pre-Order'}</span>
                <ArrowRight className="w-4.5 h-4.5" />
              </button>

              {/* Security Badge */}
              <div className="flex items-center justify-center gap-1.5 text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-1 select-none">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Verified POS Secure Booking Handshake</span>
              </div>
            </form>
          ) : (
            <div className="bg-white border border-gray-150 rounded-2xl p-8 shadow-sm text-center flex flex-col items-center justify-center min-h-[300px]">
              <CalendarRange className="w-10 h-10 text-gray-300 mb-2" />
              <h4 className="text-slate-800 font-extrabold text-sm">Select a Product</h4>
              <p className="text-gray-400 text-xs font-semibold mt-1">Please select an active pre-order device from the left panel to configure your priority booking reservation.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default PreOrderPage;
