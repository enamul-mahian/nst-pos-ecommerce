import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Check, ShoppingBag, ClipboardList, ShieldCheck, Mail, PhoneCall, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient, handleApiError } from '../../api/client';
import { useCartStore } from '../../store/cart/useCartStore';
import { Order } from '../../types';

const formatMoney = (value: number) => new Intl.NumberFormat('en-BD', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format(value);

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleString('en-BD', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  : 'Recorded in My Orders';

export const OrderSuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const clearCart = useCartStore((state) => state.clearCart);
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const orderReference = (searchParams.get('order_id') || '').trim().replace(/^#/, '');
  const paymentResult = searchParams.get('payment');
  const rawMethod = searchParams.get('method') || 'cod';

  useEffect(() => {
    if (paymentResult === 'success' || rawMethod === 'cod' || rawMethod === 'cash_on_delivery') {
      clearCart();
    }
  }, [clearCart, paymentResult, rawMethod]);

  useEffect(() => {
    let active = true;

    const loadOrder = async () => {
      if (!orderReference) {
        setLoadError('The order reference is missing. Open My Orders to view your confirmed purchases.');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setLoadError(null);
        const response = await apiClient.get('/portal/orders');
        const rows = Array.isArray(response.data?.data) ? response.data.data as Order[] : [];
        const matched = rows.find((row) => String(row.id) === orderReference || row.order_no === orderReference);
        if (!matched) throw new Error('The confirmed order could not be loaded from your account.');
        if (active) setOrder(matched);
      } catch (error: unknown) {
        const parsed = handleApiError(error);
        if (active) setLoadError(parsed.message || 'Unable to load the confirmed order.');
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadOrder();
    return () => { active = false; };
  }, [orderReference]);

  useEffect(() => {
    const callbackMessage = searchParams.get('message');
    if (paymentResult === 'success') toast.success(callbackMessage || 'Online payment verified successfully.');
  }, [paymentResult, searchParams]);

  const paymentMethodLabel = useMemo(() => {
    const method = order?.payment_method || rawMethod;
    return method === 'cod' || method === 'cash_on_delivery'
      ? 'Cash on Delivery'
      : method === 'sslcommerz'
        ? 'SSLCOMMERZ (Online Payment)'
        : method === 'piprapay'
          ? 'PipraPay (Online Payment)'
          : method.replace(/_/g, ' ');
  }, [order?.payment_method, rawMethod]);

  const orderId = order?.order_no || orderReference;
  const totalAmount = Number(order?.total ?? searchParams.get('total') ?? 0);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8fafc] px-4 py-12">
      <Helmet>
        <title>Order Confirmed Successfully | New Singapur Telecom</title>
        <meta name="description" content="View the verified details of your successfully placed New Singapur Telecom order." />
      </Helmet>

      <div className="flex w-full max-w-lg flex-col items-center rounded-3xl border border-gray-150 bg-white p-8 shadow-xl sm:p-10">
        <div className="relative mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm">
          <div className="absolute inset-0 animate-ping rounded-full bg-emerald-100/60" />
          <Check className="relative z-10 h-9 w-9 stroke-[3]" />
        </div>

        <h1 className="text-center text-xl font-black leading-none tracking-tight text-slate-800 sm:text-2xl">Order Placed Successfully!</h1>
        <p className="mt-2.5 text-center text-xs font-semibold leading-relaxed text-gray-400 sm:text-sm">
          Your order is recorded in NST POS. Payment and delivery updates will appear in My Orders.
        </p>

        {isLoading ? (
          <div className="my-8 w-full rounded-2xl border border-gray-100 bg-slate-50 p-6 text-center text-sm font-bold text-gray-500">Loading verified order details…</div>
        ) : loadError ? (
          <div className="my-8 flex w-full items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left text-sm font-semibold text-amber-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{loadError}</span>
          </div>
        ) : (
          <div className="my-8 flex w-full flex-col gap-3.5 rounded-2xl border border-gray-100 bg-slate-50 p-5 text-xs font-semibold sm:p-6 sm:text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 sm:text-xs">Order ID</span>
              <span className="rounded-lg border border-gray-150 bg-white px-2.5 py-1 font-mono font-extrabold tracking-tight text-slate-800 shadow-sm">#{orderId}</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-gray-100/60 pt-3.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 sm:text-xs">Order Date</span>
              <span className="text-right font-extrabold text-slate-800">{formatDate(order?.created_at)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-gray-100/60 pt-3.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 sm:text-xs">Payment Method</span>
              <span className="text-right font-extrabold text-slate-800">{paymentMethodLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-gray-100/60 pt-3.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 sm:text-xs">Payment Status</span>
              <span className="text-right font-extrabold capitalize text-slate-800">{String(order?.payment_status || paymentResult || 'pending').replace(/_/g, ' ')}</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-gray-100/60 pt-3.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 sm:text-xs">Total Amount</span>
              <span className="text-sm font-black text-[var(--nst-primary)] sm:text-base">৳{formatMoney(totalAmount)}</span>
            </div>
          </div>
        )}

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          <Link to="/portal/orders" className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--nst-ink)] py-3.5 text-xs font-black text-white shadow-md transition-colors hover:bg-slate-900 sm:text-sm">
            <ClipboardList className="h-4.5 w-4.5 text-[#ffb800]" /><span>View My Orders</span>
          </Link>
          <Link to="/" className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--nst-primary)] py-3.5 text-xs font-black text-white shadow-md transition-colors hover:bg-purple-600 sm:text-sm">
            <ShoppingBag className="h-4.5 w-4.5" /><span>Continue Shopping</span>
          </Link>
        </div>

        <div className="mt-8 flex w-full flex-col items-center gap-1 border-t border-gray-100 pt-6 text-[10px] font-semibold leading-relaxed text-gray-400 sm:text-xs">
          <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-purple-400" /><PhoneCall className="h-4 w-4 text-purple-400" /></div>
          <p className="mt-1 text-center">Order notifications are sent only when contact details and notification services are available.</p>
          <div className="mt-2 flex items-center gap-1.5 font-bold uppercase tracking-wider text-emerald-600"><ShieldCheck className="h-4 w-4" /><span>Order recorded securely</span></div>
        </div>
      </div>
    </div>
  );
};

export default OrderSuccessPage;
