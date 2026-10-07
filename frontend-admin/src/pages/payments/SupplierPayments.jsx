import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import accountsPaymentService from '../../services/accountsPaymentService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Truck as NstHdrTruck } from 'lucide-react';
import { useT } from '../../i18n';

const BDT = new Intl.NumberFormat('en-BD', {
  style: 'currency',
  currency: 'BDT',
  maximumFractionDigits: 0,
});

const paymentMethods = ['cash', 'bkash', 'nagad', 'rocket', 'bank', 'card'];

function money(value) {
  return BDT.format(Number(value || 0));
}

function unwrapDueCenter(response) {
  return response?.data || response || {};
}

function defaultProvider(method) {
  if (method === 'bkash') return 'bKash';
  if (method === 'nagad') return 'Nagad';
  if (method === 'rocket') return 'Rocket';
  if (method === 'bank') return 'Bank Transfer';
  if (method === 'card') return 'Card/POS';
  return 'Cash Counter';
}

function StatCard({ title, value, subtitle, tone = 'blue' }) {
  const toneClass = {
    blue: 'bg-blue-50 text-blue-800 border-blue-100',
    red: 'bg-red-50 text-red-800 border-red-100',
    amber: 'bg-amber-50 text-amber-800 border-amber-100',
    purple: 'bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)] border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]',
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 shadow-sm md:p-5 ${toneClass}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-70">{title}</p>
      <h3 className="mt-2 text-2xl font-extrabold md:text-3xl">{value}</h3>
      {subtitle && <p className="mt-2 text-xs opacity-70">{subtitle}</p>}
    </div>
  );
}

export default function SupplierPayments() {
  const t = useT();
  const [suppliers, setSuppliers] = useState([]);
  const [summary, setSummary] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [paymentSlip, setPaymentSlip] = useState(null);
  const [form, setForm] = useState({
    amount: '',
    payment_method: 'cash',
    provider_name: 'Cash Counter',
    transaction_id: '',
    note: '',
  });

  const filteredSuppliers = useMemo(() => suppliers, [suppliers]);

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await accountsPaymentService.getDueCenter({ search });
      const payload = unwrapDueCenter(response);

      setSuppliers(payload.suppliers || []);
      setSummary(payload.summary || {});
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || t('payments.supplier.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const openPayModal = (supplier) => {
    setSelectedSupplier(supplier);
    setPaymentSlip(null);
    setMessage('');
    setError('');
    setForm({
      amount: String(Number(supplier?.due_amount || 0)),
      payment_method: 'cash',
      provider_name: 'Cash Counter',
      transaction_id: '',
      note: '',
    });
  };

  const closeModal = () => {
    setSelectedSupplier(null);
    setPaymentSlip(null);
    setSaving(false);
  };

  const updateForm = (field, value) => {
    setForm((previous) => {
      const updated = { ...previous, [field]: value };

      if (field === 'payment_method') {
        updated.provider_name = defaultProvider(value);
      }

      return updated;
    });
  };

  const submitPayment = async (event) => {
    event.preventDefault();

    if (!selectedSupplier) return;

    const amount = Number(form.amount || 0);

    if (!amount || amount <= 0) {
      setError(t('common.amount_positive'));
      return;
    }

    try {
      setSaving(true);
      setError('');
      setMessage('');

      const payload = new FormData();
      payload.append('amount', String(amount));
      payload.append('payment_method', form.payment_method);
      payload.append('provider_name', form.provider_name || '');
      payload.append('transaction_id', form.transaction_id || '');
      payload.append('note', form.note || '');

      if (paymentSlip) {
        payload.append('payment_slip', paymentSlip);
      }

      await accountsPaymentService.paySupplierDue(selectedSupplier.id, payload);

      setMessage(t('payments.supplier.paid', { name: selectedSupplier.name, amount: money(amount) }));
      closeModal();
      await loadSuppliers();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || t('payments.supplier.pay_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--nst-dashboard-surface)] p-4 md:p-6">
      <NstPageHeader icon={NstHdrTruck} title={<>Supplier Payment</>} subtitle={t('payments.supplier.subtitle')} actions={<><div className="flex flex-wrap gap-2">
          <Link to="/accounts" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[var(--nst-dashboard-text)] hover:bg-slate-50">
            Accounts Dashboard
          </Link>
          <button
            type="button"
            onClick={loadSuppliers}
            disabled={loading}
            className="rounded-xl bg-[var(--nst-dashboard-primary)] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[var(--nst-dashboard-primary)] disabled:opacity-60"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div></>}/>

      {(message || error) && (
        <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-100 bg-red-50 text-red-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard title="Due Suppliers" value={Number(summary.supplier_count || 0).toLocaleString('en-BD')} subtitle="Current due supplier count" tone="blue" />
        <StatCard title="Total Payable" value={money(summary.supplier_due_total || 0)} subtitle="Supplier due total" tone="red" />
        <StatCard title="Receivable - Payable" value={money(summary.net_receivable_minus_payable || 0)} subtitle="Customer due minus supplier due" tone="purple" />
      </div>

      <div className="mb-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            loadSuppliers();
          }}
          className="flex flex-col gap-3 md:flex-row"
        >
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Supplier name, phone, email search..."
            className="min-h-[44px] flex-1 rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
          />
          <button type="submit" className="min-h-[44px] rounded-xl bg-[var(--nst-dashboard-secondary)] px-5 text-sm font-bold text-white hover:bg-[var(--nst-dashboard-secondary)]">
            Search
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-bold">Supplier</th>
                <th className="px-4 py-3 font-bold">Contact</th>
                <th className="px-4 py-3 text-right font-bold">Payable Amount</th>
                <th className="px-4 py-3 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-slate-500">Loading supplier dues...</td>
                </tr>
              ) : filteredSuppliers.length ? (
                filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-[var(--nst-dashboard-text)]">{supplier.name}</p>
                      <p className="text-xs text-slate-400">ID: {supplier.id}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <p>{supplier.phone || '-'}</p>
                      <p className="text-xs text-slate-400">{supplier.email || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-extrabold text-red-600">{money(supplier.due_amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link to={`/suppliers/${supplier.id}/ledger`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                          Ledger
                        </Link>
                        <button
                          type="button"
                          onClick={() => openPayModal(supplier)}
                          className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700"
                        >
                          Pay
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-slate-500">No supplier due found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={submitPayment} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl md:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-[var(--nst-dashboard-text)]">Pay Supplier Due</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedSupplier.name} — Current payable {money(selectedSupplier.due_amount)}</p>
              </div>
              <button type="button" onClick={closeModal} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200">×</button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Amount</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => updateForm('amount', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Payment Method</span>
                <select
                  value={form.payment_method}
                  onChange={(event) => updateForm('payment_method', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
                >
                  {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Provider Name</span>
                <input
                  value={form.provider_name}
                  onChange={(event) => updateForm('provider_name', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
                  placeholder="Cash Counter / bKash / Bank"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Transaction ID</span>
                <input
                  value={form.transaction_id}
                  onChange={(event) => updateForm('transaction_id', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
                  placeholder="Optional"
                />
              </label>
            </div>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Payment Slip</span>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(event) => setPaymentSlip(event.target.files?.[0] || null)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--nst-dashboard-primary-soft)] file:px-3 file:py-2 file:text-sm file:font-bold file:text-[var(--nst-dashboard-primary)]"
              />
            </label>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Note</span>
              <textarea
                value={form.note}
                onChange={(event) => updateForm('note', event.target.value)}
                className="min-h-[90px] w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
                placeholder="Optional note"
              />
            </label>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeModal} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
                {saving ? 'Saving...' : 'Pay Supplier'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
