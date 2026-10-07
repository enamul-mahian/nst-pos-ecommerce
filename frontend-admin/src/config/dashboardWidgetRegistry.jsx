import {
  Activity, BarChart3, Bell, Boxes, Building2, Clock3, Gauge, Globe2,
  LayoutGrid, MessageCircle, PackageCheck, ShieldCheck, ShoppingBag,
  TrendingUp, Truck, Users, WalletCards, Wrench, Target, Megaphone,
} from 'lucide-react';
import { BusinessOsIcon } from './businessOsIconRegistry';

const DEFINITIONS = [
  ['kpi-0', "Today's Sales", ShoppingBag], ['kpi-1', 'Monthly Sales', BarChart3],
  ['kpi-2', 'Total Orders', PackageCheck], ['kpi-3', 'Pending Orders', Clock3],
  ['kpi-4', "Today's Profit", TrendingUp], ['secondary-0', 'Stock Value', WalletCards],
  ['secondary-1', 'Customers', Users], ['secondary-2', 'Suppliers', Truck],
  ['secondary-3', 'Low Stock', Boxes], ['secondary-4', 'Pending Transfers', Building2],
  ['secondary-5', 'Service Queue', Wrench], ['sales-overview', 'Sales Overview', BarChart3],
  ['top-products', 'Top Selling Products', ShoppingBag], ['recent-activities', 'Recent Activities', Activity],
  ['website-orders', 'Website Orders', Globe2], ['sales-branch', 'Sales by Branch', Building2],
  ['order-status', 'Order Status', Clock3], ['profit-overview', 'Profit Overview', TrendingUp],
  ['quick-access', 'Quick Access', LayoutGrid], ['module-shortcuts', 'Module Shortcuts', Gauge],
  ['notifications', 'Notifications', Bell], ['nst-chat', 'NST Chat', MessageCircle],
  ['today-target', "Today's Target", Target], ['business-bulletin', 'Business Bulletin', Megaphone],
  ['system-status', 'System Status', ShieldCheck],
];

export const dashboardWidgetRegistry = Object.freeze(Object.fromEntries(
  DEFINITIONS.map(([id, title, Icon]) => [id, Object.freeze({ id, title, Icon, iconKey: Icon.displayName || Icon.name || id })]),
));

export const dashboardWidgetDefinitions = Object.freeze(DEFINITIONS.map(([id]) => dashboardWidgetRegistry[id]));

export function getDashboardWidget(id) {
  return dashboardWidgetRegistry[id] || Object.freeze({ id, title: id, Icon: LayoutGrid, iconKey: 'LayoutGrid' });
}

export function DashboardWidgetIdentityIcon({ id, size = 18, className = '' }) {
  const { Icon, title } = getDashboardWidget(id);
  return <span className={`nst-widget-identity-icon ${className}`} title={title} aria-hidden="true"><BusinessOsIcon icon={Icon} size={size}/></span>;
}
