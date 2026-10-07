import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownUp,
  Boxes,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  History,
  PackageCheck,
  RefreshCw,
  ScanLine,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Truck,
  Wrench,
} from 'lucide-react';
import api from '../../services/api';
import inventoryService from '../../services/inventoryService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Database as NstHdrDatabase } from 'lucide-react';

const tabs = [
  ['overview', 'Overview', Boxes],
  ['branches', 'Branches', Building2],
  ['low-stock', 'Low Stock', AlertTriangle],
  ['movements', 'Movements', History],
  ['devices', 'Device Status', ScanLine],
  ['reconciliation', 'Reconciliation', ClipboardCheck],
];

const deviceStatuses = [
  'available', 'reserved', 'booked', 'returned', 'supplier_return', 'damaged',
  'warranty_claim', 'in_service', 'service_completed', 'transferred', 'lost', 'inactive',
];

const unwrapRows = (response) => {
  const payload = response?.data?.data ?? response?.data ?? [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const labelize = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const number = (value) => Number(value || 0).toLocaleString();
const money = (value) => `৳${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const field = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none transition focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]';
const primary = 'inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-black text-white shadow-lg shadow-[var(--nst-dashboard-shadow)] transition hover:bg-[var(--nst-dashboard-primary)] disabled:cursor-not-allowed disabled:opacity-50';
const secondary = 'inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] hover:text-[var(--nst-dashboard-primary)] disabled:opacity-50';

function StatCard({ label, value, icon: Icon, note, tone = 'violet' }) {
  const tones = {
    violet: 'bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)]',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    sky: 'bg-sky-100 text-sky-700',
    slate: 'bg-slate-100 text-slate-700',
  };
  return <article className="rounded-[1.7rem] border border-slate-100 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.14em] text-slate-400">{label}</p><p className="mt-3 text-3xl font-black text-slate-950">{value}</p>{note && <p className="mt-2 text-xs font-bold text-slate-500">{note}</p>}</div><span className={`rounded-2xl p-3 ${tones[tone] || tones.violet}`}><Icon size={22}/></span></div>
  </article>;
}

function Empty({ title, description }) {
  return <div className="rounded-[1.8rem] border border-dashed border-slate-200 bg-white p-12 text-center"><CheckCircle2 className="mx-auto text-slate-300" size={46}/><p className="mt-4 text-lg font-black text-slate-700">{title}</p><p className="mt-1 text-sm font-semibold text-slate-500">{description}</p></div>;
}

export default function InventoryControlCenter() {
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [branches, setBranches] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [movements, setMovements] = useState([]);
  const [reconciliation, setReconciliation] = useState({ summary: {}, issues: [], safe_fixable: 0 });
  const [devices, setDevices] = useState([]);
  const [branchOptions, setBranchOptions] = useState([]);
  const [deviceFilters, setDeviceFilters] = useState({ search: '', status: '', branch_id: '' });
  const [movementFilters, setMovementFilters] = useState({ search: '', type: '', branch_id: '' });
  const [deviceDrafts, setDeviceDrafts] = useState({});
  const [thresholdDrafts, setThresholdDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadCore = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [overviewResponse, branchesResponse, lowResponse, movementResponse, reconciliationResponse, branchResponse] = await Promise.all([
        inventoryService.overview(),
        inventoryService.branches(),
        inventoryService.lowStock(),
        inventoryService.movements({ per_page: 100 }),
        inventoryService.reconciliation(),
        api.get('/branches/all'),
      ]);
      setOverview(overviewResponse?.data?.data || null);
      setBranches(unwrapRows(branchesResponse));
      const lowRows = unwrapRows(lowResponse);
      setLowStock(lowRows);
      setThresholdDrafts(Object.fromEntries(lowRows.map((row) => [row.id, { alert_quantity: row.threshold ?? 0, shelf_location: row.shelf_location || '' }])));
      setMovements(unwrapRows(movementResponse));
      setReconciliation(reconciliationResponse?.data?.data || { summary: {}, issues: [], safe_fixable: 0 });
      setBranchOptions(unwrapRows(branchResponse));
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Inventory Control Center could not be loaded.');
    } finally { setLoading(false); }
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      const response = await api.get('/device-units', { params: { ...deviceFilters, per_page: 60 } });
      const rows = unwrapRows(response);
      setDevices(rows);
      setDeviceDrafts((current) => {
        const next = { ...current };
        rows.forEach((row) => { if (!next[row.id]) next[row.id] = { status: row.status || 'available', branch_id: row.branch_id || '' }; });
        return next;
      });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Device stock could not be loaded.');
    }
  }, [deviceFilters]);

  const loadMovements = useCallback(async () => {
    try {
      const response = await inventoryService.movements({ ...movementFilters, per_page: 100 });
      setMovements(unwrapRows(response));
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Stock movements could not be loaded.');
    }
  }, [movementFilters]);

  useEffect(() => { void loadCore(); }, [loadCore]);
  useEffect(() => { if (activeTab === 'devices') void loadDevices(); }, [activeTab, loadDevices]);

  const summary = overview?.summary || {};
  const issueSummary = reconciliation?.summary || {};
  const highRiskCount = Number(issueSummary.critical || 0) + Number(issueSummary.high || 0);

  const runReconciliation = async (mode) => {
    if (mode === 'apply_safe_fixes' && !window.confirm('Apply only the safe reconciliation fixes? Quantity drift and duplicate IMEI issues will remain manual.')) return;
    setSaving(`reconcile-${mode}`); setMessage(''); setError('');
    try {
      const response = await inventoryService.reconcile({ mode, note: mode === 'dry_run' ? 'Inventory Control Center dry run' : 'Super Admin approved safe fixes' });
      const data = response?.data?.data || {};
      setMessage(mode === 'dry_run' ? `Dry run completed: ${data.issues_found || 0} issue(s) found.` : `Safe reconciliation complete: ${data.issues_fixed || 0} issue(s) fixed.`);
      await loadCore();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Reconciliation failed.');
    } finally { setSaving(''); }
  };

  const saveThreshold = async (row) => {
    const draft = thresholdDrafts[row.id] || {};
    const note = window.prompt('Reason / audit note for threshold update:', 'Inventory threshold review');
    if (!note) return;
    setSaving(`threshold-${row.id}`); setMessage(''); setError('');
    try {
      await inventoryService.updateThreshold(row.id, { alert_quantity: Number(draft.alert_quantity || 0), shelf_location: draft.shelf_location || null, note });
      setMessage(`${row.product_name} threshold updated.`);
      await loadCore();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Threshold update failed.');
    } finally { setSaving(''); }
  };

  const saveDeviceStatus = async (device) => {
    const draft = deviceDrafts[device.id] || {};
    const note = window.prompt(`Audit note for ${device.imei_1 || device.barcode || device.sku}:`);
    if (!note) return;
    setSaving(`device-${device.id}`); setMessage(''); setError('');
    try {
      await inventoryService.updateDeviceStatus(device.id, {
        status: draft.status,
        branch_id: draft.branch_id ? Number(draft.branch_id) : null,
        note,
      });
      setMessage('Device status and inventory balances updated.');
      await Promise.all([loadDevices(), loadCore()]);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Device status update failed.');
    } finally { setSaving(''); }
  };

  const quickLinks = [
    ['/device-stock', 'Device Stock', PackageCheck],
    ['/device-history', 'Device History', History],
    ['/branch-stock-requests', 'Stock Transfer', Truck],
    ['/stock-adjustments', 'Stock Adjustment', ArrowDownUp],
    ['/settings/barcode-tools', 'Barcode Tools', ScanLine],
    ['/warranty-service', 'Service Queue', Wrench],
  ];

  const filteredIssues = useMemo(() => reconciliation?.issues || [], [reconciliation]);

  return <div className="min-h-screen bg-slate-50 p-4 md:p-7">
    <div className="mx-auto max-w-[1650px] space-y-5">
      <NstPageHeader icon={NstHdrDatabase} title={<>Inventory Control Center</>} subtitle={<>One live workspace for branch balances, IMEI/device status, transfer pipeline, low-stock alerts, movement audit and reconciliation.</>} actions={<><button onClick={loadCore} disabled={loading} className={primary}><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/>Refresh Inventory</button></>}/><div className="mb-4 flex flex-wrap gap-2">{tabs.map(([id, label, Icon]) => <button key={id} onClick={() => setActiveTab(id)} aria-current={activeTab === id ? 'page' : undefined} aria-selected={activeTab === id} className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-black transition ${activeTab === id ? 'border-[var(--nst-dashboard-primary)] text-[var(--nst-dashboard-primary)]' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900'}`}><Icon size={16}/>{label}</button>)}</div>

      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-700">{message}</div>}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700">{error}</div>}

      {activeTab === 'overview' && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          <StatCard label="Available Stock" value={number(summary.available_quantity)} icon={Boxes} tone="emerald" note={`${number(summary.reserved_quantity)} reserved`}/>
          <StatCard label="Serialized Devices" value={number(summary.device_units)} icon={ScanLine} tone="violet" note={`${number(summary.available_devices)} available`}/>
          <StatCard label="Low Stock" value={number(summary.low_stock_rows)} icon={AlertTriangle} tone="amber" note="At or below branch threshold"/>
          <StatCard label="Transfer Pipeline" value={number(Number(summary.pending_transfers || 0) + Number(summary.in_transit_transfers || 0))} icon={Truck} tone="sky" note={`${number(summary.in_transit_transfers)} in transit`}/>
          <StatCard label="Service / Damaged" value={number(Number(summary.service_devices || 0) + Number(summary.damaged_devices || 0))} icon={Wrench} tone="rose" note={`${number(summary.lost_devices)} lost`}/>
          <StatCard label="Reconciliation" value={number(summary.reconciliation_issues)} icon={ShieldAlert} tone={summary.reconciliation_issues ? 'rose' : 'emerald'} note={summary.reconciliation_issues ? 'Review required' : 'No detected issue'}/>
        </div>
        {summary.can_see_purchase_cost && <div className="grid gap-4 md:grid-cols-2"><StatCard label="Available Serialized Stock Value" value={money(summary.available_stock_value)} icon={PackageCheck} tone="violet" note="Purchase-cost visibility follows role permissions"/><StatCard label="Branch Stock Rows" value={number(summary.branch_stock_rows)} icon={Building2} tone="slate" note={`${number(summary.total_quantity)} total quantity`}/></div>}
        <section className="rounded-[1.8rem] border border-slate-100 bg-white p-5 shadow-sm"><h2 className="text-lg font-black text-slate-950">Inventory Workspaces</h2><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{quickLinks.map(([to, label, Icon]) => <Link key={to} to={to} className="group inline-flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 transition hover:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] hover:bg-emerald-50"><Icon size={18} className="shrink-0 text-[var(--nst-dashboard-primary)]"/><p className="truncate text-sm font-black text-slate-800">{label}</p></Link>)}</div></section>
        <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
          <section className="rounded-[1.8rem] border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-lg font-black">Branch Inventory</h2><p className="text-xs font-bold text-slate-500">Live branch allocation and serialized device count.</p></div><button onClick={() => setActiveTab('branches')} className={secondary}>View All</button></div><div className="mt-4 grid gap-3 md:grid-cols-2">{branches.slice(0, 6).map((row) => <article key={row.branch_id} className="rounded-2xl bg-slate-50 p-4"><div className="flex justify-between"><div><p className="font-black">{row.branch_name}</p><p className="text-xs font-bold text-slate-500">{row.branch_code || 'No code'}</p></div><span className="rounded-xl bg-white px-3 py-2 text-xs font-black">{number(row.available_quantity)} available</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-500"><div><b className="block text-base text-slate-900">{number(row.quantity)}</b>Total</div><div><b className="block text-base text-amber-600">{number(row.low_stock_rows)}</b>Low</div><div><b className="block text-base text-[var(--nst-dashboard-primary)]">{number(row.serialized_devices)}</b>IMEI</div></div></article>)}</div></section>
          <section className="rounded-[1.8rem] border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-lg font-black">Reconciliation Health</h2><p className="text-xs font-bold text-slate-500">Critical and high-risk inventory integrity checks.</p></div><button onClick={() => setActiveTab('reconciliation')} className={secondary}>Review</button></div><div className="mt-5 grid grid-cols-3 gap-3 text-center"><div className="rounded-2xl bg-rose-50 p-4"><p className="text-2xl font-black text-rose-700">{number(issueSummary.critical)}</p><p className="text-xs font-black text-rose-500">Critical</p></div><div className="rounded-2xl bg-amber-50 p-4"><p className="text-2xl font-black text-amber-700">{number(issueSummary.high)}</p><p className="text-xs font-black text-amber-500">High</p></div><div className="rounded-2xl bg-slate-100 p-4"><p className="text-2xl font-black text-slate-700">{number(issueSummary.medium)}</p><p className="text-xs font-black text-slate-500">Medium</p></div></div><button onClick={() => runReconciliation('dry_run')} disabled={saving === 'reconcile-dry_run'} className={`${primary} mt-5 w-full`}><ClipboardCheck size={17}/>{saving === 'reconcile-dry_run' ? 'Checking…' : 'Run Fresh Dry Check'}</button></section>
        </div>
      </>}

      {activeTab === 'branches' && <section className="overflow-hidden rounded-[1.8rem] border border-slate-100 bg-white shadow-sm"><div className="overflow-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr>{['Branch','Total','Reserved','Available','Low Stock','Serialized','Available IMEI','Service'].map((title) => <th key={title} className="p-4">{title}</th>)}</tr></thead><tbody>{branches.map((row) => <tr key={row.branch_id} className="border-t border-slate-100"><td className="p-4"><p className="font-black text-slate-900">{row.branch_name}</p><p className="text-xs font-bold text-slate-500">{row.branch_code || 'No branch code'}</p></td><td className="p-4 font-black">{number(row.quantity)}</td><td className="p-4 text-amber-700">{number(row.reserved_quantity)}</td><td className="p-4 text-emerald-700 font-black">{number(row.available_quantity)}</td><td className="p-4"><span className={`rounded-xl px-3 py-2 text-xs font-black ${row.low_stock_rows ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{number(row.low_stock_rows)}</span></td><td className="p-4">{number(row.serialized_devices)}</td><td className="p-4">{number(row.available_devices)}</td><td className="p-4">{number(row.service_devices)}</td></tr>)}</tbody></table></div>{!loading && branches.length === 0 && <Empty title="No branch stock found" description="Receive purchase stock or assign products to a branch first."/>}</section>}

      {activeTab === 'low-stock' && <section className="overflow-hidden rounded-[1.8rem] border border-slate-100 bg-white shadow-sm"><div className="p-5"><h2 className="text-xl font-black">Low-stock Threshold Desk</h2><p className="mt-1 text-sm font-semibold text-slate-500">Update branch alert quantity and shelf location with an audit note.</p></div><div className="overflow-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{['Branch','Product','Available','Reserved','Threshold','Shelf','Action'].map((title) => <th key={title} className="p-4">{title}</th>)}</tr></thead><tbody>{lowStock.map((row) => { const draft = thresholdDrafts[row.id] || {}; return <tr key={row.id} className="border-t"><td className="p-4 font-black">{row.branch_name}</td><td className="p-4"><p className="font-black">{row.product_name}</p><p className="text-xs font-bold text-slate-500">{row.variant_name || 'Base product'} · {row.sku || 'No SKU'}</p></td><td className="p-4"><span className="rounded-xl bg-amber-100 px-3 py-2 font-black text-amber-700">{number(row.available_quantity)}</span></td><td className="p-4">{number(row.reserved_quantity)}</td><td className="p-4"><input type="number" min="0" className="w-24 rounded-xl border p-2 font-black" value={draft.alert_quantity ?? 0} onChange={(event) => setThresholdDrafts((old) => ({ ...old, [row.id]: { ...draft, alert_quantity: event.target.value } }))}/></td><td className="p-4"><input className="w-36 rounded-xl border p-2" value={draft.shelf_location || ''} onChange={(event) => setThresholdDrafts((old) => ({ ...old, [row.id]: { ...draft, shelf_location: event.target.value } }))} placeholder="Shelf / rack"/></td><td className="p-4"><button disabled={saving === `threshold-${row.id}`} onClick={() => saveThreshold(row)} className={secondary}>{saving === `threshold-${row.id}` ? 'Saving…' : 'Save'}</button></td></tr>; })}</tbody></table></div>{!loading && lowStock.length === 0 && <Empty title="No low-stock alert" description="Every branch item is above its configured threshold."/>}</section>}

      {activeTab === 'movements' && <section className="space-y-4"><div className="grid gap-3 rounded-[1.8rem] bg-white p-5 shadow-sm md:grid-cols-4"><div className="relative md:col-span-2"><Search className="absolute left-4 top-3.5 text-slate-400" size={18}/><input className={`${field} pl-11`} value={movementFilters.search} onChange={(event) => setMovementFilters({ ...movementFilters, search: event.target.value })} placeholder="Movement no, product, SKU or note"/></div><select className={field} value={movementFilters.branch_id} onChange={(event) => setMovementFilters({ ...movementFilters, branch_id: event.target.value })}><option value="">All branches</option>{branchOptions.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><button onClick={loadMovements} className={primary}><SlidersHorizontal size={17}/>Apply Filters</button></div><div className="overflow-hidden rounded-[1.8rem] bg-white shadow-sm"><div className="overflow-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{['Movement','Time','Branch','Product','Type','Change','Before → After','Reference','Note'].map((title) => <th key={title} className="p-4">{title}</th>)}</tr></thead><tbody>{movements.map((row) => <tr key={row.id} className="border-t"><td className="p-4 font-black text-[var(--nst-dashboard-primary)]">{row.movement_no || `#${row.id}`}</td><td className="p-4 whitespace-nowrap">{row.movement_at ? new Date(row.movement_at).toLocaleString() : '-'}</td><td className="p-4">{row.branch_name || 'Prime Stock'}</td><td className="p-4 font-bold">{row.product_name || '-'}</td><td className="p-4"><span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black">{labelize(row.type || row.movement_type)}</span></td><td className={`p-4 font-black ${Number(row.quantity_change) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{Number(row.quantity_change) >= 0 ? '+' : ''}{number(row.quantity_change)}</td><td className="p-4">{number(row.quantity_before)} → {number(row.quantity_after)}</td><td className="p-4 text-xs font-bold">{labelize(row.reference_type)} {row.reference_id ? `#${row.reference_id}` : ''}</td><td className="max-w-sm p-4 text-xs font-semibold text-slate-500">{row.note || '-'}</td></tr>)}</tbody></table></div>{movements.length === 0 && <Empty title="No movement found" description="Change filters or create an inventory transaction."/>}</div></section>}

      {activeTab === 'devices' && <section className="space-y-4"><div className="grid gap-3 rounded-[1.8rem] bg-white p-5 shadow-sm md:grid-cols-4"><div className="relative md:col-span-2"><Search className="absolute left-4 top-3.5 text-slate-400" size={18}/><input className={`${field} pl-11`} value={deviceFilters.search} onChange={(event) => setDeviceFilters({ ...deviceFilters, search: event.target.value })} placeholder="IMEI, barcode, SKU or product"/></div><select className={field} value={deviceFilters.status} onChange={(event) => setDeviceFilters({ ...deviceFilters, status: event.target.value })}><option value="">All statuses</option>{deviceStatuses.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}</select><button onClick={loadDevices} className={primary}><Search size={17}/>Search Devices</button></div><div className="overflow-hidden rounded-[1.8rem] bg-white shadow-sm"><div className="overflow-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{['Device','Product','Current Branch','Current Status','New Status','New Branch','Action'].map((title) => <th key={title} className="p-4">{title}</th>)}</tr></thead><tbody>{devices.map((device) => { const draft = deviceDrafts[device.id] || {}; return <tr key={device.id} className="border-t"><td className="p-4"><p className="font-black text-slate-900">{device.imei_1 || device.barcode || device.sku}</p><p className="text-xs font-bold text-slate-500">IMEI2: {device.imei_2 || '-'} · Barcode: {device.barcode || '-'}</p></td><td className="p-4"><p className="font-bold">{device.display_product_name || device.product_name || device.product_db_name || '-'}</p><p className="text-xs text-slate-500">{device.variant_display || device.variant_variant_name || '-'}</p></td><td className="p-4">{device.branch_name || 'Prime Stock'}</td><td className="p-4"><span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black">{labelize(device.status)}</span></td><td className="p-4"><select className="min-w-40 rounded-xl border p-2 font-bold" value={draft.status || device.status || 'available'} onChange={(event) => setDeviceDrafts((old) => ({ ...old, [device.id]: { ...draft, status: event.target.value } }))}>{deviceStatuses.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}</select></td><td className="p-4"><select className="min-w-40 rounded-xl border p-2" value={draft.branch_id ?? device.branch_id ?? ''} onChange={(event) => setDeviceDrafts((old) => ({ ...old, [device.id]: { ...draft, branch_id: event.target.value } }))}><option value="">Prime Stock</option>{branchOptions.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></td><td className="p-4"><button disabled={saving === `device-${device.id}`} onClick={() => saveDeviceStatus(device)} className={secondary}>{saving === `device-${device.id}` ? 'Updating…' : 'Update'}</button></td></tr>; })}</tbody></table></div>{devices.length === 0 && <Empty title="No device found" description="Search by exact IMEI, barcode, SKU, product or status."/>}</div></section>}

      {activeTab === 'reconciliation' && <section className="space-y-5"><div className="grid gap-4 md:grid-cols-4"><StatCard label="All Issues" value={number(issueSummary.total)} icon={ClipboardCheck} tone="slate"/><StatCard label="Critical" value={number(issueSummary.critical)} icon={ShieldAlert} tone="rose"/><StatCard label="High" value={number(issueSummary.high)} icon={AlertTriangle} tone="amber"/><StatCard label="Safe Fixable" value={number(reconciliation.safe_fixable)} icon={CheckCircle2} tone="emerald"/></div><div className="flex flex-wrap gap-3 rounded-[1.8rem] bg-white p-5 shadow-sm"><button onClick={() => runReconciliation('dry_run')} disabled={Boolean(saving)} className={secondary}><ClipboardCheck size={17}/>Run Dry Check</button><button onClick={() => runReconciliation('apply_safe_fixes')} disabled={Boolean(saving) || !reconciliation.safe_fixable} className={primary}><CheckCircle2 size={17}/>Apply Safe Fixes</button><p className="w-full text-xs font-bold text-slate-500">Safe fixes only correct reserved quantity overflow, invalid stock status and negative threshold. Serialized stock drift, orphan device and duplicate active IMEI remain manual to prevent destructive changes.</p></div><div className="grid gap-3">{filteredIssues.map((issue, index) => <article key={`${issue.type}-${issue.branch_stock_id || issue.device_unit_id || issue.imei || index}`} className="rounded-[1.6rem] border border-slate-100 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-xl px-3 py-2 text-xs font-black uppercase ${issue.severity === 'critical' ? 'bg-rose-100 text-rose-700' : issue.severity === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>{issue.severity}</span><span className="text-xs font-black uppercase tracking-wide text-[var(--nst-dashboard-primary)]">{labelize(issue.type)}</span></div><p className="mt-3 font-black text-slate-900">{issue.message}</p><p className="mt-1 text-sm font-semibold text-slate-500">{issue.branch_name || 'Prime / global'} · {issue.product_name || issue.imei || issue.barcode || 'Inventory record'}{issue.variant_name ? ` · ${issue.variant_name}` : ''}</p></div><div className="text-right text-xs font-bold text-slate-500">{issue.quantity !== undefined && <p>Quantity: {number(issue.quantity)} · Reserved: {number(issue.reserved_quantity)}</p>}{issue.serialized_count !== undefined && <p>Serialized: {number(issue.serialized_count)} · Difference: {number(issue.difference)}</p>}</div></div></article>)}{!loading && filteredIssues.length === 0 && <Empty title="Inventory integrity is clean" description="No negative stock, duplicate active IMEI, serialized drift or reservation overflow was detected."/>}</div></section>}
    </div>
  </div>;
}
