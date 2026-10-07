import { useEffect, useMemo, useState } from 'react';
import userManagementService from '../../services/userManagementService';
import accessControlService from '../../services/accessControlService';
import { useAuth } from '../../context/AuthContext';
import ACCESS_PERMISSION_REGISTRY from '../../config/accessPermissionRegistry';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { ShieldCheck as NstHdrShieldCheck } from 'lucide-react';
import { useT } from '../../i18n';

const emptyForm = {
  id: null,
  name: '',
  email: '',
  username: '',
  phone: '',
  password: '',
  branch_id: '',
  status: 'active',
  profile_type: 'staff',
  roles: [],
};

const SIDEBAR_OPTIONS = ACCESS_PERMISSION_REGISTRY;

const DASHBOARD_OPTIONS = [
  { key: 'show_financial_cards', labelKey: 'users.dashboard_options.show_financial_cards' },
  { key: 'show_stock_cards', labelKey: 'users.dashboard_options.show_stock_cards' },
  { key: 'show_sales_cards', labelKey: 'users.dashboard_options.show_sales_cards' },
  { key: 'show_branch_summary', labelKey: 'users.dashboard_options.show_branch_summary' },
  { key: 'show_dashboard_search', labelKey: 'users.dashboard_options.show_dashboard_search' },
];

const COLUMN_OPTIONS = [
  { key: 'purchase_price', label: 'Purchase Price column' },
  { key: 'buying_price', label: 'Used Purchase Buying Price column' },
  { key: 'profit', label: 'Profit / Margin column' },
  { key: 'supplier_due', label: 'Supplier Due column' },
  { key: 'customer_due', label: 'Customer Due column' },
  { key: 'imei', label: 'IMEI column' },
  { key: 'branch', label: 'Branch column' },
];

const FINANCIAL_OPTIONS = [
  { key: 'view_purchase_price', labelKey: 'users.financial_options.view_purchase_price' },
  { key: 'view_used_purchase_buying_price', labelKey: 'users.financial_options.view_used_purchase_buying_price' },
  { key: 'view_profit', labelKey: 'users.financial_options.view_profit' },
  { key: 'view_supplier_due', labelKey: 'users.financial_options.view_supplier_due' },
  { key: 'update_supplier_due', labelKey: 'users.financial_options.update_supplier_due' },
  { key: 'view_customer_due', labelKey: 'users.financial_options.view_customer_due' },
  { key: 'accounting_global_scope', labelKey: 'users.financial_options.accounting_global_scope' },
];

function normalizePayload(response) {
  return response?.data?.data || response?.data || response || {};
}

function normalizePaginated(response) {
  const payload = normalizePayload(response);
  return {
    data: payload?.data || [],
    current_page: payload?.current_page || 1,
    last_page: payload?.last_page || 1,
    total: payload?.total || 0,
  };
}

function roleLabel(role) {
  return String(role || '')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeRoleName(role) {
  const normalized = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return normalized === 'accounts' ? 'accountant' : normalized;
}

function getAuthRoles(authUser) {
  const roles = authUser?.roles || authUser?.user?.roles || [];
  return Array.isArray(roles) ? roles.map(normalizeRoleName).filter(Boolean) : [];
}

function blankAccessForm() {
  return {
    dashboard_permissions: {},
    sidebar_permissions: {},
    column_permissions: {},
    branch_ids: [],
    financial_permissions: {},
  };
}

export default function UserManagementPage() {
  const t = useT();
  const { user: authUser } = useAuth();
  const authRoles = getAuthRoles(authUser);
  const isSuperAdmin = authRoles.includes('super_admin');

  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [options, setOptions] = useState({ roles: [], branches: [], statuses: [], profile_types: [] });
  const [filters, setFilters] = useState({ search: '', role: '', status: '', branch_id: '', page: 1 });
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [resetUser, setResetUser] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState(null);
  const [accessUser, setAccessUser] = useState(null);
  const [accessForm, setAccessForm] = useState(blankAccessForm());
  const [accessLoading, setAccessLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const roleOptions = useMemo(() => options.roles || [], [options.roles]);

  const fetchOptions = async () => {
    try {
      const response = await userManagementService.options();
      setOptions({ roles: [], branches: [], statuses: [], profile_types: [], ...normalizePayload(response) });
    } catch (err) {
      setError(err?.response?.data?.message || t('users.errors.options_load_failed'));
    }
  };

  const fetchUsers = async (nextFilters = filters) => {
    try {
      setLoading(true);
      setError('');
      const response = await userManagementService.list({
        ...nextFilters,
        per_page: 15,
      });
      const normalized = normalizePaginated(response);
      setUsers(normalized.data);
      setMeta(normalized);
    } catch (err) {
      setError(err?.response?.data?.message || t('users.errors.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOptions();
  }, []);

  useEffect(() => {
    fetchUsers(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.page]);

  const applySearch = (event) => {
    event.preventDefault();
    const next = { ...filters, page: 1 };
    setFilters(next);
    fetchUsers(next);
  };

  const updateFilter = (key, value) => {
    setFilters((previous) => ({ ...previous, [key]: value, page: 1 }));
  };

  const openCreate = () => {
    setTemporaryPassword(null);
    setError('');
    setMessage('');
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (user) => {
    setTemporaryPassword(null);
    setError('');
    setMessage('');
    setForm({
      id: user.id,
      name: user.name || '',
      email: user.email || '',
      username: user.username || '',
      phone: user.phone || '',
      password: '',
      branch_id: user.branch_id || '',
      status: user.status || 'active',
      profile_type: user.profile_type || 'staff',
      roles: Array.isArray(user.roles) ? user.roles : [],
    });
    setShowForm(true);
  };

  const openAccessControl = async (user) => {
    if (!isSuperAdmin) {
      setError(t('users.errors.access_super_admin_only'));
      return;
    }

    try {
      setAccessLoading(true);
      setError('');
      setMessage('');
      setAccessUser(user);
      const response = await accessControlService.show(user.id);
      const data = normalizePayload(response);
      setAccessForm({
        dashboard_permissions: data.dashboard_permissions || {},
        sidebar_permissions: data.sidebar_permissions || {},
        column_permissions: data.column_permissions || {},
        branch_ids: Array.isArray(data.branch_ids) ? data.branch_ids.map(Number) : [],
        financial_permissions: data.financial_permissions || {},
      });
    } catch (err) {
      setError(err?.response?.data?.message || t('users.errors.access_load_failed'));
      setAccessUser(null);
    } finally {
      setAccessLoading(false);
    }
  };

  const toggleAccessPermission = (section, key) => {
    setAccessForm((previous) => ({
      ...previous,
      [section]: {
        ...(previous[section] || {}),
        [key]: !Boolean(previous?.[section]?.[key]),
      },
    }));
  };

  const toggleBranchAccess = (branchId) => {
    const id = Number(branchId);
    setAccessForm((previous) => {
      const current = Array.isArray(previous.branch_ids) ? previous.branch_ids.map(Number) : [];
      const exists = current.includes(id);
      return {
        ...previous,
        branch_ids: exists ? current.filter((item) => item !== id) : [...current, id],
      };
    });
  };

  const selectAllSidebar = (checked) => {
    const next = {};
    SIDEBAR_OPTIONS.forEach((item) => {
      next[item.key] = checked;
    });
    setAccessForm((previous) => ({ ...previous, sidebar_permissions: next }));
  };

  const saveAccessControl = async (event) => {
    event.preventDefault();
    if (!accessUser) return;

    try {
      setSaving(true);
      setError('');
      setMessage('');
      await accessControlService.update(accessUser.id, {
        dashboard_permissions: accessForm.dashboard_permissions || {},
        sidebar_permissions: accessForm.sidebar_permissions || {},
        column_permissions: accessForm.column_permissions || {},
        branch_ids: accessForm.branch_ids || [],
        financial_permissions: accessForm.financial_permissions || {},
      });
      setMessage(t('users.access_updated', { name: accessUser.name }));
      setAccessUser(null);
    } catch (err) {
      const validationErrors = err?.response?.data?.errors;
      setError(validationErrors ? Object.values(validationErrors).flat().join(' ') : err?.response?.data?.message || t('users.errors.access_save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const toggleRole = (roleName) => {
    setForm((previous) => {
      const exists = previous.roles.includes(roleName);
      const roles = exists
        ? previous.roles.filter((role) => role !== roleName)
        : [...previous.roles, roleName];
      return { ...previous, roles };
    });
  };

  const submitForm = async (event) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError('');
      setMessage('');
      setTemporaryPassword(null);

      const payload = {
        name: form.name,
        email: form.email,
        username: form.username || null,
        phone: form.phone || null,
        branch_id: form.branch_id ? Number(form.branch_id) : null,
        status: form.status || 'active',
        profile_type: form.profile_type || 'staff',
        roles: form.roles,
      };

      if (form.password) {
        payload.password = form.password;
      }

      const response = form.id
        ? await userManagementService.update(form.id, payload)
        : await userManagementService.create({ ...payload, password: form.password || 'NST@123456' });

      const responseData = normalizePayload(response);
      if (responseData?.temporary_password) {
        setTemporaryPassword({
          name: responseData.name || form.name,
          email: responseData.email || form.email,
          password: responseData.temporary_password,
        });
      }

      setMessage(form.id ? 'User updated successfully.' : 'User created successfully.');
      setShowForm(false);
      fetchUsers(filters);
    } catch (err) {
      const validationErrors = err?.response?.data?.errors;
      if (validationErrors) {
        setError(Object.values(validationErrors).flat().join(' '));
      } else {
        setError(err?.response?.data?.message || t('users.errors.save_failed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmReset = async (event) => {
    event.preventDefault();
    if (!resetUser) return;

    try {
      setSaving(true);
      setError('');
      setMessage('');
      const response = await userManagementService.resetPassword(resetUser.id, {
        password: resetPassword || undefined,
      });
      const data = normalizePayload(response);
      setTemporaryPassword({
        name: data.name || resetUser.name,
        email: data.email || resetUser.email,
        password: data.temporary_password,
      });
      setMessage('Password reset successfully.');
      setResetUser(null);
      setResetPassword('');
      fetchUsers(filters);
    } catch (err) {
      setError(err?.response?.data?.message || t('users.errors.password_reset_failed'));
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (user) => {
    if (!window.confirm(t('users.confirm_delete', { name: user.name }))) {
      return;
    }

    try {
      setError('');
      setMessage('');
      await userManagementService.remove(user.id);
      setMessage('User deleted successfully.');
      fetchUsers(filters);
    } catch (err) {
      setError(err?.response?.data?.message || t('users.errors.delete_failed'));
    }
  };

  const changePage = (page) => {
    const safePage = Math.max(1, Math.min(page, meta.last_page || 1));
    setFilters((previous) => ({ ...previous, page: safePage }));
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <NstPageHeader icon={NstHdrShieldCheck} title={<>User Management</>} subtitle={t('users.subtitle')} actions={<><button
          type="button"
          onClick={openCreate}
          className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-[var(--nst-dashboard-primary)]"
        >
          + Create New User
        </button></>}/>

      {!isSuperAdmin && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          {t('users.not_super_admin_notice')}
        </div>
      )}

      {message && <Alert tone="success" text={message} />}
      {error && <Alert tone="error" text={error} />}
      {temporaryPassword && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-extrabold">Temporary Password</p>
          <p className="mt-1">User: {temporaryPassword.name} ({temporaryPassword.email})</p>
          <div className="mt-3 flex flex-col gap-2 rounded-xl bg-white p-3 md:flex-row md:items-center md:justify-between">
            <code className="text-base font-extrabold text-[var(--nst-dashboard-text)]">{temporaryPassword.password}</code>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(temporaryPassword.password)}
              className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-bold hover:bg-amber-100"
            >
              Copy Password
            </button>
          </div>
        </div>
      )}

      <form onSubmit={applySearch} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          <input
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
            placeholder="Search name, email, phone, username"
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)] md:col-span-2"
          />
          <select value={filters.role} onChange={(event) => updateFilter('role', event.target.value)} className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none">
            <option value="">All Roles</option>
            {roleOptions.map((role) => <option key={role.name} value={role.name}>{role.label || roleLabel(role.name)}</option>)}
          </select>
          <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none">
            <option value="">All Status</option>
            {(options.statuses || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button type="submit" className="rounded-xl bg-[var(--nst-dashboard-secondary)] px-4 py-3 text-sm font-extrabold text-white hover:bg-[#26395f]">
            Search
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-[var(--nst-dashboard-text)]">All Users</h2>
            <p className="text-sm text-gray-500">Total: {meta.total || users.length}</p>
          </div>
          {loading && <span className="text-sm font-bold text-[var(--nst-dashboard-primary)]">Loading...</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Branch</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Password Reset</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/60">
                  <td className="px-5 py-4">
                    <p className="font-extrabold text-[var(--nst-dashboard-text)]">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                    {(user.username || user.phone) && <p className="text-xs text-gray-400">{user.username || '-'} / {user.phone || '-'}</p>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {(user.roles || []).length > 0 ? user.roles.map((role) => (
                        <span key={role} className="rounded-full bg-[var(--nst-dashboard-primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--nst-dashboard-primary)]">{roleLabel(role)}</span>
                      )) : <span className="text-gray-400">No role</span>}
                    </div>
                    {user.profile_type && <p className="mt-1 text-xs text-gray-400">Type: {roleLabel(user.profile_type)}</p>}
                  </td>
                  <td className="px-5 py-4 text-gray-600">{user.branch?.name || user.branch_id || '-'}</td>
                  <td className="px-5 py-4"><StatusBadge status={user.status || 'active'} /></td>
                  <td className="px-5 py-4 text-xs text-gray-500">
                    {user.must_change_password ? 'Must change password' : 'Normal'}
                    {user.password_reset_at && <div>{String(user.password_reset_at).slice(0, 19)}</div>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={() => openEdit(user)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">Edit</button>
                      {isSuperAdmin && (
                        <button type="button" onClick={() => openAccessControl(user)} className="rounded-lg border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-[var(--nst-dashboard-primary-soft)] px-3 py-2 text-xs font-bold text-[var(--nst-dashboard-primary)] hover:bg-[var(--nst-dashboard-primary-soft)]">Access</button>
                      )}
                      <button type="button" onClick={() => setResetUser(user)} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100">Reset</button>
                      <button type="button" onClick={() => deleteUser(user)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 && (
                <tr><td colSpan="6" className="px-5 py-10 text-center text-gray-500">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 text-sm">
          <button type="button" onClick={() => changePage((meta.current_page || 1) - 1)} disabled={(meta.current_page || 1) <= 1} className="rounded-lg border border-gray-200 px-3 py-2 font-bold disabled:opacity-50">Previous</button>
          <span className="font-semibold text-gray-600">Page {meta.current_page || 1} of {meta.last_page || 1}</span>
          <button type="button" onClick={() => changePage((meta.current_page || 1) + 1)} disabled={(meta.current_page || 1) >= (meta.last_page || 1)} className="rounded-lg border border-gray-200 px-3 py-2 font-bold disabled:opacity-50">Next</button>
        </div>
      </div>

      {showForm && (
        <Modal title={form.id ? 'Update User Details' : 'Create New User'} onClose={() => setShowForm(false)}>
          <form onSubmit={submitForm} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Full Name" value={form.name} onChange={(value) => updateForm('name', value)} required />
              <Input label="Email" type="email" value={form.email} onChange={(value) => updateForm('email', value)} required />
              <Input label="Username" value={form.username} onChange={(value) => updateForm('username', value)} />
              <Input label="Phone" value={form.phone} onChange={(value) => updateForm('phone', value)} />
              <Input label={form.id ? 'New Password (optional)' : 'Password'} type="text" value={form.password} onChange={(value) => updateForm('password', value)} required={!form.id} />
              <select value={form.status} onChange={(event) => updateForm('status', event.target.value)} className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none">
                {(options.statuses || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <select value={form.profile_type} onChange={(event) => updateForm('profile_type', event.target.value)} className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none">
                {(options.profile_types || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <select value={form.branch_id} onChange={(event) => updateForm('branch_id', event.target.value)} className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none">
                <option value="">No Branch / Global Access</option>
                {(options.branches || []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </div>

            <div>
              <p className="mb-2 text-sm font-extrabold text-[var(--nst-dashboard-text)]">Assign Roles</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {roleOptions.map((role) => (
                  <label key={role.name} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${form.roles.includes(role.name) ? 'border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)]' : 'border-gray-200 text-gray-600'}`}>
                    <input type="checkbox" checked={form.roles.includes(role.name)} onChange={() => toggleRole(role.name)} />
                    {role.label || roleLabel(role.name)}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-bold">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-60">
                {saving ? 'Saving...' : form.id ? 'Update User' : 'Create User'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {accessUser && (
        <Modal title={`Access Control — ${accessUser.name}`} onClose={() => setAccessUser(null)} wide>
          <form onSubmit={saveAccessControl} className="space-y-6">
            {accessLoading ? (
              <div className="rounded-2xl bg-gray-50 p-6 text-center text-sm font-bold text-gray-500">Access data loading...</div>
            ) : (
              <>
                <div className="rounded-2xl border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-[var(--nst-dashboard-primary-soft)] p-4 text-sm text-[var(--nst-dashboard-primary)]">
                  <p className="font-extrabold">Super Admin Control Panel</p>
                  <p className="mt-1">{t('users.access_panel_intro')}</p>
                </div>

                <PermissionSection
                  title="Sidebar/Menu Access"
                  description={t('users.sidebar_access_help')}
                  options={SIDEBAR_OPTIONS}
                  values={accessForm.sidebar_permissions}
                  onToggle={(key) => toggleAccessPermission('sidebar_permissions', key)}
                  extraAction={(
                    <div className="flex gap-2">
                      <button type="button" onClick={() => selectAllSidebar(true)} className="rounded-lg border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] px-3 py-1.5 text-xs font-bold text-[var(--nst-dashboard-primary)]">Select All</button>
                      <button type="button" onClick={() => selectAllSidebar(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600">Clear All</button>
                    </div>
                  )}
                />

                <div className="rounded-2xl border border-gray-100 bg-white p-4">
                  <h3 className="text-base font-extrabold text-[var(--nst-dashboard-text)]">Session Timeout Override</h3>
                  <p className="mt-1 text-xs text-gray-500">User-specific policy has highest priority. Inherit uses role/global policy.</p>
                  <select
                    value={accessForm.dashboard_permissions?.session_timeout_minutes ?? ''}
                    onChange={(event) => setAccessForm((previous) => ({ ...previous, dashboard_permissions: { ...(previous.dashboard_permissions || {}), session_timeout_minutes: event.target.value === '' ? null : Number(event.target.value) } }))}
                    className="mt-3 w-full max-w-sm rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold"
                  >
                    <option value="">Inherit role/global</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="20">20 minutes</option><option value="0">Infinity</option>
                  </select>
                </div>

                <PermissionSection
                  title="Dashboard Access"
                  description={t('users.dashboard_access_help')}
                  options={DASHBOARD_OPTIONS}
                  values={accessForm.dashboard_permissions}
                  onToggle={(key) => toggleAccessPermission('dashboard_permissions', key)}
                />

                <PermissionSection
                  title="Table Column Access"
                  description={t('users.column_access_help')}
                  options={COLUMN_OPTIONS}
                  values={accessForm.column_permissions}
                  onToggle={(key) => toggleAccessPermission('column_permissions', key)}
                />

                <PermissionSection
                  title="Financial Access"
                  description={t('users.financial_access_help')}
                  options={FINANCIAL_OPTIONS}
                  values={accessForm.financial_permissions}
                  onToggle={(key) => toggleAccessPermission('financial_permissions', key)}
                />

                <div className="rounded-2xl border border-gray-100 bg-white p-4">
                  <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-base font-extrabold text-[var(--nst-dashboard-text)]">Branch Access</h3>
                      <p className="text-xs text-gray-500">{t('users.branch_access_help')}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setAccessForm((previous) => ({ ...previous, branch_ids: (options.branches || []).map((branch) => Number(branch.id)) }))} className="rounded-lg border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] px-3 py-1.5 text-xs font-bold text-[var(--nst-dashboard-primary)]">All Branches</button>
                      <button type="button" onClick={() => setAccessForm((previous) => ({ ...previous, branch_ids: [] }))} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600">Clear</button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {(options.branches || []).map((branch) => (
                      <label key={branch.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${accessForm.branch_ids?.map(Number).includes(Number(branch.id)) ? 'border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)]' : 'border-gray-200 text-gray-600'}`}>
                        <input type="checkbox" checked={accessForm.branch_ids?.map(Number).includes(Number(branch.id))} onChange={() => toggleBranchAccess(branch.id)} />
                        {branch.name}
                      </label>
                    ))}
                    {(options.branches || []).length === 0 && <p className="text-sm text-gray-400">No branch found.</p>}
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button type="button" onClick={() => setAccessUser(null)} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-bold">Cancel</button>
              <button type="submit" disabled={saving || accessLoading} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-60">
                {saving ? 'Saving...' : 'Save Access Control'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {resetUser && (
        <Modal title="Reset User Password" onClose={() => setResetUser(null)}>
          <form onSubmit={confirmReset} className="space-y-4">
            <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
              <p className="font-extrabold text-[var(--nst-dashboard-text)]">{resetUser.name}</p>
              <p>{resetUser.email}</p>
            </div>
            <Input label={t('users.new_password_label')} type="text" value={resetPassword} onChange={setResetPassword} />
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button type="button" onClick={() => setResetUser(null)} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-bold">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-60">
                {saving ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function PermissionSection({ title, description, options, values, onToggle, extraAction = null }) {
  const t = useT();
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-extrabold text-[var(--nst-dashboard-text)]">{title}</h3>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        {extraAction}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((item) => (
          <label key={item.key} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${values?.[item.key] ? 'border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)]' : 'border-gray-200 text-gray-600'}`}>
            <input type="checkbox" checked={Boolean(values?.[item.key])} onChange={() => onToggle(item.key)} />
            {item.labelKey ? t(item.labelKey) : item.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function Alert({ tone, text }) {
  const styles = tone === 'success'
    ? 'border-green-200 bg-green-50 text-green-700'
    : 'border-red-200 bg-red-50 text-red-700';
  return <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${styles}`}>{text}</div>;
}

function StatusBadge({ status }) {
  const value = status || 'active';
  const styles = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    inactive: 'bg-gray-50 text-gray-600 border-gray-100',
    suspended: 'bg-red-50 text-red-700 border-red-100',
  };
  return <span className={`rounded-full border px-3 py-1 text-xs font-extrabold ${styles[value] || styles.inactive}`}>{roleLabel(value)}</span>;
}

function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className={`mt-8 w-full ${wide ? 'max-w-6xl' : 'max-w-4xl'} rounded-2xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-extrabold text-[var(--nst-dashboard-text)]">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-xl font-bold text-gray-400 hover:bg-gray-50">×</button>
        </div>
        <div className="max-h-[78vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function Input({ label, type = 'text', value, onChange, required = false }) {
  return (
    <label className="space-y-1.5 text-sm font-semibold text-gray-700">
      <span>{label}{required ? ' *' : ''}</span>
      <input
        type={type}
        value={value ?? ''}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
      />
    </label>
  );
}
