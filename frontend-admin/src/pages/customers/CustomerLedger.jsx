import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { customerService } from '../../services/customerService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Users as NstHdrUsers } from 'lucide-react';
import { useT } from '../../i18n';

const emptyReceiveForm = {
  amount: '',
  payment_method: 'cash',
  provider_name: '',
  transaction_id: '',
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

export default function CustomerLedger() {
  const t = useT();
  const { id } = useParams();

  const [customer, setCustomer] = useState(null);
  const [summary, setSummary] = useState(null);
  const [sales, setSales] = useState([]);
  const [payments, setPayments] = useState([]);

  const [receiveForm, setReceiveForm] = useState(emptyReceiveForm);

  const [loading, setLoading] = useState(false);
  const [receiving, setReceiving] = useState(false);
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
    try {
      setLoading(true);
      setError('');

      const response = await customerService.getCustomerLedger(id);
      const data = response?.data || response || {};

      setCustomer(data.customer || null);
      setSummary(data.summary || null);
      setSales(Array.isArray(data.sales) ? data.sales : []);
      setPayments(Array.isArray(data.payments) ? data.payments : []);
    } catch (err) {
      console.log(err);
      setCustomer(null);
      setSummary(null);
      setSales([]);
      setPayments([]);
      setError(getErrorMessage(err, 'Customer ledger load failed.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, [id]);

  const currentDueAmount = Number(
    summary?.total_due_amount ?? customer?.current_balance ?? 0
  );

  const handleReceiveChange = (e) => {
    const { name, value } = e.target;

    setReceiveForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleReceiveDue = async (e) => {
    e.preventDefault();

    if (Number(receiveForm.amount || 0) <= 0) {
      setError('Receive amount must be greater than 0.');
      return;
    }

    try {
      setReceiving(true);
      setMessage('');
      setError('');

      const selectedMethod = paymentMethods.find(
        (method) => method.value === receiveForm.payment_method
      );

      const payload = {
        amount: Number(receiveForm.amount || 0),
        payment_method: receiveForm.payment_method,
        provider_name:
          receiveForm.provider_name ||
          selectedMethod?.label ||
          receiveForm.payment_method,
        transaction_id: receiveForm.transaction_id || null,
        note: receiveForm.note || null,
      };

      await customerService.receiveDue(id, payload);

      setMessage('Customer due payment received successfully.');
      setReceiveForm(emptyReceiveForm);

      await loadLedger();
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Due payment receive failed.'));
    } finally {
      setReceiving(false);
    }
  };

  const handleRecalculateDue = async () => {
    const confirmed = window.confirm(
      t('customers.recalc_confirm')
    );

    if (!confirmed) {
      return;
    }

    try {
      setRecalculating(true);
      setMessage('');
      setError('');

      const response = await customerService.recalculateDue(id);
      const data = response?.data || {};

      setMessage(
        `Due recalculated successfully. Applied Amount: BDT ${Number(
          data.applied_amount || 0
        ).toLocaleString()}`
      );

      await loadLedger();
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Due recalculation failed.'));
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
    const method = payment?.payment_method || payment?.method || '-';
    const provider = payment?.provider_name || payment?.provider || '';

    if (provider && provider !== '-' && provider !== method) {
      return provider;
    }

    return String(method).replace('_', ' ');
  };

  return (
    <div className="min-h-screen bg-[var(--nst-dashboard-surface)] p-4 md:p-6">
      <NstPageHeader icon={NstHdrUsers} title={t('customers.ledger_title')} subtitle={t('customers.ledger_subtitle')} actions={<><div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleRecalculateDue}
            disabled={recalculating || loading}
            className="inline-flex items-center justify-center rounded-lg bg-orange-50 px-5 py-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-60"
          >
            {recalculating ? 'Recalculating...' : 'Recalculate Due'}
          </button>

          <Link
            to="/customers"
            className="inline-flex items-center justify-center rounded-lg bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200"
          >
            Back to Customers
          </Link>
        </div></>}/>

      {message && (
        <div className="mb-5 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {loading && (
        <div className="mb-5 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Customer ledger loading...
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {customer && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-bold text-[var(--nst-dashboard-text)]">
            {customer.name || '-'}
          </h2>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-gray-600">
            <p>
              <span className="font-semibold text-gray-700">Phone:</span>{' '}
              {customer.phone || '-'}
            </p>

            <p>
              <span className="font-semibold text-gray-700">Email:</span>{' '}
              {customer.email || '-'}
            </p>

            <p>
              <span className="font-semibold text-gray-700">Address:</span>{' '}
              {customer.address || '-'}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-5 mb-6">
        <SummaryCard
          title="Total Invoice"
          value={summary?.total_invoice || 0}
          badge="Invoices"
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
      </div>

      <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)]">
            Receive Customer Due
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {t('customers.receive_due_help')}
          </p>
        </div>

        <form
          onSubmit={handleReceiveDue}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4"
        >
          <div>
            <label className={labelClass()}>Amount *</label>
            <input
              type="number"
              name="amount"
              value={receiveForm.amount}
              onChange={handleReceiveChange}
              min="1"
              step="0.01"
              placeholder="Receive amount"
              className={inputClass()}
              required
            />
          </div>

          <div>
            <label className={labelClass()}>Payment Method *</label>
            <select
              name="payment_method"
              value={receiveForm.payment_method}
              onChange={handleReceiveChange}
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
              {receiveForm.payment_method === 'other_mfs'
                ? 'Custom MFS Name'
                : 'Provider / Bank Name'}
            </label>
            <input
              type="text"
              name="provider_name"
              value={receiveForm.provider_name}
              onChange={handleReceiveChange}
              placeholder={
                receiveForm.payment_method === 'other_mfs'
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
              value={receiveForm.transaction_id}
              onChange={handleReceiveChange}
              placeholder="Optional"
              className={inputClass()}
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={receiving || currentDueAmount <= 0}
              className="w-full rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {receiving ? 'Receiving...' : 'Receive Due'}
            </button>
          </div>

          <div className="md:col-span-2 xl:col-span-5">
            <label className={labelClass()}>Note</label>
            <textarea
              name="note"
              value={receiveForm.note}
              onChange={handleReceiveChange}
              rows="2"
              placeholder="Payment note..."
              className={inputClass()}
            />
          </div>
        </form>

        {currentDueAmount <= 0 && (
          <div className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
            {t('customers.no_due')}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-bold text-[var(--nst-dashboard-text)]">
              Invoice History ({sales.length})
            </h2>
          </div>

          {sales.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No invoice history found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Final</th>
                    <th className="px-4 py-3">Paid</th>
                    <th className="px-4 py-3">Due</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-bold text-[var(--nst-dashboard-text)]">
                        {sale.invoice_no || `INV-${sale.id}`}
                      </td>

                      <td className="px-4 py-3 font-semibold text-gray-800">
                        {formatPrice(sale.final_amount)}
                      </td>

                      <td className="px-4 py-3 font-semibold text-green-700">
                        {formatPrice(sale.paid_amount)}
                      </td>

                      <td className="px-4 py-3 font-semibold text-red-600">
                        {formatPrice(sale.due_amount)}
                      </td>

                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(sale.created_at)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/sales/${sale.id}/print`}
                          className="rounded-lg bg-[var(--nst-dashboard-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--nst-dashboard-primary)] hover:bg-[var(--nst-dashboard-primary-soft)]"
                        >
                          Invoice
                        </Link>
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
              No payment history found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Transaction</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {payments.map((payment) => (
                    <tr
                      key={`${payment.id}-${payment.created_at}`}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 capitalize font-semibold text-[var(--nst-dashboard-text)]">
                        {getPaymentMethod(payment)}
                      </td>

                      <td className="px-4 py-3 text-gray-600">
                        {payment.transaction_id || '-'}
                      </td>

                      <td className="px-4 py-3 font-bold text-green-700">
                        {formatPrice(payment.amount)}
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