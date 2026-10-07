import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ChevronDown, Menu } from 'lucide-react';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';
import { CATEGORY_PRESETS, categoryIcon } from '../storefront/catalogPresets';
import { useI18n } from '../../i18n';
import { localizedField, menuPagesOf, slugOfPage } from '../../cms/sitePages';
import { linkLabel, selectInEditor, usePageText } from '../../cms/pageTexts';
import { colorOrUndefined, isExternalPath, useHeaderDesign } from './headerDesign';

/** "All Categories" + main links row (tablet/desktop; phones use the bottom bar and categories page). */
export const Navbar: React.FC = () => {
  const cms = useWebsiteStore((state) => state.cms);
  const { language, t } = useI18n();
  const text = usePageText('header');
  const design = useHeaderDesign();
  const nav = design.nav;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const defaultLabel = (key: string) => t(`header.links.${key}`, { defaultValue: '' });
  const links = [
    ...nav.links.filter((link) => link.enabled !== false && link.path).map((link) => ({ key: link.key, to: link.path, accent: Boolean(link.accent), label: linkLabel(link, language, defaultLabel) })),
    ...menuPagesOf(cms, 'header').map((page) => ({ key: String(page.id), to: `/${slugOfPage(page)}`, accent: false, label: localizedField(page, 'menuLabel', language) || localizedField(page, 'name', language) })),
  ];

  const cmsCategories = cms?.header?.categoryLinks?.filter((c) => c.enabled) || [];
  const categories = cmsCategories.length
    ? cmsCategories.map((c) => ({ label: c.label, to: c.path }))
    : CATEGORY_PRESETS.map((c) => ({ label: c.label, to: `/category/${c.slug}` }));

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!nav.enabled) return null;

  const compact = design.layout === 'compact';
  const style = {
    background: colorOrUndefined(nav.background),
    ['--nst-nav-text' as string]: colorOrUndefined(nav.text),
    ['--nst-nav-active' as string]: colorOrUndefined(nav.active),
  } as React.CSSProperties;
  const buttonStyle = { background: colorOrUndefined(nav.buttonBackground), color: colorOrUndefined(nav.buttonText) };

  return (
    <nav onClickCapture={selectInEditor('header', 'global-header')} data-nst-section-id="global-header"
      className="relative z-30 hidden border-b border-slate-200/80 bg-white md:block" style={style} aria-label={text('main_menu')}>
      <div className={`mx-auto flex max-w-[1320px] items-center gap-6 px-4 lg:gap-10 lg:px-6 ${compact ? 'h-10' : 'h-12'}`}>
        {nav.showAllCategories && (
          <div ref={ref} className="relative shrink-0" onMouseLeave={() => setOpen(false)}>
            <button type="button" onClick={() => setOpen((v) => !v)} onMouseEnter={() => setOpen(true)} aria-expanded={open} style={buttonStyle}
              className={`flex w-52 items-center justify-between rounded-lg bg-[var(--nst-primary-dark)] px-4 text-sm font-semibold text-white shadow-sm hover:opacity-95 lg:w-[228px] ${compact ? 'h-8' : 'h-10'}`}>
              <span className="flex items-center gap-2.5"><Menu className="h-4 w-4" />{text('all_categories')}</span>
              <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
              <div className="absolute left-0 top-full z-50 w-60 pt-1.5">
                <div className="rounded-lg border border-slate-100 bg-white py-1.5 shadow-2xl">
                  {categories.map((cat) => {
                    const Icon = categoryIcon(cat.label);
                    return (
                      <Link key={cat.to + cat.label} to={cat.to} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-[var(--nst-primary-soft)] hover:text-[var(--nst-primary)]">
                        <Icon className="h-4 w-4 text-slate-400" />{cat.label}
                      </Link>
                    );
                  })}
                  <Link to="/categories" onClick={() => setOpen(false)} className="mt-1 block border-t border-slate-100 px-4 pt-2.5 text-xs font-semibold text-[var(--nst-primary)]">{text('view_all_categories')}</Link>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="-mb-px flex h-full min-w-0 items-stretch gap-5 overflow-x-auto lg:gap-8 [scrollbar-width:none]">
          {links.map((link) => isExternalPath(link.to) ? (
            <a key={`${link.key}-${link.to}`} href={link.to} target="_blank" rel="noopener noreferrer"
              className={`flex items-center whitespace-nowrap border-b-2 border-transparent text-[13px] font-medium ${link.accent ? 'text-[var(--nst-accent,var(--nst-primary))]' : 'text-[var(--nst-nav-text,#334155)]'} hover:text-[var(--nst-nav-active,var(--nst-primary))]`}>
              {link.label}
            </a>
          ) : (
            <NavLink key={`${link.key}-${link.to}`} to={link.to} end={link.to === '/'}
              className={({ isActive }) => `flex items-center whitespace-nowrap border-b-2 text-[13px] font-medium transition ${isActive ? 'border-[var(--nst-nav-active,var(--nst-primary))] text-[var(--nst-nav-active,var(--nst-primary))]' : `border-transparent ${link.accent ? 'text-[var(--nst-accent,var(--nst-primary))]' : 'text-[var(--nst-nav-text,#334155)]'} hover:text-[var(--nst-nav-active,var(--nst-primary))]`}`}>
              {link.label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
