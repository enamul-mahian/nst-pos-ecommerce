import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Grid2X2, ShoppingCart, Heart, UserRound } from 'lucide-react';
import { useCartStore } from '../../store/cart/useCartStore';
import { useAuthStore } from '../../store/auth/useAuthStore';
import { usePageText } from '../../cms/pageTexts';

/** Daraz-style bottom bar for phones and small tablets (hidden from lg up). */
export const MobileBottomNav: React.FC = () => {
  const count = useCartStore((state: any) => state.items?.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0) || 0);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const text = usePageText('header');
  const items = [
    { label: text('nav_home'), path: '/', icon: Home },
    { label: text('nav_category'), path: '/categories', icon: Grid2X2 },
    { label: text('nav_cart'), path: '/cart', icon: ShoppingCart, badge: count },
    { label: text('nav_wishlist'), path: '/wishlist', icon: Heart },
    { label: text('nav_account'), path: isAuthenticated ? '/portal/dashboard' : '/login', icon: UserRound },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[70] border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label={text('mobile_menu')}>
      <div className="mx-auto grid h-16 max-w-lg grid-cols-5">
        {items.map(({ label, path, icon: Icon, badge }) => (
          <NavLink key={path} to={path} end={path === '/'}
            className={({ isActive }) => `flex flex-col items-center justify-center gap-1 text-[10px] font-medium ${isActive ? 'text-[var(--nst-primary)]' : 'text-slate-500'}`}>
            <span className="relative">
              <Icon className="h-5 w-5" />
              {!!badge && <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{badge > 99 ? '99+' : badge}</span>}
            </span>
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
