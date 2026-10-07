import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BadgeCheck, LogOut, Menu, X, type LucideIcon } from 'lucide-react';

export interface PortalNavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  badge?: number;
  /** Rendered as the raised round action in the phone bottom bar */
  fab?: boolean;
}

export interface PortalIdentity {
  name: string;
  badge: string;
  lines: string[];
  avatarUrl?: string | null;
  /** Round avatar for people, rounded square logo for companies */
  shape?: 'round' | 'square';
}

interface PortalShellProps {
  portalName: string;
  homePath: string;
  menu: PortalNavItem[];
  bottomNav: PortalNavItem[];
  topActions: PortalNavItem[];
  identity: PortalIdentity;
  onLogout: () => void;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'NS';

const Avatar: React.FC<{ identity: PortalIdentity; size: string }> = ({ identity, size }) => {
  const radius = identity.shape === 'square' ? 'rounded-2xl' : 'rounded-full';
  return identity.avatarUrl
    ? <img src={identity.avatarUrl} alt="" className={`${size} ${radius} shrink-0 object-cover ring-2 ring-violet-100`} />
    : <span className={`${size} ${radius} grid shrink-0 place-items-center bg-gradient-to-br from-violet-600 to-indigo-600 font-bold text-white ring-2 ring-violet-100`}>{initials(identity.name)}</span>;
};

const Logo: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <span className="flex flex-col leading-none">
    <span className={`${compact ? 'text-xl' : 'text-2xl'} font-black tracking-tight text-violet-800`}>NST</span>
    {!compact && <span className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">New Singapur Telecom</span>}
  </span>
);

const Badge: React.FC<{ count?: number; className?: string }> = ({ count, className = '' }) =>
  count ? <span className={`absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ${className}`}>{count > 99 ? '99+' : count}</span> : null;

export const PortalShell: React.FC<PortalShellProps> = ({ portalName, homePath, menu, bottomNav, topActions, identity, onLogout }) => {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('nst_portal_sidebar') === 'collapsed'; } catch { return false; }
  });

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);
  useEffect(() => {
    document.body.classList.add('nst-portal-page');
    return () => document.body.classList.remove('nst-portal-page');
  }, []);
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      try { localStorage.setItem('nst_portal_sidebar', value ? 'open' : 'collapsed'); } catch { /* storage unavailable */ }
      return !value;
    });
  };

  const current = menu.find((item) => location.pathname.startsWith(item.to));
  const isHome = location.pathname === homePath;
  const mobileTitle = isHome || !current ? `NST ${portalName}` : current.label;

  // On tablets (md) the sidebar is always an icon rail; on desktop (lg) it expands unless collapsed.
  const labelCls = collapsed ? 'sr-only' : 'sr-only lg:not-sr-only lg:truncate';
  const sideWidth = collapsed ? 'md:w-[76px]' : 'md:w-[76px] lg:w-64';
  const contentPad = collapsed ? 'md:pl-[76px]' : 'md:pl-[76px] lg:pl-64';

  const navLinkCls = ({ isActive }: { isActive: boolean }) =>
    `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-violet-50 text-violet-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`;

  return (
    <div className="min-h-dvh bg-[#f6f5fb] text-slate-900">
      {/* ===== Sidebar: icon rail on tablet, full on desktop ===== */}
      <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200/80 bg-white transition-[width] duration-200 md:flex ${sideWidth}`}>
        <div className={`flex h-[72px] shrink-0 items-center gap-3 px-3 ${collapsed ? 'justify-center' : 'justify-center lg:justify-start lg:px-5'}`}>
          <button type="button" onClick={toggleCollapsed} className="hidden rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:block" aria-label="Toggle sidebar"><Menu className="h-5 w-5" /></button>
          <Link to={homePath} className={collapsed ? 'hidden' : 'hidden lg:block'}><Logo /></Link>
          <Link to={homePath} className={collapsed ? 'hidden' : 'lg:hidden'}><Logo compact /></Link>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4 [scrollbar-width:thin]">
          {menu.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkCls} title={item.label}>
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              <span className={labelCls}>{item.label}</span>
              <Badge count={item.badge} className="right-2 top-1.5" />
            </NavLink>
          ))}
          <button type="button" onClick={onLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700" title="Logout">
            <LogOut className="h-[18px] w-[18px] shrink-0" /><span className={labelCls}>Logout</span>
          </button>
        </nav>
      </aside>

      <div className={`flex min-h-dvh flex-col transition-[padding] duration-200 ${contentPad}`}>
        {/* ===== Tablet / desktop header ===== */}
        <header className="sticky top-0 z-30 hidden border-b border-slate-200/70 bg-white/95 backdrop-blur md:block">
          <div className="flex items-center justify-between gap-4 px-6 py-3 lg:px-8">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar identity={identity} size="h-14 w-14 text-lg" />
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Welcome back,</p>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <h1 className="truncate text-lg font-bold text-slate-900">{identity.name}</h1>
                  <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700"><BadgeCheck className="h-3.5 w-3.5" />{identity.badge}</span>
                </div>
                {identity.lines.map((line) => <p key={line} className="truncate text-xs text-slate-500">{line}</p>)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {topActions.map((action) => (
                <Link key={action.label} to={action.to} className="relative rounded-xl p-2.5 text-slate-600 hover:bg-slate-100 hover:text-violet-700" aria-label={action.label} title={action.label}>
                  <action.icon className="h-5 w-5" /><Badge count={action.badge} className="right-0.5 top-0.5" />
                </Link>
              ))}
            </div>
          </div>
        </header>

        {/* ===== Phone header ===== */}
        <header className="sticky top-0 z-30 bg-gradient-to-r from-violet-800 to-violet-700 text-white shadow-md md:hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="flex h-14 items-center gap-2 px-3">
            <button type="button" onClick={() => setDrawerOpen(true)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <p className="min-w-0 flex-1 truncate text-base font-semibold">{mobileTitle}</p>
            {topActions.slice(0, 3).map((action) => (
              <Link key={action.label} to={action.to} className="relative rounded-lg p-2 hover:bg-white/10" aria-label={action.label}>
                <action.icon className="h-5 w-5" /><Badge count={action.badge} className="right-0.5 top-0.5 ring-2 ring-violet-700" />
              </Link>
            ))}
          </div>
        </header>

        <main className="w-full flex-1 px-4 pb-28 pt-4 sm:px-6 md:pb-10 md:pt-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      {/* ===== Phone drawer ===== */}
      <div className={`fixed inset-0 z-50 md:hidden ${drawerOpen ? '' : 'pointer-events-none'}`} aria-hidden={!drawerOpen}>
        <div className={`absolute inset-0 bg-slate-950/50 transition-opacity ${drawerOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setDrawerOpen(false)} />
        <aside className={`absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-white shadow-2xl transition-transform duration-200 ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar identity={identity} size="h-11 w-11 text-sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{identity.name}</p>
                <p className="truncate text-xs text-slate-500">{identity.lines[0]}</p>
              </div>
            </div>
            <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close menu"><X className="h-5 w-5" /></button>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
            {menu.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkCls}>
                <item.icon className="h-[18px] w-[18px] shrink-0" /><span className="truncate">{item.label}</span>
                <Badge count={item.badge} className="right-2 top-2" />
              </NavLink>
            ))}
            <button type="button" onClick={onLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50">
              <LogOut className="h-[18px] w-[18px]" />Logout
            </button>
          </nav>
        </aside>
      </div>

      {/* ===== Phone bottom navigation ===== */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label={`${portalName} navigation`}>
        <div className="mx-auto grid h-16 max-w-md" style={{ gridTemplateColumns: `repeat(${bottomNav.length}, minmax(0, 1fr))` }}>
          {bottomNav.map((item) => item.fab ? (
            <NavLink key={item.to} to={item.to} className="flex items-center justify-center" aria-label={item.label}>
              <span className="-mt-5 grid h-12 w-12 place-items-center rounded-full bg-violet-700 text-white shadow-lg shadow-violet-700/30 ring-4 ring-white"><item.icon className="h-6 w-6" /></span>
            </NavLink>
          ) : (
            <NavLink key={item.to} to={item.to} end={item.to === homePath}
              className={({ isActive }) => `flex flex-col items-center justify-center gap-1 text-[10px] font-medium ${isActive ? 'text-violet-700' : 'text-slate-500'}`}>
              <span className="relative"><item.icon className="h-5 w-5" /><Badge count={item.badge} /></span>
              <span className="max-w-full truncate px-1">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default PortalShell;
