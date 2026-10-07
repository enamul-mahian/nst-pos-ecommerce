import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  AlertTriangle, Banknote, Bell, CheckCircle2, ClipboardList, FolderOpen, Loader2, MessageSquare, Receipt, RotateCcw,
  Smartphone, Tags, Truck, Wallet,
} from 'lucide-react';

import { apiClient, handleApiError } from '../../api/client';
import { useSupplierAuthStore } from '../../store/supplier/useSupplierAuthStore';
import { EmptyState, LineChart, LoadingBlock, PageHeading, Panel, RecordList, StatCard, StatusBadge, Tabs, type Column } from '../../components/portal/PortalUI';
import { SUPPLIER_HEADERS, humanize, shortDate, taka, usePortalData } from '../../components/portal/portalUtils';

const title = (text: string) => <Helmet><title>{`${text} | NST Supplier`}</title></Helmet>;
const useSupplierData = (endpoint: string) => usePortalData(endpoint, { supplier: true });

const poAmount = (po: any) => Number(po?.total ?? po?.total_amount ?? po?.grand_total ?? 0);
const poStatus = (po: any) => String(po?.status || 'draft').toLowerCase();
const isPending = (po: any) => /(draft|pending|sent|submitted|new)/.test(poStatus(po));
const isAccepted = (po: any) => /(accept|approv|confirm)/.test(poStatus(po));
const isDelivery = (po: any) => /(deliver|ship|transit|dispatch)/.test(poStatus(po));
const purchaseAmount = (p: any) => Number(p?.grand_total ?? p?.final_amount ?? p?.total_amount ?? p?.net_amount ?? p?.total ?? 0);

const poColumns: Column[] = [
  { key: 'po_number', label: 'PO Number', primary: true, render: (r) => <span className="font-semibold text-slate-900">PO #{r.po_number || r.id}</span> },
  { key: 'total', label: 'Amount', render: (r) => taka(poAmount(r)) },
  { key: 'items_count', label: 'Items', render: (r) => r.items_count ?? r.items?.length ?? '-' },
  { key: 'expected_delivery_at', label: 'Expected Delivery', render: (r) => shortDate(r.expected_delivery_at) },
  { key: 'created_at', label: 'Date', render: (r) => shortDate(r.created_at) },
  { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status || 'draft'} /> },
];

/* ============================== Dashboard ============================== */

export function SupplierDashboard() {
  const dashboard = useSupplierData('/supplier-portal/dashboard');
  const orders = useSupplierData('/supplier-portal/purchase-orders');
  const payments = useSupplierData('/supplier-portal/payments');
  const prices = useSupplierData('/supplier-portal/price-submissions');
  const summary = dashboard.payload?.data?.summary || {};
  const pos = orders.rows.length ? orders.rows : (dashboard.payload?.data?.recent_orders || []);

  const chart = useMemo(() => {
    const byDay = new Map<string, { label: string; value: number; t: number }>();
    pos.forEach((po: any) => {
      const d = new Date(po.created_at);
      if (Number.isNaN(d.getTime())) return;
      const key = d.toISOString().slice(0, 10);
      const entry = byDay.get(key) || { label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), value: 0, t: d.getTime() };
      entry.value += poAmount(po);
      byDay.set(key, entry);
    });
    return [...byDay.values()].sort((a, b) => a.t - b.t).slice(-6);
  }, [pos]);

  const notifications = useMemo(() => [
    ...pos.map((po: any) => ({ id: `po${po.id}`, icon: ClipboardList, at: po.updated_at || po.created_at, text: `Your PO #${po.po_number || po.id} is ${humanize(po.status).toLowerCase()}.` })),
    ...payments.rows.map((p: any) => ({ id: `pay${p.id}`, icon: Banknote, at: p.created_at, text: `Payment of ${taka(p.amount)} completed.` })),
  ].filter((n) => n.at).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 3), [pos, payments.rows]);

  if (dashboard.isLoading) return <LoadingBlock />;

  return (
    <div className="space-y-4 sm:space-y-5">
      {title('Dashboard')}
      {dashboard.error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{dashboard.error}</p>}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={Receipt} label="Total Supplied" value={taka(summary.purchase_total)} to="/supplier/invoices" />
        <StatCard icon={ClipboardList} label="Pending POs" value={summary.open_purchase_orders ?? pos.filter(isPending).length} tone="amber" to="/supplier/new-orders" />
        <StatCard icon={CheckCircle2} label="Accepted Orders" value={pos.filter(isAccepted).length} tone="green" to="/supplier/confirmations" />
        <StatCard icon={Truck} label="Pending Delivery" value={pos.filter(isDelivery).length} tone="blue" to="/supplier/delivery" />
        <StatCard icon={Wallet} label="Total Paid" value={taka(summary.payment_total)} tone="green" to="/supplier/payments" />
        <StatCard icon={Banknote} label="Current Due" value={taka(summary.current_balance)} tone="red" to="/supplier/ledger" />
        <StatCard icon={Tags} label="Active Price Listings" value={prices.rows.filter((p) => p.availability_status !== 'out_of_stock').length} tone="amber" to="/supplier/prices" />
        <StatCard icon={Smartphone} label="Used Supplied" value={summary.used_devices ?? 0} tone="violet" to="/supplier/used-devices" />
        <StatCard icon={AlertTriangle} label="Return / Disputes" value={0} tone="red" to="/supplier/returns" />
      </div>

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-2">
        <Panel title="Purchase Orders Overview" action={{ label: 'View All', to: '/supplier/purchase-orders' }}>
          {pos.length === 0 ? <EmptyState title="No purchase orders yet" icon={ClipboardList} /> : (
            <ul className="divide-y divide-slate-100">
              {pos.slice(0, 4).map((po: any) => (
                <li key={po.id} className="grid grid-cols-2 items-center gap-2 py-3 text-sm sm:grid-cols-4">
                  <span className="font-semibold text-slate-800">PO #{po.po_number || po.id}</span>
                  <span className="text-right sm:text-left"><span className="block text-[11px] text-slate-500">Amount</span>{taka(poAmount(po))}</span>
                  <span><span className="block text-[11px] text-slate-500">Status</span><StatusBadge status={po.status} /></span>
                  <span className="text-right"><span className="block text-[11px] text-slate-500">Date</span>{shortDate(po.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Supply Summary" right={<span className="text-xs text-slate-500">Recent orders</span>}>
          <LineChart points={chart} format={(v) => (v >= 1000 ? `${Math.round(v / 1000)}K` : String(Math.round(v)))} />
        </Panel>

        <Panel title="Recent Payments" action={{ label: 'View All', to: '/supplier/payments' }}>
          {payments.isLoading ? <LoadingBlock /> : payments.rows.length === 0 ? <EmptyState title="No payments yet" icon={Banknote} /> : (
            <ul className="divide-y divide-slate-100">
              {payments.rows.slice(0, 3).map((p: any) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span className="min-w-0 font-medium text-slate-800">Payment #{p.payment_no || p.transaction_id || p.id}</span>
                  <span className="flex items-center gap-3 sm:gap-6">
                    <span className="font-semibold">{taka(p.amount)}</span>
                    <span className="hidden text-xs text-slate-500 sm:inline">{shortDate(p.created_at)}</span>
                    <StatusBadge status={p.status || 'paid'} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Latest Notifications" action={{ label: 'View All', to: '/supplier/notifications' }}>
          {notifications.length === 0 ? <EmptyState title="You're all caught up" icon={Bell} /> : (
            <ul className="space-y-3">
              {notifications.map((n) => (
                <li key={n.id} className="flex gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700"><n.icon className="h-4 w-4" /></span>
                  <span className="min-w-0"><span className="block text-sm text-slate-800">{n.text}</span><span className="text-xs text-slate-500">{shortDate(n.at)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ============================== Purchase orders ============================== */

const PO_TABS: Record<string, (po: any) => boolean> = {
  All: () => true,
  Pending: isPending,
  Accepted: isAccepted,
  Delivery: isDelivery,
  Received: (po) => /receiv|complete/.test(poStatus(po)),
  Cancelled: (po) => /cancel|reject/.test(poStatus(po)),
};

function PurchaseOrderList({ heading, subtitle, filter, tabs }: { heading: string; subtitle?: string; filter?: (po: any) => boolean; tabs?: boolean }) {
  const data = useSupplierData('/supplier-portal/purchase-orders');
  const [tab, setTab] = useState('All');
  const rows = data.rows.filter((po) => (filter ? filter(po) : true) && PO_TABS[tab](po));
  return (
    <>
      {title(heading)}
      <PageHeading title={heading} subtitle={subtitle} />
      <Panel title={`${rows.length} order${rows.length === 1 ? '' : 's'}`}>
        {tabs && <Tabs tabs={Object.keys(PO_TABS)} active={tab} onChange={setTab} />}
        <RecordList isLoading={data.isLoading} error={data.error} rows={rows} columns={poColumns} empty="No purchase orders here" />
      </Panel>
    </>
  );
}

export const SupplierPurchaseOrders = () => <PurchaseOrderList heading="Purchase Orders" subtitle="Every PO NST has issued to you." tabs />;
export const SupplierNewOrders = () => <PurchaseOrderList heading="New Supply Orders" subtitle="Orders waiting for your confirmation." filter={isPending} />;
export const SupplierConfirmations = () => <PurchaseOrderList heading="Order Confirmations" subtitle="Orders you and NST have confirmed." filter={isAccepted} />;
export const SupplierDelivery = () => <PurchaseOrderList heading="Delivery Status" subtitle="Orders on the way or awaiting delivery." filter={(po) => isDelivery(po) || isAccepted(po) || /receiv/.test(poStatus(po))} />;

/* ============================== Simple lists ============================== */

export function SupplierUsedDevices() {
  const data = useSupplierData('/supplier-portal/used-devices');
  return (
    <>
      {title('Used Devices Supplied')}
      <PageHeading title="Used Devices Supplied" />
      <Panel title="Devices">
        <RecordList isLoading={data.isLoading} error={data.error} rows={data.rows} empty="No used devices supplied yet" columns={[
          { key: 'product_name', label: 'Device', primary: true, render: (r) => r.product_name || [r.brand, r.model].filter(Boolean).join(' ') || '-' },
          { key: 'purchase_no', label: 'Reference', render: (r) => r.purchase_no || `#${r.id}` },
          { key: 'imei_1', label: 'IMEI', render: (r) => r.imei_1 || '-' },
          { key: 'purchase_price', label: 'Price', render: (r) => taka(r.purchase_price) },
          { key: 'created_at', label: 'Date', render: (r) => shortDate(r.created_at) },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status || 'received'} /> },
        ]} />
      </Panel>
    </>
  );
}

export function SupplierInvoices() {
  const data = useSupplierData('/supplier-portal/purchases');
  return (
    <>
      {title('Invoices')}
      <PageHeading title="Invoices" subtitle="Purchases NST has recorded against your supplies." />
      <Panel title="Supply invoices">
        <RecordList isLoading={data.isLoading} error={data.error} rows={data.rows} empty="No invoices yet" columns={[
          { key: 'purchase_no', label: 'Invoice', primary: true, render: (r) => r.invoice_no || r.purchase_no || r.purchase_number || `#${r.id}` },
          { key: 'purchase_date', label: 'Date', render: (r) => shortDate(r.purchase_date || r.created_at) },
          { key: 'amount', label: 'Amount', render: (r) => taka(purchaseAmount(r)) },
          { key: 'paid_amount', label: 'Paid', render: (r) => taka(r.paid_amount ?? r.total_paid) },
          { key: 'due_amount', label: 'Due', render: (r) => taka(r.due_amount ?? Math.max(0, purchaseAmount(r) - Number(r.paid_amount ?? r.total_paid ?? 0))) },
          { key: 'payment_status', label: 'Status', render: (r) => <StatusBadge status={r.payment_status || r.status || 'recorded'} /> },
        ]} />
      </Panel>
    </>
  );
}

export function SupplierPayments() {
  const data = useSupplierData('/supplier-portal/payments');
  return (
    <>
      {title('Payments')}
      <PageHeading title="Payments" />
      <Panel title="Payments received from NST">
        <RecordList isLoading={data.isLoading} error={data.error} rows={data.rows} empty="No payments yet" columns={[
          { key: 'id', label: 'Payment', primary: true, render: (r) => `Payment #${r.payment_no || r.transaction_id || r.id}` },
          { key: 'amount', label: 'Amount', render: (r) => taka(r.amount) },
          { key: 'payment_method', label: 'Method', render: (r) => humanize(r.payment_method || 'cash') },
          { key: 'created_at', label: 'Date', render: (r) => shortDate(r.created_at) },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status || 'paid'} /> },
        ]} />
      </Panel>
    </>
  );
}

export function SupplierLedger() {
  const purchases = useSupplierData('/supplier-portal/purchases');
  const payments = useSupplierData('/supplier-portal/payments');
  const rows = useMemo(() => {
    const entries = [
      ...purchases.rows.map((p) => ({ id: `p${p.id}`, at: p.purchase_date || p.created_at, ref: p.invoice_no || p.purchase_no || `Purchase #${p.id}`, type: 'Supply', credit: purchaseAmount(p), debit: 0 })),
      ...payments.rows.map((p) => ({ id: `m${p.id}`, at: p.created_at, ref: `Payment #${p.payment_no || p.transaction_id || p.id}`, type: 'Payment', credit: 0, debit: Number(p.amount) || 0 })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    let balance = 0;
    return entries.map((e) => ({ ...e, balance: (balance += e.credit - e.debit) })).reverse();
  }, [purchases.rows, payments.rows]);
  return (
    <>
      {title('Ledger')}
      <PageHeading title="Ledger" subtitle="Supplies (credit) and NST payments (debit) with running balance." />
      <Panel title="Statement">
        <RecordList isLoading={purchases.isLoading || payments.isLoading} error={purchases.error || payments.error} rows={rows} empty="No ledger entries yet" columns={[
          { key: 'ref', label: 'Reference', primary: true },
          { key: 'at', label: 'Date', render: (r) => shortDate(r.at) },
          { key: 'type', label: 'Type' },
          { key: 'credit', label: 'Credit', render: (r) => (r.credit ? taka(r.credit) : '-') },
          { key: 'debit', label: 'Debit', render: (r) => (r.debit ? taka(r.debit) : '-') },
          { key: 'balance', label: 'Balance', render: (r) => <span className="font-semibold">{taka(r.balance)}</span> },
        ]} />
      </Panel>
    </>
  );
}

/* ============================== Prices ============================== */

const PRICE_FIELDS: [string, string, string][] = [
  ['product_name', 'Product name', 'text'], ['variant_name', 'Variant', 'text'], ['unit_price', 'Unit price (৳)', 'number'],
  ['available_quantity', 'Available quantity', 'number'], ['minimum_order_quantity', 'Minimum order', 'number'], ['warranty', 'Warranty', 'text'],
  ['delivery_cost', 'Delivery cost (৳)', 'number'], ['delivery_days', 'Delivery days', 'number'], ['valid_until', 'Valid until', 'date'],
];

const priceColumns: Column[] = [
  { key: 'product_name', label: 'Product', primary: true, render: (r) => [r.product_name, r.variant_name].filter(Boolean).join(' · ') },
  { key: 'unit_price', label: 'Unit Price', render: (r) => taka(r.unit_price) },
  { key: 'available_quantity', label: 'Qty', render: (r) => r.available_quantity ?? '-' },
  { key: 'valid_until', label: 'Valid Until', render: (r) => shortDate(r.valid_until) },
  { key: 'availability_status', label: 'Availability', render: (r) => humanize(r.availability_status) },
  { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status || 'submitted'} /> },
];

export function SupplierPrices() {
  const [form, setForm] = useState<Record<string, any>>({ product_name: '', variant_name: '', unit_price: '', available_quantity: 0, minimum_order_quantity: 1, availability_status: 'available' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reload, setReload] = useState(0);
  const list = useSupplierData(`/supplier-portal/price-submissions?r=${reload}`);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await apiClient.post('/supplier-portal/price-submissions', form, { headers: SUPPLIER_HEADERS });
      setMsg({ ok: true, text: 'Price submitted for comparison.' });
      setReload((n) => n + 1);
    } catch (err) {
      setMsg({ ok: false, text: handleApiError(err).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {title('Product & Price List')}
      <PageHeading title="Product & Price List" subtitle="NST compares price, warranty, availability, delivery and reliability before ordering." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Panel title="Submit today's price">
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {PRICE_FIELDS.map(([key, label, type]) => (
              <label key={key} className="text-sm font-medium text-slate-700">{label}
                <input required={key === 'product_name' || key === 'unit_price'} type={type} min={type === 'number' ? 0 : undefined} value={form[key] ?? ''}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 sm:text-sm" />
              </label>
            ))}
            <label className="text-sm font-medium text-slate-700">Availability
              <select value={form.availability_status} onChange={(e) => setForm({ ...form, availability_status: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-violet-500 sm:text-sm">
                {['available', 'limited', 'out_of_stock', 'preorder'].map((v) => <option key={v} value={v}>{humanize(v)}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2 xl:col-span-1">
              <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60 sm:w-auto">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}Submit Price
              </button>
              {msg && <p className={`mt-3 text-sm ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.text}</p>}
            </div>
          </form>
        </Panel>
        <Panel title="My price submissions">
          <RecordList isLoading={list.isLoading} error={list.error} rows={list.rows} columns={priceColumns} empty="No prices submitted yet" />
        </Panel>
      </div>
    </>
  );
}

export function SupplierPriceRequests() {
  const list = useSupplierData('/supplier-portal/price-submissions');
  return (
    <>
      {title('Price Comparison Requests')}
      <PageHeading title="Price Comparison Requests" subtitle="Where each of your submitted prices stands in NST's comparison." right={<Link to="/supplier/prices" className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800">Submit Price</Link>} />
      <Panel title="Comparison status">
        <RecordList isLoading={list.isLoading} error={list.error} rows={list.rows} columns={priceColumns} empty="No comparison requests yet" />
      </Panel>
    </>
  );
}

/* ============================== Notifications / profile / placeholders ============================== */

export function SupplierNotifications() {
  const orders = useSupplierData('/supplier-portal/purchase-orders');
  const payments = useSupplierData('/supplier-portal/payments');
  const items = [
    ...orders.rows.map((po: any) => ({ id: `po${po.id}`, icon: ClipboardList, at: po.updated_at || po.created_at, text: `Your PO #${po.po_number || po.id} is ${humanize(po.status).toLowerCase()}.` })),
    ...payments.rows.map((p: any) => ({ id: `pay${p.id}`, icon: Banknote, at: p.created_at, text: `Payment of ${taka(p.amount)} completed.` })),
  ].filter((n) => n.at).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return (
    <>
      {title('Notifications')}
      <PageHeading title="Notifications" />
      <Panel title="Latest updates">
        {orders.isLoading || payments.isLoading ? <LoadingBlock /> : items.length === 0 ? <EmptyState title="You're all caught up" icon={Bell} /> : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => (
              <li key={n.id} className="flex gap-3 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><n.icon className="h-4 w-4" /></span>
                <span className="min-w-0"><span className="block text-sm text-slate-800">{n.text}</span><span className="text-xs text-slate-500">{shortDate(n.at)}</span></span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

export function SupplierProfile() {
  const { supplier } = useSupplierAuthStore();
  const profile = useSupplierData('/supplier-portal/profile');
  const s: any = { ...(supplier || {}), ...(profile.payload?.data?.supplier || {}) };
  const rows: [string, string][] = [
    ['Company', s.company_name || s.name], ['Supplier ID', s.supplier_code], ['Contact person', s.contact_person], ['Phone', s.phone],
    ['Email', s.email], ['Address', [s.address, s.city].filter(Boolean).join(', ')], ['Supplier since', s.supplier_since ? shortDate(s.supplier_since) : ''],
    ['Reliability score', s.reliability_score != null ? String(s.reliability_score) : ''], ['Status', s.status],
  ];
  return (
    <>
      {title('Profile & Security')}
      <PageHeading title="Profile & Security" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Company details">
          <dl className="divide-y divide-slate-100">
            {rows.map(([label, value]) => (
              <div key={label} className="flex gap-3 py-2.5 text-sm">
                <dt className="w-32 shrink-0 text-slate-500">{label}</dt>
                <dd className="min-w-0 break-words font-medium text-slate-900">{value || '-'}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Security">
          <p className="text-sm text-slate-600">Supplier accounts can only use this portal; they cannot open the NST POS. To change your password or contact details, message the NST purchase team.</p>
          <Link to="/supplier/messages" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"><MessageSquare className="h-4 w-4" />Contact NST</Link>
        </Panel>
      </div>
    </>
  );
}

const ComingSoon: React.FC<{ heading: string; icon: React.ElementType; note: string }> = ({ heading, icon, note }) => (
  <>
    {title(heading)}
    <PageHeading title={heading} />
    <Panel title={heading}><EmptyState title="No records yet" note={note} icon={icon as any} /></Panel>
  </>
);

export const SupplierReturns = () => <ComingSoon heading="Returns & Adjustments" icon={RotateCcw} note="Returned items and price adjustments raised by NST will appear here." />;
export const SupplierDocuments = () => <ComingSoon heading="Documents" icon={FolderOpen} note="Trade license, agreements and other shared documents will appear here." />;
export const SupplierMessages = () => <ComingSoon heading="Messages & Support" icon={MessageSquare} note="For urgent issues call the NST purchase team. Portal messaging is being connected." />;
