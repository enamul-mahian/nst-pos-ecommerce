import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AppWindow, Archive, BadgeDollarSign, Banknote, BarChart3, Boxes, Building2,
  CalendarDays, CircleGauge, ClipboardCheck, ClipboardList, Database, Earth, FileChartColumn,
  FileText, Globe2, HandCoins, HeartHandshake, History, House, Inbox, Landmark, LayoutDashboard,
  LayoutGrid, Megaphone, MessageCircle, Package, PackageCheck, ReceiptText, Search, Settings,
  ShieldCheck, ShoppingBag, ShoppingCart, Smartphone, Tags, Target, Truck, UserCog, Users,
  WalletCards, Wrench,
} from 'lucide-react';

// Separate visual packs, selected automatically from the effective Business OS theme.
export const LIGHT_BUSINESS_OS_ICONS = Object.freeze({
  Activity, AppWindow, BadgeDollarSign, Banknote, BarChart3, Boxes, Building2, CalendarDays,
  ClipboardList, Database, FileText, Globe2, HeartHandshake, History, Inbox, LayoutDashboard,
  LayoutGrid, Megaphone, MessageCircle, Package, ReceiptText, Search, Settings, ShieldCheck,
  ShoppingBag, Smartphone, Tags, Target, Truck, UserCog, Users, WalletCards, Wrench,
  Gauge: CircleGauge, Home: House, Landmark,
});

export const DARK_BUSINESS_OS_ICONS = Object.freeze({
  Activity: CircleGauge, AppWindow: LayoutGrid, BadgeDollarSign: HandCoins, Banknote: WalletCards,
  BarChart3: FileChartColumn, Boxes: Archive, Building2: Landmark, CalendarDays: ClipboardCheck,
  ClipboardList: ClipboardCheck, Database: Archive, FileText: ReceiptText, Globe2: Earth,
  HeartHandshake: Users, History: Activity, Inbox: MessageCircle, LayoutDashboard: CircleGauge,
  LayoutGrid: AppWindow, Megaphone: MessageCircle, MessageCircle: Inbox, Package: PackageCheck,
  ReceiptText: FileText, Search, Settings, ShieldCheck, ShoppingBag: ShoppingCart,
  Smartphone, Tags, Target, Truck, UserCog, Users, WalletCards: HandCoins, Wrench,
  Gauge: CircleGauge, Home: House, Landmark: Building2,
});

const iconName = (Icon) => Icon?.displayName || Icon?.name || 'AppWindow';
export function resolveBusinessOsIcon(Icon, dark = false) {
  const key = iconName(Icon);
  return (dark ? DARK_BUSINESS_OS_ICONS[key] : LIGHT_BUSINESS_OS_ICONS[key]) || Icon || AppWindow;
}

export function BusinessOsIcon({ icon, size = 18, className = '', ...props }) {
  const [dark,setDark] = useState(() => typeof document !== 'undefined' && document.body.classList.contains('nst-admin-theme-dark'));
  useEffect(() => {
    const sync = () => setDark(document.body.classList.contains('nst-admin-theme-dark'));
    window.addEventListener('nst-dashboard-theme-applied', sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes:true, attributeFilter:['class'] });
    return () => { window.removeEventListener('nst-dashboard-theme-applied', sync); observer.disconnect(); };
  },[]);
  const Icon = useMemo(() => resolveBusinessOsIcon(icon,dark),[icon,dark]);
  return <Icon size={size} className={className} {...props}/>;
}
