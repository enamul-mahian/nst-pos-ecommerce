import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { Bell, CreditCard, Download, Mail, Phone, ShieldCheck, ShoppingBag, Smartphone, Timer, UserRound, Wrench } from 'lucide-react';

import { apiClient, handleApiError } from '../../api/client';
import { useAuthStore } from '../../store/auth/useAuthStore';
import { EmptyState, LoadingBlock, PageHeading, Panel, RecordList, StatusBadge, Tabs } from '../../components/portal/PortalUI';
import { humanize, shortDate, taka, usePortalData } from '../../components/portal/portalUtils';
import { customerCode, devicesFromSales, notificationsFrom } from './customerData';

const title = (text: string) => <Helmet><title>{`${text} | NST Customer`}</title></Helmet>;

export const PurchasedDevices: React.FC = () => {
  const sales = usePortalData('/portal/sales');
  const devices = useMemo(() => devicesFromSales(sales.rows), [sales.rows]);
  return (
    <>
      {title('Purchased Devices')}
      <PageHeading title="Purchased Devices" subtitle="Devices you bought from NST, with IMEI and warranty." />
      <Panel title={`${devices.length} device${devices.length === 1 ? '' : 's'}`}>
        <RecordList isLoading={sales.isLoading} error={sales.error} rows={devices} empty="No purchased devices yet" columns={[
          { key: 'name', label: 'Device', primary: true, render: (d) => <span className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-violet-600" />{d.name}</span> },
          { key: 'imei', label: 'IMEI', render: (d) => d.imei || '-' },
          { key: 'invoiceNo', label: 'Invoice', render: (d) => d.invoiceNo || '-' },
          { key: 'purchasedAt', label: 'Purchase Date', render: (d) => shortDate(d.purchasedAt) },
          { key: 'warranty', label: 'Warranty', render: (d) => <StatusBadge status={d.warranty} /> },
        ]} />
      </Panel>
    </>
  );
};

export const SoldDevices: React.FC = () => {
  const data = usePortalData('/portal/purchases');
  return (
    <>
      {title('Sold Devices')}
      <PageHeading title="Devices Sold to NST" subtitle="Used devices you sold or exchanged at NST." />
      <Panel title="Sold devices">
        <RecordList isLoading={data.isLoading} error={data.error} rows={data.rows} empty="You haven't sold any device to NST yet" columns={[
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
};

const downloadInvoice = async (sale: any) => {
  try {
    const response = await apiClient.get(`/portal/sales/${sale.id}/invoice-pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sale.invoice_no || 'invoice-' + sale.id}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    toast.error(handleApiError(err).message);
  }
};

export const Invoices: React.FC = () => {
  const data = usePortalData('/portal/sales');
  return (
    <>
      {title('Invoices')}
      <PageHeading title="Invoices" subtitle="Download the invoice for any purchase." />
      <Panel title="All invoices">
        <RecordList isLoading={data.isLoading} error={data.error} rows={data.rows} empty="No invoices yet" columns={[
          { key: 'invoice_no', label: 'Invoice', primary: true, render: (r) => r.invoice_no || `#${r.id}` },
          { key: 'created_at', label: 'Date', render: (r) => shortDate(r.created_at) },
          { key: 'total', label: 'Amount', render: (r) => taka(r.final_amount ?? r.total ?? r.grand_total) },
          { key: 'due_amount', label: 'Due', render: (r) => taka(r.due_amount) },
          { key: 'payment_status', label: 'Payment', render: (r) => <StatusBadge status={r.payment_status || 'paid'} /> },
          { key: 'pdf', label: 'PDF', align: 'right', render: (r) => (
            <button type="button" onClick={() => downloadInvoice(r)} className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100"><Download className="h-3.5 w-3.5" />PDF</button>
          ) },
        ]} />
      </Panel>
    </>
  );
};

export const Warranty: React.FC = () => {
  const sales = usePortalData('/portal/sales');
  const devices = useMemo(() => devicesFromSales(sales.rows), [sales.rows]);
  return (
    <>
      {title('Warranty & Service')}
      <PageHeading title="Warranty & Service" subtitle="Warranty status of your devices. Need a repair? Message our support team."
        right={<Link to="/portal/messages" className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"><Wrench className="h-4 w-4" />Request Service</Link>} />
      {sales.isLoading ? <LoadingBlock /> : devices.length === 0 ? <Panel title="Devices"><EmptyState title="No devices under warranty" icon={ShieldCheck} /></Panel> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {devices.map((d) => (
            <article key={d.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-slate-900">{d.name}</p><StatusBadge status={d.warranty} />
              </div>
              <p className="mt-2 text-xs text-slate-500">IMEI: {d.imei || '-'}</p>
              <p className="text-xs text-slate-500">Purchased: {shortDate(d.purchasedAt)}</p>
            </article>
          ))}
        </div>
      )}
    </>
  );
};

export const Preorders: React.FC = () => {
  const data = usePortalData('/portal/preorders');
  return (
    <>
      {title('Preorders')}
      <PageHeading title="Preorders" subtitle="Devices you booked in advance." right={<Link to="/preorder" className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800">New Preorder</Link>} />
      <Panel title="My preorders">
        <RecordList isLoading={data.isLoading} error={data.error} rows={data.rows} empty="No preorders yet" columns={[
          { key: 'product_name', label: 'Product', primary: true, render: (r) => [r.product_name, r.variant_name].filter(Boolean).join(' · ') || '-' },
          { key: 'preorder_no', label: 'Preorder No', render: (r) => r.preorder_no || `#${r.id}` },
          { key: 'advance_amount', label: 'Advance', render: (r) => taka(r.advance_amount) },
          { key: 'due_amount', label: 'Due', render: (r) => taka(r.due_amount) },
          { key: 'created_at', label: 'Date', render: (r) => shortDate(r.created_at) },
          { key: 'status_key', label: 'Status', render: (r) => <StatusBadge status={r.status_key || r.status} /> },
        ]} />
      </Panel>
    </>
  );
};

export const Payments: React.FC = () => {
  const data = usePortalData('/portal/sales');
  const [tab, setTab] = useState('All');
  const rows = data.rows.filter((r) => tab === 'All' || (tab === 'Due' ? Number(r.due_amount) > 0 : Number(r.paid_amount) > 0));
  const paid = data.rows.reduce((s, r) => s + (Number(r.paid_amount) || 0), 0);
  const due = data.rows.reduce((s, r) => s + (Number(r.due_amount) || 0), 0);
  return (
    <>
      {title('Payments & Refunds')}
      <PageHeading title="Payments & Refunds" />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4"><p className="text-xs text-slate-500">Total Paid</p><p className="mt-1 text-lg font-bold">{taka(paid)}</p></div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4"><p className="text-xs text-slate-500">Due / Refund</p><p className="mt-1 text-lg font-bold text-rose-600">{taka(due)}</p></div>
      </div>
      <Panel title="Payment history">
        <Tabs tabs={['All', 'Paid', 'Due']} active={tab} onChange={setTab} />
        <RecordList isLoading={data.isLoading} error={data.error} rows={rows} empty="No payments found" columns={[
          { key: 'invoice_no', label: 'Invoice', primary: true, render: (r) => r.invoice_no || `#${r.id}` },
          { key: 'payment_method', label: 'Method', render: (r) => humanize(r.payment_method || 'cash') },
          { key: 'paid_amount', label: 'Paid', render: (r) => taka(r.paid_amount) },
          { key: 'due_amount', label: 'Due', render: (r) => taka(r.due_amount) },
          { key: 'created_at', label: 'Date', render: (r) => shortDate(r.created_at) },
          { key: 'payment_status', label: 'Status', render: (r) => <StatusBadge status={r.payment_status || (Number(r.due_amount) > 0 ? 'due' : 'paid')} /> },
        ]} />
      </Panel>
    </>
  );
};

export const Notifications: React.FC = () => {
  const orders = usePortalData('/portal/orders');
  const preorders = usePortalData('/portal/preorders');
  const sales = usePortalData('/portal/sales');
  const items = useMemo(() => notificationsFrom(orders.rows, preorders.rows, sales.rows), [orders.rows, preorders.rows, sales.rows]);
  const loading = orders.isLoading || preorders.isLoading || sales.isLoading;
  return (
    <>
      {title('Notifications')}
      <PageHeading title="Notifications" />
      <Panel title="Latest updates">
        {loading ? <LoadingBlock /> : items.length === 0 ? <EmptyState title="You're all caught up" icon={Bell} /> : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => {
              const Icon = n.kind === 'payment' ? CreditCard : n.kind === 'preorder' ? Timer : ShoppingBag;
              return (
                <li key={n.id} className="flex gap-3 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0"><span className="block text-sm text-slate-800">{n.text}</span><span className="text-xs text-slate-500">{shortDate(n.at)}</span></span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
};

export const Profile: React.FC = () => {
  const { user } = useAuthStore();
  const profile = usePortalData('/portal/profile');
  const p = profile.payload?.data?.user || user || {};
  const customer = profile.payload?.data?.customer || {};
  const rows: [React.ElementType, string, string][] = [
    [UserRound, 'Name', p.name || '-'],
    [Phone, 'Phone', p.phone || '-'],
    [Mail, 'Email', p.email || '-'],
    [ShieldCheck, 'Customer ID', customerCode({ ...user, ...customer, customer_code: customer.customer_code })],
  ];
  return (
    <>
      {title('Profile & Security')}
      <PageHeading title="Profile & Security" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Account details">
          {profile.isLoading ? <LoadingBlock /> : (
            <dl className="divide-y divide-slate-100">
              {rows.map(([Icon, label, value]) => (
                <div key={label} className="flex items-center gap-3 py-3">
                  <Icon className="h-4 w-4 shrink-0 text-violet-600" />
                  <dt className="w-28 shrink-0 text-sm text-slate-500">{label}</dt>
                  <dd className="min-w-0 truncate text-sm font-medium text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
        <Panel title="Security">
          <p className="text-sm text-slate-600">Your portal session is protected and only visible to you. To change your password or phone number, contact NST support and we will verify your identity first.</p>
          <Link to="/portal/messages" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"><ShieldCheck className="h-4 w-4" />Contact Support</Link>
        </Panel>
      </div>
    </>
  );
};
