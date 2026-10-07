import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import supplierService from '../../services/supplierService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Truck as NstHdrTruck } from 'lucide-react';
import { useT } from '../../i18n';

const emptySupplier = {
  name: '',
  phone: '',
  email: '',
  company_name: '',
  address: '',
  city: '',
  country: 'Bangladesh',
  opening_balance: '0',
  current_balance: '0',
  status: 'active',
};

export default function SupplierList() {
  const t = useT();
  const [suppliers, setSuppliers] = useState([]);
  const [meta, setMeta] = useState(null);

  const [form, setForm] = useState(emptySupplier);
  const [editingId, setEditingId] = useState(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const getErrorMessage = (err, fallback = 'Something went wrong.') => {
    if (err?.response?.data?.errors) {
      return Object.values(err.response.data.errors).flat().join(' ');
    }

    return err?.response?.data?.message || err?.message || fallback;
  };

  const extractPayload = (response) => {
    return response?.data ?? response ?? {};
  };

  const extractSuppliers = (response) => {
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

    if (Array.isArray(payload.suppliers?.data)) {
      return payload.suppliers.data;
    }

    if (Array.isArray(payload.suppliers)) {
      return payload.suppliers;
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

    if (payload.suppliers?.current_page) {
      return payload.suppliers;
    }

    return null;
  };

  const loadSuppliers = async (page = 1) => {
    try {
      setLoading(true);
      setError('');

      const response = await supplierService.getSuppliers({
        page,
        per_page: 10,
        search,
        status,
      });

      setSuppliers(extractSuppliers(response));
      setMeta(extractMeta(response));
    } catch (err) {
      console.log(err);
      setSuppliers([]);
      setMeta(null);
      setError(getErrorMessage(err, 'Supplier list load failed.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    loadSuppliers(1);
  };

  const handleResetFilter = () => {
    setSearch('');
    setStatus('');

    setTimeout(() => {
      loadSuppliers(1);
    }, 0);
  };

  const resetForm = () => {
    setForm(emptySupplier);
    setEditingId(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      setError('Supplier name is required.');
      return;
    }

    try {
      setSaving(true);
      setMessage('');
      setError('');

      const payload = {
        name: form.name,
        phone: form.phone,
        email: form.email,
        company_name: form.company_name,
        address: form.address,
        city: form.city,
        country: form.country,
        opening_balance: Number(form.opening_balance || 0),
        current_balance: Number(form.current_balance || 0),
        status: form.status,
      };

      if (editingId) {
        await supplierService.updateSupplier(editingId, payload);
        setMessage('Supplier updated successfully.');
      } else {
        await supplierService.createSupplier(payload);
        setMessage('Supplier created successfully.');
      }

      resetForm();
      await loadSuppliers(meta?.current_page || 1);
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Supplier save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (supplier) => {
    const supplierId = getSupplierId(supplier);

    if (!supplierId) {
      setError('Supplier ID missing. This supplier cannot be edited.');
      return;
    }

    setEditingId(supplierId);

    setForm({
      name: supplier.name || supplier.supplier_name || '',
      phone: supplier.phone || supplier.mobile || '',
      email: supplier.email || '',
      company_name: supplier.company_name || supplier.company || '',
      address: supplier.address || '',
      city: supplier.city || '',
      country: supplier.country || 'Bangladesh',
      opening_balance: String(
        supplier.opening_balance ??
          supplier.initial_balance ??
          0
      ),
      current_balance: String(
        supplier.current_balance ??
          supplier.balance ??
          supplier.due_amount ??
          0
      ),
      status: supplier.status || 'active',
    });

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const handleDelete = async (supplier) => {
    const supplierId = getSupplierId(supplier);

    if (!supplierId) {
      setError('Supplier ID missing. This supplier cannot be deleted.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete supplier "${getSupplierName(supplier)}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setLoading(true);
      setMessage('');
      setError('');

      await supplierService.deleteSupplier(supplierId);

      setMessage('Supplier deleted successfully.');
      await loadSuppliers(meta?.current_page || 1);
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Supplier delete failed.'));
    } finally {
      setLoading(false);
    }
  };

  const getSupplierId = (supplier) => {
    return supplier?.id ?? supplier?.supplier_id ?? supplier?.value ?? null;
  };

  const getSupplierName = (supplier) => {
    return supplier?.name || supplier?.supplier_name || supplier?.company_name || '-';
  };

  const getSupplierPhone = (supplier) => {
    return supplier?.phone || supplier?.mobile || '-';
  };

  const getSupplierEmail = (supplier) => {
    return supplier?.email || '-';
  };

  const getSupplierCompany = (supplier) => {
    return supplier?.company_name || supplier?.company || '-';
  };

  const getSupplierBalance = (supplier) => {
    return Number(
      supplier?.current_balance ??
        supplier?.balance ??
        supplier?.due_amount ??
        0
    );
  };

  const formatPrice = (amount) => {
    return `BDT ${Number(amount || 0).toLocaleString()}`;
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
            onClick={() => loadSuppliers(currentPage - 1)}
            disabled={currentPage <= 1 || loading}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>

          <button
            type="button"
            onClick={() => loadSuppliers(currentPage + 1)}
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
      <NstPageHeader icon={NstHdrTruck} title={t('suppliers.list_title')} subtitle={t('suppliers.list_subtitle')}/>

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

      <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)]">
              {editingId ? 'Edit Supplier' : 'Add New Supplier'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {t('suppliers.form_help')}
            </p>
          </div>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"
        >
          <div>
            <label className={labelClass()}>Supplier Name *</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Supplier name"
              className={inputClass()}
              required
            />
          </div>

          <div>
            <label className={labelClass()}>Phone</label>
            <input
              type="text"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="Phone number"
              className={inputClass()}
            />
          </div>

          <div>
            <label className={labelClass()}>Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="Email address"
              className={inputClass()}
            />
          </div>

          <div>
            <label className={labelClass()}>Company Name</label>
            <input
              type="text"
              name="company_name"
              value={form.company_name}
              onChange={handleChange}
              placeholder="Company name"
              className={inputClass()}
            />
          </div>

          <div>
            <label className={labelClass()}>City</label>
            <input
              type="text"
              name="city"
              value={form.city}
              onChange={handleChange}
              placeholder="City"
              className={inputClass()}
            />
          </div>

          <div>
            <label className={labelClass()}>Country</label>
            <input
              type="text"
              name="country"
              value={form.country}
              onChange={handleChange}
              placeholder="Country"
              className={inputClass()}
            />
          </div>

          <div>
            <label className={labelClass()}>Opening Balance</label>
            <input
              type="number"
              name="opening_balance"
              value={form.opening_balance}
              onChange={handleChange}
              min="0"
              step="0.01"
              className={inputClass()}
            />
          </div>

          <div>
            <label className={labelClass()}>Current Balance / Due</label>
            <input
              type="number"
              name="current_balance"
              value={form.current_balance}
              onChange={handleChange}
              min="0"
              step="0.01"
              className={inputClass()}
            />
          </div>

          <div>
            <label className={labelClass()}>Status</label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className={inputClass()}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="md:col-span-2 xl:col-span-3">
            <label className={labelClass()}>Address</label>
            <textarea
              name="address"
              value={form.address}
              onChange={handleChange}
              rows="2"
              placeholder="Supplier address"
              className={inputClass()}
            />
          </div>

          <div className="md:col-span-2 xl:col-span-4">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--nst-dashboard-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--nst-dashboard-primary)] disabled:opacity-60"
            >
              {saving
                ? 'Saving...'
                : editingId
                  ? 'Update Supplier'
                  : 'Create Supplier'}
            </button>
          </div>
        </form>
      </div>

      <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <form
          onSubmit={handleSearch}
          className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
        >
          <div className="md:col-span-2">
            <label className={labelClass()}>Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, email..."
              className={inputClass()}
            />
          </div>

          <div>
            <label className={labelClass()}>Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={inputClass()}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

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
              onClick={handleResetFilter}
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
          <h2 className="font-bold text-[var(--nst-dashboard-text)]">Supplier List</h2>

          {loading && (
            <span className="text-sm text-blue-600 font-semibold">
              Loading...
            </span>
          )}
        </div>

        {suppliers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No supplier found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Balance / Due</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {suppliers.map((supplier, index) => {
                  const supplierId = getSupplierId(supplier);

                  return (
                    <tr
                      key={supplierId || `supplier-${index}`}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-[var(--nst-dashboard-text)]">
                          {getSupplierName(supplier)}
                        </div>
                        <div className="text-xs text-gray-400">
                          ID: {supplierId || 'Missing'}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-gray-600">
                        {getSupplierCompany(supplier)}
                      </td>

                      <td className="px-4 py-3 text-gray-600">
                        {getSupplierPhone(supplier)}
                      </td>

                      <td className="px-4 py-3 text-gray-600">
                        {getSupplierEmail(supplier)}
                      </td>

                      <td className="px-4 py-3 font-semibold text-red-600">
                        {formatPrice(getSupplierBalance(supplier))}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            (supplier.status || 'active') === 'active'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {supplier.status || 'active'}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {supplierId ? (
                            <Link
                              to={`/suppliers/${supplierId}/ledger`}
                              className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100"
                            >
                              Ledger
                            </Link>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-400"
                            >
                              No ID
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleEdit(supplier)}
                            className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(supplier)}
                            className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-5 pb-5">
          {renderPagination()}
        </div>
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