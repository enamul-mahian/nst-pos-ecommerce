import { useEffect, useState } from 'react';
import { corporateOpsService } from '../../services/corporateOpsService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { CalendarDays as NstHdrCalendarDays } from 'lucide-react';

const orderStatuses = ['pending_payment', 'payment_submitted', 'booked', 'product_arrived', 'ready_for_delivery', 'converted_to_sale', 'cancelled', 'refunded', 'expired'];

function rowsFrom(response) {
  return response?.data?.data?.data || response?.data?.data || response?.data || [];
}

function errorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

export default function BookingPreorderPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    customer_phone: '',
    customer_name: '',
    product_name: '',
    product_price: '',
    paid_amount: '',
    payment_method: 'cash_on_delivery',
    transaction_id: '',
    custom_status: 'Order Recorded',
    note: '',
  });
  const [customStatuses, setCustomStatuses] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const manualPayment = form.payment_method !== 'cash_on_delivery';

  const load = async () => {
    try {
      setError('');
      const rows = rowsFrom(await corporateOpsService.listBookings());
      setItems(Array.isArray(rows) ? rows : []);
      setCustomStatuses(Object.fromEntries((Array.isArray(rows) ? rows : []).map((row) => [row.id, row.custom_status || row.status || 'Order Recorded'])));
    } catch (err) {
      setError(errorMessage(err, 'Bookings could not be loaded.'));
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.customer_phone.trim()) {
      setError('Customer phone is required.');
      return;
    }
    if (manualPayment && (!form.transaction_id.trim() || Number(form.paid_amount) <= 0)) {
      setError('Transaction ID and paid amount are required for bKash/Nagad agent payment.');
      return;
    }

    try {
      setError('');
      await corporateOpsService.createBooking(form);
      setForm({ customer_phone: '', customer_name: '', product_name: '', product_price: '', paid_amount: '', payment_method: 'cash_on_delivery', transaction_id: '', custom_status: 'Order Recorded', note: '' });
      setMessage('Booking saved.');
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Booking could not be saved.'));
    }
  };

  const updateStatus = async (item, payload) => {
    try {
      setBusyId(item.id);
      setError('');
      await corporateOpsService.bookingStatus(item.id, payload);
      setMessage(`${item.booking_no} updated.`);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Booking status could not be updated.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <NstPageHeader icon={NstHdrCalendarDays} title={<>Bookings / Pre-orders</>} subtitle={<>Cash on Delivery is the default. bKash/Nagad agent payments require transaction verification, and every preorder can have a custom status.</>}/>
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</div>}
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-3 rounded-2xl border bg-white p-5">
          <h3 className="font-black">Manual Booking</h3>
          {['customer_name', 'customer_phone', 'product_name', 'product_price', 'paid_amount'].map((key) => <input key={key} type={key.includes('price') || key.includes('amount') ? 'number' : 'text'} min={key.includes('price') || key.includes('amount') ? '0' : undefined} step={key.includes('price') || key.includes('amount') ? '0.01' : undefined} placeholder={key.replaceAll('_', ' ')} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="w-full rounded-xl border border-slate-200 p-3" />)}
          <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Payment Method<select value={form.payment_method} onChange={(event) => setForm({ ...form, payment_method: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm normal-case"><option value="cash_on_delivery">Cash on Delivery</option><option value="bkash_agent">bKash Agent Cash-out</option><option value="nagad_agent">Nagad Agent Cash-out</option></select></label>
          {manualPayment && <input placeholder="transaction id" value={form.transaction_id} onChange={(event) => setForm({ ...form, transaction_id: event.target.value })} className="w-full rounded-xl border border-slate-200 p-3" />}
          <input placeholder="custom status" maxLength={120} value={form.custom_status} onChange={(event) => setForm({ ...form, custom_status: event.target.value })} className="w-full rounded-xl border border-slate-200 p-3" />
          <textarea placeholder="note" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="w-full rounded-xl border border-slate-200 p-3" rows={3} />
          <button type="button" onClick={save} className="w-full rounded-xl bg-[var(--nst-dashboard-primary)] px-4 py-3 font-black text-white">Save Booking</button>
        </div>

        <div className="overflow-auto rounded-2xl border bg-white p-5 xl:col-span-2">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="bg-slate-50"><th className="p-2 text-left">Booking</th><th>Customer</th><th>Product</th><th>Deposit</th><th>Payment</th><th>Status</th><th>Custom Status</th></tr></thead>
            <tbody>{items.map((item) => <tr key={item.id} className="border-b align-top">
              <td className="p-2 font-bold">{item.booking_no}</td>
              <td className="p-2">{item.customer_name}<br /><span className="text-xs">{item.customer_phone}</span></td>
              <td className="p-2">{item.product_name}</td>
              <td className="p-2">৳{item.paid_amount} / ৳{item.required_deposit}</td>
              <td className="p-2"><b>{String(item.payment_method || 'cash_on_delivery').replaceAll('_', ' ')}</b><br /><span className="text-xs">{String(item.payment_status || 'cod_pending').replaceAll('_', ' ')}</span>{item.transaction_id && <><br /><span className="text-xs">TX: {item.transaction_id}</span></>}</td>
              <td className="p-2"><select disabled={String(busyId) === String(item.id)} onChange={(event) => updateStatus(item, { status: event.target.value })} value={item.status} className="rounded-lg border p-2">{orderStatuses.map((status) => <option key={status}>{status}</option>)}</select>{item.payment_status === 'pending_verification' && <div className="mt-2 grid gap-1"><button type="button" disabled={String(busyId) === String(item.id)} onClick={() => updateStatus(item, { payment_status: 'approved', custom_status: 'Payment Approved' })} className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-black text-white">Approve Payment</button><button type="button" disabled={String(busyId) === String(item.id)} onClick={() => updateStatus(item, { payment_status: 'rejected', custom_status: 'Payment Rejected', reason: 'Rejected by staff.' })} className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-black text-white">Reject Payment</button></div>}</td>
              <td className="p-2"><div className="flex min-w-[230px] gap-2"><input maxLength={120} value={customStatuses[item.id] || ''} onChange={(event) => setCustomStatuses((previous) => ({ ...previous, [item.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border p-2" /><button type="button" disabled={String(busyId) === String(item.id)} onClick={() => updateStatus(item, { custom_status: (customStatuses[item.id] || '').trim() })} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Save</button></div></td>
            </tr>)}</tbody>
          </table>
          {!items.length && <p className="p-8 text-center text-sm text-slate-500">No bookings found.</p>}
        </div>
      </div>
    </div>
  );
}
