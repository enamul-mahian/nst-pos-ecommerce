import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Bell, CheckCircle2, Clock, CreditCard, FileText, Heart, PackageSearch, Repeat2, ShoppingBag, Smartphone, Timer, Wallet,
} from 'lucide-react';

import { useAuthStore } from '../../store/auth/useAuthStore';
import { DonutChart, EmptyState, LoadingBlock, Panel, StatCard, StatusBadge } from '../../components/portal/PortalUI';
import { shortDate, taka, usePortalData } from '../../components/portal/portalUtils';
import { customerCode, devicesFromSales, notificationsFrom, orderImage, orderTitle } from './customerData';

const readWishlistCount = () => {
  try { return JSON.parse(localStorage.getItem('nst_customer_wishlist') || '{}')?.state?.items?.length || 0; } catch { return 0; }
};

const Thumb: React.FC<{ src?: string | null; alt: string; size?: string }> = ({ src, alt, size = 'h-11 w-11' }) => (
  <span className={`${size} grid shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-400`}>
    {src ? <img src={src} alt={alt} className="h-full w-full object-contain" loading="lazy" /> : <Smartphone className="h-5 w-5" />}
  </span>
);

export const PortalDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const orders = usePortalData('/portal/orders');
  const sales = usePortalData('/portal/sales');
  const soldToNst = usePortalData('/portal/purchases');
  const preorders = usePortalData('/portal/preorders');

  const stats = useMemo(() => {
    const byStatus = (re: RegExp) => orders.rows.filter((o) => re.test(String(o?.status || '').toLowerCase())).length;
    return {
      total: orders.rows.length,
      pending: byStatus(/pending|processing|placed|confirmed/),
      completed: byStatus(/delivered|completed/),
      shipped: byStatus(/shipped|transit/),
      cancelled: byStatus(/cancel/),
      preorders: preorders.rows.filter((p) => !/(cancel|reject|completed|delivered)/.test(String(p?.status_key || p?.status || ''))).length,
      due: sales.rows.reduce((sum, s) => sum + (Number(s?.due_amount) || 0), 0),
    };
  }, [orders.rows, sales.rows, preorders.rows]);

  const devices = useMemo(() => devicesFromSales(sales.rows), [sales.rows]);
  const notifications = useMemo(() => notificationsFrom(orders.rows, preorders.rows, sales.rows).slice(0, 4), [orders.rows, preorders.rows, sales.rows]);
  const device = devices[0];

  return (
    <div className="space-y-4 sm:space-y-5">
      <Helmet><title>Customer Dashboard | New Singapur Telecom</title></Helmet>

      {/* Phone-only welcome (tablet/desktop show it in the header) */}
      <section className="rounded-2xl bg-gradient-to-br from-violet-700 to-indigo-700 p-4 text-white shadow-lg shadow-violet-700/20 md:hidden">
        <p className="text-xs text-violet-100">Welcome back,</p>
        <p className="mt-0.5 text-lg font-bold">{user?.name}</p>
        <p className="mt-1 text-xs text-violet-100">Customer ID: {customerCode(user)}</p>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[11px]">
          {[['Orders', '/portal/orders', ShoppingBag], ['Tracking', '/portal/tracking', PackageSearch], ['Devices', '/portal/devices', Smartphone], ['Invoices', '/portal/invoices', FileText]].map(([label, to, Icon]: any) => (
            <Link key={to} to={to} className="flex flex-col items-center gap-1.5 rounded-xl bg-white/10 px-1 py-2.5 hover:bg-white/20"><Icon className="h-5 w-5" />{label}</Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={ShoppingBag} label="Total Orders" value={stats.total} to="/portal/orders" />
        <StatCard icon={Clock} label="Pending Orders" value={stats.pending} tone="amber" to="/portal/orders" />
        <StatCard icon={CheckCircle2} label="Completed Orders" value={stats.completed} tone="green" to="/portal/orders" />
        <StatCard icon={Timer} label="Active Preorders" value={stats.preorders} tone="violet" to="/portal/preorders" />
        <StatCard icon={Smartphone} label="Purchased Devices" value={devices.length} tone="slate" to="/portal/devices" />
        <StatCard icon={Repeat2} label="Devices Sold to NST" value={soldToNst.rows.length} tone="green" to="/portal/sold-devices" />
        <StatCard icon={Wallet} label="Due / Refund" value={taka(stats.due)} tone="red" to="/portal/payments" />
        <StatCard icon={Heart} label="Wishlist Items" value={readWishlistCount()} tone="red" to="/wishlist" />
      </div>

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-2">
        <Panel title="Recent Orders" action={{ label: 'View All', to: '/portal/orders' }}>
          {orders.isLoading ? <LoadingBlock /> : orders.rows.length === 0 ? (
            <EmptyState title="No orders yet" note="Once you place an order it will show up here." icon={ShoppingBag} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {orders.rows.slice(0, 4).map((order) => (
                <li key={order.id}>
                  <Link to={`/track-order/${order.order_no || order.id}`} className="flex items-center gap-3 py-2.5">
                    <Thumb src={orderImage(order)} alt={orderTitle(order)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800">{orderTitle(order)}</span>
                      <span className="block truncate text-xs text-slate-500">Order #{order.order_no || order.id}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-4">
                      <StatusBadge status={order.status} />
                      <span className="text-[11px] text-slate-500 sm:w-20 sm:text-right">{shortDate(order.created_at)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Order Status Overview">
          {orders.isLoading ? <LoadingBlock /> : (
            <DonutChart centerLabel="Total Orders" segments={[
              { label: 'Delivered', value: stats.completed, color: '#6d28d9' },
              { label: 'Processing', value: stats.pending, color: '#f59e0b' },
              { label: 'Shipped', value: stats.shipped, color: '#38bdf8' },
              { label: 'Cancelled', value: stats.cancelled, color: '#f43f5e' },
            ]} />
          )}
        </Panel>

        <Panel title="My Devices" action={{ label: 'View All', to: '/portal/devices' }}>
          {sales.isLoading ? <LoadingBlock /> : !device ? (
            <EmptyState title="No devices yet" note="Devices you buy from NST appear here with IMEI and warranty." icon={Smartphone} />
          ) : (
            <div className="flex items-center gap-4 rounded-xl border border-slate-100 p-3 sm:p-4">
              <Thumb src={device.image} alt={device.name} size="h-24 w-20 sm:h-28 sm:w-24" />
              <dl className="min-w-0 space-y-1.5 text-sm">
                <dt className="sr-only">Device</dt><dd className="truncate font-semibold text-slate-900">{device.name}</dd>
                <dd className="truncate text-slate-600"><span className="text-slate-500">IMEI: </span>{device.imei || '-'}</dd>
                <dd className="text-slate-600"><span className="text-slate-500">Purchase Date: </span>{shortDate(device.purchasedAt)}</dd>
                <dd className="flex items-center gap-2 text-slate-600"><span className="text-slate-500">Warranty:</span><StatusBadge status={device.warranty} /></dd>
              </dl>
            </div>
          )}
        </Panel>

        <Panel title="Latest Notifications" action={{ label: 'View All', to: '/portal/notifications' }}>
          {notifications.length === 0 ? <EmptyState title="You're all caught up" icon={Bell} /> : (
            <ul className="space-y-3">
              {notifications.map((n) => {
                const Icon = n.kind === 'payment' ? CreditCard : n.kind === 'preorder' ? Timer : ShoppingBag;
                return (
                  <li key={n.id} className="flex gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700"><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0">
                      <span className="block text-sm text-slate-800">{n.text}</span>
                      <span className="block text-xs text-slate-500">{shortDate(n.at)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
};

export default PortalDashboard;
