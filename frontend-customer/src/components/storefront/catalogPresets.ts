import {
  BatteryCharging, Camera, CarFront, Gamepad2, Headphones, Laptop, MoreHorizontal, Router, Smartphone, Speaker, Tablet, Watch,
  type LucideIcon,
} from 'lucide-react';

export interface CategoryPreset { label: string; slug: string; icon: LucideIcon; children: string[] }

const PHONE_BRANDS = ['Samsung', 'Apple', 'Xiaomi', 'OnePlus', 'realme', 'vivo', 'OPPO', 'Infinix', 'Nothing', 'Google Pixel', 'Sony', 'Nokia'];

/** Default category tree used when the Website Control Panel has no category links configured. */
export const CATEGORY_PRESETS: CategoryPreset[] = [
  { label: 'Smartphones', slug: 'smartphones', icon: Smartphone, children: PHONE_BRANDS },
  { label: 'Accessories', slug: 'accessories', icon: Headphones, children: ['Chargers', 'Cables', 'Covers & Cases', 'Screen Protectors', 'Power Banks'] },
  { label: 'Tablets', slug: 'tablets', icon: Tablet, children: ['Apple iPad', 'Samsung Galaxy Tab', 'Xiaomi Pad', 'Lenovo'] },
  { label: 'Smart Watch', slug: 'smart-watch', icon: Watch, children: ['Apple Watch', 'Samsung Galaxy Watch', 'Amazfit', 'Xiaomi'] },
  { label: 'Audio', slug: 'audio', icon: Speaker, children: ['Earbuds', 'Headphones', 'Neckbands', 'Speakers'] },
  { label: 'Laptops', slug: 'laptops', icon: Laptop, children: ['MacBook', 'Gaming Laptops', 'Ultrabooks'] },
  { label: 'Power Bank', slug: 'power-bank', icon: BatteryCharging, children: ['10000 mAh', '20000 mAh', 'Magnetic'] },
  { label: 'Camera', slug: 'camera', icon: Camera, children: ['Action Cameras', 'Gimbals'] },
  { label: 'Gaming', slug: 'gaming', icon: Gamepad2, children: ['Controllers', 'Consoles'] },
  { label: 'Network', slug: 'network', icon: Router, children: ['Routers', 'Pocket Wi-Fi'] },
  { label: 'Car Accessories', slug: 'car-accessories', icon: CarFront, children: ['Car Chargers', 'Phone Holders'] },
];

export const categoryIcon = (label: string): LucideIcon => {
  const l = label.toLowerCase();
  if (/phone|mobile/.test(l)) return Smartphone;
  if (/tab|ipad/.test(l)) return Tablet;
  if (/laptop|mac/.test(l)) return Laptop;
  if (/watch|wear/.test(l)) return Watch;
  if (/audio|speaker|sound/.test(l)) return Speaker;
  if (/power|battery|charger/.test(l)) return BatteryCharging;
  if (/camera/.test(l)) return Camera;
  if (/gam/.test(l)) return Gamepad2;
  if (/network|router|wifi/.test(l)) return Router;
  if (/car/.test(l)) return CarFront;
  if (/access|head|ear/.test(l)) return Headphones;
  return MoreHorizontal;
};

/** Brand wordmark colours for the Top Brands strip when a brand has no uploaded logo. */
export const BRAND_STYLES: Record<string, { color: string; weight?: number; font?: string; transform?: string }> = {
  samsung: { color: '#1428a0', weight: 900, transform: 'uppercase' },
  apple: { color: '#111111', weight: 700 },
  xiaomi: { color: '#ff6900', weight: 700 },
  oneplus: { color: '#eb0028', weight: 900, transform: 'uppercase' },
  realme: { color: '#111111', weight: 600 },
  vivo: { color: '#415fff', weight: 700 },
  oppo: { color: '#1f8f5a', weight: 600 },
  honor: { color: '#111111', weight: 800, transform: 'uppercase' },
  infinix: { color: '#111111', weight: 700 },
  nothing: { color: '#111111', weight: 600, transform: 'uppercase' },
  google: { color: '#4285f4', weight: 600 },
};
