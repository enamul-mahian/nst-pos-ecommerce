import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import branchService from '../../services/branchService';
import api from '../../services/api';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { ArrowDownUp as NstHdrArrowDownUp } from 'lucide-react';
import { useT } from '../../i18n';

export default function BranchStock() {
  const t = useT();
  const { id } = useParams();

  const [branch, setBranch] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [products, setProducts] = useState([]);

  const [formData, setFormData] = useState({
    product_id: '',
    quantity: '',
  });

  const [editingStockId, setEditingStockId] = useState(null);
  const [editingQuantity, setEditingQuantity] = useState('');

  const [canManageStock, setCanManageStock] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const [loading, setLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const getErrorMessage = (err) => {
    return (
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      'Something went wrong. Please check API response.'
    );
  };

  const normalizeArrayResponse = (response) => {
    const payload = response?.data ?? response;

    const possibleArrays = [
      payload,
      payload?.data,
      payload?.products,
      payload?.items,
      payload?.results,
      payload?.data?.data,
      payload?.data?.products,
      payload?.data?.items,
      payload?.data?.results,
    ];

    const foundArray = possibleArrays.find((item) => Array.isArray(item));

    return foundArray || [];
  };

  const normalizeStockArrayResponse = (response) => {
    const payload = response?.data ?? response;

    const possibleArrays = [
      payload,
      payload?.stocks,
      payload?.items,
      payload?.branch_stocks,
      payload?.data,
      payload?.data?.stocks,
      payload?.data?.items,
      payload?.data?.branch_stocks,
      payload?.data?.data,
      payload?.data?.products,
      payload?.products,
    ];

    const foundArray = possibleArrays.find((item) => Array.isArray(item));

    return foundArray || [];
  };

  const normalizeBranchResponse = (response) => {
    const payload = response?.data ?? response;

    const possibleObjects = [
      payload?.data?.branch,
      payload?.branch,
      payload?.data,
    ];

    const foundObject = possibleObjects.find(
      (item) => item && typeof item === 'object' && !Array.isArray(item) && item.id
    );

    return foundObject || null;
  };

  const normalizeStockItem = (item) => {
    const product = item?.product || item;

    return {
      id: item?.id || item?.stock_id || item?.branch_stock_id || product?.pivot?.id,
      branch_id: item?.branch_id || product?.pivot?.branch_id,
      product_id: item?.product_id || product?.id,
      quantity:
        item?.quantity ??
        item?.stock_quantity ??
        item?.qty ??
        product?.pivot?.quantity ??
        0,

      product: item?.product || product,

      product_name:
        item?.product_name ||
        item?.name ||
        product?.name ||
        '-',

      product_sku:
        item?.product_sku ||
        item?.sku ||
        product?.sku ||
        '-',

      product_barcode:
        item?.product_barcode ||
        item?.barcode ||
        product?.barcode ||
        '-',

      product_brand:
        item?.product_brand ||
        product?.brand?.name ||
        product?.brand ||
        '-',

      product_category:
        item?.product_category ||
        product?.category?.name ||
        product?.category ||
        '-',

      purchase_price:
        item?.purchase_price ??
        product?.purchase_price ??
        0,

      sale_price:
        item?.sale_price ??
        item?.regular_price ??
        product?.sale_price ??
        product?.regular_price ??
        0,
    };
  };

  const fetchBranchStock = async () => {
    try {
      setLoading(true);
      setError('');
      setMessage('');

      const response = await branchService.getBranchStock(id);

      console.log('Branch Stock API Response:', response?.data);

      const branchData = normalizeBranchResponse(response);
      const stockData = normalizeStockArrayResponse(response).map(normalizeStockItem);

      setBranch(branchData);
      setStocks(stockData);

      const payload = response?.data ?? {};
      const data = payload?.data ?? {};

      setCanManageStock(Boolean(data?.can_manage_stock ?? payload?.can_manage_stock));
      setIsSuperAdmin(Boolean(data?.is_super_admin ?? payload?.is_super_admin));
    } catch (err) {
      console.error('Branch stock load error:', err);
      setStocks([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      setProductsLoading(true);

      const response = await api.get('/products/all');

      console.log('Products All API Response:', response?.data);

      const data = normalizeArrayResponse(response);

      setProducts(data);
    } catch (err) {
      console.warn('Product list load failed:', err);
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    fetchBranchStock();
    fetchProducts();
  }, [id]);

  const totalStockQty = useMemo(() => {
    return stocks.reduce((total, item) => total + Number(item.quantity || 0), 0);
  }, [stocks]);

  const selectedProductIds = useMemo(() => {
    return stocks.map((stock) => Number(stock.product_id)).filter(Boolean);
  }, [stocks]);

  const availableProducts = useMemo(() => {
    return products.filter((product) => !selectedProductIds.includes(Number(product.id)));
  }, [products, selectedProductIds]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleAssignStock = async (e) => {
    e.preventDefault();

    if (!formData.product_id) {
      setError('Please select a product.');
      return;
    }

    if (!formData.quantity || Number(formData.quantity) <= 0) {
      setError('Quantity must be greater than 0.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setMessage('');

      await branchService.assignStock(id, {
        product_id: formData.product_id,
        quantity: Number(formData.quantity),
      });

      setMessage('Stock assigned successfully.');
      setFormData({
        product_id: '',
        quantity: '',
      });

      fetchBranchStock();
    } catch (err) {
      console.error('Assign stock error:', err);
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (stock) => {
    setEditingStockId(stock.id);
    setEditingQuantity(stock.quantity);
    setError('');
    setMessage('');
  };

  const cancelEdit = () => {
    setEditingStockId(null);
    setEditingQuantity('');
  };

  const handleUpdateStock = async (stockId) => {
    if (editingQuantity === '' || Number(editingQuantity) < 0) {
      setError('Quantity must be 0 or more.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setMessage('');

      await branchService.updateBranchStock(stockId, {
        quantity: Number(editingQuantity),
      });

      setMessage('Stock quantity updated successfully.');
      setEditingStockId(null);
      setEditingQuantity('');

      fetchBranchStock();
    } catch (err) {
      console.error('Update stock error:', err);
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveStock = async (stock) => {
    const productName = stock?.product_name || `Stock #${stock?.id}`;

    const confirmed = window.confirm(
      `Are you sure you want to remove "${productName}" from this branch stock?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);
      setError('');
      setMessage('');

      await branchService.removeBranchStock(stock.id);

      setMessage('Stock removed successfully.');
      fetchBranchStock();
    } catch (err) {
      console.error('Remove stock error:', err);
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const branchName = branch?.name || branch?.branch_name || `Branch #${id}`;
  const branchCode = branch?.code || branch?.branch_code || '-';

  return (
    <div className="p-4 md:p-6">
      <NstPageHeader icon={NstHdrArrowDownUp} title={<>Branch Stock
          </>} subtitle={<>{branchName}{branchCode !== '-' ? `(${branchCode})` : ''}</>} actions={<><Link
          to="/branches"
          className="inline-flex items-center justify-center bg-white border border-gray-100 text-[var(--nst-dashboard-text)] hover:bg-gray-50 px-5 py-2.5 rounded-lg font-semibold"
        >
          Back to Branches
        </Link></>}/>

      {message && (
        <div className="mb-5 bg-green-50 border border-green-100 text-green-700 px-4 py-3 rounded-xl text-sm">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-5 bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Stock Items</p>
          <h2 className="text-3xl font-bold text-[var(--nst-dashboard-text)] mt-2">
            {stocks.length}
          </h2>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Total Stock Qty</p>
          <h2 className="text-3xl font-bold text-[var(--nst-dashboard-text)] mt-2">
            {totalStockQty}
          </h2>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Permission</p>
          <h2 className="text-xl font-bold text-[var(--nst-dashboard-text)] mt-2">
            {canManageStock ? 'Manage Allowed' : 'View Only'}
          </h2>
        </div>
      </div>

      {canManageStock && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)] mb-4">
            Assign Product Stock
          </h2>

          <form onSubmit={handleAssignStock} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-[var(--nst-dashboard-text)] mb-2">
                Product
              </label>

              <select
                name="product_id"
                value={formData.product_id}
                onChange={handleChange}
                disabled={productsLoading}
                className="w-full border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
              >
                <option value="">
                  {productsLoading ? 'Loading products...' : 'Select product'}
                </option>

                {availableProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name || `Product #${product.id}`}
                    {product.sku ? ` - ${product.sku}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--nst-dashboard-text)] mb-2">
                Quantity
              </label>

              <input
                type="number"
                name="quantity"
                value={formData.quantity}
                onChange={handleChange}
                min="1"
                placeholder="Example: 10"
                className="w-full border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
              />
            </div>

            <div className="md:col-span-3 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="bg-[var(--nst-dashboard-primary)] hover:bg-[var(--nst-dashboard-primary)] disabled:opacity-60 text-white px-6 py-3 rounded-lg font-semibold"
              >
                {saving ? 'Saving...' : 'Assign Stock'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-500">
            Branch stock loading...
          </div>
        ) : stocks.length === 0 ? (
          <div className="p-10 text-center">
            <h2 className="text-lg font-bold text-gray-700">
              No Stock Product Found
            </h2>
            <p className="text-gray-500 mt-1">
              {t('branches.stock_empty_help')}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-4 font-semibold text-gray-600">
                      Product
                    </th>
                    <th className="text-left px-5 py-4 font-semibold text-gray-600">
                      SKU
                    </th>
                    <th className="text-left px-5 py-4 font-semibold text-gray-600">
                      Brand
                    </th>
                    <th className="text-left px-5 py-4 font-semibold text-gray-600">
                      Category
                    </th>
                    <th className="text-left px-5 py-4 font-semibold text-gray-600">
                      Sale Price
                    </th>
                    <th className="text-left px-5 py-4 font-semibold text-gray-600">
                      Quantity
                    </th>
                    <th className="text-right px-5 py-4 font-semibold text-gray-600">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {stocks.map((stock) => (
                    <tr key={stock.id} className="hover:bg-gray-50">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-[var(--nst-dashboard-text)]">
                          {stock.product_name}
                        </p>
                        <p className="text-xs text-gray-400">
                          Barcode: {stock.product_barcode}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        {stock.product_sku}
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        {stock.product_brand}
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        {stock.product_category}
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        ৳{Number(stock.sale_price || 0).toLocaleString()}
                      </td>

                      <td className="px-5 py-4">
                        {editingStockId === stock.id ? (
                          <input
                            type="number"
                            value={editingQuantity}
                            onChange={(e) => setEditingQuantity(e.target.value)}
                            min="0"
                            className="w-28 border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
                          />
                        ) : (
                          <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                            {stock.quantity}
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {canManageStock && editingStockId === stock.id && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateStock(stock.id)}
                                disabled={saving}
                                className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-semibold"
                              >
                                Save
                              </button>

                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="px-3 py-1.5 rounded-lg bg-gray-50 text-gray-700 hover:bg-gray-100 font-semibold"
                              >
                                Cancel
                              </button>
                            </>
                          )}

                          {canManageStock && editingStockId !== stock.id && (
                            <button
                              type="button"
                              onClick={() => startEdit(stock)}
                              className="px-3 py-1.5 rounded-lg bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)] hover:bg-[var(--nst-dashboard-primary-soft)] font-semibold"
                            >
                              Edit
                            </button>
                          )}

                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => handleRemoveStock(stock)}
                              className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 font-semibold"
                            >
                              Remove
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
              {stocks.map((stock) => (
                <div key={stock.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-[var(--nst-dashboard-text)]">
                        {stock.product_name}
                      </h3>
                      <p className="text-xs text-gray-400 mt-1">
                        SKU: {stock.product_sku}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Brand: {stock.product_brand}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Category: {stock.product_category}
                      </p>
                    </div>

                    <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                      Qty: {stock.quantity}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {canManageStock && (
                      <button
                        type="button"
                        onClick={() => startEdit(stock)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)] font-semibold"
                      >
                        Edit
                      </button>
                    )}

                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => handleRemoveStock(stock)}
                        className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 font-semibold"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {editingStockId === stock.id && (
                    <div className="mt-4 flex gap-2">
                      <input
                        type="number"
                        value={editingQuantity}
                        onChange={(e) => setEditingQuantity(e.target.value)}
                        min="0"
                        className="flex-1 border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
                      />

                      <button
                        type="button"
                        onClick={() => handleUpdateStock(stock.id)}
                        disabled={saving}
                        className="px-4 py-2 rounded-lg bg-green-50 text-green-700 font-semibold"
                      >
                        Save
                      </button>

                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-4 py-2 rounded-lg bg-gray-50 text-gray-700 font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}