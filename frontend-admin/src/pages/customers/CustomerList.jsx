import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { customerService } from '../../services/customerService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Users as NstHdrUsers } from 'lucide-react';
import { useT } from '../../i18n';

const emptyCustomer = {
  name: '',
  phone: '',
  email: '',
  nid_number: '',
  address: '',
  city: '',
  country: 'Bangladesh',
  opening_balance: '0',
  current_balance: '0',
  status: 'active',
};

export default function CustomerList() {
  const t = useT();
  const [customers, setCustomers] = useState([]);
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState(emptyCustomer);
  const [editingId, setEditingId] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const getErrorMessage = (err, fallback) => {
    if (err?.response?.data?.errors) {
      return Object.values(err.response.data.errors).flat().join(' ');
    }

    return err?.response?.data?.message || err?.message || fallback;
  };

  const extractCustomers = (response) => {
    const payload = response?.data ?? response;

    const possibleArrays = [
      payload,
      payload?.data,
      payload?.customers,
      payload?.items,
      payload?.results,
      payload?.data?.data,
      payload?.data?.customers,
      payload?.data?.items,
      payload?.data?.results,
    ];

    return possibleArrays.find((item) => Array.isArray(item)) || [];
  };

  const extractMeta = (response) => {
    const payload = response?.data ?? response;

    if (payload?.current_page) {
      return payload;
    }

    if (payload?.data?.current_page) {
      return payload.data;
    }

    return null;
  };

  const loadCustomers = async (page = 1) => {
    try {
      setLoading(true);
      setError('');

      const response = await customerService.getCustomers({
        page,
        search,
        status,
        per_page: 10,
      });

      setCustomers(extractCustomers(response));
      setMeta(extractMeta(response));
    } catch (err) {
      console.log(err);
      setCustomers([]);
      setError(getErrorMessage(err, 'Customers load failed.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    loadCustomers(1);
  };

  const handleReset = () => {
    setSearch('');
    setStatus('');

    setTimeout(() => {
      loadCustomers(1);
    }, 0);
  };

  const resetForm = () => {
    setForm(emptyCustomer);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      setMessage('');
      setError('');

      const payload = {
        ...form,
        opening_balance: Number(form.opening_balance || 0),
        current_balance: Number(form.current_balance || 0),
      };

      if (editingId) {
        await customerService.updateCustomer(editingId, payload);
        setMessage('Customer updated successfully.');
      } else {
        await customerService.createCustomer(payload);
        setMessage('Customer created successfully.');
      }

      resetForm();
      await loadCustomers(meta?.current_page || 1);
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Customer save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (customer) => {
    setEditingId(customer.id);

    setForm({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      nid_number: customer.nid_number || '',
      address: customer.address || '',
      city: customer.city || '',
      country: customer.country || 'Bangladesh',
      opening_balance: String(customer.opening_balance || 0),
      current_balance: String(customer.current_balance || 0),
      status: customer.status || 'active',
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (customer) => {
    const confirmed = window.confirm(`Delete customer "${customer.name}"?`);

    if (!confirmed) {
      return;
    }

    try {
      setMessage('');
      setError('');

      await customerService.deleteCustomer(customer.id);

      setMessage('Customer deleted successfully.');
      await loadCustomers(meta?.current_page || 1);
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Customer delete failed.'));
    }
  };

  const handleViewHistory = async (customer) => {
    try {
      setError('');

      const response = await customerService.getCustomer(customer.id);
      const payload = response?.data || response || {};

      setSelectedCustomer(payload);
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Customer sold device history load failed.'));
    }
  };

  const formatPrice = (price) => {
    return `BDT ${Number(price || 0).toLocaleString()}`;
  };

  const soldDeviceRecords =
    selectedCustomer?.used_purchases ||
    selectedCustomer?.usedPurchases ||
    selectedCustomer?.sold_devices ||
    selectedCustomer?.soldDevices ||
    [];

  return (
    <div className="min-h-screen bg-[var(--nst-dashboard-surface)] p-4 md:p-6">
      <NstPageHeader icon={NstHdrUsers} title={t('customers.list_title')} subtitle={t('customers.list_subtitle')}/>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4"
        >
          <div>
            <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)]">
              {editingId ? 'Edit Customer' : 'Add New Customer'}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Customer name required. Other fields optional.
            </p>
          </div>

          <InputField
            label="Customer Name *"
            name="name"
            value={form.name}
            onChange={handleChange}
            required
          />

          <InputField
            label="Phone"
            name="phone"
            value={form.phone}
            onChange={handleChange}
          />

          <InputField
            label="Email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
          />

          <InputField
            label="NID Number"
            name="nid_number"
            value={form.nid_number}
            onChange={handleChange}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address
            </label>
            <textarea
              name="address"
              rows="3"
              value={form.address}
              onChange={handleChange}
              className={inputClass()}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InputField
              label="City"
              name="city"
              value={form.city}
              onChange={handleChange}
            />

            <InputField
              label="Country"
              name="country"
              value={form.country}
              onChange={handleChange}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InputField
              label="Opening Balance"
              name="opening_balance"
              type="number"
              value={form.opening_balance}
              onChange={handleChange}
            />

            <InputField
              label="Current Balance"
              name="current_balance"
              type="number"
              value={form.current_balance}
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
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

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-[var(--nst-dashboard-primary)] hover:bg-[var(--nst-dashboard-primary)] text-white px-5 py-2.5 rounded-lg font-semibold disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingId ? 'Update Customer' : 'Add Customer'}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-5 py-2.5 rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)]">Customer List</h2>
              <p className="text-xs text-gray-500 mt-1">
                Search by customer name, phone, email or NID.
              </p>
            </div>

            <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer"
                className={inputClass()}
              />

              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={inputClass()}
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              <button
                type="submit"
                className="bg-[var(--nst-dashboard-secondary)] hover:bg-[#243a63] text-white rounded-lg font-semibold px-5 py-2.5"
              >
                Search
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold px-5 py-2.5"
              >
                Reset
              </button>
            </form>
          </div>

          {loading ? (
            <div className="text-center text-gray-500 py-10">
              Loading customers...
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center text-gray-400 py-10">
              No customer found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-700 border-b">
                    <th className="p-3 text-left">Customer</th>
                    <th className="p-3 text-left">Phone</th>
                    <th className="p-3 text-left">Email</th>
                    <th className="p-3 text-left">NID</th>
                    <th className="p-3 text-left">Balance</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-semibold text-[var(--nst-dashboard-text)]">
                        {customer.name}
                      </td>

                      <td className="p-3 text-gray-600">
                        {customer.phone || '-'}
                      </td>

                      <td className="p-3 text-gray-600">
                        {customer.email || '-'}
                      </td>

                      <td className="p-3 text-gray-600">
                        {customer.nid_number || '-'}
                      </td>

                      <td className="p-3 text-gray-600">
                        {formatPrice(customer.current_balance)}
                      </td>

                      <td className="p-3">
                        <StatusBadge status={customer.status} />
                      </td>

                      <td className="p-3">
                        <div className="flex justify-end gap-2">
                          <Link
                            to={`/customers/${customer.id}/ledger`}
                            className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-semibold hover:bg-green-100"
                          >
                            Ledger
                          </Link>

                          <button
                            type="button"
                            onClick={() => handleViewHistory(customer)}
                            className="px-3 py-1.5 rounded-lg bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)] text-xs font-semibold hover:bg-[var(--nst-dashboard-primary-soft)]"
                          >
                            Sold Devices
                          </button>

                          <button
                            type="button"
                            onClick={() => handleEdit(customer)}
                            className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(customer)}
                            className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {meta && meta.last_page > 1 && (
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                disabled={meta.current_page <= 1}
                onClick={() => loadCustomers(meta.current_page - 1)}
                className="px-4 py-2 rounded-lg border disabled:opacity-50"
              >
                Previous
              </button>

              <button
                type="button"
                disabled={meta.current_page >= meta.last_page}
                onClick={() => loadCustomers(meta.current_page + 1)}
                className="px-4 py-2 rounded-lg border disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {selectedCustomer && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)]">
                Sold Devices To Us
              </h2>
              <p className="text-sm text-gray-500">
                {t('customers.sold_devices_help', { name: selectedCustomer.name })}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedCustomer(null)}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
            >
              Close
            </button>
          </div>

          <SoldDevicesTable records={soldDeviceRecords} formatPrice={formatPrice} />
        </div>
      )}
    </div>
  );
}

function SoldDevicesTable({ records, formatPrice }) {
  if (!records.length) {
    return (
      <div className="py-8 text-center text-gray-400">
        No sold device history found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-700 border-b">
            <th className="p-3 text-left">Product Name</th>
            <th className="p-3 text-left">Brand</th>
            <th className="p-3 text-left">Product IMEI</th>
            <th className="p-3 text-left">Sell Price</th>
            <th className="p-3 text-left">Battery Health</th>
            <th className="p-3 text-left">Branch</th>
            <th className="p-3 text-left">Salesman</th>
            <th className="p-3 text-left">Notes</th>
          </tr>
        </thead>

        <tbody>
          {records.map((item) => (
            <tr key={item.id} className="border-b hover:bg-gray-50">
              <td className="p-3 font-semibold text-[var(--nst-dashboard-text)]">
                {item.product_name}
              </td>

              <td className="p-3 text-gray-600">
                {item.brandInfo?.name || item.brand_info?.name || item.brand || '-'}
              </td>

              <td className="p-3 text-gray-600">
                {item.imei_1 || item.imei_2 || '-'}
              </td>

              <td className="p-3 text-gray-600">
                {formatPrice(item.purchase_price)}
              </td>

              <td className="p-3 text-gray-600">
                {item.battery_health !== null && item.battery_health !== undefined
                  ? `${item.battery_health}%`
                  : '-'}
              </td>

              <td className="p-3 text-gray-600">
                {item.branch?.name || '-'}
              </td>

              <td className="p-3 text-gray-600">
                {item.salesman?.name || '-'}
              </td>

              <td className="p-3 text-gray-600">
                {item.notes || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InputField({
  label,
  name,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  required = false,
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>

      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className={inputClass()}
      />
    </div>
  );
}

function StatusBadge({ status }) {
  const active = status === 'active';

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-semibold ${
        active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
      }`}
    >
      {status || 'N/A'}
    </span>
  );
}

function Alert({ type, message }) {
  const className =
    type === 'success'
      ? 'mb-4 bg-green-50 text-green-700 border border-green-200 px-4 py-3 rounded-lg'
      : 'mb-4 bg-red-50 text-red-600 border border-red-200 px-4 py-3 rounded-lg';

  return <div className={className}>{message}</div>;
}

function inputClass() {
  return 'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]';
}