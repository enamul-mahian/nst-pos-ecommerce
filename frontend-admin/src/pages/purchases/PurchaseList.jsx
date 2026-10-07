import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import purchaseService from '../../services/purchaseService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { ShoppingBag as NstHdrShoppingBag } from 'lucide-react';
import { useT } from '../../i18n';

export default function PurchaseList() {
  const t = useT();
  const [purchases, setPurchases] = useState([]);
  const [meta, setMeta] = useState(null);

  const [search, setSearch] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');

  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedDevices, setSelectedDevices] = useState([]);

  const [currentUser, setCurrentUser] = useState(null);

  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const canViewPurchasePrice = canSeePurchasePrice(currentUser);

  const getErrorMessage = (err, fallback = 'Something went wrong.') => {
    if (err?.response?.data?.errors) {
      return Object.values(err.response.data.errors).flat().join(' ');
    }

    return err?.response?.data?.message || err?.message || fallback;
  };

  const extractPayload = (response) => {
    return response?.data ?? response ?? {};
  };

  const extractPurchases = (response) => {
    const payload = extractPayload(response);

    if (Array.isArray(payload)) {
      return payload;
    }

    if (Array.isArray(payload.data?.data)) {
      return payload.data.data;
    }

    if (Array.isArray(payload.data)) {
      return payload.data;
    }

    return [];
  };

  const extractMeta = (response) => {
    const payload = extractPayload(response);

    if (payload.data?.current_page) {
      return payload.data;
    }

    if (payload.current_page) {
      return payload;
    }

    return null;
  };

  const loadCurrentUser = async () => {
    try {
      const response = await api.get('/me');
      setCurrentUser(extractUser(response.data));
    } catch (err) {
      console.log(err);
      setCurrentUser(null);
    }
  };

  const loadPurchases = async (page = 1) => {
    try {
      setLoading(true);
      setError('');

      const params = {
        page,
        per_page: 15,
        search,
      };

      if (canViewPurchasePrice && paymentStatus) {
        params.payment_status = paymentStatus;
      }

      const response = await purchaseService.getPurchases(params);

      setPurchases(extractPurchases(response));
      setMeta(extractMeta(response));
    } catch (err) {
      console.log(err);
      setPurchases([]);
      setMeta(null);
      setError(getErrorMessage(err, 'Purchase list load failed.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCurrentUser();
    loadPurchases();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    loadPurchases(1);
  };

  const handleReset = () => {
    setSearch('');
    setPaymentStatus('');

    setTimeout(() => {
      loadPurchases(1);
    }, 0);
  };

  const handleViewDetails = async (purchase) => {
    try {
      setDetailsLoading(true);
      setError('');

      const response = await purchaseService.getPurchase(purchase.id);
      const rawPayload = response?.data || response || {};
      const payload = rawPayload?.data || rawPayload;

      setSelectedPurchase(payload.purchase || purchase);
      setSelectedItems(Array.isArray(payload.items) ? payload.items : []);
      setSelectedDevices(Array.isArray(payload.devices) ? payload.devices : []);
    } catch (err) {
      console.log(err);
      setSelectedPurchase(null);
      setSelectedItems([]);
      setSelectedDevices([]);
      setError(getErrorMessage(err, 'Purchase details load failed.'));
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    setSelectedPurchase(null);
    setSelectedItems([]);
    setSelectedDevices([]);
  };

  const handleDelete = async (purchase) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete purchase "${getPurchaseNo(purchase)}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setLoading(true);
      setMessage('');
      setError('');

      await purchaseService.deletePurchase(purchase.id);

      setMessage('Purchase deleted successfully.');
      await loadPurchases(meta?.current_page || 1);
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Purchase delete failed.'));
    } finally {
      setLoading(false);
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

  const getPurchaseNo = (purchase) => {
    return (
      purchase?.purchase_no ||
      purchase?.purchase_number ||
      purchase?.invoice_no ||
      purchase?.reference_no ||
      `PUR-${purchase?.id}`
    );
  };

  const getFinalAmount = (purchase) => {
    return Number(
      purchase?.final_amount ||
        purchase?.total_amount ||
        purchase?.grand_total ||
        purchase?.bill_amount ||
        purchase?.net_amount ||
        0
    );
  };

  const getDueAmount = (purchase) => {
    return Number(
      purchase?.due_amount ||
        purchase?.current_due ||
        purchase?.balance_due ||
        0
    );
  };

  const getCashPaidAmount = (purchase) => {
    return Number(purchase?.cash_paid_amount || 0);
  };

  const getAdvanceAppliedAmount = (purchase) => {
    return Number(purchase?.advance_applied_amount || 0);
  };

  const getBranchName = (purchase) => {
    return purchase?.branch_name || purchase?.branch_id || '-';
  };

  const getSupplierName = (purchase) => {
    return purchase?.supplier_name || purchase?.supplier_phone || purchase?.supplier_id || '-';
  };

  const renderPaymentStatus = (status) => {
    let badgeClass = 'bg-gray-100 text-gray-600';

    if (status === 'paid') {
      badgeClass = 'bg-green-50 text-green-700';
    }

    if (status === 'partial') {
      badgeClass = 'bg-orange-50 text-orange-700';
    }

    if (status === 'due') {
      badgeClass = 'bg-red-50 text-red-700';
    }

    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
        {status || '-'}
      </span>
    );
  };

  const renderPagination = () => {
    if (!meta || !meta.last_page || meta.last_page <= 1) {
      return null;
    }

    const currentPage = Number(meta.current_page || 1);
    const lastPage = Number(meta.last_page || 1);

    return (
      <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-500">
          Page {currentPage} of {lastPage}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadPurchases(currentPage - 1)}
            disabled={currentPage <= 1 || loading}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>

          <button
            type="button"
            onClick={() => loadPurchases(currentPage + 1)}
            disabled={currentPage >= lastPage || loading}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--nst-dashboard-surface)] p-4 md:p-6">
      <NstPageHeader icon={NstHdrShoppingBag} title={t('purchases.list_title')} subtitle={t('purchases.list_subtitle')} actions={<><Link
          to="/purchases/create"
          className="inline-flex items-center justify-center rounded-lg bg-[var(--nst-dashboard-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--nst-dashboard-primary)]"
        >
          + Create Purchase
        </Link></>}/>

      {message && (
        <div className="mb-5 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <form
          onSubmit={handleSearch}
          className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
        >
          <div className={canViewPurchasePrice ? 'md:col-span-2' : 'md:col-span-3'}>
            <label className={labelClass()}>Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search purchase no, supplier, branch..."
              className={inputClass()}
            />
          </div>

          {canViewPurchasePrice && (
            <div>
              <label className={labelClass()}>Payment Status</label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                className={inputClass()}
              >
                <option value="">All</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="due">Due</option>
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[var(--nst-dashboard-secondary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--nst-dashboard-secondary)] disabled:opacity-60"
            >
              Search
            </button>

            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="w-full rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-60"
            >
              Reset
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-[var(--nst-dashboard-text)]">Purchase List</h2>

          {loading && (
            <span className="text-sm text-blue-600 font-semibold">
              Loading...
            </span>
          )}
        </div>

        {purchases.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No purchase found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Purchase No</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Branch</th>

                  {canViewPurchasePrice && (
                    <>
                      <th className="px-4 py-3">Final</th>
                      <th className="px-4 py-3">Cash Paid</th>
                      <th className="px-4 py-3">Advance</th>
                      <th className="px-4 py-3">Due</th>
                      <th className="px-4 py-3">Payment</th>
                    </>
                  )}

                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {purchases.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-bold text-[var(--nst-dashboard-text)]">
                      {getPurchaseNo(purchase)}
                    </td>

                    <td className="px-4 py-3 text-gray-600">
                      {getSupplierName(purchase)}
                    </td>

                    <td className="px-4 py-3 text-gray-600">
                      {getBranchName(purchase)}
                    </td>

                    {canViewPurchasePrice && (
                      <>
                        <td className="px-4 py-3 font-semibold text-gray-800">
                          {formatPrice(getFinalAmount(purchase))}
                        </td>

                        <td className="px-4 py-3 font-semibold text-green-700">
                          {formatPrice(getCashPaidAmount(purchase))}
                        </td>

                        <td className="px-4 py-3 font-semibold text-blue-700">
                          {formatPrice(getAdvanceAppliedAmount(purchase))}
                        </td>

                        <td className="px-4 py-3 font-semibold text-red-600">
                          {formatPrice(getDueAmount(purchase))}
                        </td>

                        <td className="px-4 py-3">
                          {renderPaymentStatus(purchase.payment_status)}
                        </td>
                      </>
                    )}

                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(purchase.purchase_date || purchase.created_at)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleViewDetails(purchase)}
                          className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          Details
                        </button>

                        {canViewPurchasePrice && (
                          <button
                            type="button"
                            onClick={() => handleDelete(purchase)}
                            className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-5 pb-5">
          {renderPagination()}
        </div>
      </div>

      {selectedPurchase && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-6xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-xl font-bold text-[var(--nst-dashboard-text)]">
                  Purchase Details
                </h2>
                <p className="text-sm text-gray-500">
                  {getPurchaseNo(selectedPurchase)}
                </p>
              </div>

              <button
                type="button"
                onClick={closeDetails}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
              >
                Close
              </button>
            </div>

            {detailsLoading ? (
              <div className="p-8 text-center text-blue-600">
                Details loading...
              </div>
            ) : (
              <div className="p-5 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <DetailCard
                    title="Supplier"
                    value={getSupplierName(selectedPurchase)}
                  />

                  <DetailCard
                    title="Branch"
                    value={getBranchName(selectedPurchase)}
                  />

                  {canViewPurchasePrice && (
                    <>
                      <DetailCard
                        title="Final Amount"
                        value={formatPrice(getFinalAmount(selectedPurchase))}
                      />

                      <DetailCard
                        title="Due Amount"
                        value={formatPrice(getDueAmount(selectedPurchase))}
                        danger
                      />

                      <DetailCard
                        title="Cash Paid"
                        value={formatPrice(getCashPaidAmount(selectedPurchase))}
                        success
                      />

                      <DetailCard
                        title="Advance Applied"
                        value={formatPrice(getAdvanceAppliedAmount(selectedPurchase))}
                        success
                      />

                      <DetailCard
                        title="Payment Status"
                        value={selectedPurchase.payment_status || '-'}
                      />
                    </>
                  )}

                  <DetailCard
                    title="Date"
                    value={formatDate(selectedPurchase.purchase_date || selectedPurchase.created_at)}
                  />
                </div>

                <div>
                  <h3 className="mb-3 font-bold text-[var(--nst-dashboard-text)]">
                    Purchase Items ({selectedItems.length})
                  </h3>

                  {selectedItems.length === 0 ? (
                    <div className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                      No purchase item found.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-100">
                      <table className="w-full min-w-[750px] text-sm">
                        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                          <tr>
                            <th className="px-4 py-3">Product</th>
                            <th className="px-4 py-3">SKU</th>
                            <th className="px-4 py-3">Product Barcode</th>
                            <th className="px-4 py-3">Qty</th>

                            {canViewPurchasePrice && (
                              <>
                                <th className="px-4 py-3">Purchase Price</th>
                                <th className="px-4 py-3">Total</th>
                              </>
                            )}

                            <th className="px-4 py-3">Devices</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                          {selectedItems.map((item) => (
                            <tr key={item.id}>
                              <td className="px-4 py-3 font-semibold text-[var(--nst-dashboard-text)]">
                                {item.product_name || item.product_id || '-'}
                              </td>

                              <td className="px-4 py-3 text-gray-600">
                                {item.sku || '-'}
                              </td>

                              <td className="px-4 py-3 text-gray-600">
                                {item.barcode || '-'}
                              </td>

                              <td className="px-4 py-3">
                                {Number(item.quantity || 0)}
                              </td>

                              {canViewPurchasePrice && (
                                <>
                                  <td className="px-4 py-3">
                                    {formatPrice(item.unit_cost)}
                                  </td>

                                  <td className="px-4 py-3 font-semibold">
                                    {formatPrice(item.line_total || item.total || item.subtotal)}
                                  </td>
                                </>
                              )}

                              <td className="px-4 py-3">
                                {item.device_count || 0}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="mb-3 font-bold text-[var(--nst-dashboard-text)]">
                    Device Units / IMEI / Barcode ({selectedDevices.length})
                  </h3>

                  {selectedDevices.length === 0 ? (
                    <div className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                      No IMEI device unit found. This purchase may contain non-IMEI items only.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-100">
                      <table className="w-full min-w-[950px] text-sm">
                        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                          <tr>
                            <th className="px-4 py-3">Product</th>
                            <th className="px-4 py-3">IMEI 1</th>
                            <th className="px-4 py-3">IMEI 2</th>
                            <th className="px-4 py-3">Main Barcode</th>
                            <th className="px-4 py-3">IMEI 1 Barcode</th>
                            <th className="px-4 py-3">IMEI 2 Barcode</th>

                            {canViewPurchasePrice && (
                              <th className="px-4 py-3">Purchase Price</th>
                            )}

                            <th className="px-4 py-3">Status</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                          {selectedDevices.map((device) => (
                            <tr key={device.id}>
                              <td className="px-4 py-3 font-semibold text-[var(--nst-dashboard-text)]">
                                {device.product_name || device.product_id || '-'}
                              </td>

                              <td className="px-4 py-3 text-gray-600">
                                {device.imei_1 || '-'}
                              </td>

                              <td className="px-4 py-3 text-gray-600">
                                {device.imei_2 || '-'}
                              </td>

                              <td className="px-4 py-3 font-semibold text-[var(--nst-dashboard-primary)]">
                                {device.barcode || '-'}
                              </td>

                              <td className="px-4 py-3 text-gray-600">
                                {device.imei_1_barcode || '-'}
                              </td>

                              <td className="px-4 py-3 text-gray-600">
                                {device.imei_2_barcode || '-'}
                              </td>

                              {canViewPurchasePrice && (
                                <td className="px-4 py-3">
                                  {formatPrice(device.purchase_cost)}
                                </td>
                              )}

                              <td className="px-4 py-3">
                                <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                                  {device.status || 'available'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {selectedPurchase.note && (
                  <div className="rounded-lg bg-gray-50 p-4">
                    <h3 className="mb-1 font-bold text-[var(--nst-dashboard-text)]">Note</h3>
                    <p className="text-sm text-gray-600">
                      {selectedPurchase.note}
                    </p>
                  </div>
                )}

                {!canViewPurchasePrice && (
                  <div className="rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
                    {t('purchases.list_price_visibility_note')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function extractUser(payload) {
  if (!payload) {
    return null;
  }

  if (payload.user) {
    return payload.user;
  }

  if (payload.data?.user) {
    return payload.data.user;
  }

  if (payload.data) {
    return payload.data;
  }

  return payload;
}

function canSeePurchasePrice(user) {
  const roles = getUserRoles(user);

  return roles.some((role) =>
    [
      'super admin',
      'super_admin',
      'super-admin',
      'superadmin',
      'admin',
      'accounts',
      'accountant',
    ].includes(role)
  );
}

function getUserRoles(user) {
  if (!user) {
    return [];
  }

  const roles = [];

  if (user.role) {
    roles.push(user.role);
  }

  if (user.role_name) {
    roles.push(user.role_name);
  }

  if (user.type) {
    roles.push(user.type);
  }

  if (Array.isArray(user.roles)) {
    user.roles.forEach((role) => {
      if (typeof role === 'string') {
        roles.push(role);
      }

      if (role?.name) {
        roles.push(role.name);
      }
    });
  }

  return roles
    .filter(Boolean)
    .map((role) => String(role).trim().toLowerCase());
}

function DetailCard({ title, value, success = false, danger = false }) {
  let valueClass = 'text-[var(--nst-dashboard-text)]';

  if (success) {
    valueClass = 'text-green-700';
  }

  if (danger) {
    valueClass = 'text-red-600';
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs text-gray-500">{title}</p>
      <p className={`mt-1 font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function labelClass() {
  return 'block text-sm font-semibold text-gray-700 mb-2';
}

function inputClass() {
  return 'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)] bg-white';
}