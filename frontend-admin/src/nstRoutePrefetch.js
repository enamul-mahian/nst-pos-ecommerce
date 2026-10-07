// Preloads admin page code in the background after the app starts,
// so opening a page from the sidebar is instant (no loading delay).
// Safe: only downloads code; it does not call APIs or change data.
const loaders = [
  () => import('./pages/WebSalesEnterprisePage'),
  () => import('./pages/accounts/AccountsDashboard'),
  () => import('./pages/audit-logs/AuditLogList'),
  () => import('./pages/barcode-tools/BarcodeToolsPage'),
  () => import('./pages/bookings/BookingPreorderPage'),
  () => import('./pages/bookings/ExternalPreorderAdminPage'),
  () => import('./pages/branches/BranchForm'),
  () => import('./pages/branches/BranchList'),
  () => import('./pages/branches/BranchStock'),
  () => import('./pages/branches/BranchStockRequests'),
  () => import('./pages/bulk-upload/BulkUpload'),
  () => import('./pages/catalog/CategoryBrandManager'),
  () => import('./pages/coupons/CouponOfferPage'),
  () => import('./pages/customers/CustomerLedger'),
  () => import('./pages/customers/CustomerList'),
  () => import('./pages/dashboard-final/BusinessBulletinCenter'),
  () => import('./pages/dashboard-final/BusinessHealthPage'),
  () => import('./pages/dashboard-final/CustomerSupportPortal'),
  () => import('./pages/dashboard-final/DashboardTargetsPage'),
  () => import('./pages/dashboard-final/StaffChatPage'),
  () => import('./pages/dashboard/CorporateDashboard'),
  () => import('./pages/dashboard/DashboardLayoutStudio'),
  () => import('./pages/device-history/DeviceHistoryPage'),
  () => import('./pages/device-stock/DeviceStockList'),
  () => import('./pages/emi/EmiSettingsPage'),
  () => import('./pages/enterprise/EnterpriseSuitePage'),
  () => import('./pages/exchanges/ExchangePage'),
  () => import('./pages/expenses/ExpenseList'),
  () => import('./pages/google-posts/GooglePostForm'),
  () => import('./pages/google-posts/GooglePostList'),
  () => import('./pages/inventory/InventoryControlCenter'),
  () => import('./pages/locked-operations/LockedOperationsPage'),
  () => import('./pages/marketing/MarketingMessagingPage'),
  () => import('./pages/messages/CustomerInboxPage'),
  () => import('./pages/orders/CustomerOrdersPage'),
  () => import('./pages/patch-manager/PatchManagerPage'),
  () => import('./pages/payments/CustomerDueCollection'),
  () => import('./pages/payments/SupplierPayments'),
  () => import('./pages/products/ProductForm'),
  () => import('./pages/products/ProductImageGallery'),
  () => import('./pages/products/ProductList'),
  () => import('./pages/products/ProductVariantMatrix'),
  () => import('./pages/profile/ProfileSettings'),
  () => import('./pages/public/PublicInvoicePage'),
  () => import('./pages/public/PublicWarrantyCheck'),
  () => import('./pages/purchases/PurchaseForm'),
  () => import('./pages/purchases/PurchaseList'),
  () => import('./pages/release-one/ReleaseOperationsPages'),
  () => import('./pages/reports/ReportDashboard'),
  () => import('./pages/reports/SalesmanReports'),
  () => import('./pages/sales/SaleForm'),
  () => import('./pages/sales/SaleInvoice'),
  () => import('./pages/sales/SaleList'),
  () => import('./pages/security/SecurityCenterPage'),
  () => import('./pages/settings/CorporateSettingsPage'),
  () => import('./pages/settings/DeliveryGatewayManagerPage'),
  () => import('./pages/settings/PaymentGatewayManagerPage'),
  () => import('./pages/settings/SettingsPage'),
  () => import('./pages/settings/SmtpSettingsPage'),
  () => import('./pages/settings/UserManagementPage'),
  () => import('./pages/settings/corporate/CorporateSettingSectionPage'),
  () => import('./pages/settings/corporate/DashboardAccessSettingsPage'),
  () => import('./pages/suppliers/SupplierLedger'),
  () => import('./pages/suppliers/SupplierList'),
  () => import('./pages/system/DataMaintenance'),
  () => import('./pages/system/SystemHealth'),
  () => import('./pages/used-purchases/UsedPurchaseForm'),
  () => import('./pages/used-purchases/UsedPurchaseList'),
  () => import('./pages/warranty-service/WarrantyServicePage'),
  () => import('./pages/website/AppCenterManager'),
  () => import('./pages/website/FileCenterPage'),
  () => import('./pages/website/WebsiteControlCenter'),
  () => import('./pages/website/WebsiteExperienceCenter'),
  () => import('./pages/website/WebsiteOperations'),
];

function runIdle(fn) {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fn, { timeout: 2500 });
  else window.setTimeout(fn, 300);
}

export function startNstRoutePrefetch() {
  if (typeof window === 'undefined' || window.__nstRoutePrefetchStarted) return;
  window.__nstRoutePrefetchStarted = true;
  if (window.location.pathname.indexOf('/login') !== -1) {
    window.setTimeout(() => { window.__nstRoutePrefetchStarted = false; startNstRoutePrefetch(); }, 8000);
    return;
  }
  let index = 0;
  const next = () => {
    if (index >= loaders.length) return;
    const load = loaders[index++];
    Promise.resolve().then(load).catch(() => {}).finally(() => runIdle(next));
  };
  window.setTimeout(() => runIdle(next), 1500);
}
