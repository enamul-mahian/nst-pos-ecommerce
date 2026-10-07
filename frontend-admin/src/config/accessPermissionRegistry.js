export const ACCESS_PERMISSION_REGISTRY = [
  { key: 'dashboard', label: 'Dashboard' }, { key: 'pos_sale', label: 'POS Sale' }, { key: 'sales_list', label: 'Sales List' },
  { key: 'device_stock', label: 'Device Stock' }, { key: 'products', label: 'Products' }, { key: 'catalog', label: 'Catalog' },
  { key: 'purchases', label: 'Purchases' }, { key: 'used_purchase', label: 'Used Purchase' }, { key: 'stock_requests', label: 'Stock Requests' },
  { key: 'branches', label: 'Branches' }, { key: 'bulk_upload', label: 'Bulk Upload' }, { key: 'customers', label: 'Customers' },
  { key: 'customer_inbox', label: 'Customer Inbox' }, { key: 'suppliers', label: 'Suppliers' }, { key: 'users_access', label: 'Users & Access' },
  { key: 'accounts', label: 'Accounts' }, { key: 'customer_due', label: 'Customer Due' }, { key: 'supplier_payments', label: 'Supplier Payments' },
  { key: 'expenses', label: 'Expenses' }, { key: 'warranty_service', label: 'Warranty / Service' }, { key: 'bookings', label: 'Bookings' },
  { key: 'coupons', label: 'Coupons & Offers' }, { key: 'messaging', label: 'Messaging' }, { key: 'google_posts', label: 'Google Posts' },
  { key: 'reports', label: 'All Reports' }, { key: 'salesman_reports', label: 'Salesman Reports' }, { key: 'activity_logs', label: 'Activity Logs' },
  { key: 'profile_settings', label: 'Profile Settings' }, { key: 'two_factor', label: 'Google Authenticator / 2FA' }, { key: 'security_center', label: 'Security Center' },
  { key: 'website_control_center', label: 'Website Control Center' }, { key: 'patch_manager', label: 'Patch Manager' }, { key: 'product_upload', label: 'Product Upload Permission' },
  { key: 'general_settings', label: 'General Settings' }, { key: 'invoice_seo', label: 'Invoice / SEO' }, { key: 'barcode_tools', label: 'Barcode Tools' },
  { key: 'emi_settings', label: 'EMI Settings' }, { key: 'system_health', label: 'System Health' }, { key: 'data_maintenance', label: 'Backup & Export / Danger Zone (Super Admin only)' },
];

export const ACCESS_PERMISSION_KEYS = ACCESS_PERMISSION_REGISTRY.map((item) => item.key);
export default ACCESS_PERMISSION_REGISTRY;
