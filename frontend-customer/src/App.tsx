import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/auth/useAuthStore';
import { useSupplierAuthStore } from './store/supplier/useSupplierAuthStore';
import PublicLayout from './layouts/PublicLayout';
import { syncSiteFavicon } from './cms/favicon';
import { startTamperGuard } from './cms/tamperGuard';
import { t } from './i18n';
import { apiClient } from './api/client';
import { useWebsiteStore } from './store/cms/useWebsiteStore';
import HomePage from './pages/home/HomePage';

const PageLoader = () => (
  <div className="flex min-h-[60vh] w-full flex-col items-center justify-center">
    <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
    <p className="mt-4 font-medium text-gray-500">Please wait...</p>
  </div>
);

const CustomerLayout = lazy(() => import('./layouts/CustomerLayout'));

const BrandsPage = lazy(() => import('./pages/brands/BrandsPage'));
const BrandPage = lazy(() => import('./pages/brand/BrandPage'));
const UsedProductsPage = lazy(() => import('./pages/used-products/UsedProductsPage'));
const OffersPage = lazy(() => import('./pages/offers/OffersPage'));
const BlogPage = lazy(() => import('./pages/blog/BlogPage'));
const BlogDetailsPage = lazy(() => import('./pages/blog/BlogDetailsPage'));
const ContactPage = lazy(() => import('./pages/contact/ContactPage'));
const LegalPage = lazy(() => import('./pages/legal/LegalPage'));
const NotFoundPage = lazy(() => import('./pages/not-found/NotFoundPage'));
const DynamicWebsitePage = lazy(() => import('./pages/dynamic/DynamicWebsitePage'));
const SlugPage = lazy(() => import('./pages/custom/CustomPage'));
const AppDownloadPage = lazy(() => import('./pages/apps/AppDownloadPage'));
const EmiCalculatorPage = lazy(() => import('./pages/emi/EmiCalculatorPage'));
const FileCenterPage = lazy(() => import('./pages/downloads/FileCenterPage'));
const CategoryPage = lazy(() => import('./pages/category/CategoryPage'));
const ProductDetailsPage = lazy(() => import('./pages/product/ProductDetailsPage'));
const SearchPage = lazy(() => import('./pages/search/SearchPage'));
const CartPage = lazy(() => import('./pages/cart/CartPage'));
const ComparePage = lazy(() => import('./pages/compare/ComparePage'));
const WishlistPage = lazy(() => import('./pages/wishlist/WishlistPage'));
const CheckoutPage = lazy(() => import('./pages/checkout/CheckoutPage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const PortalDashboard = lazy(() => import('./pages/customer/PortalDashboard'));
const PortalOrders = lazy(() => import('./pages/customer/PortalOrders'));
const PortalMessages = lazy(() => import('./pages/customer/PortalMessages'));
const OrderTrackingPage = lazy(() => import('./pages/orders/OrderTrackingPage'));
const OrderSuccessPage = lazy(() => import('./pages/orders/OrderSuccessPage'));
const PreOrderPage = lazy(() => import('./pages/preorder/PreOrderPage'));
const SupplierLoginPage = lazy(() => import('./pages/supplier/SupplierLoginPage'));
const SupplierLayout = lazy(() => import('./layouts/SupplierLayout'));
const supplierPage = (name: string) => lazy(() => import('./pages/supplier/SupplierPortalPages').then((m: any) => ({ default: m[name] })));
const SupplierDashboard = supplierPage('SupplierDashboard');
const SupplierPurchaseOrders = supplierPage('SupplierPurchaseOrders');
const SupplierNewOrders = supplierPage('SupplierNewOrders');
const SupplierUsedDevices = supplierPage('SupplierUsedDevices');
const SupplierPrices = supplierPage('SupplierPrices');
const SupplierPriceRequests = supplierPage('SupplierPriceRequests');
const SupplierConfirmations = supplierPage('SupplierConfirmations');
const SupplierDelivery = supplierPage('SupplierDelivery');
const SupplierInvoices = supplierPage('SupplierInvoices');
const SupplierPayments = supplierPage('SupplierPayments');
const SupplierLedger = supplierPage('SupplierLedger');
const SupplierReturns = supplierPage('SupplierReturns');
const SupplierDocuments = supplierPage('SupplierDocuments');
const SupplierMessages = supplierPage('SupplierMessages');
const SupplierNotifications = supplierPage('SupplierNotifications');
const SupplierProfile = supplierPage('SupplierProfile');
const customerPage = (name: string) => lazy(() => import('./pages/customer/PortalSections').then((m: any) => ({ default: m[name] })));
const PortalPurchasedDevices = customerPage('PurchasedDevices');
const PortalSoldDevices = customerPage('SoldDevices');
const PortalInvoices = customerPage('Invoices');
const PortalWarranty = customerPage('Warranty');
const PortalPreorders = customerPage('Preorders');
const PortalPayments = customerPage('Payments');
const PortalNotifications = customerPage('Notifications');
const PortalProfile = customerPage('Profile');
const CategoriesPage = lazy(() => import('./pages/categories/CategoriesPage'));



interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedCustomerRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
};


const ProtectedSupplierRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, initialize } = useSupplierAuthStore();
  const location = useLocation();
  useEffect(() => { initialize(); }, [initialize]);
  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/supplier-login" state={{ from: location }} replace />;
  return <>{children}</>;
};

export const App: React.FC = () => {
  const initializeAuth = useAuthStore((state) => state.initialize);

  const siteFavicon = useWebsiteStore((state) => state.cms?.site?.faviconUrl || '');

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => startTamperGuard({
    loadConfig: async () => {
      const config = (await apiClient.get('/public/tamper-guard')).data?.data || {};
      return { active: Boolean(config.website), detectDevtools: Boolean(config.detect_devtools) };
    },
    report: (action, key = '') => { apiClient.post('/public/tamper-guard/report', { action, key, app: 'website', page: window.location.pathname }).catch(() => undefined); },
    notice: () => t('security.blocked'),
  }), []);

  useEffect(() => {
    syncSiteFavicon(async () => (await apiClient.get('/public/system-ui-settings')).data?.data?.ui_brand ?? null, siteFavicon);
  }, [siteFavicon]);

  return (
    <HelmetProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<PublicLayout />}>
              <Route index element={<HomePage />} />
              <Route path="brands" element={<BrandsPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="brand/:slug" element={<BrandPage />} />
              <Route path="used-products" element={<UsedProductsPage />} />
              <Route path="offers" element={<OffersPage />} />
              <Route path="blog" element={<BlogPage />} />
              <Route path="blog/:slug" element={<BlogDetailsPage />} />
              <Route path="contact" element={<ContactPage />} />
              <Route path="legal/:slug" element={<LegalPage />} />
              <Route path="category/:slug" element={<CategoryPage />} />
              <Route path="products" element={<CategoryPage />} />
              <Route path="product/:slug" element={<ProductDetailsPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="cart" element={<CartPage />} />
              <Route path="compare" element={<ComparePage />} />
              <Route path="wishlist" element={<WishlistPage />} />
              <Route path="preorder" element={<PreOrderPage />} />
              <Route path="track-order" element={<OrderTrackingPage />} />
              <Route path="track-order/:id" element={<OrderTrackingPage />} />
              <Route path="apps" element={<Navigate to="/downloads" replace />} />
              <Route path="downloads" element={<FileCenterPage />} />
              <Route path="emi-calculator" element={<EmiCalculatorPage />} />
              <Route path=":slug" element={<SlugPage />} />
              <Route path="404" element={<NotFoundPage />} />
              <Route path="*" element={<DynamicWebsitePage />} />
            </Route>


            <Route path="/supplier-login" element={<SupplierLoginPage />} />
            <Route path="/supplier" element={<ProtectedSupplierRoute><SupplierLayout /></ProtectedSupplierRoute>}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<SupplierDashboard />} />
              <Route path="purchase-orders" element={<SupplierPurchaseOrders />} />
              <Route path="new-orders" element={<SupplierNewOrders />} />
              <Route path="used-devices" element={<SupplierUsedDevices />} />
              <Route path="prices" element={<SupplierPrices />} />
              <Route path="price-requests" element={<SupplierPriceRequests />} />
              <Route path="confirmations" element={<SupplierConfirmations />} />
              <Route path="delivery" element={<SupplierDelivery />} />
              <Route path="invoices" element={<SupplierInvoices />} />
              <Route path="payments" element={<SupplierPayments />} />
              <Route path="ledger" element={<SupplierLedger />} />
              <Route path="returns" element={<SupplierReturns />} />
              <Route path="documents" element={<SupplierDocuments />} />
              <Route path="messages" element={<SupplierMessages />} />
              <Route path="notifications" element={<SupplierNotifications />} />
              <Route path="profile" element={<SupplierProfile />} />
              <Route path="purchases" element={<Navigate to="/supplier/invoices" replace />} />
            </Route>

            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route path="/checkout" element={<ProtectedCustomerRoute><CheckoutPage /></ProtectedCustomerRoute>} />
            <Route path="/order-success" element={<ProtectedCustomerRoute><OrderSuccessPage /></ProtectedCustomerRoute>} />

            <Route path="/portal" element={<ProtectedCustomerRoute><CustomerLayout /></ProtectedCustomerRoute>}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<PortalDashboard />} />
              <Route path="orders" element={<PortalOrders />} />
              <Route path="messages" element={<PortalMessages />} />
              <Route path="tracking" element={<OrderTrackingPage />} />
              <Route path="tracking/:id" element={<OrderTrackingPage />} />
              <Route path="devices" element={<PortalPurchasedDevices />} />
              <Route path="sold-devices" element={<PortalSoldDevices />} />
              <Route path="invoices" element={<PortalInvoices />} />
              <Route path="warranty" element={<PortalWarranty />} />
              <Route path="preorders" element={<PortalPreorders />} />
              <Route path="payments" element={<PortalPayments />} />
              <Route path="notifications" element={<PortalNotifications />} />
              <Route path="profile" element={<PortalProfile />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </HelmetProvider>
  );
};

export default App;
