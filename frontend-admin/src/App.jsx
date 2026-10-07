import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowDownUp,
  BarChart3,
  BadgeDollarSign,
  Bell,
  CalendarDays,
  Command,
  Boxes,
  Building2,
  ChevronDown,
  ClipboardList,
  Database,
  FileText,
  Globe2,
  Gauge,
  HeartHandshake,
  History,
  Home,
  Inbox,
  MessageCircle,
  Megaphone,
  LayoutGrid,
  Landmark,
  LogOut,
  Menu,
  Package,
  Plus,
  ReceiptText,
  Search,
  ScanLine,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  ShoppingBag,
  Tags,
  Truck,
  Target,
  UserCog,
  Users,
  WalletCards,
  BriefcaseBusiness,
  Banknote,
  Clock4,
  Wrench,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { I18nProvider, labelKey, t as translate, useT } from './i18n';
import { startTamperGuard } from './utils/tamperGuard';
import LanguageSwitcher from './i18n/LanguageSwitcher';
import accessRules from './utils/accessRules';
import { BusinessOsIcon } from './config/businessOsIconRegistry';

import Login from './pages/Login';

const ProductList = lazy(() => import('./pages/products/ProductList'));
const ProductForm = lazy(() => import('./pages/products/ProductForm'));
const ProductVariantMatrix = lazy(() => import('./pages/products/ProductVariantMatrix'));
const ProductImageGallery = lazy(() => import('./pages/products/ProductImageGallery'));
const BranchList = lazy(() => import('./pages/branches/BranchList'));
const BranchForm = lazy(() => import('./pages/branches/BranchForm'));
const BranchStock = lazy(() => import('./pages/branches/BranchStock'));
const BranchStockRequests = lazy(() => import('./pages/branches/BranchStockRequests'));
const CategoryBrandManager = lazy(() => import('./pages/catalog/CategoryBrandManager'));
const SupplierList = lazy(() => import('./pages/suppliers/SupplierList'));
const SupplierLedger = lazy(() => import('./pages/suppliers/SupplierLedger'));
const PurchaseList = lazy(() => import('./pages/purchases/PurchaseList'));
const PurchaseForm = lazy(() => import('./pages/purchases/PurchaseForm'));
const SaleList = lazy(() => import('./pages/sales/SaleList'));
const SaleForm = lazy(() => import('./pages/sales/SaleForm'));
const SaleInvoice = lazy(() => import('./pages/sales/SaleInvoice'));
const BulkUpload = lazy(() => import('./pages/bulk-upload/BulkUpload'));
const UsedPurchaseList = lazy(() => import('./pages/used-purchases/UsedPurchaseList'));
const UsedPurchaseForm = lazy(() => import('./pages/used-purchases/UsedPurchaseForm'));
const CustomerList = lazy(() => import('./pages/customers/CustomerList'));
const CustomerLedger = lazy(() => import('./pages/customers/CustomerLedger'));
const ReportDashboard = lazy(() => import('./pages/reports/ReportDashboard'));
const SalesmanReports = lazy(() => import('./pages/reports/SalesmanReports'));
const AccountsDashboard = lazy(() => import('./pages/accounts/AccountsDashboard'));
const ExpenseList = lazy(() => import('./pages/expenses/ExpenseList'));
const CustomerDueCollection = lazy(() => import('./pages/payments/CustomerDueCollection'));
const SupplierPayments = lazy(() => import('./pages/payments/SupplierPayments'));
const DeviceStockList = lazy(() => import('./pages/device-stock/DeviceStockList'));
const PrepareForSalePage = lazy(() => import('./pages/device-stock/PrepareForSalePage'));
const InventoryControlCenter = lazy(() => import('./pages/inventory/InventoryControlCenter'));
const DeviceHistoryPage = lazy(() => import('./pages/device-history/DeviceHistoryPage'));
const AuditLogList = lazy(() => import('./pages/audit-logs/AuditLogList'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));
const UserManagementPage = lazy(() => import('./pages/settings/UserManagementPage'));
const DataMaintenance = lazy(() => import('./pages/system/DataMaintenance'));
const SystemHealth = lazy(() => import('./pages/system/SystemHealth'));
const WarrantyServicePage = lazy(() => import('./pages/warranty-service/WarrantyServicePage'));
const GooglePostList = lazy(() => import('./pages/google-posts/GooglePostList'));
const GooglePostForm = lazy(() => import('./pages/google-posts/GooglePostForm'));
const preloadProfileSettings = () => import('./pages/profile/ProfileSettings');
const ProfileSettings = lazy(preloadProfileSettings);
const CorporateDashboard = lazy(() => import('./pages/dashboard/CorporateDashboard'));
const DashboardLayoutStudio = lazy(() => import('./pages/dashboard/DashboardLayoutStudio'));
const EnterpriseSuitePage = lazy(() => import('./pages/enterprise/EnterpriseSuitePage'));
const EnterpriseModuleRouter = lazy(() => import('./pages/enterprise/EnterpriseSuitePage').then((module) => ({ default: module.EnterpriseModuleRouter })));
const CorporateSettingsPage = lazy(() => import('./pages/settings/CorporateSettingsPage'));
const CorporateSettingSectionPage = lazy(() => import('./pages/settings/corporate/CorporateSettingSectionPage'));
const DashboardAccessSettingsPage = lazy(() => import('./pages/settings/corporate/DashboardAccessSettingsPage'));
const PaymentGatewayManagerPage = lazy(() => import('./pages/settings/PaymentGatewayManagerPage'));
const DeliveryGatewayManagerPage = lazy(() => import('./pages/settings/DeliveryGatewayManagerPage'));
const EmiSettingsPage = lazy(() => import('./pages/emi/EmiSettingsPage'));
const SmtpSettingsPage = lazy(() => import('./pages/settings/SmtpSettingsPage'));
const MarketingMessagingPage = lazy(() => import('./pages/marketing/MarketingMessagingPage'));
const BookingPreorderPage = lazy(() => import('./pages/bookings/BookingPreorderPage'));
const CustomerInboxPage = lazy(() => import('./pages/messages/CustomerInboxPage'));
const CustomerOrdersPage = lazy(() => import('./pages/orders/CustomerOrdersPage'));
const CouponOfferPage = lazy(() => import('./pages/coupons/CouponOfferPage'));
const BarcodeToolsPage = lazy(() => import('./pages/barcode-tools/BarcodeToolsPage'));
const LockedOperationsPage = lazy(() => import('./pages/locked-operations/LockedOperationsPage'));
const PublicWarrantyCheck = lazy(() => import('./pages/public/PublicWarrantyCheck'));
const PublicInvoicePage = lazy(() => import('./pages/public/PublicInvoicePage'));
const WebsiteControlCenter = lazy(() => import('./pages/website/WebsiteControlCenter'));
const WebsiteOperations = lazy(() => import('./pages/website/WebsiteOperations'));
const WebsiteExperienceCenter = lazy(() => import('./pages/website/WebsiteExperienceCenter'));
const FileCenterPage = lazy(() => import('./pages/website/FileCenterPage'));
const AppCenterManager = lazy(() => import('./pages/website/AppCenterManager'));
const ExternalPreorderAdminPage = lazy(() => import('./pages/bookings/ExternalPreorderAdminPage'));
const SecurityCenterPage = lazy(() => import('./pages/security/SecurityCenterPage'));
const PatchManagerPage = lazy(() => import('./pages/patch-manager/PatchManagerPage'));
const StockAdjustmentPage = lazy(() => import('./pages/release-one/ReleaseOperationsPages').then((module) => ({ default: module.StockAdjustmentPage })));
const ExchangePage = lazy(() => import('./pages/exchanges/ExchangePage'));
const DeliveryPage = lazy(() => import('./pages/release-one/ReleaseOperationsPages').then((module) => ({ default: module.DeliveryPage })));
const WebSalesEnterprisePage = lazy(() => import('./pages/WebSalesEnterprisePage').then((module) => ({ default: module.WebSalesEnterprisePage })));
const WebSalesReportPage = lazy(() => import('./pages/WebSalesEnterprisePage').then((module) => ({ default: module.WebSalesReportPage })));
const BarcodeHistoryPage = lazy(() => import('./pages/WebSalesEnterprisePage').then((module) => ({ default: module.BarcodeHistoryPage })));
const UsersAccessEnterprisePage = lazy(() => import('./pages/WebSalesEnterprisePage').then((module) => ({ default: module.UsersAccessEnterprisePage })));
const CustomerSupportPortal = lazy(() => import('./pages/dashboard-final/CustomerSupportPortal'));
const StaffChatPage = lazy(() => import('./pages/dashboard-final/StaffChatPage'));
const BusinessBulletinCenter = lazy(() => import('./pages/dashboard-final/BusinessBulletinCenter'));
const BusinessHealthPage = lazy(() => import('./pages/dashboard-final/BusinessHealthPage'));
const DashboardTargetsPage = lazy(() => import('./pages/dashboard-final/DashboardTargetsPage'));


import api from './services/api';
import corporateOpsService from './services/corporateOpsService';
import dashboardOperatingService from './services/dashboardOperatingService';
import { applyDashboardTheme, cacheDashboardTheme, defaultDashboardTheme, readCachedDashboardTheme } from './theme/dashboardThemes';
import NstQaTracker from './components/qa/NstQaTracker';
import { NstSystemUiProvider, useNstSystemUi } from './context/NstSystemUiContext';
import { NstBrandEditButton, NstBrandEditor, NstBrandMark, useDesignMode, useNstBrand } from './components/system/NstBrand';
import NstInlineSectionEditor from './components/system/NstInlineSectionEditor';
import NstSaveStatus from './components/system/NstSaveStatus';
import NstScannerModal from './components/search/NstScannerModal';

import NstQaErrorBoundary from './components/qa/NstQaErrorBoundary';

const PRIMARY = '#8d39e4';
const SIDEBAR_WIDTH = '17rem';

const DEFAULT_ADMIN_BRANDING = {
  name: 'New Singapur Telecom',
  shortName: 'NST',
  adminName: 'NST POS',
  logoText: 'NST',
  logoUrl: '',
  tagline: 'Telecom Admin',
};


const ADMIN_BRANDING_CACHE_KEY = 'nst-admin-branding:v1';
let adminBrandingRequest = null;

function readCachedAdminBranding() {
  try {
    const cached = JSON.parse(localStorage.getItem(ADMIN_BRANDING_CACHE_KEY) || 'null');
    return cached && typeof cached === 'object' ? { ...DEFAULT_ADMIN_BRANDING, ...cached } : DEFAULT_ADMIN_BRANDING;
  } catch {
    return DEFAULT_ADMIN_BRANDING;
  }
}

async function loadAdminBranding() {
  if (adminBrandingRequest) return adminBrandingRequest;
  adminBrandingRequest = api.get('/website-builder/published')
    .then((response) => {
      const site = response?.data?.data?.site || response?.data?.data?.published?.site || {};
      const branding = {
        ...DEFAULT_ADMIN_BRANDING,
        ...site,
        adminName: site.adminName || site.name || DEFAULT_ADMIN_BRANDING.adminName,
        shortName: site.shortName || site.logoText || DEFAULT_ADMIN_BRANDING.shortName,
        logoText: site.logoText || site.shortName || DEFAULT_ADMIN_BRANDING.logoText,
      };
      try { localStorage.setItem(ADMIN_BRANDING_CACHE_KEY, JSON.stringify(branding)); } catch {}
      window.dispatchEvent(new CustomEvent('nst-admin-branding-updated', { detail: branding }));
      return branding;
    })
    .finally(() => { adminBrandingRequest = null; });
  return adminBrandingRequest;
}

function useAdminBranding() {
  const [branding, setBranding] = useState(readCachedAdminBranding);

  useEffect(() => {
    let mounted = true;
    const receive = (event) => { if (mounted && event?.detail) setBranding(event.detail); };
    window.addEventListener('nst-admin-branding-updated', receive);
    loadAdminBranding().then((next) => { if (mounted) setBranding(next); }).catch(() => {});
    return () => { mounted = false; window.removeEventListener('nst-admin-branding-updated', receive); };
  }, []);

  return branding;
}

function AdminRouteLoader() {
  return <div className="min-h-screen bg-[var(--nst-dashboard-bg)] p-5 text-[var(--nst-dashboard-text)]"><div className="mx-auto max-w-[1600px] animate-pulse space-y-4"><div className="h-10 w-72 rounded-2xl bg-[var(--nst-dashboard-surface)]"/><div className="grid gap-4 md:grid-cols-3">{[0,1,2,3,4,5].map((item) => <div key={item} className="h-36 rounded-3xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)]"/>)}</div></div></div>;
}

function AdminContentLoader() {
  return <div className="nst-route-content-loader" role="status" aria-live="polite" aria-label="Opening page">
    <span className="nst-route-progress" aria-hidden="true"/>
    <div className="mx-auto max-w-[1600px] animate-pulse space-y-5 p-4 md:p-6">
      <div className="space-y-2">
        <div className="h-8 w-64 rounded-xl bg-[var(--nst-dashboard-surface)]"/>
        <div className="h-4 w-80 max-w-full rounded-lg bg-[var(--nst-dashboard-surface)]"/>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0,1,2].map((item) => <div key={item} className="h-36 rounded-3xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)]"/> )}
      </div>
    </div>
  </div>;
}

function PublicRouteLoader() {
  return <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-600" role="status"><div className="text-center"><span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] border-t-transparent"/><p className="mt-3 text-sm font-bold">Opening page...</p></div></div>;
}

function PublicSystemUiPage({ children }) {
  return <NstSystemUiProvider publicMode>{children}</NstSystemUiProvider>;
}

function PublicLazyPage({ children }) {
  return <PublicSystemUiPage><Suspense fallback={<PublicRouteLoader/>}>{children}</Suspense></PublicSystemUiPage>;
}

function AdminBootstrap({ children }) {
  const { user, loading } = useAuth();
  const cachedTheme = useMemo(() => readCachedDashboardTheme(), []);
  const [themeReady, setThemeReady] = useState(Boolean(cachedTheme));

  useEffect(() => {
    if (cachedTheme?.theme) applyDashboardTheme(cachedTheme.theme);
  }, [cachedTheme]);

  const guardUserKey = user?.user?.id || user?.id || '';
  useEffect(() => {
    if (loading) return undefined;
    return startTamperGuard({
      loadConfig: async () => {
        const config = (await api.get('/public/tamper-guard'))?.data?.data || {};
        return { active: Boolean(config.admin), detectDevtools: Boolean(config.detect_devtools) };
      },
      report: (action, key = '') => { api.post('/public/tamper-guard/report', { action, key, app: 'admin', page: window.location.pathname }, { nstSaveFeedback: false }).catch(() => undefined); },
      notice: () => translate('security_guard.blocked'),
    });
  }, [loading, guardUserKey]);

  useEffect(() => {
    if (loading) return;
    if (!user) { setThemeReady(true); return; }
    let active = true;
    if (!cachedTheme) setThemeReady(false);
    Promise.allSettled([corporateOpsService.getEffectiveDashboardTheme(), loadAdminBranding()])
      .then(([themeResult]) => {
        if (!active) return;
        if (themeResult.status === 'fulfilled') {
          const data = themeResult.value?.data?.data || themeResult.value?.data || {};
          const theme = data.theme || defaultDashboardTheme;
          cacheDashboardTheme(theme);
          applyDashboardTheme(theme);
        } else if (!cachedTheme) {
          applyDashboardTheme(defaultDashboardTheme);
        }
      })
      .finally(() => { if (active) setThemeReady(true); });
    return () => { active = false; };
  }, [user, loading, cachedTheme]);

  if (loading || (user && !themeReady)) return <AdminRouteLoader />;
  return children;
}


function getRoles(user) {
  const roles = user?.roles || user?.user?.roles || [];
  if (!Array.isArray(roles)) return [];
  return roles
    .map((role) => (typeof role === 'string' ? role : role?.name || ''))
    .filter(Boolean)
    .map((role) => role.toLowerCase());
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        Loading...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  if (user?.can_access_pos === false || user?.access?.can_access_pos === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-black text-red-600">POS Access Blocked</h1>
          <p className="mt-3 text-sm text-slate-500">Customer/Supplier accounts cannot access the POS panel. Please use the customer or supplier portal.</p>
        </div>
      </div>
    );
  }

  return children;
}

function buildMenu(user) {
  const roles = accessRules.roles(user);
  const admin = ['super_admin', 'admin'];
  const privileged = ['super_admin', 'admin', 'accounts', 'accountant'];
  const isSuperAdmin = accessRules.isSuperAdmin(user);
  const sidebarPermissions = user?.access?.sidebar_permissions || user?.user?.access?.sidebar_permissions || {};
  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

  const canSee = (item) => {
    if (!accessRules.canAccessSidebarItem(user, item)) return false;
    if (isSuperAdmin) return true;
    if (item.superOnly) return false;
    if (item.permissionKey && hasOwn(sidebarPermissions, item.permissionKey)) return Boolean(sidebarPermissions[item.permissionKey]);
    if (!item.roles) return true;
    return item.roles.some((role) => roles.includes(role === 'accounts' ? 'accountant' : role));
  };

  const groups = [
    { title: 'Dashboard', icon: Gauge, items: [
      { label: 'Overview', path: '/dashboard', icon: Gauge, permissionKey: 'dashboard', status: 'ready' },
      { label: "Today's Target", path: '/dashboard-targets', icon: Target, permissionKey: 'dashboard', status: 'ready' },
      { label: 'Customer Support', path: '/customer-support', icon: HeartHandshake, permissionKey: 'customers', status: 'ready' },
    ] },
    { title: 'Product & Inventory', icon: Package, items: [
      { label: 'Inventory Control', path: '/inventory-control', icon: Boxes, permissionKey: 'device_stock', status: 'ready' },
      { label: 'Products', path: '/products', icon: Package, permissionKey: 'products' },
      { label: 'Device Stock', path: '/device-stock', icon: Boxes, permissionKey: 'device_stock' },
      { label: 'Device History', path: '/device-history', icon: History, permissionKey: 'device_history' },
      { label: 'Product Variants', path: '/products/variant-operations', icon: LayoutGrid, permissionKey: 'products' },
      { label: 'Product Images', path: '/products/image-gallery', icon: Database, permissionKey: 'products' },
      { label: 'Catalog', path: '/catalog', icon: Tags, guard: 'canManageCatalog', permissionKey: 'catalog' },
      { label: 'Used / Pre-Owned', path: '/used-purchase', icon: ShieldCheck, permissionKey: 'used_purchase' },
      { label: 'Stock Adjustment', path: '/stock-adjustments', icon: ArrowDownUp, permissionKey: 'stock_adjustment' },
      { label: 'Bulk Upload', path: '/bulk-upload', icon: Database, roles: admin, permissionKey: 'bulk_upload' },
    ]},
    { title: 'Sales & Order', icon: ShoppingBag, items: [
      { label: 'POS Sale', path: '/sales/create', icon: ReceiptText, permissionKey: 'pos_sale' },
      { label: 'Sales List', path: '/sales', icon: ShoppingBag, permissionKey: 'sales_list' },
      { label: 'Web Sales', path: '/web-sales', icon: Globe2, roles: privileged, permissionKey: 'web_sales' },
      { label: 'Customer Orders', path: '/orders', icon: ClipboardList, roles: privileged, permissionKey: 'orders' },
      { label: 'Exchanges', path: '/exchanges', icon: ArrowDownUp, roles: privileged, permissionKey: 'exchange' },
      { label: 'Delivery', path: '/deliveries', icon: Truck, roles: privileged, permissionKey: 'delivery' },
      { label: 'Bookings & Preorders', path: '/bookings', icon: CalendarDays, roles: privileged, permissionKey: 'bookings' },
      { label: 'External Preorders', path: '/external-preorders', icon: Inbox, roles: privileged, permissionKey: 'bookings' },
    ]},
    { title: 'Purchase', icon: Truck, items: [
      { label: 'Purchase List', path: '/purchases', icon: Truck, guard: 'canManagePurchases', roles: privileged, permissionKey: 'purchases' },
      { label: 'Add Purchase', path: '/purchases/create', icon: Plus, guard: 'canManagePurchases', roles: privileged, permissionKey: 'purchases' },
      { label: 'Suppliers', path: '/suppliers', icon: Truck, guard: 'canViewSupplierInfo', roles: privileged, permissionKey: 'suppliers' },
    ]},
    { title: 'Stock Transfer', icon: Building2, items: [
      { label: 'Stock Requests', path: '/branch-stock-requests', icon: Boxes, permissionKey: 'stock_requests' },
      { label: 'Branches', path: '/branches', icon: Building2, roles: admin, permissionKey: 'branches' },
    ]},
    { title: 'Accounts & Finance', icon: WalletCards, items: [
      { label: 'Finance Center', path: '/finance-center', icon: Landmark, guard: 'canViewAccountingArea', roles: privileged, permissionKey: 'accounts' },
      { label: 'Legacy Accounts', path: '/accounts', icon: WalletCards, guard: 'canViewAccountingArea', roles: privileged, permissionKey: 'accounts' },
      { label: 'Customer Due', path: '/customer-due-collection', icon: FileText, guard: 'canViewAccountingArea', roles: privileged, permissionKey: 'customer_due' },
      { label: 'Supplier Payments', path: '/supplier-payments', icon: WalletCards, guard: 'canUpdateSupplierDue', roles: privileged, permissionKey: 'supplier_payments' },
      { label: 'Supplier Price & PO', path: '/locked-operations?tab=prices', activePaths: ['/locked-operations?tab=prices', '/locked-operations?tab=orders'], icon: Tags, roles: privileged, permissionKey: 'supplier_price_watch' },
      { label: 'Expenses', path: '/expenses', icon: ReceiptText, guard: 'canViewAccountingArea', roles: privileged, permissionKey: 'expenses' },
      { label: 'EMI Settings', path: '/settings/emi', icon: WalletCards, guard: 'canViewAccountingArea', roles: privileged, permissionKey: 'emi_settings' },
    ]},
    { title: 'Customers', icon: Users, items: [
      { label: 'CRM Center', path: '/crm-center', icon: HeartHandshake, guard: 'canViewCustomerDatabase', permissionKey: 'customers' },
      { label: 'Customer Database', path: '/customers', icon: Users, guard: 'canViewCustomerDatabase', permissionKey: 'customers' },
      { label: 'Customer Inbox', path: '/customer-messages', icon: Inbox, roles: admin, permissionKey: 'customer_inbox' },
    ]},
    { title: 'HRM & Payroll', icon: BriefcaseBusiness, items: [
      { label: 'HR Dashboard', path: '/hrm', icon: Gauge, roles: privileged, permissionKey: 'hrm' },
      { label: 'Employees', path: '/module/hr-employees', icon: Users, roles: privileged, permissionKey: 'hrm' },
      { label: 'Departments', path: '/module/hr-departments', icon: Building2, roles: privileged, permissionKey: 'hrm' },
      { label: 'Designations', path: '/module/hr-designations', icon: UserCog, roles: privileged, permissionKey: 'hrm' },
      { label: 'Attendance', path: '/module/hr-attendance', icon: Clock4, roles: privileged, permissionKey: 'hrm' },
      { label: 'Shift Management', path: '/module/hr-shifts', icon: CalendarDays, roles: privileged, permissionKey: 'hrm' },
      { label: 'Leave Management', path: '/module/hr-leave', icon: ClipboardList, roles: privileged, permissionKey: 'hrm' },
      { label: 'Payroll', path: '/module/payroll', icon: Banknote, roles: privileged, permissionKey: 'payroll' },
      { label: 'Salary Structure', path: '/module/salary-structure', icon: WalletCards, roles: privileged, permissionKey: 'payroll' },
      { label: 'Payslip', path: '/module/payslip', icon: FileText, roles: privileged, permissionKey: 'payroll' },
      { label: 'Commission & Bonus', path: '/module/hr-commission', icon: WalletCards, roles: privileged, permissionKey: 'payroll' },
      { label: 'Advance & Loan', path: '/module/hr-loan', icon: WalletCards, roles: privileged, permissionKey: 'payroll' },
      { label: 'Performance', path: '/module/hr-performance', icon: BarChart3, roles: privileged, permissionKey: 'hrm' },
      { label: 'HR Reports', path: '/module/hr-reports', icon: BarChart3, roles: privileged, permissionKey: 'hrm' },
      { label: 'Users & Access', path: '/users-access', icon: ShieldCheck, superOnly: true, permissionKey: 'users_access' },
      { label: 'NST Financial View', path: '/locked-operations?tab=financial', icon: BadgeDollarSign, superOnly: true, permissionKey: 'financial_view' },
    ]},
    { title: 'Service & Repair', icon: Wrench, items: [
      { label: 'Warranty / Service', path: '/warranty-service', icon: Wrench, permissionKey: 'warranty_service' },
      { label: 'Barcode Tools', path: '/settings/barcode-tools', icon: Tags, guard: 'canViewAccountingArea', roles: privileged, permissionKey: 'barcode_tools' },
    ]},
    { title: 'Business Communication', icon: MessageCircle, items: [
      { label: 'Staff Chat', path: '/staff-chat', icon: MessageCircle, permissionKey: 'staff_chat', status: 'ready' },
      { label: 'Business Bulletin', path: '/business-bulletins', icon: Megaphone, permissionKey: 'business_bulletin', status: 'ready' },
    ]},
    { title: 'Website Builder', icon: Globe2, items: [
      { label: 'Website Operations', path: '/website-operations', icon: Globe2, superOnly: true, permissionKey: 'website_control_center' },
      { label: 'Website Control Center', path: '/website-control-center', icon: LayoutGrid, superOnly: true, permissionKey: 'website_control_center' },
      { label: 'File Center', path: '/file-center', icon: FileText, superOnly: true, permissionKey: 'website_control_center' },
      { label: 'Experience & SEO', path: '/website-experience-center', icon: Globe2, superOnly: true, permissionKey: 'website_control_center' },
    ]},
    { title: 'App Studio', icon: LayoutGrid, items: [
    ]},
    { title: 'Marketing Center', icon: HeartHandshake, items: [
      { label: 'SMS Panel', path: '/marketing', icon: Inbox, roles: privileged, permissionKey: 'messaging' },
      { label: 'Coupons & Offers', path: '/coupons', icon: Tags, roles: privileged, permissionKey: 'coupons' },
      { label: 'Google Posts', path: '/google-posts', icon: FileText, guard: 'canManageGooglePosts', roles: privileged, permissionKey: 'google_posts' },
    ]},
    { title: 'Reports & Analytics', icon: BarChart3, items: [
      { label: 'All Reports', path: '/reports', icon: BarChart3, guard: 'canViewReports', roles: privileged, permissionKey: 'reports' },
      { label: 'Web Sales Report', path: '/reports/web-sales', icon: Globe2, roles: privileged, permissionKey: 'web_sales_report' },
      { label: 'Barcode History', path: '/barcode-history', icon: History, roles: privileged, permissionKey: 'barcode_history' },
      { label: 'Activity Logs', path: '/audit-logs', icon: ClipboardList, roles: privileged, permissionKey: 'activity_logs' },
    ]},
    { title: 'Module Hub', icon: LayoutGrid, items: [
      { label: 'Patch Manager', path: '/patch-manager', icon: Database, superOnly: true, permissionKey: 'patch_manager' },
      { label: 'System Health', path: '/system-health', icon: ShieldCheck, roles: admin, permissionKey: 'system_health' },
      { label: 'Business Health', path: '/business-health', icon: Activity, permissionKey: 'business_health', status: 'ready' },
    ]},
    { title: 'Settings', icon: Settings, items: [
      { label: 'Profile Settings', path: '/profile', icon: UserCog, permissionKey: 'profile_settings' },
      { label: 'General Settings', path: '/settings', icon: Settings, roles: admin, guard: 'isAdmin', permissionKey: 'general_settings', aliases: 'system settings company settings general' },
      { label: 'UI & Layout', path: '/settings?tab=ui', icon: LayoutGrid, roles: admin, guard: 'isAdmin', permissionKey: 'general_settings', aliases: 'appearance design theme card cards radius border padding gap spacing layout scanner camera qr barcode central search global ui' },
      { label: 'Dashboard Layout', path: '/dashboard-layout', icon: LayoutGrid, permissionKey: 'dashboard', status: 'ready', aliases: 'dashboard layout widgets order size' },
      { label: 'Payment Gateways', path: '/settings/payment-gateways', icon: WalletCards, superOnly: true, permissionKey: 'general_settings' },
      { label: 'Delivery APIs', path: '/settings/delivery-gateways', icon: Truck, superOnly: true, permissionKey: 'general_settings' },
      { label: 'Corporate Settings', path: '/settings/corporate', icon: FileText, roles: admin, permissionKey: 'invoice_seo', aliases: 'invoice seo domain sms email barcode booking dashboard corporate settings' },
      { label: 'Security Center', path: '/security-center', icon: ShieldCheck, roles: admin, permissionKey: 'security_center' },
      { label: 'Backup & Export', path: '/data-maintenance', icon: Database, superOnly: true, permissionKey: 'data_maintenance' },
    ]},
  ];

  return groups.map((group) => ({ ...group, items: group.items.filter((item) => item.status !== 'development' && canSee(item)) })).filter((group) => group.items.length > 0);
}

function userStorageKey(user, suffix) {
  const id = user?.user?.id || user?.id || user?.user?.email || user?.email || 'anonymous';
  return `nst-business-os:${id}:${suffix}`;
}

function sidebarPathMatchScore(itemPath, location) {
  const [expectedPathRaw, expectedQueryRaw = ''] = String(itemPath || '').split('?');
  const expectedPath = expectedPathRaw || '/';
  const exactPath = location.pathname === expectedPath;
  const descendantPath = expectedPath !== '/' && location.pathname.startsWith(`${expectedPath}/`);

  if (!exactPath && !descendantPath) return -1;

  const expectedQuery = new URLSearchParams(expectedQueryRaw);
  const actualQuery = new URLSearchParams(location.search);
  let queryPairs = 0;
  for (const [key, value] of expectedQuery.entries()) {
    if (actualQuery.get(key) !== value) return -1;
    queryPairs += 1;
  }

  // Exact routes beat parent-prefix routes. Query-specific routes beat generic routes
  // that share the same pathname. Path length resolves nested menu conflicts such as
  // /sales vs /sales/create and /settings vs /settings/corporate.
  return (exactPath ? 100000 : 1000)
    + (queryPairs * 10000)
    + expectedPath.length;
}

function sidebarItemMatchScore(item, location) {
  const candidatePaths = Array.isArray(item?.activePaths) && item.activePaths.length
    ? item.activePaths
    : [item?.path];
  return candidatePaths.reduce(
    (best, candidatePath) => Math.max(best, sidebarPathMatchScore(candidatePath, location)),
    -1,
  );
}

function resolveActiveSidebarEntry(menuGroups, location) {
  let best = null;
  menuGroups.forEach((group) => {
    group.items.forEach((item) => {
      const score = sidebarItemMatchScore(item, location);
      if (score < 0) return;
      if (!best || score > best.score) best = { groupTitle: group.title, item, score };
    });
  });
  return best;
}

function ShellTooltip({ label }) {
  return <span className="nst-shell-tooltip" role="tooltip">{label}</span>;
}

function Sidebar({ mobileOpen, onMobileClose, desktopMode, onDesktopModeChange }) {
  const { user } = useAuth();
  const location = useLocation();
  const branding = useAdminBranding();
  const brand = useNstBrand(branding);
  const designMode = useDesignMode();
  const [brandEditorOpen, setBrandEditorOpen] = useState(false);
  const t = useT();
  const menuGroups = useMemo(() => buildMenu(user).map((group) => ({
    ...group,
    label: t(labelKey('nav.group', group.title), { defaultValue: group.title }),
    items: group.items.map((item) => ({ ...item, labelEn: item.label, label: t(labelKey('nav', item.label), { defaultValue: item.label }) })),
  })), [user, t]);
  const [sidebarQuery, setSidebarQuery] = useState('');
  const visibleMenuGroups = useMemo(() => {
    const query = sidebarQuery.trim().toLowerCase();
    if (!query) return menuGroups;
    return menuGroups.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const haystack = [group.title, group.label, item.label, item.labelEn, item.path, item.permissionKey, item.guard, item.aliases]
          .filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      }),
    })).filter((group) => group.items.length > 0);
  }, [menuGroups, sidebarQuery]);
  const [openGroups, setOpenGroups] = useState({});
  const navRef = useRef(null);
  const collapsed = desktopMode === 'collapsed';
  const hidden = desktopMode === 'hidden';
  const scrollKey = userStorageKey(user, 'sidebar-scroll');
  const activeEntry = useMemo(
    () => resolveActiveSidebarEntry(menuGroups, location),
    [location.pathname, location.search, menuGroups],
  );
  const activeGroupTitle = activeEntry?.groupTitle || null;
  const activeItemPath = activeEntry?.item?.path || null;
  const activeGroupOpen = activeGroupTitle ? true : false;

  useEffect(() => {
    setOpenGroups((previous) => {
      const initialized = menuGroups.some((group) => Object.prototype.hasOwnProperty.call(previous, group.title));
      const base = initialized
        ? previous
        : Object.fromEntries(menuGroups.map((group) => [group.title, group.title === 'Dashboard']));
      if (!activeGroupTitle || base[activeGroupTitle]) return base;
      return { ...base, [activeGroupTitle]: true };
    });
  }, [activeGroupTitle, menuGroups]);

  useEffect(() => { onMobileClose(); }, [location.pathname, location.search]);

  useEffect(() => {
    const element = navRef.current;
    if (!element) return undefined;
    const saved = Number(localStorage.getItem(scrollKey) || 0);
    if (saved > 0) element.scrollTop = saved;
    const save = () => localStorage.setItem(scrollKey, String(element.scrollTop));
    element.addEventListener('scroll', save, { passive: true });
    return () => element.removeEventListener('scroll', save);
  }, [scrollKey, desktopMode]);

  useEffect(() => {
    if (!activeGroupTitle || !activeGroupOpen) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const nav = navRef.current;
      const activeLink = nav?.querySelector('.nst-nav-link.is-active');
      if (!nav || !activeLink) return;

      const navRect = nav.getBoundingClientRect();
      const activeRect = activeLink.getBoundingClientRect();
      const safeGap = 16;
      if (activeRect.top < navRect.top + safeGap) {
        nav.scrollTop -= (navRect.top + safeGap) - activeRect.top;
      } else if (activeRect.bottom > navRect.bottom - safeGap) {
        nav.scrollTop += activeRect.bottom - (navRect.bottom - safeGap);
      }
      localStorage.setItem(scrollKey, String(nav.scrollTop));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeGroupOpen, activeGroupTitle, location.pathname, location.search, scrollKey]);

  useEffect(() => {
    if (!sidebarQuery.trim()) return;
    setOpenGroups((previous) => ({
      ...previous,
      ...Object.fromEntries(visibleMenuGroups.map((group) => [group.title, true])),
    }));
  }, [sidebarQuery, visibleMenuGroups]);

  const toggleGroup = (title) => {
    // Keep the parent of the current page open so the user never loses their location.
    if (title === activeGroupTitle) return;
    setOpenGroups((previous) => ({ ...previous, [title]: !previous[title] }));
  };

  return <>
    <button type="button" onClick={onMobileClose} className={`nst-drawer-backdrop ${mobileOpen ? 'is-open' : ''}`} aria-label="Close navigation" tabIndex={mobileOpen ? 0 : -1}/>
    <aside
      className={`nst-business-sidebar ${collapsed ? 'is-collapsed' : ''} ${hidden ? 'is-hidden' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}
      aria-label="NST Business OS navigation"
    >
      <div className="nst-sidebar-brand" style={brand.style}>
        <NstBrandMark brand={brand} alt={brand.title}/>
        <div className="nst-brand-copy">
          <strong>{brand.title}</strong>
          <span>{brand.subtitle}</span>
        </div>
        {designMode && !collapsed ? <NstBrandEditButton onClick={() => setBrandEditorOpen(true)}/> : null}
        {brandEditorOpen ? <NstBrandEditor branding={branding} onClose={() => setBrandEditorOpen(false)}/> : null}
        <button type="button" onClick={onMobileClose} className="nst-mobile-close" aria-label="Close sidebar"><X size={19}/></button>
      </div>

      {!collapsed && <div className="nst-sidebar-search-wrap">
        <Search size={16} aria-hidden="true"/>
        <input
          value={sidebarQuery}
          onChange={(event) => setSidebarQuery(event.target.value)}
          placeholder="Find a page or setting..."
          aria-label="Search sidebar pages and settings"
        />
        {sidebarQuery && <button type="button" onClick={() => setSidebarQuery('')} aria-label="Clear sidebar search"><X size={14}/></button>}
      </div>}

      <nav ref={navRef} data-nst-sidebar-scroll className="nst-overlay-scroll nst-sidebar-nav" tabIndex="0">
        <p className="nst-sidebar-eyebrow">{sidebarQuery ? `Search Results (${visibleMenuGroups.reduce((sum, group) => sum + group.items.length, 0)})` : 'Workspace'}</p>
        {visibleMenuGroups.length === 0 && <div className="nst-sidebar-search-empty">No permitted page matches this search.</div>}
        {visibleMenuGroups.map((group) => {
          const GroupIcon = group.icon || Home;
          const groupIsCurrent = group.title === activeGroupTitle;
          const groupOpen = groupIsCurrent || Boolean(openGroups[group.title]);
          const direct = Boolean(group.direct);
          return <div className={`nst-nav-group ${groupIsCurrent ? 'is-current' : ''}`} key={group.title}>
            {!direct && !collapsed && <button type="button" className="nst-nav-group-button" onClick={() => toggleGroup(group.title)} aria-expanded={groupOpen} aria-current={groupIsCurrent ? 'true' : undefined}>
              <span><BusinessOsIcon icon={GroupIcon} size={15}/>{group.label}</span><ChevronDown size={14} className={groupOpen ? 'rotate-180' : ''}/>
            </button>}
            {(direct || groupOpen || collapsed) && <div className="nst-nav-items">
              {group.items.map((item) => {
                const ItemIcon = item.icon || Home;
                const itemActive = item.path === activeItemPath;
                return <NavLink key={item.path} to={item.path} onMouseEnter={() => { if (item.path === '/profile') preloadProfileSettings(); }} onFocus={() => { if (item.path === '/profile') preloadProfileSettings(); }} className={() => `nst-nav-link ${itemActive ? 'is-active' : ''}`} aria-current={itemActive ? 'page' : undefined} aria-label={item.label}>
                  <span className="nst-nav-icon"><BusinessOsIcon icon={ItemIcon} size={19}/></span><span className="nst-nav-label">{item.label}</span>{item.status && !collapsed && <span className={`nst-module-status-dot is-${item.status}`} title={item.status === 'ready' ? 'Ready' : item.status === 'development' ? 'Under Development' : 'Planned'}/>} {collapsed && <ShellTooltip label={`${item.label}${item.status === 'development' ? ' — Under Development' : ''}`}/>}
                </NavLink>;
              })}
            </div>}
          </div>;
        })}

      </nav>

      <div className="nst-business-health">
        <NavLink to="/business-health" className="flex items-center gap-3"><span className="nst-health-dot"/><div className="nst-nav-label"><strong>Business Health</strong><small>Open live status</small></div></NavLink>
      </div>
      {!hidden && <button type="button" className="nst-sidebar-desktop-cycle" onClick={onDesktopModeChange} aria-label="Change sidebar mode">
        {collapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}<span className="nst-nav-label">{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
      </button>}
    </aside>
  </>;
}

function GlobalSearch() {
  const { settings } = useNstSystemUi();
  const t = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchHeld, setSearchHeld] = useState(false);
  const inputRef = useRef(null);
  const searchNowRef = useRef(false);

  useEffect(() => {
    const handler = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setOpen(true); setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (searchHeld || query.trim().length < 2) { setResults([]); return undefined; }
    const delay = searchNowRef.current ? 0 : 280;
    searchNowRef.current = false;
    const timer = setTimeout(async () => {
      try {
        const response = await corporateOpsService.centralSearch(query.trim());
        const payload = response?.data || {};
        setResults(Array.isArray(payload.data) ? payload.data : (payload.items || []));
      } catch { setResults([]); }
    }, delay);
    return () => clearTimeout(timer);
  }, [query, searchHeld]);

  const handleScan = (value) => {
    setScannerOpen(false);
    const autoSearch = settings?.scanner_auto_search !== false;
    searchNowRef.current = autoSearch;
    setSearchHeld(!autoSearch);
    setQuery(value);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return <div className={`nst-global-search ${open ? 'is-open' : ''}`}>
    <Search size={18}/><input ref={inputRef} value={query} onFocus={() => setOpen(true)} onChange={(event) => { setSearchHeld(false); setQuery(event.target.value); }} onKeyDown={(event) => { if (event.key === 'Enter' && searchHeld) { event.preventDefault(); searchNowRef.current = true; setSearchHeld(false); setOpen(true); } }} placeholder={t('global_search.placeholder')} aria-label={t('global_search.aria')}/>
    {settings?.scanner_enabled !== false && <button type="button" className="nst-scan-button" onClick={() => setScannerOpen(true)} aria-label={t('global_search.scan_aria')} title={t('global_search.scan_title')}><ScanLine size={17}/></button>}
    <kbd>Ctrl K</kbd>
    {open && searchHeld && query.trim().length >= 2 && <div className="nst-search-results nst-overlay-scroll" tabIndex="0"><p>{t('global_search.press_enter')}</p></div>}
    {open && !searchHeld && query.trim().length >= 2 && <div className="nst-search-results nst-overlay-scroll" tabIndex="0">
      {results.length ? results.slice(0,12).map((item,index) => <NavLink key={`${item.id || index}-${index}`} to={item.url || '/device-history'} onClick={() => setOpen(false)}>
        <strong>{item.product_name || item.title || item.name || t('global_search.result_fallback')}</strong><span>{item.sku_barcode || item.imei_1 || item.subtitle || ''}</span>
      </NavLink>) : <p>{t('global_search.no_results')}</p>}
    </div>}
    {settings?.scanner_enabled !== false && <NstScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleScan}/>}
  </div>;
}

/* Notification payment rows */
function nstPaymentRows(response) {
  const payload = response?.data?.data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(response?.data?.transactions)) return response.data.transactions;
  return [];
}

function nstPaymentActivityNotifications(response) {
  const titleByStatus = {
    paid: 'Payment Verified',
    refunded: 'Refund Completed',
    validation_failed: 'Payment Validation Failed',
    init_failed: 'Payment Initiation Failed',
    failed: 'Payment Failed',
    cancelled: 'Payment Cancelled',
  };
  const statuses = new Set(Object.keys(titleByStatus));

  return nstPaymentRows(response)
    .filter((row) => statuses.has(String(row?.status || '').toLowerCase()))
    .map((row) => {
      const status = String(row?.status || '').toLowerCase();
      const provider = String(row?.provider || 'payment').toUpperCase();
      const orderNo = row?.order?.order_no || row?.customer_order?.order_no || row?.order_no || row?.customer_order_id || 'NST order';
      const amountValue = status === 'refunded' ? (row?.refund_amount || row?.amount || 0) : (row?.amount || 0);
      const amount = Number(amountValue || 0);
      const formattedAmount = Number.isFinite(amount)
        ? `৳${new Intl.NumberFormat('en-BD', { maximumFractionDigits: 2 }).format(amount)}`
        : '';
      const createdAt = row?.refunded_at || row?.paid_at || row?.failed_at || row?.updated_at || row?.created_at || null;
      const gatewayRef = row?.provider_transaction_id || row?.gateway_ref || row?.transaction_no || '';

      return {
        id: `gateway-${row?.id || gatewayRef || orderNo}-${status}-${createdAt || ''}`,
        type: 'activity',
        title: `${provider} ${titleByStatus[status]}`,
        message: [String(orderNo), formattedAmount, gatewayRef].filter(Boolean).join(' · '),
        created_at: createdAt,
        url: '/settings/payment-gateways',
      };
    });
}
function Topbar({ desktopMode, onSidebarAction, onMobileOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const branding = useAdminBranding();
  const brand = useNstBrand(branding);
  const t = useT();
  const name = user?.user?.name || user?.name || 'Admin';
  const roles = getRoles(user).join(', ') || 'admin';
  const photo = user?.user?.profile_photo_url || user?.profile_photo_url || '';
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [actionSummary, setActionSummary] = useState({ notifications: [], counts: {}, health: null });
  const [paymentNotifications, setPaymentNotifications] = useState([]);
  const [summaryError, setSummaryError] = useState(false);
  const [notificationLastSyncAt, setNotificationLastSyncAt] = useState(null);

  /*
   * Read state is per signed-in staff identity and browser.
   * Fingerprints include title/message/status-time data so a later refund or
   * payment-state change can become unread even for the same transaction row.
   */
  const notificationReadStorageKey = `nst:notification-read:v1:${String(
    user?.user?.id || user?.id || user?.user?.email || user?.email || name || 'staff'
  )}`;
  const [readNotificationKeys, setReadNotificationKeys] = useState([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(notificationReadStorageKey) || '[]');
      setReadNotificationKeys(Array.isArray(stored) ? stored : []);
    } catch {
      setReadNotificationKeys([]);
    }
  }, [notificationReadStorageKey]);
  const actionRef = useRef(null);

  /* Notification polling */
  useEffect(() => {
    let mounted = true;
    let timer = 0;
    let failures = 0;
    let loading = false;
    let rerunRequested = false;

    const schedule = (delay) => {
      window.clearTimeout(timer);
      if (!mounted) return;
      timer = window.setTimeout(load, delay);
    };

    const mergeSummarySafely = (previous, response) => {
      const next = response?.data?.data;
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        return previous;
      }

      return {
        ...previous,
        ...next,
        notifications: Array.isArray(next.notifications) ? next.notifications : (previous?.notifications || []),
        counts: next.counts && typeof next.counts === 'object' && !Array.isArray(next.counts)
          ? { ...(previous?.counts || {}), ...next.counts }
          : (previous?.counts || {}),
        health: next.health ?? previous?.health ?? null,
      };
    };

    const load = async () => {
      if (!mounted) return;

      if (loading) {
        rerunRequested = true;
        return;
      }

      if (document.visibilityState === 'hidden') {
        schedule(15000);
        return;
      }

      loading = true;
      rerunRequested = false;

      const cacheBust = Date.now();
      const [summaryResult, paymentResult] = await Promise.allSettled([
        api.get('/dashboard/action-summary', { params: { _nst_rt: cacheBust } }),
        api.get('/payment-gateways/transactions', { params: { per_page: 20, _nst_rt: cacheBust } }),
      ]);

      if (!mounted) return;

      let anySuccess = false;

      if (summaryResult.status === 'fulfilled') {
        const response = summaryResult.value;
        const next = response?.data?.data;

        if (next && typeof next === 'object' && !Array.isArray(next)) {
          setActionSummary((previous) => mergeSummarySafely(previous, response));
          anySuccess = true;
        }
      }

      if (paymentResult.status === 'fulfilled') {
        const rows = nstPaymentRows(paymentResult.value);
        if (Array.isArray(rows)) {
          setPaymentNotifications(nstPaymentActivityNotifications(paymentResult.value));
          anySuccess = true;
        }
      }

      if (anySuccess) {
        failures = 0;
        setSummaryError(false);
        setNotificationLastSyncAt(new Date());
      } else {
        failures += 1;
        setSummaryError(true);
      }

      loading = false;

      if (rerunRequested) {
        schedule(50);
        return;
      }

      schedule(anySuccess
        ? 3000
        : Math.min(30000, 3000 * (2 ** Math.min(failures, 3))));
    };

    const requestImmediateRefresh = () => {
      schedule(30);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestImmediateRefresh();
      }
    };

    load();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('nst-operating-event-refresh', requestImmediateRefresh);

    return () => {
      mounted = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('nst-operating-event-refresh', requestImmediateRefresh);
    };
  }, []);

  useEffect(() => {
    const close = (event) => {
      if (actionRef.current && !actionRef.current.contains(event.target)) {
        setProfileOpen(false); setNotificationOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const handleLogout = async () => {
    setProfileOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  const liveNotifications = useMemo(() => {
    const combined = [...(actionSummary?.notifications || []), ...paymentNotifications];
    const seen = new Set();
    return combined
      .filter((item) => {
        const key = String(item?.id || `${item?.title || ''}|${item?.message || ''}|${item?.created_at || ''}`);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
      .slice(0, 20);
  }, [actionSummary?.notifications, paymentNotifications]);
  const notificationFingerprint = (item) => [
    item?.id ?? '',
    item?.type ?? '',
    item?.title ?? '',
    item?.message ?? '',
    item?.created_at ?? item?.updated_at ?? '',
  ].map((part) => String(part)).join('|');

  const readNotificationSet = new Set(readNotificationKeys);
  const unreadNotifications = liveNotifications.filter(
    (item) => !readNotificationSet.has(notificationFingerprint(item))
  );
  const notificationCount = unreadNotifications.length;

  const markAllNotificationsRead = () => {
    if (!liveNotifications.length) return;

    const next = Array.from(new Set([
      ...readNotificationKeys,
      ...liveNotifications.map(notificationFingerprint),
    ])).slice(-500);

    setReadNotificationKeys(next);

    try {
      window.localStorage.setItem(notificationReadStorageKey, JSON.stringify(next));
    } catch {
      // Keep the current-session read state even if browser storage is blocked.
    }
  };
  const bulletinCount = Number(actionSummary?.counts?.unread_bulletins || 0);
  const chatCount = Number(actionSummary?.counts?.unread_chat || 0);

  return <header className={`nst-business-topbar sidebar-${desktopMode}`}>
    <div className="nst-header-leading">
      <button type="button" className="nst-mobile-menu" onClick={onMobileOpen} aria-label="Open navigation"><Menu size={20}/></button>
      <button type="button" className="nst-desktop-sidebar-action" onClick={onSidebarAction} aria-label="Cycle sidebar expanded, collapsed and hidden modes">
        {desktopMode === 'expanded' ? <PanelLeftClose size={20}/> : <PanelLeftOpen size={20}/>}
      </button>
      <div className="nst-header-brand"><strong>{brand.title}</strong><span>{t('brand.workspace_tagline')}</span></div>
    </div>
    <GlobalSearch/>
    <div className="nst-header-actions" ref={actionRef}>
      <NavLink to="/sales/create" className="nst-quick-command" title="Open Quick Command / New Sale"><Command size={17}/><span>Quick Command</span></NavLink>
      <NavLink to="/staff-chat" className="nst-icon-action" aria-label={`Staff Chat${chatCount ? `, ${chatCount} unread` : ''}`} title="Staff Chat"><MessageCircle size={18}/>{chatCount > 0 && <b className="nst-action-count">{chatCount > 99 ? '99+' : chatCount}</b>}</NavLink>
      <NavLink to="/dashboard-targets" className="nst-icon-action" aria-label="Calendar and Today's Target" title="Calendar & Today's Target"><CalendarDays size={18}/></NavLink>
      <div className="relative">
        <button type="button" onClick={() => { window.dispatchEvent(new Event('nst-operating-event-refresh')); setNotificationOpen((open) => !open); setProfileOpen(false); }} className="nst-icon-action" aria-label={`Notifications${notificationCount ? `, ${notificationCount} items` : ''}`} title="Realtime Business Notifications"><Bell size={18}/>{notificationCount > 0 && <b className="nst-action-count">{notificationCount > 99 ? '99+' : notificationCount}</b>}</button>
        {notificationOpen && <div className="nst-action-popover nst-overlay-scroll">
          <div className="nst-action-popover-head"><div><strong>Notifications</strong><span>{summaryError ? 'Live feed delayed — showing last known updates' : `Live business activity${notificationLastSyncAt ? ` · synced ${notificationLastSyncAt.toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}`}</span></div><button type="button" className="nst-notification-all-read" onClick={markAllNotificationsRead} disabled={notificationCount === 0} title="Mark all current notifications as read">All Read</button></div>
          {liveNotifications.length ? liveNotifications.map((item) => <NavLink key={item.id} to={item.url || '/audit-logs'} onClick={() => setNotificationOpen(false)} className="nst-action-notification"><span className={`is-${item.type || 'activity'}`}/><div><strong>{item.title}</strong><p>{item.message}</p><small>{item.created_at ? new Date(item.created_at).toLocaleString('en-BD') : ''}</small></div></NavLink>) : <p className="nst-action-empty">{summaryError ? 'The authenticated notification feed did not respond.' : 'No business notification is available.'}</p>}
          <NavLink to="/business-health" onClick={() => setNotificationOpen(false)} className="nst-action-health"><Activity size={15}/><span>Business Health: {actionSummary?.health?.overall_status || 'not checked'}</span></NavLink>
        </div>}
      </div>
      <NavLink to="/business-bulletins" className="nst-icon-action" aria-label={`Business Bulletins${bulletinCount ? `, ${bulletinCount} unread` : ''}`} title="Business Bulletins"><Megaphone size={18}/>{bulletinCount > 0 && <b className="nst-action-count">{bulletinCount > 99 ? '99+' : bulletinCount}</b>}</NavLink>
      <LanguageSwitcher className="nst-header-language"/>
      <NavLink to="/settings" className="nst-icon-action nst-settings-action" aria-label="Settings" title="Settings"><Settings size={18}/></NavLink>
      <div className="nst-profile-menu-wrap">
        <button type="button" className="nst-profile-chip" onClick={() => { setProfileOpen((open) => !open); setNotificationOpen(false); }} aria-haspopup="menu" aria-expanded={profileOpen ? 'true' : 'false'}>
          <span className="nst-avatar">{photo && <img src={photo} alt={name} onError={(event) => { event.currentTarget.style.display='none'; }}/>}<b>{name.slice(0,1).toUpperCase()}</b></span>
          <span className="nst-profile-copy"><strong>{name}</strong><small>{roles}</small></span><ChevronDown size={14}/>
        </button>
        {profileOpen && <div className="nst-profile-dropdown" role="menu">
          <NavLink to="/profile" onMouseEnter={preloadProfileSettings} onFocus={preloadProfileSettings} onClick={() => setProfileOpen(false)} role="menuitem">Profile</NavLink>
          <NavLink to="/settings" onClick={() => setProfileOpen(false)} role="menuitem">Settings</NavLink>
          <button type="button" onClick={handleLogout} role="menuitem" className="is-logout"><LogOut size={15}/> Logout</button>
        </div>}
      </div>
    </div>
  </header>;
}

function AdminLayout({ children }) {
  const { user } = useAuth();
  const storageKey = userStorageKey(user, 'sidebar-mode');
  const [desktopMode, setDesktopMode] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return ['expanded','collapsed','hidden'].includes(saved) ? saved : 'expanded';
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { localStorage.setItem(storageKey, desktopMode); }, [desktopMode, storageKey]);
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, []);

  const cycleMode = () => setDesktopMode((mode) => mode === 'expanded' ? 'collapsed' : mode === 'collapsed' ? 'hidden' : 'expanded');
  const superAdminDesign = getRoles(user).includes('super_admin');
  return <NstSystemUiProvider><div className={`nst-business-shell sidebar-${desktopMode}`}>
    <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} desktopMode={desktopMode} onDesktopModeChange={cycleMode}/>
    <Topbar desktopMode={desktopMode} onSidebarAction={cycleMode} onMobileOpen={() => setMobileOpen(true)}/>
    <main className="nst-shell-main nst-ios-compact-ui"><NstQaErrorBoundary>{children}</NstQaErrorBoundary></main>
    <NstInlineSectionEditor enabled={superAdminDesign}/>
    <NstSaveStatus/>
    <NstQaTracker auth={user}/>
  </div></NstSystemUiProvider>;
}

function AccessDenied() {
  return (
    <div className="p-6">
      <div className="rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-black text-red-600">Access Denied</h1>
        <p className="mt-2 text-sm text-slate-500">This module or action is not allowed for your current role or permission.</p>
      </div>
    </div>
  );
}

function ProtectedPage({ children, policy }) {
  const { user } = useAuth();
  const allowed = accessRules.canOpenPage(user, policy);

  return (
    <ProtectedRoute>
      <AdminLayout>
        <Suspense fallback={<AdminContentLoader/>}>
          {allowed ? children : <AccessDenied />}
        </Suspense>
      </AdminLayout>
    </ProtectedRoute>
  );
}

function Placeholder({ title }) {
  return (
    <div className="p-6">
      <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-black text-slate-950">{title}</h1>
        <p className="mt-2 text-slate-500">This module route is ready.</p>
        <p className="mt-1 text-slate-500">This module route is ready.</p>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <BrowserRouter basename="/pos">
      <Routes>
        <Route path="/login" element={<PublicSystemUiPage><Login /></PublicSystemUiPage>} />
        <Route path="/warranty-check" element={<PublicLazyPage><PublicWarrantyCheck /></PublicLazyPage>} />
        <Route path="/invoice-public/:invoiceNo" element={<PublicLazyPage><PublicInvoicePage /></PublicLazyPage>} />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<ProtectedPage><CorporateDashboard /></ProtectedPage>} />
        <Route path="/dashboard-layout" element={<ProtectedPage><DashboardLayoutStudio /></ProtectedPage>} />
        <Route path="/dashboard-targets" element={<ProtectedPage><DashboardTargetsPage /></ProtectedPage>} />
        <Route path="/customer-support" element={<ProtectedPage><CustomerSupportPortal /></ProtectedPage>} />
        <Route path="/staff-chat" element={<ProtectedPage><StaffChatPage /></ProtectedPage>} />
        <Route path="/business-bulletins" element={<ProtectedPage><BusinessBulletinCenter /></ProtectedPage>} />
        <Route path="/business-health" element={<ProtectedPage><BusinessHealthPage /></ProtectedPage>} />
        <Route path="/module/:moduleKey" element={<ProtectedPage><EnterpriseModuleRouter /></ProtectedPage>} />
        <Route path="/finance-center" element={<ProtectedPage><EnterpriseSuitePage stage="finance" /></ProtectedPage>} />
        <Route path="/crm-center" element={<ProtectedPage><EnterpriseSuitePage stage="crm" /></ProtectedPage>} />
        <Route path="/hrm" element={<ProtectedPage><EnterpriseSuitePage stage="hrm" /></ProtectedPage>} />
        <Route path="/website-operations" element={<ProtectedPage policy="superAdmin"><WebsiteOperations /></ProtectedPage>} />
        <Route path="/cms-operations" element={<ProtectedPage policy="superAdmin"><EnterpriseSuitePage stage="cms" /></ProtectedPage>} />
        <Route path="/products" element={<ProtectedPage policy="productsView"><ProductList /></ProtectedPage>} />
        <Route path="/products/create" element={<ProtectedPage policy="manageProducts"><ProductForm /></ProtectedPage>} />
        <Route path="/products/:id/edit" element={<ProtectedPage policy="manageProducts"><ProductForm /></ProtectedPage>} />
        <Route path="/products/variant-operations" element={<ProtectedPage policy="manageProducts"><ProductVariantMatrix /></ProtectedPage>} />
        <Route path="/products/:id/variant-operations" element={<ProtectedPage policy="manageProducts"><ProductVariantMatrix /></ProtectedPage>} />
        <Route path="/products/image-gallery" element={<ProtectedPage policy="manageProducts"><ProductImageGallery /></ProtectedPage>} />
        <Route path="/catalog" element={<ProtectedPage policy="manageCatalog"><CategoryBrandManager /></ProtectedPage>} />
        <Route path="/branches" element={<ProtectedPage><BranchList /></ProtectedPage>} />
        <Route path="/branches/create" element={<ProtectedPage><BranchForm /></ProtectedPage>} />
        <Route path="/branches/:id/edit" element={<ProtectedPage><BranchForm /></ProtectedPage>} />
        <Route path="/branches/:id/stock" element={<ProtectedPage><BranchStock /></ProtectedPage>} />
        <Route path="/branch-stock-requests" element={<ProtectedPage><BranchStockRequests /></ProtectedPage>} />
        <Route path="/used-purchase" element={<ProtectedPage policy="usedPurchase"><UsedPurchaseList /></ProtectedPage>} />
        <Route path="/used-purchase/create" element={<ProtectedPage policy="usedPurchase"><UsedPurchaseForm /></ProtectedPage>} />
        <Route path="/used-purchase/:id/edit" element={<ProtectedPage policy="usedPurchase"><UsedPurchaseForm /></ProtectedPage>} />
        <Route path="/used-purchase/:purchaseId/prepare-sale" element={<ProtectedPage policy="usedPurchase"><PrepareForSalePage /></ProtectedPage>} />
        <Route path="/sales/create" element={<ProtectedPage><SaleForm /></ProtectedPage>} />
        <Route path="/sales" element={<ProtectedPage><SaleList /></ProtectedPage>} />
        <Route path="/sales/:id/invoice" element={<ProtectedPage><SaleInvoice /></ProtectedPage>} />
        <Route path="/sales/:id/print" element={<ProtectedPage><SaleInvoice /></ProtectedPage>} />
        <Route path="/sales/:id/view" element={<ProtectedPage><SaleInvoice /></ProtectedPage>} />
        <Route path="/sales/:id/view-print" element={<ProtectedPage><SaleInvoice /></ProtectedPage>} />
        <Route path="/sales/:id/invoice-print" element={<ProtectedPage><SaleInvoice /></ProtectedPage>} />
        <Route path="/sales/invoice/:id" element={<ProtectedPage><SaleInvoice /></ProtectedPage>} />
        <Route path="/sales/print/:id" element={<ProtectedPage><SaleInvoice /></ProtectedPage>} />
        <Route path="/sale/:id/invoice" element={<ProtectedPage><SaleInvoice /></ProtectedPage>} />
        <Route path="/sale/:id/print" element={<ProtectedPage><SaleInvoice /></ProtectedPage>} />
        <Route path="/customers" element={<ProtectedPage policy="customerDatabase"><CustomerList /></ProtectedPage>} />
        <Route path="/customers/:id/ledger" element={<ProtectedPage policy="customerDatabase"><CustomerLedger /></ProtectedPage>} />
        <Route path="/suppliers" element={<ProtectedPage policy="supplierInfo"><SupplierList /></ProtectedPage>} />
        <Route path="/suppliers/:id/ledger" element={<ProtectedPage policy="supplierInfo"><SupplierLedger /></ProtectedPage>} />
        <Route path="/purchases" element={<ProtectedPage policy="managePurchases"><PurchaseList /></ProtectedPage>} />
        <Route path="/purchases/create" element={<ProtectedPage policy="managePurchases"><PurchaseForm /></ProtectedPage>} />
        <Route path="/inventory-control" element={<ProtectedPage policy="deviceStock"><InventoryControlCenter /></ProtectedPage>} />
        <Route path="/device-stock" element={<ProtectedPage policy="deviceStock"><DeviceStockList /></ProtectedPage>} />
        <Route path="/device-stock/:deviceId/prepare-sale" element={<ProtectedPage policy="deviceStock"><PrepareForSalePage /></ProtectedPage>} />
        <Route path="/device-history" element={<ProtectedPage policy="deviceStock"><DeviceHistoryPage /></ProtectedPage>} />
        <Route path="/reports" element={<ProtectedPage policy="reports"><ReportDashboard /></ProtectedPage>} />
        <Route path="/salesman-reports" element={<ProtectedPage><SalesmanReports /></ProtectedPage>} />
        <Route path="/salesmen" element={<Navigate to="/salesman-reports" replace />} />
        <Route path="/accounts" element={<ProtectedPage policy="accountingArea"><AccountsDashboard /></ProtectedPage>} />
        <Route path="/customer-due-collection" element={<ProtectedPage policy="accountingArea"><CustomerDueCollection /></ProtectedPage>} />
        <Route path="/supplier-payments" element={<ProtectedPage policy="supplierInfo"><SupplierPayments /></ProtectedPage>} />
        <Route path="/expenses" element={<ProtectedPage policy="accountingArea"><ExpenseList /></ProtectedPage>} />
        <Route path="/warranty-service" element={<ProtectedPage><WarrantyServicePage /></ProtectedPage>} />
        <Route path="/bookings" element={<ProtectedPage><BookingPreorderPage /></ProtectedPage>} />
        <Route path="/external-preorders" element={<ProtectedPage><ExternalPreorderAdminPage /></ProtectedPage>} />
        <Route path="/customer-messages" element={<ProtectedPage><CustomerInboxPage /></ProtectedPage>} />
        <Route path="/marketing" element={<ProtectedPage><MarketingMessagingPage /></ProtectedPage>} />
        <Route path="/google-posts" element={<ProtectedPage policy="googlePosts"><GooglePostList /></ProtectedPage>} />
        <Route path="/google-posts/create" element={<ProtectedPage policy="googlePosts"><GooglePostForm /></ProtectedPage>} />
        <Route path="/google-posts/:id/edit" element={<ProtectedPage policy="googlePosts"><GooglePostForm /></ProtectedPage>} />
        <Route path="/coupons" element={<ProtectedPage><CouponOfferPage /></ProtectedPage>} />
        <Route path="/website-control-center" element={<ProtectedPage policy="superAdmin"><WebsiteControlCenter /></ProtectedPage>} />
        <Route path="/file-center" element={<ProtectedPage policy="superAdmin"><FileCenterPage /></ProtectedPage>} />
        <Route path="/website-experience-center" element={<ProtectedPage policy="superAdmin"><WebsiteExperienceCenter /></ProtectedPage>} />
        <Route path="/app-center-manager" element={<Navigate to="/website-control-center" replace />} />
        <Route path="/security-center" element={<ProtectedPage><SecurityCenterPage /></ProtectedPage>} />
        <Route path="/patch-manager" element={<ProtectedPage policy="superAdmin"><PatchManagerPage /></ProtectedPage>} />
        <Route path="/settings/emi" element={<ProtectedPage><EmiSettingsPage /></ProtectedPage>} />
        <Route path="/settings/barcode-tools" element={<ProtectedPage><BarcodeToolsPage /></ProtectedPage>} />
        <Route path="/settings/smtp" element={<ProtectedPage><SmtpSettingsPage /></ProtectedPage>} />
        <Route path="/settings/corporate" element={<ProtectedPage><CorporateSettingsPage /></ProtectedPage>} />
        <Route path="/settings/corporate/dashboard" element={<ProtectedPage><DashboardAccessSettingsPage /></ProtectedPage>} />
        <Route path="/settings/corporate/:sectionKey" element={<ProtectedPage><CorporateSettingSectionPage /></ProtectedPage>} />
        <Route path="/settings/payment-gateways" element={<ProtectedPage policy="superAdmin"><PaymentGatewayManagerPage /></ProtectedPage>} />
        <Route path="/settings/delivery-gateways" element={<ProtectedPage policy="superAdmin"><DeliveryGatewayManagerPage /></ProtectedPage>} />
        <Route path="/settings/users" element={<ProtectedPage policy="superAdmin"><UserManagementPage /></ProtectedPage>} />
        <Route path="/settings" element={<ProtectedPage><SettingsPage /></ProtectedPage>} />
        <Route path="/profile" element={<ProtectedPage><ProfileSettings /></ProtectedPage>} />
        <Route path="/audit-logs" element={<ProtectedPage><AuditLogList /></ProtectedPage>} />
        <Route path="/system-health" element={<ProtectedPage><SystemHealth /></ProtectedPage>} />
        <Route path="/data-maintenance" element={<ProtectedPage policy="superAdmin"><DataMaintenance /></ProtectedPage>} />
        <Route path="/bulk-upload" element={<ProtectedPage><BulkUpload /></ProtectedPage>} />
        <Route path="/locked-operations" element={<ProtectedPage><LockedOperationsPage /></ProtectedPage>} />
        <Route path="/stock-adjustments" element={<ProtectedPage><StockAdjustmentPage /></ProtectedPage>} />
        <Route path="/exchanges" element={<ProtectedPage><ExchangePage /></ProtectedPage>} />
        <Route path="/deliveries" element={<ProtectedPage><DeliveryPage /></ProtectedPage>} />
        <Route path="/orders" element={<ProtectedPage><CustomerOrdersPage /></ProtectedPage>} />
        <Route path="/web-sales" element={<ProtectedPage><WebSalesEnterprisePage /></ProtectedPage>} />
        <Route path="/reports/web-sales" element={<ProtectedPage><WebSalesReportPage /></ProtectedPage>} />
        <Route path="/barcode-history" element={<ProtectedPage><BarcodeHistoryPage /></ProtectedPage>} />
        <Route path="/users-access" element={<ProtectedPage policy="superAdmin"><UsersAccessEnterprisePage /></ProtectedPage>} />
        <Route path="/products/new" element={<Navigate to="/products/create" replace />} />
        <Route path="/products/used" element={<Navigate to="/used-purchase" replace />} />
        <Route path="/products/pre-owned" element={<Navigate to="/used-purchase" replace />} />
        <Route path="/device-purchases/pending" element={<Navigate to="/purchases" replace />} />
        <Route path="/messages" element={<Navigate to="/customer-messages" replace />} />
        <Route path="/security" element={<Navigate to="/security-center" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AdminBootstrap><AppRoutes /></AdminBootstrap>
      </AuthProvider>
    </I18nProvider>
  );
}
