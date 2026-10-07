import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, ShoppingBag, X } from 'lucide-react';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';
import { apiClient } from '../../api/client';
import { usePageText } from '../../cms/pageTexts';

interface PopupEntry {
  name: string;
  location: string;
  product: string;
  action: 'purchased' | 'preordered' | string;
  minutesAgo: number | null;
  image: string;
}

const DISMISS_KEY = 'nst_purchase_popup_closed';
const REFRESH_MS = 5 * 60_000;

const readDismissed = () => {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
};

/** "Someone from X just purchased Y" toast, fed by real recent sales (or the manual list from the editor). */
export const LivePurchasePopup: React.FC = () => {
  const popup = useWebsiteStore((state) => state.cms?.popup);
  const text = usePageText('popup');
  const enabled = popup?.enabled ?? true;
  const source = popup?.source === 'manual' ? 'manual' : 'sales';
  const intervalMs = Math.max(4000, Number(popup?.intervalMs) || 11500);
  const visibleMs = Math.max(2000, Math.min(intervalMs - 1000, Number(popup?.visibleMs) || 4500));
  const days = Math.max(1, Math.min(365, Number(popup?.days) || 30));
  const limit = Math.max(1, Math.min(30, Number(popup?.limit) || 12));
  const showTime = popup?.showTime !== false;
  const showOnMobile = popup?.showOnMobile !== false;
  const rightSide = popup?.position === 'right';

  const [sales, setSales] = useState<PopupEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    if (!enabled || source !== 'sales') return;
    let active = true;
    const load = () => apiClient.get('/public/recent-purchases', { params: { days, limit } })
      .then((response) => {
        const rows = response.data?.data;
        if (!active || !Array.isArray(rows)) return;
        setSales(rows.map((row: any) => ({
          name: String(row?.name || ''),
          location: String(row?.location || ''),
          product: String(row?.product || ''),
          action: String(row?.action || 'purchased'),
          minutesAgo: row?.minutes_ago === null || row?.minutes_ago === undefined ? null : Number(row.minutes_ago),
          image: String(row?.image || ''),
        })).filter((row) => row.product));
      })
      .catch(() => undefined);
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [enabled, source, days, limit]);

  const entries = useMemo<PopupEntry[]>(() => {
    if (source === 'sales') return sales;
    return (Array.isArray(popup?.items) ? popup!.items : [])
      .filter((item) => item && item.item)
      .map((item) => ({ name: item.name || '', location: item.district || '', product: item.item, action: item.action || '', minutesAgo: null, image: '' }));
  }, [source, sales, popup]);

  useEffect(() => {
    if (!enabled || dismissed || entries.length === 0) return;
    let hideTimer = 0;
    let nextTimer = 0;
    const cycle = () => {
      setVisible(true);
      hideTimer = window.setTimeout(() => {
        setVisible(false);
        nextTimer = window.setTimeout(() => setIndex((value) => (value + 1) % entries.length), 500);
      }, visibleMs);
    };
    const first = window.setTimeout(cycle, 3000);
    const repeat = window.setInterval(cycle, intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(repeat);
      window.clearTimeout(hideTimer);
      window.clearTimeout(nextTimer);
    };
  }, [enabled, dismissed, entries.length, intervalMs, visibleMs]);

  if (!enabled || dismissed || entries.length === 0) return null;

  const entry = entries[index % entries.length];
  const actionText = entry.action === 'purchased' ? text('purchased') : entry.action === 'preordered' ? text('preordered') : entry.action || text('purchased');
  const timeText = entry.minutesAgo === null ? '' : entry.minutesAgo < 2 ? text('just_now')
    : entry.minutesAgo < 60 ? text('minutes_ago', { count: entry.minutesAgo })
      : entry.minutesAgo < 1440 ? text('hours_ago', { count: Math.round(entry.minutesAgo / 60) })
        : text('days_ago', { count: Math.round(entry.minutesAgo / 1440) });

  const close = () => {
    setVisible(false);
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* storage unavailable */ }
  };

  return (
    <div role="status" aria-live="polite"
      className={`nst-purchase-popup ${rightSide ? 'is-right' : ''} ${showOnMobile ? '' : 'is-desktop-only'} ${visible ? 'is-visible' : ''}`}>
      <span className="nst-purchase-popup__media">
        {entry.image ? <img src={entry.image} alt="" loading="lazy" /> : <ShoppingBag className="h-5 w-5 text-[var(--nst-primary)]" />}
        <i aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-left leading-tight">
        <span className="block truncate text-[12.5px] text-slate-500">
          <b className="font-bold text-slate-800">{entry.name || text('someone')}</b>
          {entry.location ? <> {text('from')} <b className="font-semibold text-[var(--nst-primary)]">{entry.location}</b></> : null}
        </span>
        <span className="mt-0.5 block text-[12.5px] text-slate-600">
          {actionText} <strong className="line-clamp-1 font-bold text-slate-900">{entry.product}</strong>
        </span>
        <span className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600">
          <CheckCircle className="h-3 w-3" />{text('verified')}{showTime && timeText ? <span className="font-medium normal-case tracking-normal text-slate-400">· {timeText}</span> : null}
        </span>
      </span>
      <button type="button" onClick={close} className="nst-purchase-popup__close" aria-label={text('close')}><X className="h-3.5 w-3.5" /></button>
    </div>
  );
};

export default LivePurchasePopup;
