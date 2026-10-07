import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  Barcode,
  Boxes,
  Building2,
  CalendarClock,
  CreditCard,
  History,
  Printer,
  RotateCcw,
  Loader2,
  ScanLine,
  Search,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNstSystemUi } from '../../context/NstSystemUiContext';
import NstScannerModal from '../../components/search/NstScannerModal';
import accessRules from '../../utils/accessRules';
import { searchDeviceHistory } from '../../services/deviceHistoryService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Smartphone as NstHdrSmartphone } from 'lucide-react';
import { useT } from '../../i18n';

const taka = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return `৳${numeric.toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
};

const safe = (value, fallback = '—') =>
  value === null || value === undefined || value === '' ? fallback : value;

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-BD', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function InfoTile({ icon: Icon, label, value }) {
  return (
    <div className="nst-dh-tile">
      <div className="nst-dh-tile__label">
        <Icon size={16} />
        {label}
      </div>
      <div className="nst-dh-tile__value">{safe(value)}</div>
    </div>
  );
}

function Timeline({ items = [] }) {
  const t = useT();
  if (!items.length) {
    return <div className="nst-dh-empty is-small">{t('device_history.no_events')}</div>;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={`${item.type || 'event'}:${item.id || index}:${item.at || index}`} className="nst-dh-event">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="nst-dh-strong">{item.title || item.type || t('device_history.device_event')}</div>
              <div className="nst-dh-muted mt-1 text-xs font-bold">{formatDate(item.at)}</div>
            </div>
            {item.amount !== null && item.amount !== undefined && item.amount !== '' ? (
              <div className="nst-dh-amount">
                {item.payment_direction === 'outbound' ? `${t('device_history.paid_to_customer')} ` : ''}
                {taka(item.amount)}
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            {item.reference_no ? <span className="nst-dh-chip">{t('device_history.ref', { value: item.reference_no })}</span> : null}
            {item.payment_method ? <span className="nst-dh-chip">{t('device_history.method', { value: item.payment_method })}</span> : null}
            {item.payment_reference ? <span className="nst-dh-chip">{t('device_history.txn', { value: item.payment_reference })}</span> : null}
            {item.from_status || item.to_status ? (
              <span className="nst-dh-chip">
                {safe(item.from_status, t('device_history.created'))} → {safe(item.to_status)}
              </span>
            ) : null}
          </div>

          {item.note ? <p className="nst-dh-muted mt-3 text-sm font-semibold leading-6">{item.note}</p> : null}
        </div>
      ))}
    </div>
  );
}

function DeviceCard({ item, canViewPurchasePrice, canViewProfit }) {
  const t = useT();
  const device = item.device || {};
  const sale = item.sale || {};
  const customer = item.customer || {};
  const supplier = item.supplier || {};
  const used = item.used_purchase || null;
  const source = used
    ? t(used.seller_type === 'supplier' ? 'device_history.used_from_supplier' : 'device_history.used_from_customer', { name: safe(used.seller_name) })
    : supplier.name || supplier.company_name || item.source || t('device_history.store_stock');

  return (
    <div className="nst-dh-card">
      <div className="nst-dh-card__head">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-[var(--nst-dashboard-primary)]">
              {t('device_history.lifetime_id', { id: device.id })}
            </div>
            <h2 className="nst-dh-strong mt-2 text-2xl">{safe(device.product_name, t('device_history.device'))}</h2>
            <div className="nst-dh-muted mt-2 flex flex-wrap gap-2 text-xs font-bold">
              <span>{t('device_history.sku', { value: safe(device.sku) })}</span>
              <span>·</span>
              <span>{t('device_history.status', { value: safe(device.status) })}</span>
            </div>
            {sale.id ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="nst-dh-chip">{t('device_history.invoice', { value: safe(sale.invoice_no) })}</span>
                <Link to={`/sales/${sale.id}/invoice`} className="nst-dh-print"><Printer size={15} />{t('device_history.print_invoice')}</Link>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="nst-dh-stat">
              <p>{t('device_history.sale_price')}</p>
              <strong>{taka(device.selling_price || sale.last_sale_price)}</strong>
            </div>
            {canViewPurchasePrice && device.purchase_cost !== undefined ? (
              <div className="nst-dh-stat">
                <p>{t('device_history.purchase')}</p>
                <strong>{taka(device.purchase_cost)}</strong>
              </div>
            ) : null}
            {canViewProfit && sale.profit_amount !== undefined ? (
              <div className="nst-dh-stat">
                <p>{t('device_history.profit')}</p>
                <strong className="is-positive">{taka(sale.profit_amount)}</strong>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <InfoTile icon={Smartphone} label={t('device_history.imei_1')} value={device.imei_1} />
        <InfoTile icon={Smartphone} label={t('device_history.imei_2')} value={device.imei_2} />
        <InfoTile icon={Barcode} label={t('device_history.barcode')} value={device.barcode || device.imei_1_barcode || device.imei_2_barcode} />
        <InfoTile icon={Building2} label={t('device_history.branch')} value={item.branch?.name || device.branch_name || t('device_history.prime_stock')} />
        <InfoTile icon={Boxes} label={t('device_history.variant')} value={[device.color_name, device.region, device.sim_network, device.ram, device.storage].filter(Boolean).join(' · ')} />
        <InfoTile icon={ShieldCheck} label={t('device_history.battery_warranty')} value={`${safe(device.battery_health)}% · ${safe(device.warranty_type || device.warranty_note, t('device_history.warranty_not_set'))}`} />
        <InfoTile icon={UserRound} label={t('device_history.customer')} value={customer.name || sale.customer_name || sale.customer_phone} />
        <InfoTile icon={CreditCard} label={t('device_history.source')} value={source} />
      </div>

      {used ? (
        <div className="nst-dh-used">
          <div className="nst-dh-used__title"><RotateCcw size={16} />{t('device_history.used_title')}</div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoTile icon={UserRound} label={t(used.seller_type === 'supplier' ? 'device_history.seller_supplier' : 'device_history.seller_customer')} value={used.seller_name} />
            <InfoTile icon={Smartphone} label={t('device_history.seller_phone')} value={used.seller_phone} />
            {canViewPurchasePrice && used.purchase_price !== undefined ? (
              <InfoTile icon={CreditCard} label={t('device_history.bought_for')} value={taka(used.purchase_price)} />
            ) : null}
            <InfoTile icon={CalendarClock} label={t('device_history.bought_on')} value={formatDate(used.purchased_at)} />
          </div>
        </div>
      ) : null}

      <div className="nst-dh-timeline">
        <div className="mb-4 flex items-center gap-2">
          <History className="text-[var(--nst-dashboard-primary)]" size={18} />
          <h3 className="nst-dh-strong text-sm uppercase tracking-wider">{t('device_history.timeline')}</h3>
        </div>
        <Timeline items={item.timeline || []} />
      </div>
    </div>
  );
}

export default function DeviceHistoryPage() {
  const t = useT();
  const { user } = useAuth();
  const { settings } = useNstSystemUi() || {};
  const scannerEnabled = settings?.scanner_enabled !== false;
  const [scannerOpen, setScannerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const canViewPurchasePrice = useMemo(() => accessRules.canViewPurchasePrice(user), [user]);
  const canViewProfit = useMemo(() => accessRules.canViewProfit(user), [user]);

  const runSearch = async (event, identifier) => {
    event?.preventDefault?.();
    const value = String(identifier ?? query).trim();
    setError('');
    if (value.length < 3) {
      setItems([]);
      setSummary(null);
      setSearched(false);
      setError(t('device_history.enter_identifier'));
      return;
    }
    setLoading(true);
    setSearched(true);

    try {
      const response = await searchDeviceHistory({ q: value, exact: 1, limit: 25 });
      const payload = response?.data || {};
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setSummary(payload.summary || null);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || t('device_history.search_failed'));
      setItems([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = (value) => {
    setScannerOpen(false);
    const scanned = String(value || '').trim();
    setQuery(scanned);
    if (settings?.scanner_auto_search !== false) runSearch(null, scanned);
  };

  return (
    <div className="nst-dh-page min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <NstPageHeader icon={NstHdrSmartphone} title={t('device_history.title')} subtitle={t('device_history.subtitle')} actions={<><form onSubmit={runSearch} className="nst-dh-search" autoComplete="off">
              <label className="nst-dh-search__field">
                <Search className="nst-dh-muted nst-dh-search__icon" size={19} />
                <input
                  value={query}
                  name="device-history-identifier"
                  autoComplete="off"
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('device_history.placeholder')}
                  title={t('device_history.placeholder')}
                  className={`nst-dh-input w-full rounded-2xl py-3 pl-11 font-bold outline-none ${scannerEnabled ? 'has-scan pr-12' : 'pr-4'}`}
                />
                {scannerEnabled ? (
                  <button
                    type="button"
                    className="nst-dh-scan"
                    onClick={() => setScannerOpen(true)}
                    aria-label={t('global_search.scan_aria')}
                    title={t('global_search.scan_title')}
                  >
                    <ScanLine size={17} />
                  </button>
                ) : null}
              </label>
              <button
                type="submit"
                disabled={loading}
                className="rounded-2xl bg-[var(--nst-dashboard-primary)] px-5 py-3 font-black text-white disabled:opacity-60"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : t('common.search')}
              </button>
            </form></>}/>
        {scannerEnabled ? <NstScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleScan} /> : null}

        {summary && items.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoTile icon={Boxes} label={t('device_history.matched')} value={summary.matched_devices} />
            <InfoTile icon={Activity} label={t('device_history.sold_records')} value={summary.sold_records} />
            <InfoTile icon={ShieldCheck} label={t('device_history.available')} value={summary.available_records} />
            <InfoTile icon={CalendarClock} label={t('device_history.last_movement')} value={formatDate(summary.last_movement_at)} />
          </div>
        ) : null}

        {error ? (
          <div className="flex items-center gap-3 rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 font-bold text-rose-500">
            <AlertCircle size={20} />
            {error}
          </div>
        ) : null}

        {!searched && !error ? (
          <div className="nst-dh-empty">
            <Search size={28} className="mx-auto mb-3 opacity-60" />
            {t('device_history.start_hint')}
          </div>
        ) : null}

        {searched && !loading && !error && items.length === 0 ? (
          <div className="nst-dh-empty">{t('device_history.no_match')}</div>
        ) : null}

        <div className="space-y-5">
          {items.map((item) => (
            <DeviceCard
              key={item.id}
              item={item}
              canViewPurchasePrice={canViewPurchasePrice}
              canViewProfit={canViewProfit}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
