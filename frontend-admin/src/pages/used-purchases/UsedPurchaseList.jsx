import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import usedPurchaseService from '../../services/usedPurchaseService';
import { useAuth } from '../../context/AuthContext';
import accessRules from '../../utils/accessRules';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { RotateCcw as NstHdrRotateCcw } from 'lucide-react';
import { useT } from '../../i18n';

const UsedPurchaseList = () => {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canViewBuyingPrice = accessRules.canViewUsedPurchaseBuyingPrice(user);
  const [usedPurchases, setUsedPurchases] = useState([]);
  const [branches, setBranches] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [search, setSearch] = useState('');
  const [purchaseType, setPurchaseType] = useState('');
  const [sellerType, setSellerType] = useState('');
  const [branchId, setBranchId] = useState('');
  const [salesmanId, setSalesmanId] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const normalizeArrayResponse = (response) => {
    const payload = response?.data ?? response;
    const possibleArrays = [payload, payload?.data, payload?.used_purchases, payload?.usedPurchases, payload?.data?.data];
    return possibleArrays.find((item) => Array.isArray(item)) || [];
  };

  const fetchOptions = async () => {
    try {
      const response = await usedPurchaseService.getOptions();
      const data = response?.data?.data || response?.data || {};
      setBranches(Array.isArray(data.branches) ? data.branches : []);
      setSalesmen(Array.isArray(data.salesmen) ? data.salesmen : []);
    } catch (err) {
      console.error('Options Load Error:', err);
    }
  };

  const fetchUsedPurchases = async () => {
    try {
      setLoading(true);
      setError('');
      setMessage('');
      const response = await usedPurchaseService.getUsedPurchases({
        search: search || undefined,
        purchase_type: purchaseType || undefined,
        seller_type: sellerType || undefined,
        branch_id: branchId || undefined,
        salesman_id: salesmanId || undefined,
        status: status || undefined,
      });
      setUsedPurchases(normalizeArrayResponse(response));
    } catch (err) {
      console.error('Used Purchase Fetch Error:', err);
      setUsedPurchases([]);
      setError(err?.response?.data?.message || err?.message || 'Used purchase data load failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOptions();
    fetchUsedPurchases();
  }, []);

  useEffect(() => {
    fetchUsedPurchases();
  }, [purchaseType, sellerType, branchId, salesmanId, status]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchUsedPurchases();
  };

  const handleReset = () => {
    setSearch('');
    setPurchaseType('');
    setSellerType('');
    setBranchId('');
    setSalesmanId('');
    setStatus('');
    setTimeout(() => fetchUsedPurchases(), 0);
  };

  const handleMarkReadyForSale = (item) => {
    navigate(`/used-purchase/${item.id}/prepare-sale`);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this used purchase record?')) return;
    try {
      setLoading(true);
      setError('');
      setMessage('');
      await usedPurchaseService.deleteUsedPurchase(id);
      setMessage('Used purchase deleted successfully.');
      fetchUsedPurchases();
    } catch (err) {
      console.error('Used Purchase Delete Error:', err);
      setError(err?.response?.data?.message || err?.message || 'Used purchase delete failed.');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) => `BDT ${Number(price || 0).toLocaleString()}`;
  const getPurchaseTypeText = (type) => type === 'pre_owned' ? 'Pre-Owned' : 'Used';
  const getPurchaseTypeBadgeClass = (type) => type === 'pre_owned' ? 'bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)]' : 'bg-blue-50 text-blue-700';
  const getSellerTypeText = (type) => type === 'supplier' ? 'Supplier' : 'Customer';
  const getSellerTypeBadgeClass = (type) => type === 'supplier' ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700';
  const getStatusBadgeClass = (purchaseStatus) => {
    if (purchaseStatus === 'purchased') return 'bg-blue-50 text-blue-700';
    if (purchaseStatus === 'ready_for_sale') return 'bg-green-50 text-green-700';
    if (purchaseStatus === 'sold') return 'bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)]';
    if (purchaseStatus === 'returned') return 'bg-orange-50 text-orange-700';
    if (purchaseStatus === 'cancelled') return 'bg-red-50 text-red-700';
    return 'bg-gray-50 text-gray-700';
  };
  const getBrandName = (item) => item?.brandInfo?.name || item?.brand_info?.name || item?.brand || '-';
  const getBranchName = (item) => item?.branch?.name ? `${item.branch.name}${item.branch.code ? ` (${item.branch.code})` : ''}` : '-';
  const getSalesmanName = (item) => item?.salesman?.name || '-';
  const getBatteryHealthText = (item) => item?.battery_health === null || item?.battery_health === undefined || item?.battery_health === '' ? '-' : `${item.battery_health}%`;
  const hasDocuments = (item) => Boolean(item?.nid_photo_url || item?.customer_product_photo_url || (Array.isArray(item?.product_image_urls) && item.product_image_urls.length > 0));
  const getReadyProductText = (item) => {
    if (!item?.readyProduct && !item?.ready_product) return '-';
    const product = item.readyProduct || item.ready_product;
    return product?.sku || product?.barcode || product?.name || '-';
  };

  return (
    <div className="p-6">
      <NstPageHeader icon={NstHdrRotateCcw} title={t('used_purchases.list_title')} subtitle={t('used_purchases.list_subtitle')} actions={<><Link to="/used-purchase/create" className="inline-flex items-center justify-center rounded-lg bg-[var(--nst-dashboard-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--nst-dashboard-primary)]">Add Used / Pre-Owned</Link></>}/>

      <div className="mb-5 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-7 gap-3">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Seller, phone, IMEI..." className={inputClass()} />
          <select value={purchaseType} onChange={(e) => setPurchaseType(e.target.value)} className={inputClass()}><option value="">All Type</option><option value="used">Used</option><option value="pre_owned">Pre-Owned</option></select>
          <select value={sellerType} onChange={(e) => setSellerType(e.target.value)} className={inputClass()}><option value="">All Seller</option><option value="customer">Customer</option><option value="supplier">Supplier</option></select>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputClass()}><option value="">All Branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} {branch.code ? `(${branch.code})` : ''}</option>)}</select>
          <select value={salesmanId} onChange={(e) => setSalesmanId(e.target.value)} className={inputClass()}><option value="">All Salesman</option>{salesmen.map((salesman) => <option key={salesman.id} value={salesman.id}>{salesman.name}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass()}><option value="">All Status</option><option value="purchased">Purchased</option><option value="ready_for_sale">Ready For Sale</option><option value="sold">Sold</option><option value="returned">Returned</option><option value="cancelled">Cancelled</option></select>
          <div className="flex gap-2"><button type="submit" className="w-full rounded-lg bg-[var(--nst-dashboard-secondary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--nst-dashboard-secondary)]">Search</button><button type="button" onClick={handleReset} className="w-full rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200">Reset</button></div>
        </form>
      </div>

      {message && <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between"><h2 className="font-bold text-[var(--nst-dashboard-text)]">Purchase List ({usedPurchases.length})</h2>{loading && <span className="text-sm text-gray-400">Loading...</span>}</div>
        {!loading && usedPurchases.length === 0 ? <div className="p-10 text-center"><p className="text-gray-500">No Used / Pre-Owned Purchase Found</p></div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1700px] text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-5 py-3">SL</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Seller</th><th className="px-5 py-3">Branch</th><th className="px-5 py-3">Salesman</th><th className="px-5 py-3">Product</th><th className="px-5 py-3">IMEI</th><th className="px-5 py-3">Battery</th><th className="px-5 py-3">Documents</th>{canViewBuyingPrice && <th className="px-5 py-3">Buying Price</th>}<th className="px-5 py-3">Status</th><th className="px-5 py-3">Stock Product</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {usedPurchases.map((item, index) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4 text-gray-600">{index + 1}</td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${getPurchaseTypeBadgeClass(item.purchase_type)}`}>{getPurchaseTypeText(item.purchase_type)}</span></td>
                    <td className="px-5 py-4"><div className="mb-1"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${getSellerTypeBadgeClass(item.seller_type)}`}>{getSellerTypeText(item.seller_type)}</span></div><div className="font-semibold text-[var(--nst-dashboard-text)]">{item.customer_name}</div><div className="text-xs text-gray-500">Phone: {item.customer_phone || '-'}</div></td>
                    <td className="px-5 py-4 text-gray-700">{getBranchName(item)}</td>
                    <td className="px-5 py-4 text-gray-700">{getSalesmanName(item)}</td>
                    <td className="px-5 py-4"><div className="font-semibold text-gray-800">{item.product_name}</div><div className="text-xs text-gray-500">Brand: {getBrandName(item)}</div><div className="text-xs text-gray-500">Model: {item.model || '-'}</div></td>
                    <td className="px-5 py-4"><div className="text-xs text-gray-600">IMEI 1: {item.imei_1 || '-'}</div><div className="text-xs text-gray-600">IMEI 2: {item.imei_2 || '-'}</div></td>
                    <td className="px-5 py-4 font-semibold text-gray-700">{getBatteryHealthText(item)}</td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${hasDocuments(item) ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}`}>{hasDocuments(item) ? 'Uploaded' : 'Not Uploaded'}</span></td>
                    {canViewBuyingPrice && <td className="px-5 py-4 font-semibold text-gray-800">{formatPrice(item.purchase_price)}</td>}
                    <td className="px-5 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${getStatusBadgeClass(item.status)}`}>{item.status || 'N/A'}</span></td>
                    <td className="px-5 py-4 text-xs text-gray-600">{getReadyProductText(item)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        {item.status !== 'sold' && (
                          <button
                            type="button"
                            onClick={() => handleMarkReadyForSale(item)}
                            className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100"
                          >
                            {item.ready_product_id ? t('used_purchases.update_ready') : t('used_purchases.prepare_for_sale')}
                          </button>
                        )}
                        <Link to={`/used-purchase/${item.id}/edit`} className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">Edit</Link>
                        <button type="button" onClick={() => handleDelete(item.id)} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

function inputClass() {
  return 'w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]';
}

export default UsedPurchaseList;
