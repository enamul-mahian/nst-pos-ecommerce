import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import accountsPaymentService from '../../services/accountsPaymentService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Users as NstHdrUsers } from 'lucide-react';
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
    green: 'bg-emerald-50 text-emerald-800 border-emerald-100',
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

export default function CustomerDueCollection() {
  const t = useT();
  const [customers, setCustomers] = useState([]);
  const [summary, setSummary] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    amount: '',
    payment_method: 'cash',
    provider_name: 'Cash Counter',
    transaction_id: '',
    note: '',
  });

  const filteredCustomers = useMemo(() => customers, [customers]);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await accountsPaymentService.getDueCenter({ search });
      const payload = unwrapDueCenter(response);

      setCustomers(payload.customers || []);
      setSummary(payload.summary || {});
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || t('payments.customer.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const openReceiveModal = (customer) => {
    setSelectedCustomer(customer);
    setMessage('');
    setError('');
    setForm({
      amount: String(Number(customer?.due_amount || 0)),
      payment_method: 'cash',
      provider_name: 'Cash Counter',
      transaction_id: '',
      note: '',
    });
  };

  const closeModal = () => {
    setSelectedCustomer(null);
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

    if (!selectedCustomer) return;

    const amount = Number(form.amount || 0);

    if (!amount || amount <= 0) {
      setError(t('common.amount_positive'));
      return;
    }

    try {
      setSaving(true);
      setError('');
      setMessage('');

      await accountsPaymentService.receiveCustomerDue(selectedCustomer.id, {
        amount,
        payment_method: form.payment_method,
        provider_name: form.provider_name,
        transaction_id: form.transaction_id,
        note: form.note,
      });

      setMessage(t('payments.customer.received', { name: selectedCustomer.name, amount: money(amount) }));
      closeModal();
      await loadCustomers();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || t('payments.customer.receive_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--nst-dashboard-surface)] p-4 md:p-6">
      <NstPageHeader icon={NstHdrUsers} title={<>Customer Due Collection</>} subtitle={t('payments.customer.subtitle')} actions={<><div className="flex flex-wrap gap-2">
          <Link to="/accounts" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[var(--nst-dashboard-text)] hover:bg-slate-50">
            Accounts Dashboard
          </Link>
          <button
            type="button"
            onClick={loadCustomers}
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
        <StatCard title="Due Customers" value={Number(summary.customer_count || 0).toLocaleString('en-BD')} subtitle="Current due customer count" tone="blue" />
        <StatCard title="Total Receivable" value={money(summary.customer_due_total || 0)} subtitle="Customer due total" tone="green" />
        <StatCard title="Net Position" value={money(summary.net_receivable_minus_payable || 0)} subtitle="Receivable - Supplier payable" tone="purple" />
      </div>

      <div className="mb-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            loadCustomers();
          }}
          className="flex flex-col gap-3 md:flex-row"
        >
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Customer name, phone, email search..."
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
                <th className="px-4 py-3 font-bold">Customer</th>
                <th className="px-4 py-3 font-bold">Contact</th>
                <th className="px-4 py-3 text-right font-bold">Due Amount</th>
                <th className="px-4 py-3 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-slate-500">Loading customer dues...</td>
                </tr>
              ) : filteredCustomers.length ? (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-[var(--nst-dashboard-text)]">{customer.name}</p>
                      <p className="text-xs text-slate-400">ID: {customer.id}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <p>{customer.phone || '-'}</p>
                      <p className="text-xs text-slate-400">{customer.email || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-extrabold text-red-600">{money(customer.due_amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link to={`/customers/${customer.id}/ledger`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                          Ledger
                        </Link>
                        <button
                          type="button"
                          onClick={() => openReceiveModal(customer)}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                          Receive
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-slate-500">No customer due found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={submitPayment} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl md:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-[var(--nst-dashboard-text)]">Receive Customer Due</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedCustomer.name} — Current due {money(selectedCustomer.due_amount)}</p>
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
              <button type="submit" disabled={saving} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                {saving ? 'Saving...' : 'Receive Payment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
