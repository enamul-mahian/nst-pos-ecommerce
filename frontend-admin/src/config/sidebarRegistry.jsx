import {
  LayoutDashboard, Package, ShoppingCart, Users, Truck, UserCog, Wallet, Settings,
  Smartphone, Sparkles, RotateCcw, ShieldCheck, BarChart3, ReceiptText, Banknote,
  ClipboardList, Database, CheckCircle2, Wrench, Globe2, Building2, BriefcaseBusiness,
  MessageCircle, HeartHandshake, Tags, FileText, Megaphone, AppWindow, LockKeyhole, Activity,
} from 'lucide-react';

export const SIDEBAR_REGISTRY = [
  { id:'dashboard', name:'Dashboard', icon:LayoutDashboard, path:'/dashboard', category:'Main' },
  { id:'products', name:'Products', icon:Package, category:'Products', children:[
    { id:'products-all', name:'All Products', path:'/products', icon:Package, policy:'productsView' },
    { id:'products-new', name:'New Devices', path:'/products/new', icon:Sparkles, policy:'productsView' },
    { id:'products-used', name:'Used Devices', path:'/products/used', icon:RotateCcw, policy:'productsView' },
    { id:'products-preowned', name:'Pre-Owned Devices', path:'/products/pre-owned', icon:ShieldCheck, policy:'productsView' },
    { id:'catalog', name:'Brands & Categories', path:'/catalog', icon:Tags, policy:'manageCatalog' },
  ]},
  { id:'used-purchase-group', name:'Used/Pre-Owned Purchase', icon:Smartphone, category:'Products', children:[
    { id:'used-purchase', name:'Purchase Entries', path:'/used-purchase', icon:Smartphone, policy:'usedPurchase' },
    { id:'used-pending', name:'Pending Verification', path:'/device-purchases/pending', icon:ShieldCheck, policy:'manageProducts' },
  ]},
  { id:'pos-sale', name:'POS Sale', icon:ReceiptText, path:'/sales/create', category:'Sales' },
  { id:'sales-list', name:'Sales List', icon:ShoppingCart, path:'/sales', category:'Sales' },
  { id:'web-sales', name:'Web Sales', icon:Globe2, path:'/web-sales', category:'Sales', policy:'accountingArea' },
  { id:'crm-center', name:'CRM Center', icon:HeartHandshake, path:'/crm-center', category:'CRM', policy:'customerDatabase' },
  { id:'customers', name:'Customers', icon:Users, path:'/customers', category:'CRM', policy:'customerDatabase' },
  { id:'suppliers', name:'Suppliers', icon:Truck, path:'/suppliers', category:'Purchases', policy:'supplierInfo' },
  { id:'purchases', name:'Purchases', icon:Package, path:'/purchases', category:'Purchases', policy:'managePurchases' },
  { id:'device-stock', name:'Device Stock / IMEI', icon:Smartphone, path:'/device-stock', category:'Inventory', policy:'deviceStock' },
  { id:'stock-transfer', name:'Stock Transfer', icon:Building2, path:'/branch-stock-requests', category:'Inventory', policy:'deviceStock' },
  { id:'warranty-service', name:'Warranty / Service', icon:Wrench, path:'/warranty-service', category:'Service' },
  { id:'salesman-reports', name:'Salesman Reports', icon:UserCog, path:'/salesman-reports', category:'Reports', policy:'reports' },
  { id:'finance-center', name:'Finance Center', icon:Wallet, path:'/finance-center', category:'Accounts', policy:'accountingArea' },
  { id:'accounts', name:'Legacy Accounts', icon:Wallet, path:'/accounts', category:'Accounts', policy:'accountingArea' },
  { id:'customer-due', name:'Customer Due Collection', icon:Banknote, path:'/customer-due-collection', category:'Accounts', policy:'accountingArea' },
  { id:'supplier-payments', name:'Supplier Payments', icon:Banknote, path:'/supplier-payments', category:'Accounts', policy:'accountingArea' },
  { id:'expenses', name:'Expenses', icon:ReceiptText, path:'/expenses', category:'Accounts', policy:'accountingArea' },
  { id:'all-reports', name:'All Reports', icon:BarChart3, path:'/reports', category:'Reports', policy:'reports' },
  { id:'web-sales-report', name:'Web Sales Report', icon:BarChart3, path:'/reports/web-sales', category:'Reports', policy:'reports' },
  { id:'barcode-history', name:'Barcode History', icon:ClipboardList, path:'/barcode-history', category:'Inventory', policy:'reports' },
  { id:'audit-logs', name:'Activity Logs', icon:ClipboardList, path:'/audit-logs', category:'Security', policy:'accountingArea' },
  { id:'hrm', name:'HRM & Payroll', icon:BriefcaseBusiness, path:'/hrm', category:'HRM' },
  { id:'messages', name:'Customer Inbox', icon:MessageCircle, path:'/messages', category:'CRM' },
  { id:'website-operations', name:'Website Operations', icon:Globe2, path:'/website-operations', category:'Website', policy:'superAdmin' },
  { id:'website', name:'Website Control Center', icon:Globe2, path:'/website-control-center', category:'Website', policy:'superAdmin' },
  { id:'marketing', name:'Marketing Center', icon:Megaphone, path:'/marketing', category:'Marketing', policy:'accountingArea' },
  { id:'users', name:'Users', icon:UserCog, path:'/settings/users', category:'Security', policy:'superAdmin' },
  { id:'users-access', name:'Users & Access', icon:ShieldCheck, path:'/users-access', category:'Security', policy:'superAdmin' },
  { id:'system-health', name:'System Health', icon:CheckCircle2, path:'/system-health', category:'Hub', policy:'superAdmin' },
  { id:'data-maintenance', name:'Backup & Export', icon:Database, path:'/data-maintenance', category:'Hub', policy:'superAdmin' },
  { id:'security-center', name:'Security Center', icon:LockKeyhole, path:'/security', category:'Security', policy:'superAdmin' },
  { id:'patch-manager', name:'Patch Manager', icon:Activity, path:'/patch-manager', category:'Hub', policy:'superAdmin' },
  { id:'corporate-settings', name:'Corporate Settings', icon:Settings, path:'/settings/corporate', category:'Settings' },
  { id:'settings', name:'Settings', icon:Settings, path:'/settings', category:'Settings', policy:'superAdmin' },
];

export function permittedSidebarRegistry(user, accessRules) {
  const allowed = (item) => item.status !== 'development' && (!item.policy || accessRules.canOpenPage(user, item.policy));
  return SIDEBAR_REGISTRY.map(item => item.children
    ? {...item, children:item.children.filter(allowed)}
    : item
  ).filter(item => allowed(item) && (!item.children || item.children.length));
}

export function flattenSidebarRegistry(items) {
  return items.flatMap(item => item.children
    ? item.children.map(child => ({...child, parentId:item.id, parentName:item.name, category:item.category || item.name}))
    : [{...item, parentId:null, parentName:null}]
  );
}
