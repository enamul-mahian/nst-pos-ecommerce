import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import deviceUnitService from '../../services/deviceUnitService';
import { useAuth } from '../../context/AuthContext';
import accessRules from '../../utils/accessRules';
import { buildNstBarcodePrintHtml, labelOptionsFromTemplate, NST_BARCODE_LABEL } from '../../utils/nstBarcodeLabel';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Smartphone as NstHdrSmartphone } from 'lucide-react';
import { useT } from '../../i18n';

const statusOptions = [
  { value: '', label: 'All Status' },
  { value: 'available', label: 'Available' },
  { value: 'awaiting_inspection', label: 'Awaiting Inspection' },
  { value: 'ready_for_sale', label: 'Ready For Sale' },
  { value: 'sold', label: 'Sold' },
  { value: 'returned', label: 'Returned' },
  { value: 'supplier_return', label: 'Supplier Return' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'warranty_claim', label: 'Warranty Claim' },
];

function unwrapList(response) {
  const payload = response?.data ?? response;
  const data = payload?.data ?? payload;

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function unwrapPagination(response) {
  const payload = response?.data ?? response;
  const data = payload?.data ?? payload;

  return {
    rows: Array.isArray(data?.data) ? data.data : [],
    currentPage: Number(data?.current_page || 1),
    lastPage: Number(data?.last_page || 1),
    total: Number(data?.total || 0),
  };
}

function money(value) {
  if (value === null || value === undefined || value === '') return '৳0.00';

  return `৳${Number(value || 0).toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalizeStatus(status) {
  return String(status || 'available').replaceAll('_', ' ');
}

function StatusBadge({ status }) {
  const normalized = String(status || 'available');
  const colorClass =
    normalized === 'available' || normalized === 'ready_for_sale'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : normalized === 'awaiting_inspection'
        ? 'bg-amber-50 text-amber-700 border-amber-100'
        : normalized === 'sold'
          ? 'bg-blue-50 text-blue-700 border-blue-100'
          : normalized === 'damaged'
            ? 'bg-red-50 text-red-700 border-red-100'
            : 'bg-gray-50 text-gray-700 border-gray-100';

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${colorClass}`}>
      {normalizeStatus(normalized)}
    </span>
  );
}

function SummaryCard({ title, value, subtitle }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:p-5">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <h3 className="mt-2 text-2xl font-extrabold text-[var(--nst-dashboard-text)] md:text-3xl">{value}</h3>
      {subtitle && <p className="mt-2 text-xs text-gray-400">{subtitle}</p>}
    </div>
  );
}

function DeviceStockListCore() {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const canViewSupplierInfo = accessRules.canViewSupplierInfo(user);

  const [filters, setFilters] = useState({
    search: '',
    status: statusOptions.some((option) => option.value === searchParams.get('status')) ? searchParams.get('status') : '',
    branch_id: '',
    product_id: '',
    from_date: '',
    to_date: '',
    per_page: 20,
  });

  const [page, setPage] = useState(1);
  const [devices, setDevices] = useState([]);
  const [pagination, setPagination] = useState({ currentPage: 1, lastPage: 1, total: 0 });
  const [summary, setSummary] = useState({});
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [canSeePurchaseCost, setCanSeePurchaseCost] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [barcodeDialog, setBarcodeDialog] = useState(null);
  const [barcodeForm, setBarcodeForm] = useState({ action: 'print', reason: '', printer_type: 'thermal', copies: 1 });
  const [canManageDevices, setCanManageDevices] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deleteDevice, setDeleteDevice] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [manageBusy, setManageBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.get('/access-matrix/me').then((response) => {
      if (!active) return;
      const payload = response?.data?.data ?? response?.data ?? {};
      const matrixUser = payload?.user ?? payload;
      const roles = [matrixUser?.role, matrixUser?.role_name, matrixUser?.type, matrixUser?.user_type, matrixUser?.role?.name, matrixUser?.role?.slug]
        .filter(Boolean).map((value) => String(value).toLowerCase().replace(/[\s-]+/g, '_'));
      setCanManageDevices(Boolean(payload?.is_super_admin || matrixUser?.is_super_admin || matrixUser?.super_admin || roles.includes('super_admin')));
    }).catch(() => active && setCanManageDevices(false));
    return () => { active = false; };
  }, []);

  const startDeviceEdit = (device) => {
    setEditingDevice(device);
    setEditForm({
      product_name: device.product_name || device.product_db_name || '', model_number: device.model_number || '',
      sku: device.sku || '', barcode: device.barcode || '', imei_1: device.imei_1 || '', imei_2: device.imei_2 || '',
      selling_price: device.selling_price ?? '', purchase_cost: device.purchase_cost ?? '', status: device.status || 'available',
      service_status: device.service_status || '', note: device.note || '',
    });
  };

  const saveDeviceEdit = async () => {
    if (!editingDevice?.id) return;
    setManageBusy(true); setError('');
    try {
      const payload = { ...editForm };
      ['selling_price', 'purchase_cost'].forEach((key) => { payload[key] = payload[key] === '' ? null : Number(payload[key]); });
      await api.put(`/device-units/${editingDevice.id}`, payload);
      setEditingDevice(null);
      await loadDevices();
    } catch (err) { setError(err?.response?.data?.message || err?.message || 'Device update failed.'); }
    finally { setManageBusy(false); }
  };

  const confirmDeviceDelete = async () => {
    if (!deleteDevice?.id || deleteReason.trim().length < 3) return;
    setManageBusy(true); setError('');
    try {
      await api.delete(`/device-units/${deleteDevice.id}`, { data: { reason: deleteReason.trim() } });
      setDeleteDevice(null); setDeleteReason('');
      await loadDevices();
    } catch (err) { setError(err?.response?.data?.message || err?.message || 'Device delete failed.'); }
    finally { setManageBusy(false); }
  };

  const queryParams = useMemo(() => {
    const params = { page, per_page: filters.per_page };

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) {
        params[key] = value;
      }
    });

    return params;
  }, [filters, page]);

  const loadOptions = async () => {
    try {
      const [branchRes, productRes] = await Promise.allSettled([
        api.get('/branches/all'),
        api.get('/products/all'),
      ]);

      if (branchRes.status === 'fulfilled') setBranches(unwrapList(branchRes.value));
      if (productRes.status === 'fulfilled') setProducts(unwrapList(productRes.value));
    } catch (err) {
      console.error('Device stock option load error:', err);
    }
  };

  const loadDevices = async () => {
    try {
      setLoading(true);
      setError('');

      const [listRes, summaryRes] = await Promise.all([
        deviceUnitService.list(queryParams),
        deviceUnitService.summary(),
      ]);

      const listPayload = listRes?.data || {};
      const parsed = unwrapPagination(listRes);

      setDevices(parsed.rows);
      setPagination({
        currentPage: parsed.currentPage,
        lastPage: parsed.lastPage,
        total: parsed.total,
      });
      setCanSeePurchaseCost(Boolean(listPayload.can_see_purchase_cost) && accessRules.canViewPurchasePrice(user));
      setSummary(summaryRes?.data?.data || {});
    } catch (err) {
      console.error('Device stock load error:', err);
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Device stock load failed. Check the backend route and device_units migration.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    loadDevices();
  }, [queryParams]);

  const updateFilter = (key, value) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
  };

  const openBarcode = (device, forceAction = null) => {
    const action = forceAction || (device.is_barcode_printed ? 'reprint' : 'print');
    setBarcodeForm({ action, reason: '', printer_type: 'thermal', copies: 1 });
    setBarcodeDialog({ devices: [device] });
  };

  const openBatchBarcode = () => {
    const batch = devices.filter((device) => selectedIds.includes(device.id));
    if (!batch.length) return alert('Select at least one device.');

    const printed = batch.filter((device) => device.is_barcode_printed).length;
    const action = printed === 0 ? 'print' : printed === batch.length ? 'reprint' : 'mixed';

    setBarcodeForm({
      action,
      reason: '',
      printer_type: 'thermal',
      copies: 1,
    });
    setBarcodeDialog({ devices: batch });
  };

  const logBarcodeBatch = async (list) => {
    const newItems = list.filter((item) => !item.is_barcode_printed);
    const reprintItems = list.filter((item) => item.is_barcode_printed);

    const payloadFor = (items, action) => ({
      items: items.map((item) => ({
        type: 'device',
        id: item.id,
        barcode: item.barcode,
        sku: item.sku,
      })),
      action,
      reason: action === 'reprint' ? barcodeForm.reason.trim() : null,
      printer_type: barcodeForm.printer_type,
      copies: Math.max(1, Number(barcodeForm.copies) || 1),
    });

    if (newItems.length) {
      await api.post('/barcode-tools/log-v2', payloadFor(newItems, 'print'));
    }

    if (reprintItems.length) {
      await api.post('/barcode-tools/log-v2', payloadFor(reprintItems, 'reprint'));
    }
  };

  const printBarcode = async () => {
    const list = barcodeDialog?.devices || [];
    if (!list.length) return;

    const hasReprint = list.some((item) => item.is_barcode_printed);
    if (hasReprint && !barcodeForm.reason.trim()) {
      return alert('Reprint reason is required for previously printed devices.');
    }

    if (list.some((item) => !String(item.barcode || item.sku || '').trim())) {
      return alert('Every selected device must have an NST Barcode or SKU before printing.');
    }

    try {
      await logBarcodeBatch(list);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Barcode print history could not be saved.');
      return;
    }

    let templateSettings = {};
    try {
      const response = await api.get('/barcode-label-templates');
      const rows = response?.data?.data ?? response?.data ?? [];
      const template = Array.isArray(rows) ? rows.find((row) => row.is_default) || rows[0] : null;
      templateSettings = template?.settings || {};
    } catch {
      templateSettings = {};
    }

    const html = buildNstBarcodePrintHtml(list, {
      ...labelOptionsFromTemplate(templateSettings),
      copies: Math.max(1, Number(barcodeForm.copies) || 1),
    });

    const popup = window.open('', 'nst-device-stock-barcode', 'width=900,height=760');
    if (!popup) {
      setError('Allow browser pop-ups to print barcode labels.');
      return;
    }

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 250);

    setBarcodeDialog(null);
    setSelectedIds([]);
    await loadDevices();
  };

  return (
    <div className="p-4 md:p-6">
      <NstPageHeader icon={NstHdrSmartphone} title={<>Device Stock & Lifetime IMEI Control
          </>} subtitle={<>Each physical IMEI stays traceable through Sale, Exchange, Cash Exchange, Awaiting Inspection,
            Ready For Sale and Resale. Barcode printing uses the single NST Final 30×40 design.
          </>} actions={<><button
          type="button"
          onClick={loadDevices}
          disabled={loading}
          className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60"
        >
          {loading ? 'Refreshing...' : 'Refresh Stock'}
        </button></>}/>

      {error && (
        <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Total Devices" value={summary.total_devices || 0} subtitle="All device_units rows" />
        <SummaryCard title="Available / Ready" value={summary.available_devices || 0} subtitle="Saleable stock" />
        <SummaryCard title="Sold" value={summary.sold_devices || 0} subtitle="Already sold" />
        <SummaryCard title="Returned/Damaged" value={(summary.returned_devices || 0) + (summary.damaged_devices || 0)} subtitle="Returned + damaged" />
        <SummaryCard
          title="Available Stock Value"
          value={canSeePurchaseCost ? money(summary.available_stock_value) : 'Hidden'}
          subtitle={canSeePurchaseCost ? `Avg: ${money(summary.average_purchase_cost)}` : 'Role restricted'}
        />
      </div>

      <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input
            type="text"
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
            placeholder="Search IMEI, barcode, product..."
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none xl:col-span-2"
          />

          <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none">
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>

          <select value={filters.branch_id} onChange={(event) => updateFilter('branch_id', event.target.value)} className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none">
            <option value="">All Branches</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name || branch.branch_name || `Branch #${branch.id}`}</option>)}
          </select>

          <select value={filters.product_id} onChange={(event) => updateFilter('product_id', event.target.value)} className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none">
            <option value="">All Products</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name || product.product_name || product.title || `Product #${product.id}`}</option>)}
          </select>

          <select value={filters.per_page} onChange={(event) => updateFilter('per_page', Number(event.target.value))} className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none">
            <option value={10}>10 / page</option>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-extrabold text-[var(--nst-dashboard-text)]">Device Unit List</h2>
            <p className="text-xs text-gray-400">Total found: {pagination.total}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={openBatchBarcode} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-4 py-2 text-xs font-black text-white">
              Batch Final 30×40 Print ({selectedIds.length})
            </button>
            <p className="text-xs font-semibold text-gray-500">Purchase Cost: {canSeePurchaseCost ? 'Allowed' : 'Hidden'}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1280px] w-full divide-y divide-gray-100 text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3"><input type="checkbox" checked={devices.length > 0 && selectedIds.length === devices.length} onChange={(e) => setSelectedIds(e.target.checked ? devices.map((device) => device.id) : [])} /></th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">IMEI 1</th>
                <th className="px-4 py-3">IMEI 2</th>
                <th className="px-4 py-3">Barcode</th>
                <th className="px-4 py-3">Branch</th>
                {canViewSupplierInfo && <th className="px-4 py-3">Supplier</th>}
                <th className="px-4 py-3">Purchase Ref</th>
                {canSeePurchaseCost && <th className="px-4 py-3 text-right">Purchase Cost</th>}
                <th className="px-4 py-3">Stock Status</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Printed</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={(canSeePurchaseCost ? 11 : 10) + (canViewSupplierInfo ? 1 : 0)} className="px-4 py-10 text-center text-gray-500">
                    Device stock loading...
                  </td>
                </tr>
              )}

              {!loading && devices.length === 0 && (
                <tr>
                  <td colSpan={(canSeePurchaseCost ? 11 : 10) + (canViewSupplierInfo ? 1 : 0)} className="px-4 py-10 text-center text-gray-500">
                    No device stock found.
                  </td>
                </tr>
              )}

              {!loading && devices.map((device) => (
                <tr key={device.id} className="transition hover:bg-gray-50/80">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(device.id)}
                      onChange={(e) => setSelectedIds((current) => e.target.checked ? [...current, device.id] : current.filter((id) => id !== device.id))}
                    />
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-bold text-[var(--nst-dashboard-text)]">
                      {device.display_product_name || device.product_name || device.product_db_name || 'Unnamed Device'}
                    </div>
                    <div className="text-xs text-gray-400">SKU: {device.sku || 'N/A'}</div>
                  </td>

                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{device.imei_1 || '-'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{device.imei_2 || '-'}</td>

                  <td className="px-4 py-3">
                    <div className="font-mono text-xs font-bold text-gray-700">{device.barcode || '-'}</div>
                    <div className="text-[11px] text-gray-400">{device.barcode_source || 'auto'}</div>
                  </td>

                  <td className="px-4 py-3 text-gray-600">{device.branch_name || '-'}</td>
                  {canViewSupplierInfo && <td className="px-4 py-3 text-gray-600">{device.supplier_name || '-'}</td>}
                  <td className="px-4 py-3 text-gray-600">{device.purchase_reference || device.purchase_id || '-'}</td>

                  {canSeePurchaseCost && (
                    <td className="px-4 py-3 text-right font-extrabold text-[var(--nst-dashboard-text)]">
                      {money(device.purchase_cost)}
                    </td>
                  )}

                  <td className="px-4 py-3"><StatusBadge status={device.status} /></td>

                  <td className="px-4 py-3">
                    {device.service_status ? (
                      <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-bold capitalize text-amber-700">
                        {String(device.service_status).replaceAll('_', ' ')}
                      </span>
                    ) : <span className="text-xs text-gray-400">-</span>}
                  </td>

                  <td className="px-4 py-3 text-gray-600">
                    {device.is_barcode_printed ? 'Yes · Reprint available' : 'Not printed'}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {['awaiting_inspection', 'ready_for_sale'].includes(String(device.status)) ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/device-stock/${device.id}/prepare-sale`)}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white"
                        >
                          {String(device.status) === 'awaiting_inspection' ? t('sale_prep.actions.inspect_prepare') : t('sale_prep.actions.edit_sale_details')}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => openBarcode(device)}
                        className="rounded-lg bg-[var(--nst-dashboard-primary)] px-3 py-2 text-xs font-bold text-white"
                      >
                        {device.is_barcode_printed ? 'Reprint 30×40' : 'Print 30×40'}
                      </button>

                      <button
                        type="button"
                        onClick={() => openBarcode(device, device.is_barcode_printed ? 'reprint' : 'print')}
                        className="rounded-lg border px-3 py-2 text-xs font-bold"
                      >
                        PDF / Preview
                      </button>

                      {canManageDevices ? (
                        <>
                          <button type="button" onClick={() => startDeviceEdit(device)} className="rounded-lg bg-purple-50 px-3 py-2 text-xs font-bold text-purple-700">Edit</button>
                          <button type="button" onClick={() => { setDeleteDevice(device); setDeleteReason(''); }} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Delete</button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">Page {pagination.currentPage} of {pagination.lastPage}</p>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagination.currentPage <= 1 || loading}
              onClick={() => setPage((previous) => Math.max(previous - 1, 1))}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={pagination.currentPage >= pagination.lastPage || loading}
              onClick={() => setPage((previous) => previous + 1)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {barcodeDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-2xl font-black">NST Final 30×40 Barcode</h3>
            <p className="mt-1 text-sm text-slate-500">
              {barcodeDialog.devices.length} device(s) selected. Physical output is fixed at {NST_BARCODE_LABEL.widthMm}mm × {NST_BARCODE_LABEL.heightMm}mm.
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-black uppercase text-slate-400">Action</div>
                <div className="mt-1 font-black capitalize">{barcodeForm.action === 'mixed' ? 'Print + Reprint batch' : barcodeForm.action}</div>
              </div>

              <select
                value={barcodeForm.printer_type}
                onChange={(e) => setBarcodeForm((current) => ({ ...current, printer_type: e.target.value }))}
                className="rounded-xl border p-3"
              >
                <option value="thermal">Thermal Label Printer</option>
                <option value="brother">Brother</option>
                <option value="zebra">Zebra</option>
                <option value="pdf">Save as PDF</option>
              </select>

              <input
                type="number"
                min="1"
                max="500"
                value={barcodeForm.copies}
                onChange={(e) => setBarcodeForm((current) => ({ ...current, copies: e.target.value }))}
                className="rounded-xl border p-3"
                placeholder="Copies"
              />
            </div>

            {barcodeDialog.devices.some((item) => item.is_barcode_printed) ? (
              <textarea
                value={barcodeForm.reason}
                onChange={(e) => setBarcodeForm((current) => ({ ...current, reason: e.target.value }))}
                className="mt-3 min-h-24 w-full rounded-xl border p-3"
                placeholder="Reprint reason (required for previously printed devices)"
              />
            ) : null}

            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setBarcodeDialog(null)} className="rounded-xl border px-5 py-3 font-bold">Cancel</button>
              <button onClick={printBarcode} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 font-black text-white">
                Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {editingDevice ? (
        <div className="fixed inset-0 z-[110] overflow-y-auto bg-slate-950/60 p-4">
          <div className="mx-auto mt-10 max-w-2xl rounded-3xl bg-white p-5 shadow-2xl">
            <h3 className="text-xl font-black">Edit Device #{editingDevice.id}</h3>
            <p className="mt-1 text-sm text-slate-500">Sold/invoice-linked identity fields remain protected by the server.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[['product_name','Product Name','text'],['model_number','Model','text'],['sku','SKU','text'],['barcode','Barcode','text'],['imei_1','IMEI 1','text'],['imei_2','IMEI 2','text'],['selling_price','Sale Price','number'],['purchase_cost','Purchase Cost','number'],['status','Status','text'],['service_status','Service Status','text']].map(([key,label,type]) => (
                <label key={key} className="text-xs font-black uppercase text-slate-500">{label}<input type={type} value={editForm[key] ?? ''} onChange={(e) => setEditForm((current) => ({ ...current, [key]: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-500" /></label>
              ))}
              <label className="sm:col-span-2 text-xs font-black uppercase text-slate-500">Note<textarea value={editForm.note ?? ''} onChange={(e) => setEditForm((current) => ({ ...current, note: e.target.value }))} className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-500" /></label>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setEditingDevice(null)} className="rounded-xl border px-4 py-2 font-bold">Cancel</button><button type="button" disabled={manageBusy} onClick={saveDeviceEdit} className="rounded-xl bg-purple-700 px-5 py-2 font-black text-white disabled:opacity-50">{manageBusy ? 'Saving...' : 'Save Changes'}</button></div>
          </div>
        </div>
      ) : null}

      {deleteDevice ? (
        <div className="fixed inset-0 z-[115] bg-slate-950/60 p-4"><div className="mx-auto mt-24 max-w-lg rounded-3xl bg-white p-5 shadow-2xl"><h3 className="text-xl font-black text-red-700">Delete Device #{deleteDevice.id}</h3><p className="mt-2 text-sm text-slate-600">Only unsold correction records can be soft-deleted. Sold/invoice-linked devices are blocked by the backend.</p><textarea value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} className="mt-4 min-h-24 w-full rounded-xl border p-3" placeholder="Required audit reason" /><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeleteDevice(null)} className="rounded-xl border px-4 py-2 font-bold">Cancel</button><button type="button" disabled={manageBusy || deleteReason.trim().length < 3} onClick={confirmDeviceDelete} className="rounded-xl bg-red-600 px-5 py-2 font-black text-white disabled:opacity-50">{manageBusy ? 'Deleting...' : 'Confirm Delete'}</button></div></div></div>
      ) : null}
    </div>
  );
}

export default function DeviceStockList(props) {
  return <DeviceStockListCore {...props} />;
}
