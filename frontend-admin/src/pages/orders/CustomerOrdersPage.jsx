import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, PackageCheck, RefreshCw, Search, XCircle } from 'lucide-react';
import api from '../../services/api';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { ShoppingCart as NstHdrShoppingCart } from 'lucide-react';

const money = (value) => `৳${Number(value || 0).toLocaleString()}`;
const unwrap = (response) => response?.data?.data || response?.data || {};

export default function CustomerOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState({ search: '', status: '', payment_status: '' });
  const [customStatuses, setCustomStatuses] = useState({});

  const load = async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await api.get('/orders', { params: { ...filters, per_page: 100 } });
      const payload = unwrap(response);
      const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      setOrders(rows);
      setCustomStatuses(Object.fromEntries(rows.map((row) => [row.id, row.custom_status || row.status || 'Order Recorded'])));
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'Customer orders could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (order) => {
    setSavingId(order.id);
    setMessage('');
    try {
      await api.put(`/orders/${order.id}`, { custom_status: customStatuses[order.id] || order.custom_status, status: order.status });
      setMessage('Order status updated.');
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'Order status update failed.');
    } finally {
      setSavingId(null);
    }
  };

  const fixedAction = async (order, action) => {
    setSavingId(order.id);
    setMessage('');
    try {
      await api.post(`/orders/${order.id}/${action}`);
      setMessage(`Order ${action} completed.`);
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || `Order ${action} failed.`);
    } finally {
      setSavingId(null);
    }
  };

  const reviewPayment = async (order, decision) => {
    let reason = '';
    if (decision === 'rejected') {
      reason = window.prompt('Enter payment rejection reason:') || '';
      if (!reason.trim()) return;
    }
    setSavingId(order.id);
    setMessage('');
    try {
      await api.post(`/orders/${order.id}/payment-review`, { decision, reason });
      setMessage(decision === 'approved' ? 'Payment approved.' : 'Payment rejected.');
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'Payment review failed.');
    } finally {
      setSavingId(null);
    }
  };

  const pendingPaymentCount = useMemo(() => orders.filter((row) => row.payment_status === 'pending_verification').length, [orders]);

  return <div className="min-h-screen bg-slate-50 p-4 md:p-7">
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="rounded-[1.8rem] border border-slate-100 bg-white p-6 shadow-sm">
        <NstPageHeader icon={NstHdrShoppingCart} title={<>Customer Orders</>} subtitle={<>Website orders, Cash on Delivery and bKash/Nagad transaction verification.</>} actions={<><div className="flex flex-wrap gap-3"><div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-700">Pending verification: {pendingPaymentCount}</div><button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-2xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-black text-white"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Refresh</button></div></>}/>
        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_220px_220px_auto]">
          <label className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Order no, customer, phone or transaction ID" className="w-full rounded-2xl border border-slate-200 py-3 pl-11 pr-4 text-sm font-semibold outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]" /></label>
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold"><option value="">All order status</option><option value="order_recorded">Order Recorded</option><option value="payment_submitted">Payment Submitted</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
          <select value={filters.payment_status} onChange={(event) => setFilters({ ...filters, payment_status: event.target.value })} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold"><option value="">All payment status</option><option value="cod_pending">COD Pending</option><option value="pending_verification">Pending Verification</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
          <button type="button" onClick={load} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Apply Filters</button>
        </div>
        {message && <p className="mt-4 rounded-2xl bg-slate-100 p-4 text-sm font-bold text-slate-700">{message}</p>}
      </section>

      <section className="grid gap-4">
        {orders.map((order) => <article key={order.id} className="rounded-[1.7rem] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
            <div><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-[var(--nst-dashboard-primary)]">{order.order_no}</p><h2 className="mt-1 text-xl font-black text-slate-950">{order.customer_name}</h2><p className="text-sm font-semibold text-slate-500">{order.customer_phone}{order.customer_email ? ` · ${order.customer_email}` : ''}{order.branch?.name ? ` · ${order.branch.name}` : ''}</p><p className="mt-2 text-sm text-slate-600">{order.delivery_address}</p></div><div className="text-left sm:text-right"><p className="text-2xl font-black text-[var(--nst-dashboard-primary)]">{money(order.total_amount)}</p><p className="text-xs font-bold text-slate-400">{order.payment_method?.replaceAll('_', ' ')} / {order.payment_status?.replaceAll('_', ' ')}</p></div></div>
              <div className="mt-4 grid gap-2">{(order.items || []).map((item) => <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3 text-sm"><span className="font-bold text-slate-700">{item.product_name}{item.variant_name ? ` · ${item.variant_name}` : ''} x {item.quantity}</span><span className="font-black">{money(item.line_total)}</span></div>)}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-500">Status Control</p><label className="mt-3 block text-sm font-black text-slate-700">Custom Status<input value={customStatuses[order.id] || ''} onChange={(event) => setCustomStatuses({ ...customStatuses, [order.id]: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-semibold outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]" /></label><button disabled={savingId === order.id} onClick={() => updateStatus(order)} className="mt-3 w-full rounded-xl bg-[var(--nst-dashboard-primary)] px-4 py-3 text-sm font-black text-white disabled:opacity-50">Save Custom Status</button>
              {order.transaction_id && <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800"><p><b>Transaction ID:</b> {order.transaction_id}</p><p className="mt-1"><b>Paid:</b> {money(order.paid_amount)}</p>{order.payment_rejection_reason ? <p className="mt-1 font-bold text-rose-600">Reason: {order.payment_rejection_reason}</p> : null}</div>}
              {order.payment_status === 'pending_verification' && <div className="mt-3 grid grid-cols-2 gap-2"><button disabled={savingId === order.id} onClick={() => reviewPayment(order, 'approved')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 text-xs font-black text-white"><CheckCircle2 size={15} /> Approve</button><button disabled={savingId === order.id} onClick={() => reviewPayment(order, 'rejected')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 py-3 text-xs font-black text-white"><XCircle size={15} /> Reject</button></div>}
              <div className="mt-3 grid grid-cols-3 gap-2"><button disabled={savingId === order.id} onClick={() => fixedAction(order, 'confirm')} className="rounded-xl bg-blue-600 px-2 py-3 text-xs font-black text-white">Confirm</button><button disabled={savingId === order.id} onClick={() => fixedAction(order, 'complete')} className="rounded-xl bg-emerald-700 px-2 py-3 text-xs font-black text-white">Complete</button><button disabled={savingId === order.id} onClick={() => fixedAction(order, 'cancel')} className="rounded-xl bg-slate-700 px-2 py-3 text-xs font-black text-white">Cancel</button></div>
            </div>
          </div>
        </article>)}
        {!loading && orders.length === 0 && <div className="rounded-[1.7rem] border border-dashed border-slate-200 bg-white p-12 text-center"><PackageCheck className="mx-auto text-slate-300" size={52} /><p className="mt-4 font-black text-slate-600">No customer orders found.</p></div>}
      </section>
    </div>
  </div>;
}
