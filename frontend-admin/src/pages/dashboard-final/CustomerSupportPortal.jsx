import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, UserRound, Phone, MapPin, Building2, ReceiptText, Smartphone, ArrowDownUp, ShieldCheck, RefreshCw, WalletCards, Eye, AlertCircle } from 'lucide-react';
import dashboardOperatingService from '../../services/dashboardOperatingService';
import NstPageHero from '../../components/system/NstPageHero';
import { useT } from '../../i18n';

const money = (value) => `৳${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value || 0))}`;
const when = (value) => value ? new Date(value).toLocaleString('en-BD') : '—';
const tabs = [
  ['overview', 'customer_support.tabs.overview'], ['purchased', 'customer_support.tabs.purchased'], ['sold', 'customer_support.tabs.sold'],
  ['invoices', 'customer_support.tabs.invoices'], ['service', 'customer_support.tabs.service'], ['payments', 'customer_support.tabs.payments'],
];

function Panel({ children, className = '' }) {
  return <section className={`rounded-[26px] border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] shadow-[var(--nst-dashboard-shadow)] ${className}`}>{children}</section>;
}

function Empty({ children }) {
  return <div className="rounded-2xl border border-dashed border-[var(--nst-dashboard-border)] p-8 text-center text-sm text-[var(--nst-dashboard-muted)]">{children}</div>;
}

export default function CustomerSupportPortal() {
  const t = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState('overview');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(async () => {
      const q = query.trim();
      if (q.length < 2) { setResults([]); return; }
      setSearching(true); setError('');
      try {
        const response = await dashboardOperatingService.searchCustomers(q);
        setResults(response?.data?.data || []);
      } catch (err) {
        setError(err?.response?.data?.message || t('customer_support.errors.search_failed'));
        setResults([]);
      } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, t]);

  const openCustomer = async (id) => {
    setSelectedId(id); setLoading(true); setError(''); setTab('overview');
    try {
      const response = await dashboardOperatingService.customerSupportProfile(id);
      setProfile({ ...(response?.data?.data || {}), can_view_purchase_price: Boolean(response?.data?.can_view_purchase_price) });
    } catch (err) {
      setProfile(null); setError(err?.response?.data?.message || t('customer_support.errors.profile_failed'));
    } finally { setLoading(false); }
  };

  const selected = profile?.customer;
  const sales = profile?.sales || [];
  const sold = profile?.sold_to_nst || [];
  const summary = profile?.summary || {};
  const invoiceRows = useMemo(() => sales.map((sale) => ({ ...sale, document_type: t('customer_support.sales_invoice') })), [sales, t]);

  return <main className="min-h-full bg-[var(--nst-dashboard-bg)] p-4 text-[var(--nst-dashboard-text)] md:p-6">
    <div className="mx-auto max-w-[1700px] space-y-5">
      <NstPageHero pageKey="/customer-support" icon={UserRound} defaults={{ eyebrow: t('customer_support.eyebrow'), title: t('customer_support.title'), subtitle: t('customer_support.subtitle') }} actions={<div className="nst-ph-search flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] px-4 py-3"><Search size={19}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('customer_support.search_placeholder')} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"/>{searching && <RefreshCw className="animate-spin" size={17}/>}</div>}/>

      {error && <div className="flex items-center gap-3 rounded-2xl border border-rose-300/40 bg-rose-500/10 p-4 text-sm font-bold text-rose-500"><AlertCircle size={18}/>{error}</div>}

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Panel className="min-h-[650px] overflow-hidden">
          <div className="border-b border-[var(--nst-dashboard-border)] p-4"><h2 className="font-black">{t('customer_support.matching_title')}</h2><p className="text-xs text-[var(--nst-dashboard-muted)]">{t('customer_support.matching_help')}</p></div>
          <div className="max-h-[760px] space-y-2 overflow-y-auto p-3 nst-overlay-scroll">
            {query.trim().length < 2 && <Empty>{t('customer_support.empty.min_chars')}</Empty>}
            {query.trim().length >= 2 && !searching && results.length === 0 && <Empty>{t('customer_support.empty.no_match')}</Empty>}
            {results.map((customer) => <button key={customer.id} onClick={() => openCustomer(customer.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === customer.id ? 'border-[var(--nst-dashboard-primary)] bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_10%,var(--nst-dashboard-surface))]' : 'border-[var(--nst-dashboard-border)] hover:border-[var(--nst-dashboard-primary)]'}`}>
              <div className="flex items-start justify-between gap-3"><div><strong className="block text-sm">{customer.name}</strong><span className="text-[11px] font-bold text-[var(--nst-dashboard-primary)]">{customer.customer_id}</span></div><span className="rounded-full border border-[var(--nst-dashboard-border)] px-2 py-1 text-[10px] font-black">{t('customer_support.txn_count', { count: customer.total_transactions })}</span></div>
              <div className="mt-3 space-y-1 text-xs text-[var(--nst-dashboard-muted)]"><p className="flex items-center gap-2"><Phone size={13}/>{customer.phone || t('customer_support.no_phone')}</p><p className="flex items-center gap-2"><MapPin size={13}/>{[customer.address, customer.city].filter(Boolean).join(', ') || t('customer_support.no_address')}</p><p className="flex items-center gap-2"><Building2 size={13}/>{customer.last_branch || t('customer_support.no_branch_txn')}</p></div>
              <div className="mt-3 flex gap-2 text-[10px] font-bold"><span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-emerald-500">{t('customer_support.bought_count', { count: customer.purchase_count })}</span><span className="rounded-lg bg-orange-500/10 px-2 py-1 text-orange-500">{t('customer_support.sold_count', { count: customer.sold_to_nst_count })}</span></div>
            </button>)}
          </div>
        </Panel>

        <Panel className="min-h-[650px] overflow-hidden">
          {!selectedId && <div className="grid min-h-[650px] place-items-center p-8"><div className="text-center"><UserRound className="mx-auto text-[var(--nst-dashboard-muted)]" size={54}/><h2 className="mt-4 text-xl font-black">{t('customer_support.select_customer')}</h2><p className="mt-2 text-sm text-[var(--nst-dashboard-muted)]">{t('customer_support.select_customer_help')}</p></div></div>}
          {loading && <div className="grid min-h-[650px] place-items-center"><RefreshCw className="animate-spin text-[var(--nst-dashboard-primary)]" size={36}/></div>}
          {selected && !loading && <>
            <div className="border-b border-[var(--nst-dashboard-border)] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[.15em] text-[var(--nst-dashboard-primary)]">{selected.customer_id}</p><h2 className="text-2xl font-black">{selected.name}</h2><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--nst-dashboard-muted)]"><span>{selected.phone}</span><span>{selected.email || t('customer_support.no_email')}</span><span>{selected.address || t('customer_support.no_address')}</span></div></div><div className="rounded-2xl border border-[var(--nst-dashboard-border)] px-4 py-3 text-xs"><strong>{t('customer_support.cost_visibility')}</strong> <span className={profile.can_view_purchase_price ? 'text-emerald-500' : 'text-amber-500'}>{profile.can_view_purchase_price ? t('customer_support.authorized') : t('customer_support.restricted')}</span></div></div>
              <div className="mt-5 flex gap-2 overflow-x-auto pb-1 nst-overlay-scroll">{tabs.map(([id, labelKey]) => <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-black ${tab === id ? 'bg-[var(--nst-dashboard-primary)] text-white' : 'border border-[var(--nst-dashboard-border)]'}`}>{t(labelKey)}</button>)}</div>
            </div>

            <div className="p-5">
              {tab === 'overview' && <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
                  [Smartphone, t('customer_support.tabs.purchased'), summary.purchased_from_nst || 0], [ArrowDownUp, t('customer_support.tabs.sold'), summary.sold_to_nst || 0],
                  [ReceiptText, t('customer_support.invoices'), summary.invoices || 0], [WalletCards, t('customer_support.current_due'), money(summary.total_due || 0)],
                ].map(([Icon, label, value]) => <div key={label} className="rounded-2xl border border-[var(--nst-dashboard-border)] p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_14%,transparent)] text-[var(--nst-dashboard-primary)]"><Icon size={18}/></span><p className="mt-3 text-xs font-bold text-[var(--nst-dashboard-muted)]">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>)}</div>
                <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-[var(--nst-dashboard-border)] p-4"><h3 className="font-black">{t('customer_support.latest_purchases')}</h3><div className="mt-3 space-y-2">{sales.slice(0,5).map((sale) => <div key={sale.id} className="flex items-center justify-between rounded-xl bg-[var(--nst-dashboard-bg)] p-3 text-xs"><div><strong>{sale.invoice_no}</strong><p className="text-[var(--nst-dashboard-muted)]">{when(sale.date)} · {sale.branch}</p></div><span className="font-black">{money(sale.sale_price)}</span></div>)}{sales.length === 0 && <Empty>{t('customer_support.empty.no_purchase')}</Empty>}</div></div><div className="rounded-2xl border border-[var(--nst-dashboard-border)] p-4"><h3 className="font-black">{t('customer_support.latest_sold')}</h3><div className="mt-3 space-y-2">{sold.slice(0,5).map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-[var(--nst-dashboard-bg)] p-3 text-xs"><div><strong>{item.product_name}</strong><p className="text-[var(--nst-dashboard-muted)]">{item.imei_1 || t('customer_support.no_imei')} · {item.branch}</p></div><span className="font-black">{profile.can_view_purchase_price ? money(item.purchase_price) : t('customer_support.restricted')}</span></div>)}{sold.length === 0 && <Empty>{t('customer_support.empty.no_sold')}</Empty>}</div></div></div>
              </div>}

              {tab === 'purchased' && <div className="space-y-4">{sales.map((sale) => <article key={sale.id} className="rounded-2xl border border-[var(--nst-dashboard-border)] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black">{sale.invoice_no}</h3><p className="text-xs text-[var(--nst-dashboard-muted)]">{when(sale.date)} · {sale.branch} · {sale.salesperson}</p></div><div className="flex items-center gap-2"><span className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-500">{money(sale.sale_price)}</span><Link to={`/sales/${sale.id}/invoice`} className="rounded-xl border border-[var(--nst-dashboard-border)] p-2" title={t('customer_support.view_invoice')}><Eye size={17}/></Link></div></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="text-[var(--nst-dashboard-muted)]"><tr><th className="pb-2">{t('customer_support.table.device')}</th><th>{t('customer_support.table.sku_imei')}</th><th>{t('customer_support.table.qty')}</th><th>{t('customer_support.table.sale_price')}</th>{profile.can_view_purchase_price && <th>{t('customer_support.table.purchase_price')}</th>}<th>{t('customer_support.table.status')}</th></tr></thead><tbody>{sale.items.map((item) => <tr key={item.id} className="border-t border-[var(--nst-dashboard-border)]"><td className="py-3 font-bold">{item.product_name}</td><td>{item.sku}<br/>{item.imei_1}</td><td>{item.quantity}</td><td>{money(item.sale_price)}</td>{profile.can_view_purchase_price && <td>{money(item.purchase_price)}</td>}<td>{item.device_status || sale.status}</td></tr>)}</tbody></table></div></article>)}{sales.length === 0 && <Empty>{t('customer_support.empty.no_device_purchase')}</Empty>}</div>}

              {tab === 'sold' && <div className="grid gap-4 lg:grid-cols-2">{sold.map((item) => <article key={item.id} className="rounded-2xl border border-[var(--nst-dashboard-border)] p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black">{item.product_name}</h3><p className="text-xs text-[var(--nst-dashboard-muted)]">{item.brand} {item.model} · {item.condition}</p></div><span className="rounded-xl bg-orange-500/10 px-3 py-2 text-xs font-black text-orange-500">{item.type || t('customer_support.used_purchase')}</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><span className="text-[var(--nst-dashboard-muted)]">{t('customer_support.imei')}</span><strong className="block">{item.imei_1 || '—'}</strong></div><div><span className="text-[var(--nst-dashboard-muted)]">{t('customer_support.branch')}</span><strong className="block">{item.branch || '—'}</strong></div><div><span className="text-[var(--nst-dashboard-muted)]">{t('customer_support.nst_purchase_price')}</span><strong className="block">{profile.can_view_purchase_price ? money(item.purchase_price) : t('customer_support.permission_restricted')}</strong></div><div><span className="text-[var(--nst-dashboard-muted)]">{t('customer_support.table.status')}</span><strong className="block">{item.stock_status}</strong></div></div>{item.resale_invoice_no && <p className="mt-4 rounded-xl bg-[var(--nst-dashboard-bg)] p-3 text-xs">{t('customer_support.later_sold_on')} <strong>{item.resale_invoice_no}</strong></p>}</article>)}{sold.length === 0 && <div className="lg:col-span-2"><Empty>{t('customer_support.empty.no_device_sold')}</Empty></div>}</div>}

              {tab === 'invoices' && <div className="space-y-2">{invoiceRows.map((row) => <div key={row.id} className="flex flex-col gap-3 rounded-2xl border border-[var(--nst-dashboard-border)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><strong>{row.document_type}: {row.invoice_no}</strong><p className="text-xs text-[var(--nst-dashboard-muted)]">{when(row.date)} · {row.payment_status} · {row.status}</p></div><div className="flex items-center gap-3"><span className="font-black">{money(row.sale_price)}</span><Link to={`/sales/${row.id}/invoice`} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-4 py-2 text-xs font-black text-white">{t('customer_support.view_print')}</Link></div></div>)}{invoiceRows.length === 0 && <Empty>{t('customer_support.empty.no_invoice')}</Empty>}</div>}

              {tab === 'service' && <div className="space-y-3">{(profile.warranty_service || []).map((job) => <div key={job.id} className="rounded-2xl border border-[var(--nst-dashboard-border)] p-4"><div className="flex items-center gap-3"><ShieldCheck className="text-[var(--nst-dashboard-primary)]" size={20}/><div><strong>{job.job_no || t('customer_support.service_no', { id: job.id })}</strong><p className="text-xs text-[var(--nst-dashboard-muted)]">{job.status || job.service_status} · {when(job.created_at)}</p></div></div></div>)}{(profile.warranty_service || []).length === 0 && <Empty>{t('customer_support.empty.no_service')}</Empty>}</div>}

              {tab === 'payments' && <div className="space-y-3">{(profile.payments || []).map((payment) => <div key={payment.id} className="flex items-center justify-between rounded-2xl border border-[var(--nst-dashboard-border)] p-4"><div><strong>{payment.payment_no || t('customer_support.payment_no', { id: payment.id })}</strong><p className="text-xs text-[var(--nst-dashboard-muted)]">{payment.payment_method || payment.method || t('customer_support.payment')} · {when(payment.created_at)}</p></div><span className="font-black">{money(payment.amount)}</span></div>)}{(profile.payments || []).length === 0 && <Empty>{t('customer_support.empty.no_payment')}</Empty>}</div>}
            </div>
          </>}
        </Panel>
      </div>
    </div>
  </main>;
}
