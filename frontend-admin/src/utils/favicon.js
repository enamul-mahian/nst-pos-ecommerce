/*
 * Browser tab icon from the brand settings (ui_brand):
 *   faviconMode 'logo'    -> square icon made from the brand logo (default when a logo exists)
 *   faviconMode 'custom'  -> the uploaded faviconUrl
 *   faviconMode 'default' -> the icon shipped with the app
 */
const ICON_SIZE = 64;
let originalHref = null;
let lastSource = '';

function iconLinks() {
  const links = Array.from(document.querySelectorAll('link[rel~="icon"]'));
  if (links.length) return links;
  const link = document.createElement('link');
  link.rel = 'icon';
  document.head.appendChild(link);
  return [link];
}

function squareIcon(src) {
  return new Promise((resolve) => {
    const image = new Image();
    if (!src.startsWith('data:')) image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = ICON_SIZE;
        canvas.height = ICON_SIZE;
        const scale = Math.min(ICON_SIZE / image.width, ICON_SIZE / image.height);
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, (ICON_SIZE - width) / 2, (ICON_SIZE - height) / 2, width, height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(src);
      }
    };
    image.onerror = () => resolve('');
    image.src = src;
  });
}

export function faviconSourceOf(brand = {}) {
  const mode = brand.faviconMode || 'logo';
  if (mode === 'default') return '';
  if (mode === 'custom') return brand.faviconUrl || '';
  return brand.logoUrl || '';
}

export async function applyFavicon(source) {
  const links = iconLinks();
  if (originalHref === null) originalHref = links[0].getAttribute('href') || '';
  const src = String(source || '');
  if (src === lastSource) return;
  lastSource = src;
  const href = src ? await squareIcon(src) : '';
  if (src !== lastSource) return;
  links.forEach((link) => {
    link.setAttribute('href', href || originalHref);
    if (href) link.setAttribute('type', 'image/png');
    else if (originalHref.endsWith('.svg')) link.setAttribute('type', 'image/svg+xml');
  });
}
