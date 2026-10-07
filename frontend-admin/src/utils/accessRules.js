export function normalizeRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/^accounts$/, 'accountant');
}

export function getUserRoles(user) {
  const raw = user?.roles || user?.user?.roles || [];
  const roles = Array.isArray(raw) ? raw : [];
  const names = roles
    .map((role) => (typeof role === 'string' ? role : role?.name || role?.guard_name || ''))
    .filter(Boolean)
    .map(normalizeRole);

  ['role', 'user_type', 'type', 'profile_type'].forEach((field) => {
    const value = user?.[field] || user?.user?.[field];
    if (value) names.push(normalizeRole(value));
  });

  return [...new Set(names.filter(Boolean))];
}

function access(user, section) {
  return user?.access?.[section] || user?.user?.access?.[section] || {};
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function roleAny(user, allowed) {
  const roles = getUserRoles(user);
  const wanted = allowed.map(normalizeRole);
  return roles.some((role) => wanted.includes(role));
}

function flag(user, section, key, fallback = false) {
  const data = access(user, section);
  if (hasOwn(data, key)) return Boolean(data[key]);
  return fallback;
}

export const accessRules = {
  roles: getUserRoles,
  hasRole: roleAny,
  isSuperAdmin: (user) => roleAny(user, ['super_admin']),
  isAdmin: (user) => roleAny(user, ['super_admin', 'admin']),
  isAccountant: (user) => roleAny(user, ['accountant']),
  isBranchManager: (user) => roleAny(user, ['branch_manager', 'branch manager']),
  isSalesman: (user) => roleAny(user, ['salesman', 'sales_man', 'sales man']),
  isSupplier: (user) => roleAny(user, ['supplier']),
  isCustomer: (user) => roleAny(user, ['customer']),

  sidebarFlag(user, key, fallback = undefined) {
    const data = access(user, 'sidebar_permissions');
    if (hasOwn(data, key)) return Boolean(data[key]);
    return fallback;
  },

  dashboardFlag(user, key, fallback = undefined) {
    const data = access(user, 'dashboard_permissions');
    if (hasOwn(data, key)) return Boolean(data[key]);
    return fallback;
  },

  columnFlag(user, key, fallback = undefined) {
    const data = access(user, 'column_permissions');
    if (hasOwn(data, key)) return Boolean(data[key]);
    return fallback;
  },

  financialFlag(user, key, fallback = undefined) {
    const data = access(user, 'financial_permissions');
    if (hasOwn(data, key)) return Boolean(data[key]);
    return fallback;
  },

  canViewPurchasePrice(user) {
    if (this.isSalesman(user) || this.isSupplier(user) || this.isCustomer(user)) return false;
    if (roleAny(user, ['super_admin', 'admin', 'accountant'])) return true;
    return Boolean(this.financialFlag(user, 'view_purchase_price', false));
  },

  canViewUsedPurchaseBuyingPrice(user) {
    if (this.isSalesman(user) || this.isSupplier(user) || this.isCustomer(user)) return false;
    if (roleAny(user, ['super_admin', 'admin', 'accountant', 'branch_manager'])) return true;
    return Boolean(this.financialFlag(user, 'view_used_purchase_buying_price', false));
  },

  canViewProfit(user) {
    if (this.isSalesman(user) || this.isSupplier(user) || this.isCustomer(user) || this.isBranchManager(user)) return false;
    if (roleAny(user, ['super_admin', 'admin', 'accountant'])) return true;
    return Boolean(this.financialFlag(user, 'view_profit', false));
  },

  canViewDashboardFinancial(user) {
    if (!this.canViewProfit(user)) return false;
    return this.dashboardFlag(user, 'show_financial_cards', true) !== false;
  },

  canViewSupplierInfo(user) {
    if (this.isSalesman(user) || this.isSupplier(user) || this.isCustomer(user)) return false;
    if (roleAny(user, ['super_admin', 'admin', 'accountant', 'branch_manager'])) return true;
    return Boolean(this.financialFlag(user, 'view_supplier_due', false));
  },

  canUpdateSupplierDue(user) {
    if (this.isSalesman(user) || this.isSupplier(user) || this.isCustomer(user)) return false;
    if (roleAny(user, ['super_admin', 'admin', 'accountant'])) return true;
    return Boolean(this.financialFlag(user, 'update_supplier_due', false));
  },

  canViewCustomerDatabase(user) {
    if (this.isSalesman(user) || this.isSupplier(user) || this.isCustomer(user)) return false;
    if (roleAny(user, ['super_admin', 'admin', 'accountant', 'branch_manager'])) return true;
    return Boolean(this.sidebarFlag(user, 'customers', false));
  },

  canManageProducts(user) {
    if (this.isSalesman(user) || this.isSupplier(user) || this.isCustomer(user) || this.isAccountant(user)) return false;
    if (roleAny(user, ['super_admin', 'admin'])) return true;
    if (this.isBranchManager(user)) return Boolean(this.sidebarFlag(user, 'products', false));
    return false;
  },

  canViewProducts(user) {
    if (this.isSupplier(user) || this.isCustomer(user)) return false;
    if (roleAny(user, ['super_admin', 'admin', 'accountant', 'branch_manager'])) return true;
    return Boolean(this.sidebarFlag(user, 'products', false));
  },

  canUseDeviceStock(user) {
    if (this.isSupplier(user) || this.isCustomer(user)) return false;
    if (roleAny(user, ['super_admin', 'admin', 'accountant', 'branch_manager'])) return true;
    return Boolean(this.sidebarFlag(user, 'device_stock', false));
  },

  canUseUsedPurchase(user) {
    if (this.isSupplier(user) || this.isCustomer(user)) return false;
    if (roleAny(user, ['super_admin', 'admin', 'accountant', 'branch_manager'])) return true;
    return Boolean(this.sidebarFlag(user, 'used_purchase', false));
  },

  canManageCatalog(user) {
    if (this.isSalesman(user) || this.isSupplier(user) || this.isCustomer(user)) return false;
    return roleAny(user, ['super_admin', 'admin']);
  },

  canManagePurchases(user) {
    if (this.isSalesman(user) || this.isSupplier(user) || this.isCustomer(user)) return false;
    return roleAny(user, ['super_admin', 'admin', 'accountant', 'branch_manager']);
  },

  canViewAccountingArea(user) {
    if (this.isSalesman(user) || this.isSupplier(user) || this.isCustomer(user)) return false;
    return roleAny(user, ['super_admin', 'admin', 'accountant']);
  },

  canManageGooglePosts(user) {
    if (this.isSalesman(user) || this.isSupplier(user) || this.isCustomer(user)) return false;
    return roleAny(user, ['super_admin', 'admin', 'accountant']);
  },

  canViewReports(user) {
    if (this.isSupplier(user) || this.isCustomer(user)) return false;
    if (this.isSalesman(user)) return Boolean(this.sidebarFlag(user, 'salesman_reports', false));
    return roleAny(user, ['super_admin', 'admin', 'accountant', 'branch_manager']);
  },

  canAccessSidebarItem(user, item) {
    if (!item) return true;
    if (item.superOnly && !this.isSuperAdmin(user)) return false;
    if (item.guard && typeof this[item.guard] === 'function' && !this[item.guard](user)) return false;
    if (Array.isArray(item.denyRoles) && item.denyRoles.some((role) => roleAny(user, [role]))) return false;
    return true;
  },

  canOpenPage(user, policy) {
    if (!policy) return true;
    const policies = {
      superAdmin: () => this.isSuperAdmin(user),
      productsView: () => this.canViewProducts(user),
      deviceStock: () => this.canUseDeviceStock(user),
      usedPurchase: () => this.canUseUsedPurchase(user),
      manageProducts: () => this.canManageProducts(user),
      manageCatalog: () => this.canManageCatalog(user),
      managePurchases: () => this.canManagePurchases(user),
      customerDatabase: () => this.canViewCustomerDatabase(user),
      supplierInfo: () => this.canViewSupplierInfo(user),
      accountingArea: () => this.canViewAccountingArea(user),
      googlePosts: () => this.canManageGooglePosts(user),
      reports: () => this.canViewReports(user),
    };
    return policies[policy] ? policies[policy]() : true;
  },
};

export default accessRules;
