import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowUp, Clock, Facebook, Instagram, Mail, MapPin, Phone, Youtube,
} from 'lucide-react';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';
import { useI18n } from '../../i18n';
import { localizedField, menuPagesOf, slugOfPage } from '../../cms/sitePages';

const TikTokIcon: React.FC<React.SVGProps<SVGSVGElement>> = ({ className = '', ...props }) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
  </svg>
);

/** Strips scripts, inline event handlers and javascript: URLs from an admin-supplied footer design. */
const sanitizeFooterHtml = (html: string): string => {
  if (typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, object, embed, base, meta, link[rel="import"]').forEach((node) => node.remove());
  doc.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || (/^(href|src|action|formaction|xlink:href)$/.test(name) && /^\s*javascript:/i.test(attr.value))) node.removeAttribute(attr.name);
    });
  });
  return doc.body.innerHTML;
};

/** Built-in palettes per footer design; admin colours override them, empty values follow the site theme. */
const DESIGN_PALETTES: Record<string, Record<string, string>> = {
  light: { backgroundColor: '#ffffff', surfaceColor: '#f8fafc', textColor: '#475569', headingColor: '#0f172a', accentColor: 'var(--nst-primary)', borderColor: '#e2e8f0' },
};

export const Footer: React.FC = () => {
  const cms = useWebsiteStore((state) => state.cms);
  const location = useLocation();
  const editorPreview = new URLSearchParams(location.search).get('nst-editor-preview') === '1';
  const [showScroll, setShowScroll] = useState(false);

  useEffect(() => {
    const check = () => setShowScroll(window.scrollY > 400);
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, []);

  const footer = cms?.footer;
  const site = cms?.site;
  const { language, t } = useI18n();
  const columns = useMemo(() => {
    const rows = [...(footer?.columns || [])].filter((column) => column.enabled !== false).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const pages = menuPagesOf(cms, 'footer');
    if (!pages.length) return rows;
    const links = pages.map((page, index) => ({ label: localizedField(page, 'menuLabel', language) || localizedField(page, 'name', language), path: `/${slugOfPage(page)}`, enabled: true, order: index + 1 }));
    return [...rows, { title: t('pages.more_pages'), enabled: true, order: 999, links }];
  }, [footer?.columns, cms, language, t]);

  const customHtml = useMemo(() => (footer?.layout === 'custom' && footer?.customHtml ? sanitizeFooterHtml(String(footer.customHtml)) : ''), [footer?.layout, footer?.customHtml]);

  if (footer?.enabled === false) return null;

  // "Custom design": admin pasted their own footer HTML/CSS in the Website Control Center.
  if (customHtml) {
    return (
      <footer data-nst-builder-section-id="global-footer" data-nst-builder-section-type="footer" className="nst-custom-footer relative w-full">
        {footer?.customCss && <style>{String(footer.customCss).replace(/<\/style/gi, '')}</style>}
        <div dangerouslySetInnerHTML={{ __html: customHtml }} />
      </footer>
    );
  }

  const layout = footer?.layout || 'classic';
  const palette = DESIGN_PALETTES[layout] || {};
  const columnLayout = layout === 'classic' || layout === 'light';
  const backgroundStyle = footer?.backgroundStyle || 'solid';
  const backgroundColor = footer?.backgroundColor || palette.backgroundColor || 'var(--nst-ink)';
  const surfaceColor = footer?.surfaceColor || palette.surfaceColor || 'var(--nst-primary-deep)';
  const accentColor = footer?.accentColor || palette.accentColor || 'var(--nst-primary-light)';
  const textColor = footer?.textColor || palette.textColor || '#c9c3dc';
  const headingColor = footer?.headingColor || palette.headingColor || '#ffffff';
  const borderColor = footer?.borderColor || palette.borderColor || 'rgba(255,255,255,.12)';
  const brandName = footer?.brandName || site?.name || 'New Singapur Telecom';
  const logoText = footer?.logoText || site?.shortName || 'NST';
  const phone = footer?.phone || site?.contactPhone || '';
  const footerStyle: React.CSSProperties = {
    color: textColor,
    borderColor,
    background: backgroundStyle === 'gradient'
      ? `linear-gradient(135deg, ${backgroundColor}, ${surfaceColor})`
      : backgroundColor,
    ['--footer-heading' as string]: headingColor,
    ['--footer-accent' as string]: accentColor,
    ['--footer-border' as string]: borderColor,
    ['--footer-surface' as string]: surfaceColor,
  };

  const chooseFooter = (event: React.MouseEvent<HTMLElement>) => {
    if (!editorPreview) return;
    event.preventDefault();
    event.stopPropagation();
    window.parent?.postMessage({
      type: 'NST_WEBSITE_SECTION_SELECTED',
      pageId: 'footer',
      sectionId: 'global-footer',
      sectionType: 'footer',
    }, '*');
  };

  const socialLinks = [
    { key: 'facebook', href: footer?.facebook, label: 'Facebook', Icon: Facebook },
    { key: 'youtube', href: footer?.youtube, label: 'YouTube', Icon: Youtube },
    { key: 'instagram', href: footer?.instagram, label: 'Instagram', Icon: Instagram },
    { key: 'tiktok', href: footer?.tiktok, label: 'TikTok', Icon: TikTokIcon },
  ].filter((item) => item.href);

  const maxWidth = footer?.maxWidth === 'wide' ? 'max-w-[1500px]' : footer?.maxWidth === 'narrow' ? 'max-w-5xl' : 'max-w-7xl';
  const layoutClass = layout === 'centered'
    ? 'flex flex-col items-center text-center'
    : layout === 'minimal'
      ? 'grid gap-8 md:grid-cols-[1.4fr_2fr]'
      : layout === 'compact'
        ? 'grid grid-cols-2 gap-6 md:grid-cols-4'
        : 'grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-12';

  return (
    <footer
      data-nst-builder-section-id="global-footer"
      data-nst-builder-section-type="footer"
      onClickCapture={chooseFooter}
      className={`relative w-full border-t ${editorPreview ? 'nst-editor-preview-footer' : ''}`}
      style={footerStyle}
    >
      {editorPreview && <span className="absolute right-4 top-4 z-10 rounded-full px-3 py-1 text-xs font-black text-white" style={{ background: accentColor }}>EDIT FOOTER</span>}

      <div className={`${maxWidth} mx-auto px-4 py-12 sm:px-6 lg:px-8`}>
        <div className={layoutClass}>
          <section className={columnLayout ? 'lg:col-span-4' : layout === 'compact' ? 'col-span-2 md:col-span-1' : ''}>
            <Link to="/" className={`inline-flex items-center gap-3 ${layout === 'centered' ? 'justify-center' : ''}`}>
              {footer?.logoUrl ? (
                <img src={footer.logoUrl} alt={brandName} className="h-12 max-w-48 object-contain" />
              ) : (
                <span className="grid h-12 min-w-12 place-items-center rounded-xl px-3 text-lg font-black text-white" style={{ background: accentColor }}>{logoText}</span>
              )}
              <span className="text-left">
                <strong className="block text-base font-black" style={{ color: headingColor }}>{brandName}</strong>
                {footer?.tagline && <small className="mt-1 block text-xs font-semibold">{footer.tagline}</small>}
              </span>
            </Link>

            {footer?.description && <p className={`mt-4 max-w-md text-sm leading-7 ${layout === 'centered' ? 'mx-auto' : ''}`}>{footer.description}</p>}

            {footer?.showSocial !== false && socialLinks.length > 0 && (
              <div className={`mt-5 flex flex-wrap gap-2 ${layout === 'centered' ? 'justify-center' : ''}`}>
                {socialLinks.map(({ key, href, label, Icon }) => (
                  <a key={key} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="grid h-10 w-10 place-items-center rounded-full border transition hover:-translate-y-0.5" style={{ borderColor, background: surfaceColor, color: headingColor }}>
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            )}

            {footer?.showAppButtons !== false && (
              <div className={`mt-5 flex flex-wrap gap-2 ${layout === 'centered' ? 'justify-center' : ''}`}>
                {footer?.playStoreUrl && <a href={footer.playStoreUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl border px-4 py-2 text-left text-xs font-bold" style={{ borderColor, background: surfaceColor, color: headingColor }}><small className="block opacity-70">GET IT ON</small>{footer.playStoreLabel || 'Google Play'}</a>}
                {footer?.appStoreUrl && <a href={footer.appStoreUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl border px-4 py-2 text-left text-xs font-bold" style={{ borderColor, background: surfaceColor, color: headingColor }}><small className="block opacity-70">DOWNLOAD ON</small>{footer.appStoreLabel || 'App Store'}</a>}
              </div>
            )}
          </section>

          {layout !== 'minimal' && columns.map((column) => (
            <section key={`${column.title}-${column.order}`} className={columnLayout ? 'lg:col-span-2' : ''}>
              <h3 className="border-l-2 pl-3 text-sm font-black uppercase tracking-wider" style={{ color: headingColor, borderColor: accentColor }}>{column.title}</h3>
              <ul className="mt-4 space-y-2.5 text-sm">
                {[...(column.links || [])].filter((link) => link.enabled !== false).sort((a, b) => Number(a.order || 0) - Number(b.order || 0)).map((link) => (
                  <li key={`${link.label}-${link.path}`}><Link to={link.path || '/'} className="transition hover:underline" style={{ color: textColor }}>{link.label}</Link></li>
                ))}
              </ul>
            </section>
          ))}

          {layout === 'minimal' && (
            <section className="grid gap-6 sm:grid-cols-2">
              {columns.map((column) => <div key={`${column.title}-${column.order}`}><h3 className="text-sm font-black uppercase" style={{ color: headingColor }}>{column.title}</h3><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">{column.links.filter((link) => link.enabled !== false).map((link) => <Link key={`${link.label}-${link.path}`} to={link.path || '/'} className="text-sm hover:underline">{link.label}</Link>)}</div></div>)}
            </section>
          )}

          {footer?.showContact !== false && layout !== 'minimal' && (
            <section className={columnLayout ? 'lg:col-span-2' : ''}>
              <h3 className="border-l-2 pl-3 text-sm font-black uppercase tracking-wider" style={{ color: headingColor, borderColor: accentColor }}>{footer?.contactTitle || 'Contact Us'}</h3>
              <ul className="mt-4 space-y-3 text-sm">
                {footer?.address && <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accentColor }} /><span>{footer.address}</span></li>}
                {phone && <li className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0" style={{ color: accentColor }} /><a href={`tel:${phone}`}>{phone}</a></li>}
                {footer?.email && <li className="flex items-center gap-2"><Mail className="h-4 w-4 shrink-0" style={{ color: accentColor }} /><a href={`mailto:${footer.email}`} className="break-all">{footer.email}</a></li>}
                {footer?.businessHours && <li className="flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accentColor }} /><span>{footer.businessHours}</span></li>}
              </ul>
            </section>
          )}
        </div>

        {footer?.newsletter?.enabled && (
          <section className="mt-8 rounded-2xl border p-5" style={{ borderColor, background: surfaceColor }}>
            <div className="grid items-center gap-4 md:grid-cols-[1fr_minmax(280px,420px)]">
              <div><h3 className="font-black" style={{ color: headingColor }}>{footer.newsletter.title || 'Stay Updated'}</h3><p className="mt-1 text-sm">{footer.newsletter.text}</p></div>
              <div className="flex overflow-hidden rounded-xl bg-white"><input aria-label="Newsletter email" placeholder={footer.newsletter.placeholder || 'Email address'} className="min-w-0 flex-1 px-4 py-3 text-sm text-slate-900 outline-none"/><button type="button" className="px-5 text-sm font-black text-white" style={{ background: accentColor }}>{footer.newsletter.buttonLabel || 'Subscribe'}</button></div>
            </div>
          </section>
        )}

        {footer?.showPayments !== false && ((footer?.badges || []).length > 0 || (footer as any)?.paymentImage) && (
          <div className="mt-8 flex flex-wrap items-center gap-2 border-t pt-5" style={{ borderColor }}>
            <span className="mr-1 text-xs font-black uppercase tracking-wider">Payment & Delivery</span>
            {(footer?.badges || []).map((badge) => <span key={badge} className="rounded-lg border px-2.5 py-1 text-xs font-bold" style={{ borderColor, background: surfaceColor, color: headingColor }}>{badge}</span>)}
            {(footer as any)?.paymentImage ? <img src={String((footer as any).paymentImage)} alt="Payment methods" className="h-8 max-w-full object-contain sm:h-9" loading="lazy" /> : null}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 border-t pt-5 text-xs sm:flex-row sm:items-center sm:justify-between" style={{ borderColor }}>
          <p>{footer?.copyright || `© ${new Date().getFullYear()} ${brandName}. All Rights Reserved.`}</p>
          {footer?.bottomText && <p>{footer.bottomText}</p>}
        </div>
      </div>

      {showScroll && footer?.showBackToTop !== false && !editorPreview && (
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Scroll to top" className="nst-footer-back-to-top grid h-11 w-11 place-items-center rounded-full text-white shadow-xl" style={{ background: accentColor }}>
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </footer>
  );
};

export default Footer;
