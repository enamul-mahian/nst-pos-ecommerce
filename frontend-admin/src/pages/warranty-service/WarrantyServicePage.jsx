import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import warrantyService from '../../services/warrantyService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Cpu as NstHdrCpu } from 'lucide-react';
import { useT } from '../../i18n';

const STATUS_OPTIONS = [
  { value: 'received', label: 'Received' },
  { value: 'checking', label: 'Checking' },
  { value: 'sent_to_service_center', label: 'Sent to Service Center' },
  { value: 'repairing', label: 'Repairing' },
  { value: 'waiting_for_parts', label: 'Waiting for Parts' },
  { value: 'ready_to_deliver', label: 'Ready to Deliver' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const initialForm = {
  branch_id: '',
  customer_name: '',
  customer_phone: '',
  product_name: '',
  device_unit_id: '',
  sale_id: '',
  sale_item_id: '',
  customer_id: '',
  product_id: '',
  imei_1: '',
  imei_2: '',
  barcode: '',
  warranty_type: 'warranty',
  issue_type: 'Software / Hardware Check',
  issue_description: '',
  priority: 'normal',
  expected_delivery_date: '',
  assigned_to: '',
  estimated_cost: 0,
  service_charge: 0,
  parts_cost: 0,
  discount_amount: 0,
  paid_amount: 0,
  payment_method: 'cash',
  transaction_id: '',
  technician_note: '',
  note: '',
};

function money(value) {
  return Number(value || 0).toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function badgeClass(status) {
  const map = {
    received: 'bg-blue-50 text-blue-700 border-blue-100',
    checking: 'bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)] border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]',
    sent_to_service_center: 'bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)] border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]',
    repairing: 'bg-amber-50 text-amber-700 border-amber-100',
    waiting_for_parts: 'bg-orange-50 text-orange-700 border-orange-100',
    ready_to_deliver: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    delivered: 'bg-green-50 text-green-700 border-green-100',
    rejected: 'bg-red-50 text-red-700 border-red-100',
    cancelled: 'bg-gray-50 text-gray-700 border-gray-100',
  };

  return map[status] || 'bg-gray-50 text-gray-700 border-gray-100';
}

function labelForStatus(status) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || status || '-';
}

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.users)) return payload.users;
  if (Array.isArray(payload?.branches)) return payload.branches;
  return [];
}

export default function WarrantyServicePage() {
  const t = useT();
  const [jobs, setJobs] = useState([]);
  const [summary, setSummary] = useState({});
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ search: '', status: '', warranty_type: '', per_page: 20 });
  const [form, setForm] = useState(initialForm);
  const [deviceSearch, setDeviceSearch] = useState('');
  const [deviceResults, setDeviceResults] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [statusPayload, setStatusPayload] = useState({ status: 'checking', note: '' });
  const [paymentPayload, setPaymentPayload] = useState({ amount: '', payment_method: 'cash', transaction_id: '', note: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const totals = useMemo(() => {
    const serviceCharge = Number(form.service_charge || 0);
    const partsCost = Number(form.parts_cost || 0);
    const discount = Number(form.discount_amount || 0);
    const total = Math.max(0, serviceCharge + partsCost - discount);
    const paid = Math.min(Number(form.paid_amount || 0), total);
    return { total, due: Math.max(0, total - paid) };
  }, [form.service_charge, form.parts_cost, form.discount_amount, form.paid_amount]);

  useEffect(() => {
    loadOptions();
    loadJobs();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadJobs(), 350);
    return () => clearTimeout(timer);
  }, [filters.search, filters.status, filters.warranty_type]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (deviceSearch.trim().length >= 2) {
        warrantyService.searchDevices(deviceSearch.trim()).then((res) => setDeviceResults(asList(res))).catch(() => setDeviceResults([]));
      } else {
        setDeviceResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [deviceSearch]);

  async function loadOptions() {
    try {
      const [branchRes, userRes] = await Promise.allSettled([
        api.get('/branches/all'),
        api.get('/users/options'),
      ]);

      if (branchRes.status === 'fulfilled') {
        setBranches(asList(branchRes.value.data));
      }

      if (userRes.status === 'fulfilled') {
        setUsers(asList(userRes.value.data));
      }
    } catch (error) {
      // Options are helpful, but page can still work without them.
    }
  }

  async function loadJobs() {
    setLoading(true);
    try {
      const res = await warrantyService.getJobs(filters);
      setJobs(asList(res));
      setSummary(res.summary || res.data?.summary || {});
    } catch (error) {
      setMessage(error.response?.data?.message || t('warranty.errors.load_failed'));
    } finally {
      setLoading(false);
    }
  }

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function chooseDevice(device) {
    setForm((prev) => ({
      ...prev,
      device_unit_id: device.id || '',
      sale_id: device.sale_id || '',
      customer_id: device.customer_id || '',
      branch_id: device.branch_id || prev.branch_id || '',
      product_id: device.product_id || '',
      customer_name: device.customer_name || prev.customer_name || '',
      customer_phone: device.customer_phone || prev.customer_phone || '',
      product_name: device.product_name || prev.product_name || '',
      imei_1: device.imei_1 || '',
      imei_2: device.imei_2 || '',
      barcode: device.barcode || '',
    }));
    setDeviceSearch(`${device.imei_1 || device.imei_2 || device.barcode || device.product_name || ''}`);
    setDeviceResults([]);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const payload = {
        ...form,
        branch_id: form.branch_id || null,
        customer_id: form.customer_id || null,
        sale_id: form.sale_id || null,
        sale_item_id: form.sale_item_id || null,
        device_unit_id: form.device_unit_id || null,
        product_id: form.product_id || null,
        assigned_to: form.assigned_to || null,
      };

      const res = await warrantyService.createJob(payload);
      setMessage(res.message || 'Service job saved successfully.');
      setForm(initialForm);
      setDeviceSearch('');
      loadJobs();
    } catch (error) {
      setMessage(error.response?.data?.message || t('warranty.errors.save_failed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusUpdate(event) {
    event.preventDefault();

    if (!selectedJob) return;

    setSaving(true);
    setMessage('');
    try {
      const res = await warrantyService.updateStatus(selectedJob.id, statusPayload);
      setMessage(res.message || 'Status updated successfully.');
      setSelectedJob(res.data || null);
      loadJobs();
    } catch (error) {
      setMessage(error.response?.data?.message || t('warranty.errors.status_update_failed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleReceivePayment(event) {
    event.preventDefault();

    if (!selectedJob) return;

    setSaving(true);
    setMessage('');
    try {
      const res = await warrantyService.receivePayment(selectedJob.id, paymentPayload);
      setMessage(res.message || 'Payment received successfully.');
      setSelectedJob(res.data || null);
      setPaymentPayload({ amount: '', payment_method: 'cash', transaction_id: '', note: '' });
      loadJobs();
    } catch (error) {
      setMessage(error.response?.data?.message || t('warranty.errors.payment_failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <style>{`
        .input { width: 100%; border-radius: 0.75rem; border: 1px solid #E5E7EB; padding: 0.625rem 0.75rem; font-size: 0.875rem; outline: none; }
        .input:focus { border-color: var(--nst-dashboard-primary); box-shadow: 0 0 0 3px rgba(109, 40, 217, 0.10); }
      `}</style>
      <NstPageHeader icon={NstHdrCpu} title={t('warranty.title')} subtitle={t('warranty.subtitle')} actions={<><button
          type="button"
          onClick={loadJobs}
          className="rounded-xl bg-[var(--nst-dashboard-secondary)] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#263a63]"
        >
          Refresh
        </button></>}/>

      {message && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
          {message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Total Jobs" value={summary.total_jobs || 0} />
        <StatCard title="Open Jobs" value={summary.open_jobs || 0} />
        <StatCard title="Ready" value={summary.ready_to_deliver || 0} />
        <StatCard title="Service Income" value={`৳ ${money(summary.paid_amount)}`} />
        <StatCard title="Service Due" value={`৳ ${money(summary.due_amount)}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[430px_1fr]">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-extrabold text-[var(--nst-dashboard-text)]">New Warranty / Service Job</h2>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Search Sold Device / IMEI / Invoice / Customer</label>
            <input
              value={deviceSearch}
              onChange={(e) => setDeviceSearch(e.target.value)}
              placeholder="IMEI, barcode, invoice no, customer phone..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
            />
            {asList(deviceResults).length > 0 && (
              <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-lg">
                {asList(deviceResults).map((device) => (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => chooseDevice(device)}
                    className="block w-full border-b border-gray-50 px-3 py-2 text-left text-sm transition hover:bg-gray-50"
                  >
                    <div className="font-bold text-[var(--nst-dashboard-text)]">{device.product_name || 'Device'} #{device.id}</div>
                    <div className="text-xs text-gray-500">IMEI: {device.imei_1 || '-'} / {device.imei_2 || '-'} • Barcode: {device.barcode || '-'}</div>
                    <div className="text-xs text-gray-500">Invoice: {device.invoice_no || '-'} • Customer: {device.customer_name || '-'} {device.customer_phone ? `(${device.customer_phone})` : ''}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Branch">
              <select value={form.branch_id} onChange={(e) => updateForm('branch_id', e.target.value)} className="input">
                <option value="">Select Branch</option>
                {asList(branches).map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name || branch.code}</option>
                ))}
              </select>
            </Field>
            <Field label="Warranty Type">
              <select value={form.warranty_type} onChange={(e) => updateForm('warranty_type', e.target.value)} className="input">
                <option value="warranty">Warranty</option>
                <option value="paid_service">Paid Service</option>
                <option value="out_of_warranty">Out of Warranty</option>
                <option value="replacement_check">Replacement Check</option>
              </select>
            </Field>
            <Field label="Customer Name">
              <input value={form.customer_name} onChange={(e) => updateForm('customer_name', e.target.value)} className="input" required />
            </Field>
            <Field label="Customer Phone">
              <input value={form.customer_phone} onChange={(e) => updateForm('customer_phone', e.target.value)} className="input" />
            </Field>
            <Field label="Product Name">
              <input value={form.product_name} onChange={(e) => updateForm('product_name', e.target.value)} className="input" />
            </Field>
            <Field label="Priority">
              <select value={form.priority} onChange={(e) => updateForm('priority', e.target.value)} className="input">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </Field>
            <Field label="IMEI 1">
              <input value={form.imei_1} onChange={(e) => updateForm('imei_1', e.target.value)} className="input" />
            </Field>
            <Field label="IMEI 2">
              <input value={form.imei_2} onChange={(e) => updateForm('imei_2', e.target.value)} className="input" />
            </Field>
            <Field label="Barcode">
              <input value={form.barcode} onChange={(e) => updateForm('barcode', e.target.value)} className="input" />
            </Field>
            <Field label="Expected Delivery">
              <input type="date" value={form.expected_delivery_date} onChange={(e) => updateForm('expected_delivery_date', e.target.value)} className="input" />
            </Field>
            <Field label="Technician">
              <select value={form.assigned_to} onChange={(e) => updateForm('assigned_to', e.target.value)} className="input">
                <option value="">Not assigned</option>
                {asList(users).map((user) => (
                  <option key={user.id} value={user.id}>{user.name || user.email}</option>
                ))}
              </select>
            </Field>
            <Field label="Issue Type">
              <input value={form.issue_type} onChange={(e) => updateForm('issue_type', e.target.value)} className="input" />
            </Field>
          </div>

          <Field label="Issue Description">
            <textarea value={form.issue_description} onChange={(e) => updateForm('issue_description', e.target.value)} className="input min-h-[90px]" required />
          </Field>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Service Charge">
              <input type="number" min="0" value={form.service_charge} onChange={(e) => updateForm('service_charge', e.target.value)} className="input" />
            </Field>
            <Field label="Parts Cost">
              <input type="number" min="0" value={form.parts_cost} onChange={(e) => updateForm('parts_cost', e.target.value)} className="input" />
            </Field>
            <Field label="Discount">
              <input type="number" min="0" value={form.discount_amount} onChange={(e) => updateForm('discount_amount', e.target.value)} className="input" />
            </Field>
            <Field label="Paid Amount">
              <input type="number" min="0" value={form.paid_amount} onChange={(e) => updateForm('paid_amount', e.target.value)} className="input" />
            </Field>
            <Field label="Payment Method">
              <select value={form.payment_method} onChange={(e) => updateForm('payment_method', e.target.value)} className="input">
                <option value="cash">Cash</option>
                <option value="bkash">bKash</option>
                <option value="nagad">Nagad</option>
                <option value="bank">Bank</option>
                <option value="card">Card</option>
              </select>
            </Field>
            <Field label="Transaction ID">
              <input value={form.transaction_id} onChange={(e) => updateForm('transaction_id', e.target.value)} className="input" />
            </Field>
          </div>

          <div className="my-4 rounded-xl bg-gray-50 p-3 text-sm">
            <div className="flex justify-between font-bold text-gray-700"><span>Total</span><span>৳ {money(totals.total)}</span></div>
            <div className="mt-1 flex justify-between font-bold text-red-600"><span>Due</span><span>৳ {money(totals.due)}</span></div>
          </div>

          <button disabled={saving} className="w-full rounded-xl bg-[var(--nst-dashboard-primary)] px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[var(--nst-dashboard-primary)] disabled:opacity-60">
            {saving ? 'Saving...' : 'Save Service Job'}
          </button>
        </form>

        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-3">
              <input
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder="Search job, IMEI, customer..."
                className="input"
              />
              <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} className="input">
                <option value="">All Status</option>
                {STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <select value={filters.warranty_type} onChange={(e) => setFilters((prev) => ({ ...prev, warranty_type: e.target.value }))} className="input">
                <option value="">All Types</option>
                <option value="warranty">Warranty</option>
                <option value="paid_service">Paid Service</option>
                <option value="out_of_warranty">Out of Warranty</option>
                <option value="replacement_check">Replacement Check</option>
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Job</th>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-left">Device</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Due</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan="6" className="px-4 py-6 text-center text-gray-500">Loading...</td></tr>
                  ) : jobs.length === 0 ? (
                    <tr><td colSpan="6" className="px-4 py-6 text-center text-gray-500">No service jobs found.</td></tr>
                  ) : jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-extrabold text-[var(--nst-dashboard-text)]">{job.job_no}</div>
                        <div className="text-xs text-gray-500">{job.warranty_type?.replaceAll('_', ' ')} • {job.priority}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-gray-700">{job.customer_name || '-'}</div>
                        <div className="text-xs text-gray-500">{job.customer_phone || '-'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-700">{job.product_name || '-'}</div>
                        <div className="text-xs text-gray-500">IMEI: {job.imei_1 || job.imei_2 || '-'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${badgeClass(job.status)}`}>{labelForStatus(job.status)}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-extrabold text-red-600">৳ {money(job.due_amount)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedJob(job);
                            setStatusPayload({ status: job.status || 'checking', note: '' });
                          }}
                          className="rounded-lg bg-[var(--nst-dashboard-secondary)] px-3 py-2 text-xs font-bold text-white hover:bg-[#263a63]"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-extrabold text-[var(--nst-dashboard-text)]">{selectedJob.job_no}</h3>
                <p className="text-sm text-gray-500">{selectedJob.customer_name} • {selectedJob.product_name}</p>
              </div>
              <button onClick={() => setSelectedJob(null)} className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-200">Close</button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Info label="Status" value={labelForStatus(selectedJob.status)} />
              <Info label="Total" value={`৳ ${money(selectedJob.total_amount)}`} />
              <Info label="Due" value={`৳ ${money(selectedJob.due_amount)}`} />
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <form onSubmit={handleStatusUpdate} className="rounded-xl border border-gray-100 p-4">
                <h4 className="mb-3 font-extrabold text-[var(--nst-dashboard-text)]">Update Status</h4>
                <Field label="New Status">
                  <select value={statusPayload.status} onChange={(e) => setStatusPayload((prev) => ({ ...prev, status: e.target.value }))} className="input">
                    {STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </Field>
                <Field label="Status Note">
                  <textarea value={statusPayload.note} onChange={(e) => setStatusPayload((prev) => ({ ...prev, note: e.target.value }))} className="input min-h-[90px]" />
                </Field>
                <button disabled={saving} className="w-full rounded-xl bg-[var(--nst-dashboard-primary)] px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60">Update Status</button>
              </form>

              <form onSubmit={handleReceivePayment} className="rounded-xl border border-gray-100 p-4">
                <h4 className="mb-3 font-extrabold text-[var(--nst-dashboard-text)]">Receive Service Payment</h4>
                <Field label="Amount">
                  <input type="number" min="1" value={paymentPayload.amount} onChange={(e) => setPaymentPayload((prev) => ({ ...prev, amount: e.target.value }))} className="input" required />
                </Field>
                <Field label="Payment Method">
                  <select value={paymentPayload.payment_method} onChange={(e) => setPaymentPayload((prev) => ({ ...prev, payment_method: e.target.value }))} className="input">
                    <option value="cash">Cash</option>
                    <option value="bkash">bKash</option>
                    <option value="nagad">Nagad</option>
                    <option value="bank">Bank</option>
                    <option value="card">Card</option>
                  </select>
                </Field>
                <Field label="Transaction ID">
                  <input value={paymentPayload.transaction_id} onChange={(e) => setPaymentPayload((prev) => ({ ...prev, transaction_id: e.target.value }))} className="input" />
                </Field>
                <button disabled={saving} className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60">Receive Payment</button>
              </form>
            </div>

            <div className="mt-5 rounded-xl bg-gray-50 p-4">
              <h4 className="mb-2 font-extrabold text-[var(--nst-dashboard-text)]">Issue</h4>
              <p className="text-sm text-gray-700">{selectedJob.issue_description || '-'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{title}</p>
      <p className="mt-2 text-2xl font-extrabold text-[var(--nst-dashboard-text)]">{value}</p>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-bold uppercase text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="text-xs font-bold uppercase text-gray-400">{label}</p>
      <p className="mt-1 font-extrabold text-[var(--nst-dashboard-text)]">{value}</p>
    </div>
  );
}

// Tailwind helper class used by inputs in this page.
// Keep the class name literal in JSX so Vite/Tailwind can compile it.
const _inputClassReference = 'input w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]';
