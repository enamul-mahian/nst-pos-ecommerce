import React from 'react';
import { Link } from 'react-router-dom';
import {
  BadgePercent, CreditCard, Flame, Gift, Megaphone, RotateCcw, ShieldCheck, Sparkles, Star, Tag, Truck, Zap,
} from 'lucide-react';

/**
 * NST Promo Ticker (Website Control Center section "Promo Ticker").
 * - smooth horizontal scrolling, pause on hover (optional)
 * - every color comes from the active storefront theme tokens (--nst-primary ...)
 * Section data shape (builder JSON):
 *   { type:'Promo Ticker', visible, content:{ label }, ticker:{ enabled, speed, pauseOnHover, items:[{id,icon,text,link,enabled}] } }
 */
export const TICKER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  truck: Truck, percent: BadgePercent, card: CreditCard, return: RotateCcw, shield: ShieldCheck,
  gift: Gift, tag: Tag, flame: Flame, star: Star, zap: Zap, megaphone: Megaphone, sparkles: Sparkles,
};

export interface TickerItem { id?: string; icon?: string; text?: string; link?: string; enabled?: boolean }

export const PromoTicker: React.FC<{ section: any }> = ({ section }) => {
  const ticker = section?.ticker || {};
  const items: TickerItem[] = (Array.isArray(ticker.items) ? ticker.items : []).filter((item: TickerItem) => item && item.enabled !== false && String(item.text || '').trim());
  if (ticker.enabled === false || !items.length) return null;
  const label = String(section?.content?.label ?? "Today's Highlights");
  const seconds = Math.min(120, Math.max(8, Number(ticker.speed) || 30));
  const pause = ticker.pauseOnHover !== false;

  const renderItems = (copy: number) => items.map((item, index) => {
    const Icon = TICKER_ICONS[String(item.icon || 'tag')] || Tag;
    const body = (
      <span className="inline-flex items-center gap-2 whitespace-nowrap px-4 text-[12px] font-semibold text-slate-700 sm:text-[13px]">
        <Icon className="h-4 w-4 shrink-0 text-[var(--nst-primary)]" />
        {item.text}
      </span>
    );
    const key = `${copy}-${item.id || index}`;
    return (
      <React.Fragment key={key}>
        {item.link ? <Link to={item.link} className="hover:text-[var(--nst-primary)]" tabIndex={copy ? -1 : 0}>{body}</Link> : body}
        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-[color-mix(in_oklab,var(--nst-primary)_22%,white)]" />
      </React.Fragment>
    );
  });

  return (
    <div className={`nst-promo-ticker flex items-stretch overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--nst-primary)_28%,white)] bg-white ${pause ? 'is-pausable' : ''}`}
      role="region" aria-label={label || 'Promotions'}>
      {label ? (
        <span className="relative z-10 inline-flex shrink-0 items-center gap-1.5 bg-[var(--nst-primary)] px-3 text-[12px] font-bold text-white sm:px-4 sm:text-[13px]">
          <Zap className="h-4 w-4" />{label}
        </span>
      ) : null}
      <div className="relative min-w-0 flex-1 overflow-hidden bg-[var(--nst-primary-soft)] py-2.5">
        <div className="nst-promo-ticker__track flex w-max items-center" style={{ animationDuration: `${seconds}s` }}>
          {renderItems(0)}
          <span aria-hidden="true" className="flex items-center">{renderItems(1)}</span>
        </div>
      </div>
    </div>
  );
};

export default PromoTicker;
