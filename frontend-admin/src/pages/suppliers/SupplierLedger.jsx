import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import supplierService from '../../services/supplierService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Truck as NstHdrTruck } from 'lucide-react';
import { useT } from '../../i18n';

const emptyPayForm = {
  amount: '',
  payment_method: 'cash',
  provider_name: '',
  transaction_id: '',
  payment_slip: null,
  note: '',
};

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'rocket', label: 'Rocket' },
  { value: 'upay', label: 'Upay' },
  { value: 'bank', label: 'Bank' },
  { value: 'card', label: 'Card' },
  { value: 'other_mfs', label: 'Other MFS' },
];

export default function SupplierLedger() {
  const t = useT();
  const { id } = useParams();

  const supplierId = id;
  const hasValidSupplierId =
    supplierId &&
    supplierId !== 'undefined' &&
    supplierId !== 'null';

  const [supplier, setSupplier] = useState(null);
  const [summary, setSummary] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [payments, setPayments] = useState([]);

  const [payForm, setPayForm] = useState(emptyPayForm);

  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const getErrorMessage = (err, fallback = 'Something went wrong.') => {
    if (err?.response?.data?.errors) {
      return Object.values(err.response.data.errors).flat().join(' ');
    }

    return err?.response?.data?.message || err?.message || fallback;
  };

  const loadLedger = async () => {
    if (!hasValidSupplierId) {
      setSupplier(null);
      setSummary(null);
      setPurchases([]);
      setPayments([]);
      setError('Supplier ID missing. Please open ledger from supplier list.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const response = await supplierService.getSupplierLedger(supplierId);
      const data = response?.data || response || {};

      setSupplier(data.supplier || null);
      setSummary(data.summary || null);
      setPurchases(Array.isArray(data.purchases) ? data.purchases : []);
      setPayments(Array.isArray(data.payments) ? data.payments : []);
    } catch (err) {
      console.log(err);
      setSupplier(null);
      setSummary(null);
      setPurchases([]);
      setPayments([]);
      setError(getErrorMessage(err, 'Supplier ledger load failed.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, [supplierId]);

  const currentDueAmount = Number(
    summary?.total_due_amount ?? supplier?.current_balance ?? 0
  );

  const currentAdvanceAmount = Number(
    summary?.total_advance_amount ?? supplier?.advance_balance ?? 0
  );

  const handlePayChange = (e) => {
    const { name, value, files } = e.target;

    if (name === 'payment_slip') {
      setPayForm((previous) => ({
        ...previous,
        payment_slip: files?.[0] || null,
      }));

      return;
    }

    setPayForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handlePayDue = async (e) => {
    e.preventDefault();

    if (!hasValidSupplierId) {
      setError('Supplier ID missing. Please open ledger from supplier list.');
      return;
    }

    if (Number(payForm.amount || 0) <= 0) {
      setError('Payment amount must be greater than 0.');
      return;
    }

    try {
      setPaying(true);
      setMessage('');
      setError('');

      const selectedMethod = paymentMethods.find(
        (method) => method.value === payForm.payment_method
      );

      const formData = new FormData();
      formData.append('amount', Number(payForm.amount || 0));
      formData.append('payment_method', payForm.payment_method);
      formData.append(
        'provider_name',
        payForm.provider_name || selectedMethod?.label || payForm.payment_method
      );

      if (payForm.transaction_id) {
        formData.append('transaction_id', payForm.transaction_id);
      }

      if (payForm.note) {
        formData.append('note', payForm.note);
      }

      if (payForm.payment_slip) {
        formData.append('payment_slip', payForm.payment_slip);
      }

      await supplierService.payDue(supplierId, formData);

      setMessage(
        currentDueAmount > 0
          ? 'Supplier due payment saved successfully.'
          : 'Supplier advance payment saved successfully.'
      );

      setPayForm(emptyPayForm);
      await loadLedger();
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Supplier payment failed.'));
    } finally {
      setPaying(false);
    }
  };

  const handleRecalculateDue = async () => {
    if (!hasValidSupplierId) {
      setError('Supplier ID missing. Please open ledger from supplier list.');
      return;
    }

    const confirmed = window.confirm(
      t('suppliers.recalc_confirm')
    );

    if (!confirmed) {
      return;
    }

    try {
      setRecalculating(true);
      setMessage('');
      setError('');

      await supplierService.recalculateDue(supplierId);

      setMessage('Supplier due recalculated successfully.');
      await loadLedger();
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Supplier due recalculation failed.'));
    } finally {
      setRecalculating(false);
    }
  };

  const formatPrice = (amount) => {
    return `BDT ${Number(amount || 0).toLocaleString()}`;
  };

  const formatDate = (value) => {
    if (!value) {
      return '-';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString();
  };

  const getPaymentMethod = (payment) => {
    const method = payment?.payment_method || '-';
    const provider = payment?.provider_name || '';

    if (provider && provider !== '-' && provider !== method) {
      return provider;
    }

    return String(method).replace('_', ' ');
  };

  return (
    <div className="min-h-screen bg-[var(--nst-dashboard-surface)] p-4 md:p-6">
      <NstPageHeader icon={NstHdrTruck} title={t('suppliers.ledger_title')} subtitle={t('suppliers.ledger_subtitle')} actions={<><div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleRecalculateDue}
            disabled={recalculating || loading || !hasValidSupplierId}
            className="inline-flex items-center justify-center rounded-lg bg-orange-50 px-5 py-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-60"
          >
            {recalculating ? 'Recalculating...' : 'Recalculate Due'}
          </button>

          <Link
            to="/suppliers"
            className="inline-flex items-center justify-center rounded-lg bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200"
          >
            Back to Suppliers
          </Link>
        </div></>}/>

      {message && (
        <div className="mb-5 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {loading && (
        <div className="mb-5 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Supplier ledger loading...
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {supplier && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-bold text-[var(--nst-dashboard-text)]">
            {supplier.name || '-'}
          </h2>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-gray-600">
            <p>
              <span className="font-semibold text-gray-700">Phone:</span>{' '}
              {supplier.phone || '-'}
            </p>

            <p>
              <span className="font-semibold text-gray-700">Email:</span>{' '}
              {supplier.email || '-'}
            </p>

            <p>
              <span className="font-semibold text-gray-700">Address:</span>{' '}
              {supplier.address || '-'}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 md:gap-5 mb-6">
        <SummaryCard
          title="Total Purchase"
          value={summary?.total_purchase || 0}
          badge="Purchases"
        />

        <SummaryCard
          title="Purchase Amount"
          value={formatPrice(summary?.total_purchase_amount)}
          badge="Total"
        />

        <SummaryCard
          title="Paid Amount"
          value={formatPrice(summary?.total_paid_amount)}
          badge="Paid"
          success
        />

        <SummaryCard
          title="Due Amount"
          value={formatPrice(currentDueAmount)}
          badge="Due"
          danger
        />

        <SummaryCard
          title="Advance Payment"
          value={formatPrice(currentAdvanceAmount)}
          badge="Advance"
          success
        />
      </div>

      <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)]">
            {currentDueAmount > 0 ? 'Pay Supplier Due' : 'Add Supplier Advance Payment'}
          </h2>

          <p className="text-sm text-gray-500 mt-1">
            {currentDueAmount > 0
              ? t('suppliers.payment_help_due')
              : t('suppliers.payment_help_advance')}
          </p>
        </div>

        <form
          onSubmit={handlePayDue}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4"
        >
          <div>
            <label className={labelClass()}>Amount *</label>
            <input
              type="number"
              name="amount"
              value={payForm.amount}
              onChange={handlePayChange}
              min="1"
              step="0.01"
              placeholder="Payment amount"
              className={inputClass()}
              required
            />
          </div>

          <div>
            <label className={labelClass()}>Payment Method *</label>
            <select
              name="payment_method"
              value={payForm.payment_method}
              onChange={handlePayChange}
              className={inputClass()}
              required
            >
              {paymentMethods.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass()}>
              {payForm.payment_method === 'other_mfs'
                ? 'Custom MFS Name'
                : 'Provider / Bank Name'}
            </label>
            <input
              type="text"
              name="provider_name"
              value={payForm.provider_name}
              onChange={handlePayChange}
              placeholder={
                payForm.payment_method === 'other_mfs'
                  ? 'Example: Tap'
                  : 'Optional'
              }
              className={inputClass()}
            />
          </div>

          <div>
            <label className={labelClass()}>Transaction ID</label>
            <input
              type="text"
              name="transaction_id"
              value={payForm.transaction_id}
              onChange={handlePayChange}
              placeholder="Optional"
              className={inputClass()}
            />
          </div>

          <div>
            <label className={labelClass()}>Pay Slip</label>
            <input
              type="file"
              name="payment_slip"
              onChange={handlePayChange}
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              className={fileInputClass()}
            />
          </div>

          <div className="md:col-span-2 xl:col-span-5">
            <label className={labelClass()}>Note</label>
            <textarea
              name="note"
              value={payForm.note}
              onChange={handlePayChange}
              rows="2"
              placeholder="Payment note..."
              className={inputClass()}
            />
          </div>

          <div className="md:col-span-2 xl:col-span-5">
            <button
              type="submit"
              disabled={paying || !hasValidSupplierId}
              className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {paying
                ? 'Saving Payment...'
                : currentDueAmount > 0
                  ? 'Pay Supplier Due'
                  : 'Add Advance Payment'}
            </button>
          </div>
        </form>

        {currentDueAmount <= 0 && (
          <div className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {t('suppliers.no_due_notice')}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-bold text-[var(--nst-dashboard-text)]">
              Purchase History ({purchases.length})
            </h2>
          </div>

          {purchases.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No purchase history found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Purchase No</th>
                    <th className="px-4 py-3">Final</th>
                    <th className="px-4 py-3">Paid</th>
                    <th className="px-4 py-3">Due</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {purchases.map((purchase) => (
                    <tr key={purchase.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-bold text-[var(--nst-dashboard-text)]">
                        {purchase.purchase_no || `PUR-${purchase.id}`}
                      </td>

                      <td className="px-4 py-3 font-semibold text-gray-800">
                        {formatPrice(purchase.final_amount)}
                      </td>

                      <td className="px-4 py-3 font-semibold text-green-700">
                        {formatPrice(purchase.paid_amount)}
                      </td>

                      <td className="px-4 py-3 font-semibold text-red-600">
                        {formatPrice(purchase.due_amount)}
                      </td>

                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(purchase.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-bold text-[var(--nst-dashboard-text)]">
              Payment History ({payments.length})
            </h2>
          </div>

          {payments.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No supplier payment history found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Transaction</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Advance</th>
                    <th className="px-4 py-3">Slip</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {payments.map((payment) => (
                    <tr key={`${payment.id}-${payment.created_at}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3 capitalize font-semibold text-[var(--nst-dashboard-text)]">
                        {getPaymentMethod(payment)}
                      </td>

                      <td className="px-4 py-3 text-gray-600">
                        {payment.transaction_id || '-'}
                      </td>

                      <td className="px-4 py-3 font-bold text-green-700">
                        {formatPrice(payment.amount)}
                      </td>

                      <td className="px-4 py-3 font-bold text-blue-700">
                        {formatPrice(payment.extra_amount)}
                      </td>

                      <td className="px-4 py-3">
                        {payment.payment_slip_url ? (
                          <a
                            href={payment.payment_slip_url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg bg-[var(--nst-dashboard-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--nst-dashboard-primary)] hover:bg-[var(--nst-dashboard-primary-soft)]"
                          >
                            View Slip
                          </a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(payment.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, badge, success = false, danger = false }) {
  let badgeClass = 'bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)]';

  if (success) {
    badgeClass = 'bg-green-50 text-green-700';
  }

  if (danger) {
    badgeClass = 'bg-red-50 text-red-700';
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <h2 className="text-2xl font-bold text-[var(--nst-dashboard-text)] mt-2">
            {value}
          </h2>
        </div>

        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${badgeClass}`}>
          {badge}
        </span>
      </div>
    </div>
  );
}

function labelClass() {
  return 'block text-sm font-semibold text-gray-700 mb-2';
}

function inputClass() {
  return 'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)] bg-white';
}

function fileInputClass() {
  return 'block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--nst-dashboard-primary-soft)] file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-[var(--nst-dashboard-primary)] hover:file:bg-[var(--nst-dashboard-primary-soft)]';
}