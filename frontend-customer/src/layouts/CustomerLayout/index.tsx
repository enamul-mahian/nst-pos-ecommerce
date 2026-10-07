import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Bell, CreditCard, FileText, GitCompareArrows, Heart, Home, LayoutDashboard, MessageSquare, PackageSearch,
  Search, ShieldCheck, ShoppingBag, ShoppingCart, Smartphone, Timer, UserRound, Wrench, Repeat2,
} from 'lucide-react';

import { useAuthStore } from '../../store/auth/useAuthStore';
import { useCartStore } from '../../store/cart/useCartStore';
import PortalShell, { type PortalNavItem } from '../../components/portal/PortalShell';
import { customerCode } from '../../pages/customer/customerData';

const readWishlistCount = () => {
  try { return JSON.parse(localStorage.getItem('nst_customer_wishlist') || '{}')?.state?.items?.length || 0; } catch { return 0; }
};

export const CustomerLayout: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const cartCount = useCartStore((state: any) => state.items?.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0) || 0);
  const wishlistCount = useMemo(readWishlistCount, []);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully.');
    } catch {
      toast.error('An error occurred during logout.');
    } finally {
      navigate('/login', { replace: true });
    }
  };

  const menu: PortalNavItem[] = [
    { label: 'Dashboard', to: '/portal/dashboard', icon: LayoutDashboard },
    { label: 'My Orders', to: '/portal/orders', icon: ShoppingBag },
    { label: 'Order Tracking', to: '/portal/tracking', icon: PackageSearch },
    { label: 'Purchased Devices', to: '/portal/devices', icon: Smartphone },
    { label: 'Sold Devices', to: '/portal/sold-devices', icon: Repeat2 },
    { label: 'Invoices', to: '/portal/invoices', icon: FileText },
    { label: 'Warranty & Service', to: '/portal/warranty', icon: Wrench },
    { label: 'Preorders', to: '/portal/preorders', icon: Timer },
    { label: 'Wishlist', to: '/wishlist', icon: Heart, badge: wishlistCount },
    { label: 'Compare', to: '/compare', icon: GitCompareArrows },
    { label: 'Payments & Refunds', to: '/portal/payments', icon: CreditCard },
    { label: 'Messages / Support', to: '/portal/messages', icon: MessageSquare },
    { label: 'Notifications', to: '/portal/notifications', icon: Bell },
    { label: 'Profile & Security', to: '/portal/profile', icon: ShieldCheck },
  ];

  return (
    <PortalShell
      portalName="Customer"
      homePath="/portal/dashboard"
      menu={menu}
      identity={{
        name: user?.name || 'Customer',
        badge: 'Verified Customer',
        lines: [`Customer ID: ${customerCode(user)}`],
        avatarUrl: (user as any)?.avatar_url || (user as any)?.photo_url || null,
      }}
      topActions={[
        { label: 'Search', to: '/search', icon: Search },
        { label: 'Notifications', to: '/portal/notifications', icon: Bell },
        { label: 'Cart', to: '/cart', icon: ShoppingCart, badge: cartCount },
        { label: 'Messages', to: '/portal/messages', icon: MessageSquare },
        { label: 'Wishlist', to: '/wishlist', icon: Heart, badge: wishlistCount },
      ]}
      bottomNav={[
        { label: 'Home', to: '/portal/dashboard', icon: Home },
        { label: 'Orders', to: '/portal/orders', icon: ShoppingBag },
        { label: 'Cart', to: '/cart', icon: ShoppingCart, badge: cartCount },
        { label: 'Wishlist', to: '/wishlist', icon: Heart },
        { label: 'Account', to: '/portal/profile', icon: UserRound },
      ]}
      onLogout={handleLogout}
    />
  );
};

export default CustomerLayout;
