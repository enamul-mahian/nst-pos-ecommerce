import { useEffect, useState } from 'react';
import finalOperationsService from '../../services/finalOperationsService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { CalendarDays as NstHdrCalendarDays } from 'lucide-react';

const statuses = ['order_recorded', 'payment_requested', 'payment_submitted', 'payment_approved', 'processing', 'product_arrived', 'ready_for_delivery', 'completed', 'cancelled'];
const paymentStatuses = ['', 'cod_pending', 'pending_verification', 'approved', 'rejected'];

function errorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function paymentLabel(value) {
  if (value === 'bkash_agent') return 'bKash Agent Cash-out';
  if (value === 'nagad_agent') return 'Nagad Agent Cash-out';
  return 'Cash on Delivery';
}

export default function ExternalPreorderAdminPage() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [customStatuses, setCustomStatuses] = useState({});
  const [rejectReasons, setRejectReasons] = useState({});

  const load = async () => {
    try {
      setError('');
      const params = {};
      if (filter) params.status = filter;
      if (paymentFilter) params.payment_status = paymentFilter;
      const response = await finalOperationsService.externalPreorders(params);
      const rows = response?.data?.data?.data || [];
      setItems(rows);
      setCustomStatuses(Object.fromEntries(rows.map((row) => [row.id, row.custom_status || row.status || 'Order Recorded'])));
    } catch (err) {
      setError(errorMessage(err, 'External preorders could not be loaded.'));
    }
  };

  useEffect(() => { load(); }, [filter, paymentFilter]);

  const update = async (item, payload) => {
    try {
      setBusyId(item.id);
      setError('');
      await finalOperationsService.updateExternalPreorder(item.id, payload);
      setMessage(`${item.preorder_no} updated successfully.`);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Preorder could not be updated.'));
    } finally {
      setBusyId(null);
    }
  };

  const reviewPayment = async (item, action) => {
    const reason = rejectReasons[item.id] || '';
    if (action === 'reject' && !reason.trim()) {
      setError('Write a rejection reason before rejecting a payment.');
      return;
    }

    try {
      setBusyId(item.id);
      setError('');
      await finalOperationsService.reviewExternalPreorderPayment(item.id, {
        action,
        reason: action === 'reject' ? reason.trim() : undefined,
        custom_status: action === 'approve' ? 'Payment Approved' : 'Payment Rejected',
      });
      setMessage(action === 'approve' ? 'Payment approved.' : 'Payment rejected.');
      setRejectReasons((previous) => ({ ...previous, [item.id]: '' }));
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Payment review failed.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <NstPageHeader icon={NstHdrCalendarDays} title={<>External Product Preorders</>} subtitle={<>Cash on Delivery is the default. Super Admin, Admin and Accountant can verify bKash/Nagad agent transactions and set a custom preorder status.</>} actions={<><div className="flex flex-col gap-2 sm:flex-row">
          <label className="text-sm font-bold">Order Status<select value={filter} onChange={(event) => setFilter(event.target.value)} className="ml-2 rounded-xl border border-slate-200 px-3 py-2"><option value="">All</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="text-sm font-bold">Payment<select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="ml-2 rounded-xl border border-slate-200 px-3 py-2">{paymentStatuses.map((item) => <option key={item || 'all'} value={item}>{item || 'All'}</option>)}</select></label>
        </div></>}/>

      {message && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => {
          const manual = ['bkash_agent', 'nagad_agent'].includes(item.payment_method);
          const pendingReview = manual && item.payment_status === 'pending_verification';
          const busy = String(busyId) === String(item.id);

          return (
            <article key={item.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex gap-4">
                {item.product_image_url && <img src={item.product_image_url} alt="Product" className="h-28 w-24 rounded-xl object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-wider text-[var(--nst-dashboard-primary)]">{item.preorder_no}</p>
                  <h2 className="mt-1 font-black text-slate-900">{item.product_name}</h2>
                  <a href={item.product_link} target="_blank" rel="noreferrer" className="mt-1 block truncate text-sm font-bold text-blue-600">Open product link</a>
                  <p className="mt-2 text-sm text-slate-600">{item.customer_name} · {item.customer_phone}</p>
                  <p className="text-xs text-slate-500">{item.customer_email}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-bold">System Status<select value={item.status || 'order_recorded'} disabled={busy} onChange={(event) => update(item, { status: event.target.value, custom_status: customStatuses[item.id] })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
                <div className="rounded-xl bg-slate-50 p-3 text-sm"><p>Requested: ৳{item.requested_amount || 0}</p><p>Paid: ৳{item.paid_amount || 0}</p></div>
              </div>

              <div className="mt-3 rounded-2xl border border-slate-100 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Custom Preorder Status</p>
                <div className="mt-2 flex gap-2"><input value={customStatuses[item.id] || ''} onChange={(event) => setCustomStatuses((previous) => ({ ...previous, [item.id]: event.target.value }))} maxLength={120} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Example: Supplier Confirmed" /><button type="button" disabled={busy || !(customStatuses[item.id] || '').trim()} onClick={() => update(item, { custom_status: (customStatuses[item.id] || '').trim() })} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Save</button></div>
              </div>

              <div className="mt-3 rounded-2xl bg-[var(--nst-dashboard-primary-soft)] p-4 text-sm text-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2"><b>{paymentLabel(item.payment_method)}</b><span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase">{String(item.payment_status || 'cod_pending').replaceAll('_', ' ')}</span></div>
                {item.transaction_id && <p className="mt-2">Transaction ID: <b>{item.transaction_id}</b></p>}
                {item.payment_verified_at && <p className="mt-1 text-xs text-slate-500">Reviewed: {new Date(item.payment_verified_at).toLocaleString()}</p>}
                {item.payment_rejection_reason && <p className="mt-2 rounded-xl bg-rose-50 p-2 font-bold text-rose-700">Reason: {item.payment_rejection_reason}</p>}

                {pendingReview && <div className="mt-3 space-y-2"><textarea value={rejectReasons[item.id] || ''} onChange={(event) => setRejectReasons((previous) => ({ ...previous, [item.id]: event.target.value }))} rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2" placeholder="Rejection reason (required only for reject)" /><div className="grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={() => reviewPayment(item, 'approve')} className="rounded-xl bg-emerald-600 px-4 py-2 font-black text-white disabled:opacity-50">Approve</button><button type="button" disabled={busy} onClick={() => reviewPayment(item, 'reject')} className="rounded-xl bg-rose-600 px-4 py-2 font-black text-white disabled:opacity-50">Reject</button></div></div>}
              </div>

              {item.customer_note && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{item.customer_note}</p>}
              {item.admin_note && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Admin note: {item.admin_note}</p>}
            </article>
          );
        })}
        {items.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500 lg:col-span-2">No external preorders found.</div>}
      </div>
    </div>
  );
}
