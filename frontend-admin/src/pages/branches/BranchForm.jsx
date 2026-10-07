import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import branchService from '../../services/branchService';
import api from '../../services/api';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Building2 as NstHdrBuilding2 } from 'lucide-react';
import { useT } from '../../i18n';

export default function BranchForm() {
  const t = useT();
  const { id } = useParams();
  const navigate = useNavigate();

  const isEditMode = Boolean(id);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    phone: '',
    email: '',
    address: '',
    manager_id: '',
    status: 'active',
    invoice_profile: { use_custom_profile:false, invoice_prefix:'', business_name:'', short_name:'', logo_url:'', address:'', phone:'', email:'', website:'', bin_vat:'', layout:'a4', orientation:'portrait', payment_details:'', terms:'', warranty_terms:'', return_policy:'', footer_text:'', signature_text:'Authorized Signature', show_qr:true, show_barcode:true, auto_print:false },
  });

  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const normalizeSingleBranchResponse = (response) => {
    const payload = response?.data ?? response;

    const possibleObjects = [
      payload?.data,
      payload?.branch,
      payload?.data?.branch,
      payload?.data?.data,
      payload,
    ];

    const branch = possibleObjects.find(
      (item) => item && typeof item === 'object' && !Array.isArray(item) && item.id
    );

    return branch || {};
  };

  const normalizeArrayResponse = (response) => {
    const payload = response?.data ?? response;

    const possibleArrays = [
      payload,
      payload?.data,
      payload?.users,
      payload?.managers,
      payload?.data?.data,
      payload?.data?.users,
      payload?.data?.managers,
    ];

    const foundArray = possibleArrays.find((item) => Array.isArray(item));

    return foundArray || [];
  };

  const getErrorMessage = (err) => {
    return (
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      'Something went wrong. Please try again.'
    );
  };

  const loadManagers = async () => {
    try {
      const response = await api.get('/users');

      console.log('Users API Response:', response?.data);

      const users = normalizeArrayResponse(response);

      const managerUsers = users.filter((user) => {
        const roleText = [
          user?.role,
          user?.user_type,
          user?.type,
          ...(Array.isArray(user?.roles) ? user.roles : []),
          ...(Array.isArray(user?.role_names) ? user.role_names : []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return (
          roleText.includes('branch') ||
          roleText.includes('manager') ||
          roleText.includes('branch_manager') ||
          roleText.includes('branch manager')
        );
      });

      setManagers(managerUsers.length > 0 ? managerUsers : users);
    } catch (err) {
      console.warn('Manager list load failed:', err);
      setManagers([]);
    }
  };

  const loadBranch = async () => {
    if (!isEditMode) {
      return;
    }

    try {
      setLoading(true);
      setError('');

      const response = await branchService.getBranch(id);

      console.log('Single Branch API Response:', response?.data);

      const branch = normalizeSingleBranchResponse(response);

      setFormData({
        name: branch?.name || branch?.branch_name || '',
        code: branch?.code || branch?.branch_code || '',
        phone: branch?.phone || '',
        email: branch?.email || '',
        address: branch?.address || '',
        manager_id:
          branch?.manager_id ||
          branch?.manager?.id ||
          branch?.branch_manager_id ||
          '',
        status: branch?.status || 'active',
        invoice_profile: {
          use_custom_profile: Boolean(branch?.invoice_profile?.use_custom_profile),
          invoice_prefix: branch?.invoice_profile?.invoice_prefix || '', business_name: branch?.invoice_profile?.business_name || '', short_name: branch?.invoice_profile?.short_name || '',
          logo_url: branch?.invoice_profile?.logo_url || '', address: branch?.invoice_profile?.address || '', phone: branch?.invoice_profile?.phone || '', email: branch?.invoice_profile?.email || '',
          website: branch?.invoice_profile?.website || '', bin_vat: branch?.invoice_profile?.bin_vat || '', layout: branch?.invoice_profile?.layout || 'a4', orientation: branch?.invoice_profile?.orientation || 'portrait', payment_details: branch?.invoice_profile?.payment_details || '',
          terms: branch?.invoice_profile?.terms || '', warranty_terms: branch?.invoice_profile?.warranty_terms || '', return_policy: branch?.invoice_profile?.return_policy || '', footer_text: branch?.invoice_profile?.footer_text || '',
          signature_text: branch?.invoice_profile?.signature_text || 'Authorized Signature', show_qr: branch?.invoice_profile?.show_qr !== false, show_barcode: branch?.invoice_profile?.show_barcode !== false, auto_print: Boolean(branch?.invoice_profile?.auto_print),
        },
      });
    } catch (err) {
      console.error('Branch load error:', err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadManagers();
    loadBranch();
  }, [id]);

  const selectedManagerExists = useMemo(() => {
    if (!formData.manager_id) {
      return true;
    }

    return managers.some((manager) => String(manager.id) === String(formData.manager_id));
  }, [managers, formData.manager_id]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleInvoiceChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((previous) => ({
      ...previous,
      invoice_profile: { ...previous.invoice_profile, [name]: type === 'checkbox' ? checked : value },
    }));
  };

  const buildSubmitData = () => {
    return {
      name: formData.name,
      code: formData.code,
      phone: formData.phone,
      email: formData.email,
      address: formData.address,
      manager_id: formData.manager_id || null,
      status: formData.status || 'active',
      invoice_profile: formData.invoice_profile,
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const submitData = buildSubmitData();

      if (isEditMode) {
        await branchService.updateBranch(id, submitData);
        setSuccess('Branch updated successfully.');
      } else {
        await branchService.createBranch(submitData);
        setSuccess('Branch created successfully.');
      }

      setTimeout(() => {
        navigate('/branches');
      }, 600);
    } catch (err) {
      console.error('Branch save error:', err);
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <NstPageHeader icon={NstHdrBuilding2} title={<>{isEditMode ? 'Edit Branch' : 'Add Branch'}</>} subtitle={<>{isEditMode
              ? 'Update branch information and manager.'
              : 'Create a new branch and assign manager.'}</>} actions={<><Link
          to="/branches"
          className="bg-white border border-gray-100 text-[var(--nst-dashboard-text)] hover:bg-gray-50 px-5 py-2.5 rounded-lg font-semibold"
        >
          Back to Branches
        </Link></>}/>

      {loading && (
        <div className="mb-5 bg-blue-50 border border-blue-100 text-blue-700 px-4 py-3 rounded-xl">
          Branch data loading...
        </div>
      )}

      {error && (
        <div className="mb-5 bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-5 bg-green-50 border border-green-100 text-green-700 px-4 py-3 rounded-xl">
          {success}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-[var(--nst-dashboard-text)] mb-2">
                Branch Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Example: Main Branch"
                required
                className="w-full border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--nst-dashboard-text)] mb-2">
                Branch Code
              </label>
              <input
                type="text"
                name="code"
                value={formData.code}
                onChange={handleChange}
                placeholder="Example: MAIN"
                className="w-full border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--nst-dashboard-text)] mb-2">
                Phone
              </label>
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Example: 01983398333"
                className="w-full border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--nst-dashboard-text)] mb-2">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Example: branch@example.com"
                className="w-full border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--nst-dashboard-text)] mb-2">
                Branch Manager
              </label>
              <select
                name="manager_id"
                value={formData.manager_id}
                onChange={handleChange}
                className="w-full border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
              >
                <option value="">No Manager</option>

                {!selectedManagerExists && formData.manager_id && (
                  <option value={formData.manager_id}>
                    Current Manager #{formData.manager_id}
                  </option>
                )}

                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name || manager.email || `User #${manager.id}`}
                  </option>
                ))}
              </select>

              <p className="text-xs text-gray-400 mt-2">
                {t('branches.manager_help')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--nst-dashboard-text)] mb-2">
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-[var(--nst-dashboard-text)] mb-2">
                Address
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Branch full address"
                rows="5"
                className="w-full border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
              />
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-violet-200 bg-violet-50 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-900">Branch Invoice Profile</h2><p className="text-xs text-slate-500">Invoice numbers remain branch-specific. Enable custom profile to override NST global branding for this branch.</p></div><label className="flex items-center gap-2 text-sm font-black"><input type="checkbox" name="use_custom_profile" checked={formData.invoice_profile.use_custom_profile} onChange={handleInvoiceChange}/>Use custom invoice branding</label></div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold">Invoice Prefix<input name="invoice_prefix" value={formData.invoice_profile.invoice_prefix} onChange={handleInvoiceChange} placeholder="NST-BOG" className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
              <label className="text-sm font-semibold">Print Layout<select name="layout" value={formData.invoice_profile.layout} onChange={handleInvoiceChange} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="a4">A4 Full (210 x 297 mm)</option><option value="a5">A5 / Half A4 (148 x 210 mm)</option><option value="80mm">80mm Thermal</option><option value="58mm">58mm Thermal</option></select></label>
              <label className="text-sm font-semibold">Print Orientation<select name="orientation" value={formData.invoice_profile.orientation} onChange={handleInvoiceChange} disabled={['80mm','58mm'].includes(formData.invoice_profile.layout)} className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-slate-100 disabled:text-slate-400"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select><span className="mt-1 block text-xs font-normal text-slate-500">Saved with the branch invoice profile and frozen into each new invoice snapshot. Thermal layouts ignore orientation.</span></label>
              <label className="text-sm font-semibold">Business / Branch Name<input name="business_name" value={formData.invoice_profile.business_name} onChange={handleInvoiceChange} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
              <label className="text-sm font-semibold">Short Name<input name="short_name" value={formData.invoice_profile.short_name} onChange={handleInvoiceChange} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
              <label className="text-sm font-semibold">Invoice Logo URL<input name="logo_url" value={formData.invoice_profile.logo_url} onChange={handleInvoiceChange} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
              <label className="text-sm font-semibold">BIN / VAT<input name="bin_vat" value={formData.invoice_profile.bin_vat} onChange={handleInvoiceChange} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
              <label className="text-sm font-semibold">Invoice Phone<input name="phone" value={formData.invoice_profile.phone} onChange={handleInvoiceChange} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
              <label className="text-sm font-semibold">Invoice Email<input type="email" name="email" value={formData.invoice_profile.email} onChange={handleInvoiceChange} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
              <label className="text-sm font-semibold md:col-span-2">Invoice Address<textarea name="address" value={formData.invoice_profile.address} onChange={handleInvoiceChange} rows="2" className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
              <label className="text-sm font-semibold">Website<input name="website" value={formData.invoice_profile.website} onChange={handleInvoiceChange} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
              <label className="text-sm font-semibold">Signature Label<input name="signature_text" value={formData.invoice_profile.signature_text} onChange={handleInvoiceChange} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
              {[['payment_details','Payment Details'],['terms','Terms & Conditions'],['warranty_terms','Warranty Terms'],['return_policy','Return Policy'],['footer_text','Footer Text']].map(([name,label]) => <label key={name} className="text-sm font-semibold md:col-span-2">{label}<textarea name={name} value={formData.invoice_profile[name]} onChange={handleInvoiceChange} rows="2" className="mt-1 w-full rounded-lg border px-3 py-2"/></label>)}
            </div>
            <div className="mt-4 flex flex-wrap gap-5 text-sm font-bold"><label><input className="mr-2" type="checkbox" name="show_qr" checked={formData.invoice_profile.show_qr} onChange={handleInvoiceChange}/>Customer online-invoice QR</label><label><input className="mr-2" type="checkbox" name="show_barcode" checked={formData.invoice_profile.show_barcode} onChange={handleInvoiceChange}/>Staff invoice Code128 barcode</label><label><input className="mr-2" type="checkbox" name="auto_print" checked={formData.invoice_profile.auto_print} onChange={handleInvoiceChange}/>Auto print</label></div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-8">
            <Link
              to="/branches"
              className="bg-gray-100 hover:bg-gray-200 text-[var(--nst-dashboard-text)] px-6 py-3 rounded-lg font-semibold"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={saving || loading}
              className="bg-[var(--nst-dashboard-primary)] hover:bg-[var(--nst-dashboard-primary)] disabled:opacity-60 text-white px-6 py-3 rounded-lg font-semibold"
            >
              {saving
                ? 'Saving...'
                : isEditMode
                  ? 'Update Branch'
                  : 'Create Branch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}