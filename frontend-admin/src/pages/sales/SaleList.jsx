import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import saleService from '../../services/saleService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { ShoppingCart as NstHdrShoppingCart } from 'lucide-react';
import { useT } from '../../i18n';

const initialReturnForm = {
  reason: '',
  note: '',
};

export default function SaleList() {
  const t = useT();
  const [sales, setSales] = useState([]);
  const [meta, setMeta] = useState(null);

  const [search, setSearch] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [saleStatus, setSaleStatus] = useState('');

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [returnSale, setReturnSale] = useState(null);
  const [returnForm, setReturnForm] = useState(initialReturnForm);

  const normalizePaginatedResponse = (response) => {
    const payload = response?.data ?? response;
    const wrapper = payload?.data ?? payload;

    if (Array.isArray(wrapper)) {
      return { rows: wrapper, pagination: null };
    }

    if (Array.isArray(wrapper?.data)) {
      return { rows: wrapper.data, pagination: wrapper };
    }

    if (Array.isArray(payload?.data?.data)) {
      return { rows: payload.data.data, pagination: payload.data };
    }

    return { rows: [], pagination: null };
  };

  const getErrorMessage = (err) => {
    if (err?.response?.data?.errors) {
      return Object.values(err.response.data.errors).flat().join(' ');
    }

    return err?.response?.data?.message || err?.message || 'Sales data load failed.';
  };

  const fetchSales = async (page = 1) => {
    try {
      setLoading(true);
      setMessage('');
      setError('');

      const response = await saleService.getSales({
        page,
        search: search || undefined,
        payment_status: paymentStatus || undefined,
        status: saleStatus || undefined,
        per_page: 15,
      });

      const normalized = normalizePaginatedResponse(response);
      setSales(normalized.rows);
      setMeta(normalized.pagination);
    } catch (err) {
      console.error('Sales load error:', err);
      setSales([]);
      setMeta(null);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchSales(1);
  };

  const handleReset = () => {
    setSearch('');
    setPaymentStatus('');
    setSaleStatus('');

    setTimeout(() => {
      fetchSales(1);
    }, 0);
  };

  const handleDelete = async (sale) => {
    const invoice = getInvoiceNo(sale);

    const confirmed = window.confirm(
      `Are you sure you want to delete invoice "${invoice}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(sale.id);
      setMessage('');
      setError('');

      await saleService.deleteSale(sale.id);

      setMessage('Sale invoice deleted successfully.');
      await fetchSales(meta?.current_page || 1);
    } catch (err) {
      console.error('Sale delete error:', err);
      setError(getErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const handleCancel = async (sale) => {
    const invoice = getInvoiceNo(sale);

    const reason = window.prompt(
      t('sales.cancel_reason_prompt', { invoice }),
      'Cancelled from sales list'
    );

    if (reason === null) {
      return;
    }

    try {
      setActionLoading(true);
      setMessage('');
      setError('');

      await saleService.cancelSale(sale.id, {
        reason: reason || 'Cancelled from sales list',
      });

      setMessage('Sale invoice cancelled successfully. Stock/device status restored.');
      await fetchSales(meta?.current_page || 1);
    } catch (err) {
      console.error('Sale cancel error:', err);
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const openReturnModal = (sale) => {
    setReturnSale(sale);
    setReturnForm(initialReturnForm);
    setError('');
    setMessage('');
  };

  const closeReturnModal = () => {
    if (actionLoading) {
      return;
    }

    setReturnSale(null);
    setReturnForm(initialReturnForm);
  };

  const submitReturn = async (e) => {
    e.preventDefault();

    if (!returnSale?.id) {
      return;
    }

    const confirmed = window.confirm(
      t('sales.return_confirm', { invoice: getInvoiceNo(returnSale) })
    );

    if (!confirmed) {
      return;
    }

    try {
      setActionLoading(true);
      setMessage('');
      setError('');

      await saleService.returnSale(returnSale.id, {
        reason: returnForm.reason || 'Customer return',
        note: returnForm.note || '',
      });

      setMessage('Sale returned successfully. Stock/device status restored.');
      setReturnSale(null);
      setReturnForm(initialReturnForm);
      await fetchSales(meta?.current_page || 1);
    } catch (err) {
      console.error('Sale return error:', err);
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const formatPrice = (amount) => {
    return `BDT ${Number(amount || 0).toLocaleString()}`;
  };

  const getInvoiceNo = (sale) => {
    return sale?.invoice_no || sale?.invoice_number || `INV-${sale?.id}`;
  };

  const getCustomerName = (sale) => {
    return sale?.customer?.name || sale?.customer_name || '-';
  };

  const getCustomerPhone = (sale) => {
    return sale?.customer?.phone || sale?.customer_phone || '-';
  };

  const getBranchName = (sale) => {
    return sale?.branch?.name || sale?.branch_name || '-';
  };

  const getFinalAmount = (sale) => {
    return sale?.final_amount || sale?.total_amount || sale?.grand_total || 0;
  };

  const getPaidAmount = (sale) => {
    return sale?.paid_amount || sale?.total_paid || 0;
  };

  const getDueAmount = (sale) => {
    return sale?.due_amount || sale?.current_due || 0;
  };

  const getPaymentStatus = (sale) => {
    return sale?.payment_status || (Number(getDueAmount(sale)) > 0 ? 'partial' : 'paid');
  };

  const getSaleStatus = (sale) => {
    return sale?.sale_status || sale?.status || 'completed';
  };

  const canReverse = (sale) => getSaleStatus(sale) === 'completed';

  return (
    <div className="p-4 md:p-6">
      <NstPageHeader icon={NstHdrShoppingCart} title={t('sales.list_title')} subtitle={t('sales.list_subtitle')} actions={<><Link
          to="/sales/create"
          className="inline-flex items-center justify-center rounded-lg bg-[var(--nst-dashboard-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--nst-dashboard-primary)]"
        >
          + New POS Sale
        </Link></>}/>

      {message && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-5 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Invoice, customer, phone, IMEI..."
            className={inputClass()}
          />

          <select
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
            className={inputClass()}
          >
            <option value="">All Payment</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial / Due</option>
            <option value="due">Due</option>
            <option value="unpaid">Unpaid</option>
          </select>

          <select
            value={saleStatus}
            onChange={(e) => setSaleStatus(e.target.value)}
            className={inputClass()}
          >
            <option value="">All Status</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="returned">Returned</option>
          </select>

          <button
            type="submit"
            className="rounded-lg bg-[var(--nst-dashboard-secondary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--nst-dashboard-secondary)] disabled:opacity-60"
            disabled={loading || actionLoading}
          >
            Search
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-60"
            disabled={loading || actionLoading}
          >
            Reset
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-[var(--nst-dashboard-text)]">
            Sale Invoices ({sales.length})
          </h2>

          {(loading || actionLoading) && (
            <span className="text-sm text-gray-400">Processing...</span>
          )}
        </div>

        {!loading && sales.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-gray-500">No sale invoice found.</p>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[1250px] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-3">Invoice</th>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Branch</th>
                    <th className="px-5 py-3">Final Amount</th>
                    <th className="px-5 py-3">Paid</th>
                    <th className="px-5 py-3">Due</th>
                    <th className="px-5 py-3">Payment</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-gray-50">
                      <td className="px-5 py-4">
                        <p className="font-bold text-[var(--nst-dashboard-text)]">
                          {getInvoiceNo(sale)}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-semibold text-gray-800">
                          {getCustomerName(sale)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {getCustomerPhone(sale)}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        {getBranchName(sale)}
                      </td>

                      <td className="px-5 py-4 font-bold text-gray-800">
                        {formatPrice(getFinalAmount(sale))}
                      </td>

                      <td className="px-5 py-4 font-bold text-green-700">
                        {formatPrice(getPaidAmount(sale))}
                      </td>

                      <td className="px-5 py-4 font-bold text-red-600">
                        {formatPrice(getDueAmount(sale))}
                      </td>

                      <td className="px-5 py-4">
                        <PaymentBadge status={getPaymentStatus(sale)} />
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge status={getSaleStatus(sale)} />
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        {formatDate(sale?.created_at || sale?.sale_date)}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2 flex-wrap">
                          <Link
                            to={`/sales/${sale.id}/invoice`}
                            className="rounded-lg bg-[var(--nst-dashboard-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--nst-dashboard-primary)] hover:bg-[var(--nst-dashboard-primary-soft)]"
                          >
                            View / Print
                          </Link>

                          {canReverse(sale) && (
                            <button
                              type="button"
                              onClick={() => openReturnModal(sale)}
                              disabled={actionLoading}
                              className="rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-60"
                            >
                              Return
                            </button>
                          )}

                          {canReverse(sale) && (
                            <button
                              type="button"
                              onClick={() => handleCancel(sale)}
                              disabled={actionLoading}
                              className="rounded-lg bg-yellow-50 px-3 py-1.5 text-xs font-semibold text-yellow-700 hover:bg-yellow-100 disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          )}

                          {getSaleStatus(sale) !== 'completed' && (
                            <button
                              type="button"
                              onClick={() => handleDelete(sale)}
                              disabled={deletingId === sale.id || actionLoading}
                              className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                            >
                              {deletingId === sale.id ? 'Deleting...' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-gray-100">
              {sales.map((sale) => (
                <div key={sale.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-[var(--nst-dashboard-text)]">
                        {getInvoiceNo(sale)}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {getCustomerName(sale)} / {getCustomerPhone(sale)}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 items-end">
                      <PaymentBadge status={getPaymentStatus(sale)} />
                      <StatusBadge status={getSaleStatus(sale)} />
                    </div>
                  </div>

                  <div className="mt-3 space-y-1 text-sm text-gray-600">
                    <p>Branch: {getBranchName(sale)}</p>
                    <p>Final: {formatPrice(getFinalAmount(sale))}</p>
                    <p>Paid: {formatPrice(getPaidAmount(sale))}</p>
                    <p>Due: {formatPrice(getDueAmount(sale))}</p>
                    <p>Date: {formatDate(sale?.created_at || sale?.sale_date)}</p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      to={`/sales/${sale.id}/invoice`}
                      className="rounded-lg bg-[var(--nst-dashboard-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--nst-dashboard-primary)]"
                    >
                      View / Print
                    </Link>

                    {canReverse(sale) && (
                      <button
                        type="button"
                        onClick={() => openReturnModal(sale)}
                        disabled={actionLoading}
                        className="rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 disabled:opacity-60"
                      >
                        Return
                      </button>
                    )}

                    {canReverse(sale) && (
                      <button
                        type="button"
                        onClick={() => handleCancel(sale)}
                        disabled={actionLoading}
                        className="rounded-lg bg-yellow-50 px-3 py-1.5 text-xs font-semibold text-yellow-700 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    )}

                    {getSaleStatus(sale) !== 'completed' && (
                      <button
                        type="button"
                        onClick={() => handleDelete(sale)}
                        disabled={deletingId === sale.id || actionLoading}
                        className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-60"
                      >
                        {deletingId === sale.id ? 'Deleting...' : 'Delete'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {meta && meta.last_page > 1 && (
          <div className="flex justify-between items-center p-4 border-t">
            <button
              disabled={meta.current_page === 1 || loading}
              onClick={() => fetchSales(meta.current_page - 1)}
              className="px-4 py-2 rounded-lg border disabled:opacity-50"
            >
              Previous
            </button>

            <p className="text-sm text-gray-500">
              Page {meta.current_page} of {meta.last_page}
            </p>

            <button
              disabled={meta.current_page === meta.last_page || loading}
              onClick={() => fetchSales(meta.current_page + 1)}
              className="px-4 py-2 rounded-lg border disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {returnSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-gray-100">
            <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-[var(--nst-dashboard-text)]">Sale Return</h3>
                <p className="text-sm text-gray-500">Invoice: {getInvoiceNo(returnSale)}</p>
              </div>

              <button
                type="button"
                onClick={closeReturnModal}
                className="h-9 w-9 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                ×
              </button>
            </div>

            <form onSubmit={submitReturn} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-gray-500">Customer</p>
                  <p className="font-semibold text-gray-800">{getCustomerName(returnSale)}</p>
                </div>

                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-gray-500">Final Amount</p>
                  <p className="font-semibold text-gray-800">{formatPrice(getFinalAmount(returnSale))}</p>
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700">Return Reason</span>
                <input
                  type="text"
                  value={returnForm.reason}
                  onChange={(e) => setReturnForm((prev) => ({ ...prev, reason: e.target.value }))}
                  placeholder="Customer return / device issue / exchange reason"
                  className={inputClass()}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700">Note</span>
                <textarea
                  value={returnForm.note}
                  onChange={(e) => setReturnForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder={t('sales.return_note_placeholder')}
                  rows={4}
                  className={`${inputClass()} min-h-28`}
                />
              </label>

              <div className="rounded-lg bg-orange-50 px-4 py-3 text-sm text-orange-700">
                {t('sales.return_info')}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeReturnModal}
                  disabled={actionLoading}
                  className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-60"
                >
                  Close
                </button>

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                >
                  {actionLoading ? 'Returning...' : 'Confirm Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentBadge({ status }) {
  const value = String(status || 'paid').toLowerCase();

  let className = 'bg-green-50 text-green-700';

  if (value === 'partial') {
    className = 'bg-yellow-50 text-yellow-700';
  }

  if (value === 'due' || value === 'unpaid') {
    className = 'bg-red-50 text-red-700';
  }

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${className}`}>
      {value.replace('_', ' ')}
    </span>
  );
}

function StatusBadge({ status }) {
  const value = String(status || 'completed').toLowerCase();

  let className = 'bg-green-50 text-green-700';

  if (value === 'cancelled') {
    className = 'bg-red-50 text-red-700';
  }

  if (value === 'returned') {
    className = 'bg-orange-50 text-orange-700';
  }

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${className}`}>
      {value.replace('_', ' ')}
    </span>
  );
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function inputClass() {
  return 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]';
}
