import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Mail, Phone, Wallet } from 'lucide-react';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';
import { useI18n } from '../../i18n';
import { linkLabel, selectInEditor, usePageText } from '../../cms/pageTexts';
import { HEADER_ICONS, colorOrUndefined, isExternalPath, useHeaderDesign } from './headerDesign';

/** Thin utility bar above the header (tablet/desktop only, as in the NST design). */
export const TopBar: React.FC = () => {
  const cms = useWebsiteStore((state) => state.cms);
  const { language, languages, setLanguage, t } = useI18n();
  const text = usePageText('header');
  const design = useHeaderDesign();
  const bar = design.topBar;
  if (!bar.enabled) return null;

  const phone = bar.phone || cms?.site?.contactPhone || cms?.footer?.phone || '';
  const email = bar.email || cms?.footer?.email || '';
  const links = bar.links.filter((link) => link.enabled !== false && link.path);
  const background = colorOrUndefined(bar.background);
  const color = colorOrUndefined(bar.text);
  const defaultLabel = (key: string) => t(`header.links.${key}`, { defaultValue: '' });

  return (
    <div onClickCapture={selectInEditor('header', 'global-header')} data-nst-section-id="global-header"
      className="hidden bg-[var(--nst-ink)] text-[11.5px] text-[color-mix(in_oklab,var(--nst-primary)_20%,white)] md:block"
      style={{ background, color }}>
      <div className="mx-auto flex h-9 max-w-[1320px] items-center justify-between gap-4 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-5">
          {bar.showPhone && phone && <a href={`tel:${phone.replace(/\s+/g, '')}`} className="flex items-center gap-1.5 whitespace-nowrap font-medium hover:opacity-80"><Phone className="h-3.5 w-3.5" />{text('call', { phone })}</a>}
          {bar.showEmail && email && <a href={`mailto:${email}`} className="hidden items-center gap-1.5 whitespace-nowrap font-medium hover:opacity-80 lg:flex"><Mail className="h-3.5 w-3.5" />{email}</a>}
        </div>
        <nav className="flex min-w-0 items-center gap-4 lg:gap-5" aria-label={text('utility_links')}>
          {links.map((link) => {
            const Icon = HEADER_ICONS[link.icon || ''];
            const label = linkLabel(link, language, defaultLabel);
            const body = <>{Icon && <Icon className="h-3.5 w-3.5" />}{label}</>;
            const className = 'flex items-center gap-1.5 whitespace-nowrap hover:opacity-80';
            return isExternalPath(link.path)
              ? <a key={`${link.key}-${link.path}`} href={link.path} target="_blank" rel="noopener noreferrer" className={className}>{body}</a>
              : <Link key={`${link.key}-${link.path}`} to={link.path} className={className}>{body}</Link>;
          })}
          {(bar.showLanguage || bar.showCurrency) && <span className="hidden h-3.5 w-px bg-current opacity-20 lg:block" />}
          {bar.showLanguage && (
            <label className="relative hidden items-center gap-1 lg:flex">
              <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t('common.language')} className="cursor-pointer appearance-none bg-transparent pr-4 text-inherit outline-none">
                {languages.map((item) => <option key={item.code} value={item.code} className="text-slate-900">{item.nativeLabel}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 h-3 w-3" />
            </label>
          )}
          {bar.showCurrency && <span className="hidden items-center gap-1 lg:flex"><Wallet className="h-3.5 w-3.5" />{text('currency')}</span>}
        </nav>
      </div>
    </div>
  );
};

export default TopBar;
