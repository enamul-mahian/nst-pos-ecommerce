import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Banknote, Bell, BookOpen, ClipboardCheck, ClipboardList, FileSpreadsheet, FileText, FolderOpen, LayoutDashboard,
  MessageSquare, PackagePlus, Plus, RotateCcw, Scale, Search, ShieldCheck, Smartphone, Tags, Truck, UserRound,
} from 'lucide-react';
import { useSupplierAuthStore } from '../store/supplier/useSupplierAuthStore';
import PortalShell, { type PortalNavItem } from '../components/portal/PortalShell';

export const supplierMenu: PortalNavItem[] = [
  { label: 'Dashboard', to: '/supplier/dashboard', icon: LayoutDashboard },
  { label: 'Purchase Orders', to: '/supplier/purchase-orders', icon: ClipboardList },
  { label: 'New Supply Orders', to: '/supplier/new-orders', icon: PackagePlus },
  { label: 'Used Devices Supplied', to: '/supplier/used-devices', icon: Smartphone },
  { label: 'Product & Price List', to: '/supplier/prices', icon: Tags },
  { label: 'Price Comparison Requests', to: '/supplier/price-requests', icon: Scale },
  { label: 'Order Confirmations', to: '/supplier/confirmations', icon: ClipboardCheck },
  { label: 'Delivery Status', to: '/supplier/delivery', icon: Truck },
  { label: 'Invoices', to: '/supplier/invoices', icon: FileText },
  { label: 'Payments', to: '/supplier/payments', icon: Banknote },
  { label: 'Ledger', to: '/supplier/ledger', icon: BookOpen },
  { label: 'Returns & Adjustments', to: '/supplier/returns', icon: RotateCcw },
  { label: 'Documents', to: '/supplier/documents', icon: FolderOpen },
  { label: 'Messages & Support', to: '/supplier/messages', icon: MessageSquare },
  { label: 'Notifications', to: '/supplier/notifications', icon: Bell },
  { label: 'Profile & Security', to: '/supplier/profile', icon: ShieldCheck },
];

export default function SupplierLayout() {
  const { supplier, logout } = useSupplierAuthStore();
  const navigate = useNavigate();
  const s: any = supplier || {};
  const branch = s.branch_name || s.branch?.name || s.assigned_branch;

  return (
    <PortalShell
      portalName="Supplier"
      homePath="/supplier/dashboard"
      menu={supplierMenu}
      identity={{
        name: s.company_name || s.name || 'Supplier',
        badge: 'Verified Supplier',
        lines: [`Supplier ID: ${s.supplier_code || '—'}`, ...(branch ? [`Assigned Branch: ${branch}`] : [])],
        avatarUrl: s.logo_url || s.logo || null,
        shape: 'square',
      }}
      topActions={[
        { label: 'Search', to: '/supplier/purchase-orders', icon: Search },
        { label: 'Messages', to: '/supplier/messages', icon: MessageSquare },
        { label: 'Notifications', to: '/supplier/notifications', icon: Bell },
        { label: 'Ledger', to: '/supplier/ledger', icon: FileSpreadsheet },
      ]}
      bottomNav={[
        { label: 'Dashboard', to: '/supplier/dashboard', icon: LayoutDashboard },
        { label: 'Orders', to: '/supplier/purchase-orders', icon: ClipboardList },
        { label: 'Submit Price', to: '/supplier/prices', icon: Plus, fab: true },
        { label: 'Messages', to: '/supplier/messages', icon: MessageSquare },
        { label: 'Account', to: '/supplier/profile', icon: UserRound },
      ]}
      onLogout={async () => { await logout(); navigate('/supplier-login', { replace: true }); }}
    />
  );
}
