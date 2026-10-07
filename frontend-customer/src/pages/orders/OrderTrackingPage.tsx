import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle2, ChevronRight, Circle, Clock, HelpCircle, Search, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient, handleApiError } from '../../api/client';
import { Order } from '../../types';

type TimelineEvent = {
  id?: number;
  event_type: string;
  status?: string | null;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  event_at: string;
};

type TimelinePayload = {
  order: Order & {
    total_amount?: number;
    delivery?: {
      status?: string;
      courier_name?: string;
      tracking_number?: string;
      driver_name?: string;
      driver_phone?: string;
    } | null;
  };
  events: TimelineEvent[];
  summary: Record<string, string | null>;
};

const dateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short' })
  : 'Not recorded';

export const OrderTrackingPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [orderNoInput, setOrderNoInput] = useState(id || searchParams.get('order_no') || '');
  const [timeline, setTimeline] = useState<TimelinePayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const autoTrackId = id || searchParams.get('order_no');
    if (autoTrackId) void trackOrder(autoTrackId);
  }, [id, searchParams]);

  const trackOrder = async (targetId: string) => {
    const cleanTarget = targetId.trim().replace(/^#/, '');
    if (!cleanTarget) {
      toast.error('Please enter a valid Order ID.');
      return;
    }

    try {
      setIsLoading(true);
      setSearched(true);
      setTimeline(null);
      const ordersResponse = await apiClient.get('/portal/orders');
      const orders = Array.isArray(ordersResponse.data?.data) ? ordersResponse.data.data : [];
      const matched = orders.find((row: Order) => String(row.id) === cleanTarget || row.order_no === cleanTarget);
      if (!matched) throw new Error('Order not found. Please verify your Order ID.');

      const response = await apiClient.get(`/portal/orders/${matched.id}/timeline`);
      if (!response.data?.status || !response.data?.data) throw new Error('Order timeline is unavailable.');
      setTimeline(response.data.data as TimelinePayload);
    } catch (error: unknown) {
      const parsed = handleApiError(error);
      toast.error(parsed.message || 'Unable to load tracking details.');
    } finally {
      setIsLoading(false);
    }
  };

  const order = timeline?.order;
  const delivery = order?.delivery;

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] pb-16">
      <Helmet>
        <title>Track Your Order | New Singapur Telecom</title>
        <meta name="description" content="View the verified payment, processing and delivery timeline for your New Singapur Telecom order." />
      </Helmet>

      <div className="border-b border-gray-150 bg-white px-4 py-3.5 text-xs font-semibold text-gray-500 sm:text-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-1.5 text-left">
          <Link to="/" className="hover:text-[var(--nst-primary)]">Home</Link><ChevronRight className="h-4 w-4 text-gray-300" />
          <span className="font-extrabold text-slate-800">Track Order</span>
        </div>
      </div>

      <div className="mx-auto mt-8 flex max-w-3xl flex-col gap-6 px-4">
        <div className="flex flex-col gap-4 rounded-3xl border border-gray-150 bg-white p-6 text-left shadow-sm sm:p-8">
          <h1 className="flex items-center gap-2 text-lg font-black text-slate-800 sm:text-xl"><Clock className="h-5 w-5 text-[var(--nst-primary)]" />Track Your Order</h1>
          <p className="text-xs font-semibold text-gray-400 sm:text-sm">Only events recorded by NST POS, payment gateway and delivery staff are shown.</p>
          <form onSubmit={(event) => { event.preventDefault(); void trackOrder(orderNoInput); }} className="flex h-12 items-center overflow-hidden rounded-xl border border-gray-200 bg-slate-50 focus-within:border-[var(--nst-primary)]">
            <Search className="ml-4 h-4 w-4 shrink-0 text-gray-400" />
            <input required value={orderNoInput} onChange={(event) => setOrderNoInput(event.target.value)} disabled={isLoading} placeholder="Enter order number" className="flex-grow bg-transparent px-3 py-2 text-sm text-slate-800 outline-none disabled:opacity-50" />
            <button type="submit" disabled={isLoading} className="h-full bg-[var(--nst-primary)] px-6 text-xs font-black text-white disabled:opacity-50 sm:text-sm">{isLoading ? 'Tracking…' : 'Track'}</button>
          </form>
        </div>

        {timeline && order && (
          <div className="flex animate-fade-in flex-col gap-6 rounded-3xl border border-gray-150 bg-white p-6 text-left shadow-sm sm:p-8">
            <div className="flex flex-col justify-between gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-center">
              <div><span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Tracking Order</span><h2 className="mt-1 font-mono text-lg font-extrabold text-slate-800">#{order.order_no || order.id}</h2></div>
              <div className="sm:text-right"><span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Current Status</span><p className="mt-1 text-sm font-extrabold capitalize text-[var(--nst-primary)]">{String(timeline.summary.custom_status || timeline.summary.current_status || 'recorded').replace(/_/g, ' ')}</p></div>
            </div>

            <div className="relative my-4 ml-2 flex flex-col gap-8 border-l-2 border-gray-150 pl-8">
              {timeline.events.map((event, index) => {
                const current = index === timeline.events.length - 1;
                return <div key={`${event.id || event.event_type}-${event.event_at}-${index}`} className="relative flex flex-col justify-between gap-2 sm:flex-row sm:items-center sm:gap-6">
                  <div className="absolute -left-[41px] top-0.5 rounded-full border border-emerald-500 bg-emerald-50 p-0.5 text-emerald-600 shadow-sm"><CheckCircle2 className={`h-[18px] w-[18px] fill-current text-white ${current ? 'animate-pulse' : ''}`} /></div>
                  <div className="max-w-sm"><h3 className="text-xs font-extrabold text-slate-800 sm:text-sm">{event.title}</h3>{event.description && <p className="mt-1 text-[10px] font-semibold leading-snug text-gray-400 sm:text-xs">{event.description}</p>}</div>
                  <div className="shrink-0 text-[10px] font-extrabold text-gray-500 sm:text-right sm:text-xs"><span>{dateTime(event.event_at)}</span>{current && <span className="mt-1 block text-[9px] font-black uppercase tracking-wider text-[var(--nst-primary)]">Latest update</span>}</div>
                </div>;
              })}
              {timeline.events.length === 0 && <div className="relative"><div className="absolute -left-[41px] top-0.5 rounded-full border-2 border-gray-200 bg-white p-1.5"><Circle className="h-2.5 w-2.5 fill-current text-gray-200" /></div><p className="text-sm font-semibold text-gray-500">No timeline event has been recorded yet.</p></div>}
            </div>

            {(delivery?.courier_name || delivery?.tracking_number || delivery?.driver_name) && <div className="flex flex-col justify-between gap-4 rounded-2xl border border-gray-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:p-5">
              <div className="flex items-center gap-3"><div className="rounded-xl border border-purple-200/40 bg-[var(--nst-primary)]/10 p-2.5 text-[var(--nst-primary)]"><Truck className="h-5 w-5" /></div><div><span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Delivery</span><p className="mt-1 text-xs font-extrabold text-slate-800 sm:text-sm">{delivery.courier_name || delivery.driver_name || 'NST Delivery Team'}</p></div></div>
              <div className="text-xs font-extrabold sm:text-right sm:text-sm"><span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Tracking ID</span><p className="mt-1 select-all font-mono text-slate-700">{delivery.tracking_number || 'Not assigned'}</p></div>
            </div>}
          </div>
        )}

        {!timeline && searched && !isLoading && <div className="flex animate-fade-in flex-col items-center justify-center rounded-3xl border border-gray-150 bg-white p-10 text-center shadow-sm"><HelpCircle className="mb-3 h-12 w-12 text-gray-300" /><h3 className="text-base font-extrabold text-slate-800">Order Not Found</h3><p className="mt-1 text-xs font-semibold text-gray-400">No order visible to your account matched #{orderNoInput}.</p></div>}
      </div>
    </div>
  );
};

export default OrderTrackingPage;
