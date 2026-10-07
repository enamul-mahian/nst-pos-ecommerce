import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { productService } from '../../services/productService';
import { categoryService } from '../../services/categoryService';
import { brandService } from '../../services/brandService';
import { supplierService } from '../../services/supplierService';
import bulkActionService from '../../services/bulkActionService';
import { useAuth } from '../../context/AuthContext';
import accessRules from '../../utils/accessRules';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { PackageCheck as NstHdrPackageCheck } from 'lucide-react';
import { useT } from '../../i18n';

export default function ProductList() {
  const t = useT();
  const { user } = useAuth();
  const canManageProducts = accessRules.canManageProducts(user);
  const canViewSupplierInfo = accessRules.canViewSupplierInfo(user);
  const [products, setProducts] = useState([]);
  const [meta, setMeta] = useState(null);

  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  const [selectedIds, setSelectedIds] = useState([]);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [condition, setCondition] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [supplierId, setSupplierId] = useState('');

  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadFilterOptions = async () => {
    try {
      setFilterLoading(true);

      const [categoryResponse, brandResponse, supplierResponse] = await Promise.all([
        categoryService.getAllCategories({
          status: 'active',
          limit: 200,
        }),
        brandService.getAllBrands({
          status: 'active',
          limit: 200,
        }),
        canViewSupplierInfo
          ? supplierService.getAllSuppliers({
              status: 'active',
              limit: 200,
            })
          : Promise.resolve({ data: [] }),
      ]);

      setCategories(extractList(categoryResponse));
      setBrands(extractList(brandResponse));
      setSuppliers(canViewSupplierInfo ? extractList(supplierResponse) : []);
    } catch (err) {
      console.log(err);
      setError('Category / Brand / Supplier filter load failed.');
    } finally {
      setFilterLoading(false);
    }
  };

  const loadProducts = async (page = 1, customFilters = null) => {
    try {
      setLoading(true);
      setMessage('');
      setError('');

      const filters = customFilters || {
        search,
        status,
        condition,
        categoryId,
        brandId,
        supplierId,
      };

      const response = await productService.getProducts({
        page,
        search: filters.search,
        status: filters.status,
        condition: filters.condition,
        category_id: filters.categoryId,
        brand_id: filters.brandId,
        supplier_id: canViewSupplierInfo ? filters.supplierId : undefined,
        per_page: 10,
      });

      const productList = response?.data?.data || [];

      setProducts(productList.filter((product) => !product?.deleted_at));
      setMeta(response?.data || null);
      setSelectedIds([]);
    } catch (err) {
      console.log(err);
      setProducts([]);
      setError(getErrorMessage(err, 'Products load failed.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFilterOptions();
    loadProducts();
  }, []);

  const visibleProductIds = useMemo(() => {
    return products.map((product) => product.id);
  }, [products]);

  const isAllSelected = useMemo(() => {
    return (
      visibleProductIds.length > 0 &&
      visibleProductIds.every((id) => selectedIds.includes(id))
    );
  }, [visibleProductIds, selectedIds]);

  const toggleSelectOne = (id) => {
    setSelectedIds((previous) => {
      if (previous.includes(id)) {
        return previous.filter((selectedId) => selectedId !== id);
      }

      return [...previous, id];
    });
  };

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds((previous) =>
        previous.filter((id) => !visibleProductIds.includes(id))
      );

      return;
    }

    setSelectedIds((previous) => {
      const mergedIds = [...previous, ...visibleProductIds];

      return [...new Set(mergedIds)];
    });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    loadProducts(1);
  };

  const handleReset = () => {
    const emptyFilters = {
      search: '',
      status: '',
      condition: '',
      categoryId: '',
      brandId: '',
      supplierId: '',
    };

    setSearch('');
    setStatus('');
    setCondition('');
    setCategoryId('');
    setBrandId('');
    setSupplierId('');
    setSelectedIds([]);

    loadProducts(1, emptyFilters);
  };

  const handleSingleDelete = async (product) => {
    if (!canManageProducts) {
      setError(t('products_list.errors.no_delete_permission'));
      return;
    }

    const productName = product?.name || `Product #${product?.id}`;

    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${productName}"?`
    );

    if (!confirmDelete) {
      return;
    }

    try {
      setDeletingId(product.id);
      setMessage('');
      setError('');

      await bulkActionService.delete('products', [product.id]);

      setMessage('Product deleted successfully.');
      await loadProducts(meta?.current_page || 1);
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Product delete failed.'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (!canManageProducts) {
      setError(t('products_list.errors.no_bulk_delete_permission'));
      return;
    }

    if (selectedIds.length === 0) {
      setError('Please select at least one product first.');
      return;
    }

    const confirmDelete = window.confirm(
      `Are you sure you want to delete ${selectedIds.length} selected product(s)?`
    );

    if (!confirmDelete) {
      return;
    }

    try {
      setBulkDeleting(true);
      setMessage('');
      setError('');

      const response = await bulkActionService.delete('products', selectedIds);

      const deletedCount =
        response?.data?.data?.deleted_count || selectedIds.length;

      setMessage(`${deletedCount} selected product(s) deleted successfully.`);
      setSelectedIds([]);

      await loadProducts(meta?.current_page || 1);
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Selected product delete failed.'));
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--nst-dashboard-surface)] p-4 md:p-6">
      <NstPageHeader icon={NstHdrPackageCheck} title={<>Products</>} subtitle={<>Manage all new, used, pre-owned and refurbished products.
          </>} actions={<>{canManageProducts && (
          <Link
            to="/products/create"
            className="inline-flex items-center justify-center bg-[#FF8A00] hover:bg-[#e67c00] text-white px-5 py-2.5 rounded-lg font-semibold"
          >
            + Add Product
          </Link>
        )}</>}/>

      {message && (
        <div className="mb-4 bg-green-50 text-green-700 border border-green-200 px-4 py-3 rounded-lg">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-5">
        <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-8 gap-4">
          <input
            type="text"
            placeholder="Search product name, model, barcode or IMEI..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputClass()}
          />

          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={inputClass()}
            disabled={filterLoading}
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className={inputClass()}
            disabled={filterLoading}
          >
            <option value="">All Brands</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>

          {canViewSupplierInfo && (
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={inputClass()}
              disabled={filterLoading}
            >
              <option value="">All Suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                  {supplier.company_name ? ` - ${supplier.company_name}` : ''}
                  {supplier.phone ? ` (${supplier.phone})` : ''}
                </option>
              ))}
            </select>
          )}

          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className={inputClass()}
          >
            <option value="">All Conditions</option>
            <option value="new">New</option>
            <option value="used">Used</option>
            <option value="pre_owned">Pre-Owned</option>
            <option value="refurbished">Refurbished</option>
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputClass()}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>

          <button
            type="submit"
            className="bg-[var(--nst-dashboard-secondary)] hover:bg-[#243a63] text-white rounded-lg font-semibold px-4 py-2.5"
          >
            Search
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold px-4 py-2.5"
          >
            Reset
          </button>
        </form>
      </div>

      {canManageProducts && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <p className="text-sm text-gray-500">Selected Products</p>
              <h2 className="text-2xl font-bold text-[var(--nst-dashboard-text)]">
                {selectedIds.length}
              </h2>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={selectedIds.length === 0 || bulkDeleting}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg font-semibold"
              >
                {bulkDeleting
                  ? 'Deleting...'
                  : `Delete Selected (${selectedIds.length})`}
              </button>

              <button
                type="button"
                onClick={() => setSelectedIds([])}
                disabled={selectedIds.length === 0}
                className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--nst-dashboard-text)] px-5 py-2.5 rounded-lg font-semibold"
              >
                Clear Selection
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-500">Loading products...</div>
        ) : products.length === 0 ? (
          <div className="p-10 text-center text-gray-500">No products found.</div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[1180px]">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {canManageProducts && (
                      <th className="text-left px-5 py-3 text-gray-600 w-12">
                        <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 cursor-pointer"
                      />
                      </th>
                    )}
                    <th className="text-left px-5 py-3 text-gray-600">Product</th>
                    <th className="text-left px-5 py-3 text-gray-600">Category</th>
                    <th className="text-left px-5 py-3 text-gray-600">Brand</th>
                    {canViewSupplierInfo && <th className="text-left px-5 py-3 text-gray-600">Supplier</th>}
                    <th className="text-left px-5 py-3 text-gray-600">Condition</th>
                    <th className="text-left px-5 py-3 text-gray-600">Stock</th>
                    <th className="text-left px-5 py-3 text-gray-600">Sale Price</th>
                    <th className="text-left px-5 py-3 text-gray-600">Status</th>
                    {canManageProducts && <th className="text-right px-5 py-3 text-gray-600">Action</th>}
                  </tr>
                </thead>

                <tbody>
                  {products.map((product) => {
                    const categoryName = product.category_info?.name || product.category || 'No Category';
                    const brandName = product.brand_info?.name || product.brand || 'No Brand';
                    const supplierName =
                      product.supplier_info?.name ||
                      product.supplierInfo?.name ||
                      product.supplier?.name ||
                      'No Supplier';

                    return (
                      <tr
                        key={product.id}
                        className={`border-b hover:bg-gray-50 ${
                          selectedIds.includes(product.id) ? 'bg-[var(--nst-dashboard-primary-soft)]' : ''
                        }`}
                      >
                        {canManageProducts && (
                          <td className="px-5 py-4">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(product.id)}
                              onChange={() => toggleSelectOne(product.id)}
                              className="w-4 h-4 cursor-pointer"
                            />
                          </td>
                        )}

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <ProductThumb product={product} sizeClass="w-12 h-12" />

                            <div>
                              <p className="font-semibold text-[var(--nst-dashboard-text)]">{product.name}</p>
                              <p className="text-xs text-gray-500">
                                Model: {product.model || '-'}
                              </p>
                            </div>
                          </div>
                        </td>


                        <td className="px-5 py-4">
                          <span className="bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)] px-2 py-1 rounded-full text-xs">
                            {categoryName}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded-full text-xs">
                            {brandName}
                          </span>
                        </td>

                        {canViewSupplierInfo && (
                          <td className="px-5 py-4">
                            <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full text-xs">
                              {supplierName}
                            </span>
                          </td>
                        )}

                        <td className="px-5 py-4">
                          <span className="capitalize bg-blue-50 text-blue-700 px-2 py-1 rounded-full text-xs">
                            {product.condition?.replace('_', ' ') || '-'}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-gray-600">
                          {product.stock_quantity ?? 0}
                        </td>

                        <td className="px-5 py-4 font-semibold text-gray-800">
                          BDT {Number(product.sale_price || 0).toLocaleString()}
                        </td>

                        <td className="px-5 py-4">
                          <StatusBadge status={product.status} />
                        </td>

                        {canManageProducts && (
                          <td className="px-5 py-4 text-right">
                            <Link
                              to={`/products/${product.id}/edit`}
                              className="text-blue-600 hover:underline mr-4"
                            >
                              Edit
                            </Link>

                            <Link
                              to={`/products/${product.id}/variant-operations`}
                              className="text-[var(--nst-dashboard-primary)] hover:underline mr-4 font-semibold"
                            >
                              Variants / Images
                            </Link>

                            <button
                              type="button"
                              onClick={() => handleSingleDelete(product)}
                              disabled={deletingId === product.id}
                              className="text-red-600 hover:underline disabled:opacity-60"
                            >
                              {deletingId === product.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-gray-100">
              {products.map((product) => {
                const categoryName = product.category_info?.name || product.category || 'No Category';
                const brandName = product.brand_info?.name || product.brand || 'No Brand';
                const supplierName =
                  product.supplier_info?.name ||
                  product.supplierInfo?.name ||
                  product.supplier?.name ||
                  'No Supplier';

                return (
                  <div
                    key={product.id}
                    className={`p-4 ${
                      selectedIds.includes(product.id) ? 'bg-[var(--nst-dashboard-primary-soft)]' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {canManageProducts && (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(product.id)}
                          onChange={() => toggleSelectOne(product.id)}
                          className="w-5 h-5 cursor-pointer mt-1"
                        />
                      )}

                      <div className="flex-1">
                        <div className="flex gap-3">
                          <ProductThumb product={product} sizeClass="w-14 h-14" />

                          <div>
                            <h3 className="font-bold text-[var(--nst-dashboard-text)]">
                              {product.name}
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">
                              Model: {product.model || '-'}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-1 mt-3 text-xs text-gray-500">
                          <p>Category: {categoryName}</p>
                          <p>Brand: {brandName}</p>
                          {canViewSupplierInfo && <p>Supplier: {supplierName}</p>}
                          <p>Stock: {product.stock_quantity ?? 0}</p>
                          <p>Sale Price: BDT {Number(product.sale_price || 0).toLocaleString()}</p>
                        </div>

                        {canManageProducts && (
                          <div className="flex flex-wrap gap-2 mt-4">
                            <Link
                              to={`/products/${product.id}/edit`}
                              className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-semibold"
                            >
                              Edit
                            </Link>

                            <Link
                              to={`/products/${product.id}/variant-operations`}
                              className="px-3 py-1.5 rounded-lg bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)] font-semibold"
                            >
                              Variants / Images
                            </Link>

                            <button
                              type="button"
                              onClick={() => handleSingleDelete(product)}
                              disabled={deletingId === product.id}
                              className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 disabled:opacity-60 font-semibold"
                            >
                              {deletingId === product.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {canManageProducts && (
                <div className="p-4 bg-gray-50">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="w-full bg-white border border-gray-100 text-[var(--nst-dashboard-text)] px-4 py-2.5 rounded-lg font-semibold"
                  >
                    {isAllSelected ? 'Unselect All' : 'Select All'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {meta && meta.last_page > 1 && (
          <div className="flex justify-between items-center p-4 border-t">
            <button
              disabled={meta.current_page === 1}
              onClick={() => loadProducts(meta.current_page - 1)}
              className="px-4 py-2 rounded-lg border disabled:opacity-50"
            >
              Previous
            </button>

            <p className="text-sm text-gray-500">
              Page {meta.current_page} of {meta.last_page}
            </p>

            <button
              disabled={meta.current_page === meta.last_page}
              onClick={() => loadProducts(meta.current_page + 1)}
              className="px-4 py-2 rounded-lg border disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductThumb({ product, sizeClass = 'w-12 h-12' }) {
  const imageCandidates = useMemo(() => getProductImageCandidates(product), [product]);
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    setImageIndex(0);
  }, [product?.id, imageCandidates.length]);

  const imageUrl = imageCandidates[imageIndex] || null;
  const initials = getProductInitials(product?.name || product?.model || 'NST');

  return (
    <div className={`${sizeClass} rounded-xl bg-gradient-to-br from-[var(--nst-dashboard-primary)] to-[var(--nst-dashboard-surface)] border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] overflow-hidden flex items-center justify-center shrink-0`}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={product?.name || 'Product image'}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => {
            if (imageIndex < imageCandidates.length - 1) {
              setImageIndex((current) => current + 1);
            } else {
              setImageIndex(imageCandidates.length);
            }
          }}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-center px-1">
          <span className="text-[10px] font-bold text-[var(--nst-dashboard-primary)] leading-none">{initials}</span>
          <span className="text-[8px] text-gray-400 mt-1">No Image</span>
        </div>
      )}
    </div>
  );
}

function getProductImageCandidates(product) {
  const values = [];

  const push = (value) => {
    const normalized = normalizeMediaUrl(value);

    if (normalized && !values.includes(normalized)) {
      values.push(normalized);
    }
  };

  push(product?.image_url);
  push(product?.thumbnail_url);
  push(product?.media_url);
  push(product?.image);
  push(product?.primary_media?.thumbnail_url);
  push(product?.primary_media?.image_url);
  push(product?.primary_media?.media_url);
  push(product?.primary_media?.url);

  if (Array.isArray(product?.images)) {
    product.images.forEach((media) => {
      push(media?.thumbnail_url);
      push(media?.image_url);
      push(media?.media_url);
      push(media?.url);
      push(media?.image_path);
      push(media?.thumbnail_path);
    });
  }

  if (Array.isArray(product?.variants)) {
    product.variants.forEach((variant) => {
      push(variant?.image_url);
      push(variant?.thumbnail_url);
      push(variant?.image);

      if (Array.isArray(variant?.images)) {
        variant.images.forEach((media) => {
          push(media?.thumbnail_url);
          push(media?.image_url);
          push(media?.url);
          push(media?.image_path);
        });
      }
    });
  }

  return values;
}

function normalizeMediaUrl(value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();

  if (!raw || raw === 'null' || raw === 'undefined') {
    return null;
  }

  if (raw.startsWith('blob:') || raw.startsWith('data:')) {
    return raw;
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }

  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
  const backendBase = apiBase.replace(/\/api\/?$/, '').replace(/\/$/, '');
  const clean = raw.replace(/^\/+/, '');

  if (clean.startsWith('storage/')) {
    return `${backendBase}/${clean}`;
  }

  if (clean.startsWith('public/storage/')) {
    return `${backendBase}/${clean.replace(/^public\//, '')}`;
  }

  return `${backendBase}/storage/${clean}`;
}

function getProductInitials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'NST';
}

function StatusBadge({ status }) {
  const value = status || '-';

  let className = 'bg-gray-50 text-gray-700 border-gray-100';

  if (status === 'active') {
    className = 'bg-green-50 text-green-700 border-green-100';
  }

  if (status === 'inactive') {
    className = 'bg-yellow-50 text-yellow-700 border-yellow-100';
  }

  if (status === 'out_of_stock') {
    className = 'bg-red-50 text-red-700 border-red-100';
  }

  return (
    <span className={`capitalize px-2 py-1 rounded-full text-xs border ${className}`}>
      {value.replace('_', ' ')}
    </span>
  );
}

function inputClass() {
  return 'border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A] bg-white';
}

function extractList(response) {
  const data = response?.data;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  return [];
}

function getErrorMessage(err, fallbackMessage) {
  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    fallbackMessage
  );
}