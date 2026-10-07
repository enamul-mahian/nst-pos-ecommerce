import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';

/**
 * Google Analytics 4 / Google Ads / Meta Pixel for the live storefront.
 * IDs come from Website Control Center > Global > Tracking & Ads (published site only).
 * Not loaded inside the editor preview.
 */
const addScript = (id: string, src: string) => {
  if (document.getElementById(id)) return;
  const tag = document.createElement('script');
  tag.id = id; tag.async = true; tag.src = src;
  document.head.appendChild(tag);
};

export default function NstTracking() {
  const tracking = useWebsiteStore((state: any) => state.cms?.site?.tracking) || {};
  const preview = useWebsiteStore((state: any) => state.isPreviewMode);
  const location = useLocation();
  const ga4 = /^G-[A-Z0-9]{4,20}$/i.test(String(tracking.ga4 || '')) ? String(tracking.ga4).toUpperCase() : '';
  const ads = /^AW-[0-9]{5,20}$/i.test(String(tracking.googleAds || '')) ? String(tracking.googleAds).toUpperCase() : '';
  const pixel = /^[0-9]{6,20}$/.test(String(tracking.metaPixel || '')) ? String(tracking.metaPixel) : '';

  useEffect(() => {
    if (preview || typeof window === 'undefined') return;
    const w = window as any;
    if ((ga4 || ads) && !w.gtag) {
      addScript('nst-gtag', `https://www.googletagmanager.com/gtag/js?id=${ga4 || ads}`);
      w.dataLayer = w.dataLayer || [];
      w.gtag = function gtag() { w.dataLayer.push(arguments); };
      w.gtag('js', new Date());
      if (ga4) w.gtag('config', ga4, { send_page_view: false });
      if (ads) w.gtag('config', ads);
    }
    if (pixel && !w.fbq) {
      const fbq: any = function (...args: any[]) { fbq.callMethod ? fbq.callMethod(...args) : fbq.queue.push(args); };
      fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
      w.fbq = fbq; w._fbq = fbq;
      addScript('nst-fbq', 'https://connect.facebook.net/en_US/fbevents.js');
      w.fbq('init', pixel);
    }
  }, [preview, ga4, ads, pixel]);

  useEffect(() => {
    if (preview || typeof window === 'undefined') return;
    const w = window as any;
    if (ga4 && w.gtag) w.gtag('event', 'page_view', { page_path: location.pathname + location.search, page_title: document.title });
    if (pixel && w.fbq) w.fbq('track', 'PageView');
  }, [preview, ga4, pixel, location.pathname, location.search]);

  return null;
}
