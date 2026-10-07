import { useEffect, useMemo, useState } from 'react';
import { CreditCard, RefreshCw, Save, ShieldCheck, WalletCards, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import paymentGatewayService from '../../services/paymentGatewayService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { CreditCard as NstHdrCreditCard } from 'lucide-react';

const unwrap = (response) => response?.data?.data ?? response?.data ?? {};
const money = (value, currency = 'BDT') => `${currency === 'BDT' ? '৳' : `${currency} `}${Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-[var(--nst-dashboard-primary)]';
const label = 'block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5';

function GatewayCard({ row, busy, onSave }) {
  const [form, setForm] = useState(row);
  useEffect(() => setForm(row), [row]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const provider = row.provider;
  const isPipra = provider === 'piprapay';

  const submit = async () => {
    const payload = {
      display_name: form.display_name,
      enabled: Boolean(form.enabled),
      mode: form.mode,
      sort_order: Number(form.sort_order || 0),
      refunds_enabled: isPipra ? Boolean(form.refunds_enabled) : false,
      currency: form.currency || 'BDT',
      timeout_seconds: Number(form.timeout_seconds || 30),
      frontend_url: form.frontend_url || undefined,
      ...(isPipra
        ? { base_url: form.base_url || '', api_key: form.api_key || '' }
        : {
            store_id: form.store_id || '',
            store_password: form.store_password || '',
            allow_risk_level_one: Boolean(form.allow_risk_level_one),
          }),
    };
    await onSave(provider, payload);
    setForm((prev) => ({ ...prev, api_key: '', store_password: '' }));
  };

  return (
    <article className="rounded-3xl border border-[var(--nst-dashboard-border)] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <WalletCards size={20} className="text-[var(--nst-dashboard-primary)]" />
            <h2 className="text-xl font-black">{row.display_name}</h2>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {provider} · {row.configured ? 'Configured' : 'Credentials required'} · source: {row.source}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${row.enabled && row.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {row.enabled && row.configured ? 'ACTIVE' : 'INACTIVE'}
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div><label className={label}>Display Name</label><input className={input} value={form.display_name || ''} onChange={(e) => set('display_name', e.target.value)} /></div>
        <div><label className={label}>Mode</label><select className={input} value={form.mode || 'live'} onChange={(e) => set('mode', e.target.value)}><option value="live">Live</option><option value="sandbox">Sandbox</option></select></div>
        <div><label className={label}>Currency</label><input className={input} value={form.currency || 'BDT'} onChange={(e) => set('currency', e.target.value.toUpperCase())} /></div>
        <div><label className={label}>Sort Order</label><input className={input} type="number" min="0" value={form.sort_order ?? 0} onChange={(e) => set('sort_order', e.target.value)} /></div>
        <div><label className={label}>Timeout Seconds</label><input className={input} type="number" min="10" max="120" value={form.timeout_seconds ?? 30} onChange={(e) => set('timeout_seconds', e.target.value)} /></div>
        <div><label className={label}>Customer Frontend URL</label><input className={input} value={form.frontend_url || ''} onChange={(e) => set('frontend_url', e.target.value)} placeholder="https://newsingapurtele.com" /></div>

        {isPipra ? <>
          <div className="md:col-span-2"><label className={label}>PipraPay Base URL</label><input className={input} value={form.base_url || ''} onChange={(e) => set('base_url', e.target.value)} placeholder="https://pay.example.com" /></div>
          <div className="md:col-span-2"><label className={label}>API Key</label><input className={input} type="password" value={form.api_key || ''} onChange={(e) => set('api_key', e.target.value)} placeholder={row.api_key_masked ? `Saved: ${row.api_key_masked} — leave blank to keep` : 'Enter PipraPay API key'} /></div>
        </> : <>
          <div><label className={label}>Store ID</label><input className={input} value={form.store_id || ''} onChange={(e) => set('store_id', e.target.value)} placeholder={row.store_id_masked ? `Saved: ${row.store_id_masked}` : 'SSLCOMMERZ Store ID'} /></div>
          <div><label className={label}>Store Password</label><input className={input} type="password" value={form.store_password || ''} onChange={(e) => set('store_password', e.target.value)} placeholder={row.store_password_masked ? `Saved: ${row.store_password_masked} — leave blank to keep` : 'SSLCOMMERZ Store Password'} /></div>
        </>}
      </div>

      <div className="mt-5 flex flex-wrap gap-4 rounded-2xl bg-slate-50 p-4">
        <label className="flex items-center gap-2 text-sm font-black"><input type="checkbox" checked={Boolean(form.enabled)} onChange={(e) => set('enabled', e.target.checked)} /> Enabled</label>
        {isPipra && <label className="flex items-center gap-2 text-sm font-black"><input type="checkbox" checked={Boolean(form.refunds_enabled)} onChange={(e) => set('refunds_enabled', e.target.checked)} /> Allow full gateway refunds</label>}
        {!isPipra && <label className="flex items-center gap-2 text-sm font-black"><input type="checkbox" checked={Boolean(form.allow_risk_level_one)} onChange={(e) => set('allow_risk_level_one', e.target.checked)} /> Allow SSLCommerz risk level 1</label>}
      </div>

      <div className="mt-5 flex justify-end">
        <button disabled={busy} onClick={submit} className="inline-flex items-center gap-2 rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">
          <Save size={16} /> Save {row.display_name}
        </button>
      </div>
    </article>
  );
}

export default function PaymentGatewayManagerPage() {
  const [gateways, setGateways] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [tab, setTab] = useState('gateways');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const [gatewayRes, txRes, webhookRes] = await Promise.all([
        paymentGatewayService.list(),
        paymentGatewayService.transactions({ per_page: 50 }),
        paymentGatewayService.webhookLogs({ per_page: 50 }),
      ]);
      setGateways(Array.isArray(unwrap(gatewayRes)) ? unwrap(gatewayRes) : []);
      setTransactions(unwrap(txRes)?.data || []);
      setWebhooks(unwrap(webhookRes)?.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to load payment gateway manager.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (provider, payload) => {
    setBusy(true);
    try {
      const response = await paymentGatewayService.update(provider, payload);
      toast.success(response?.data?.message || 'Gateway saved.');
      await load();
    } catch (error) {
      const data = error?.response?.data;
      if (data?.data) await load();
      toast.error(data?.message || 'Gateway save failed.');
    } finally {
      setBusy(false);
    }
  };

  const refund = async (row) => {
    if (!window.confirm(`Refund full ${money(row.amount, row.currency)} for ${row.transaction_no}? This does not change stock automatically.`)) return;
    setBusy(true);
    try {
      const response = await paymentGatewayService.refund(row.id);
      toast.success(response?.data?.message || 'Refund confirmed.');
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Refund failed.');
    } finally {
      setBusy(false);
    }
  };

  const activeCount = useMemo(() => gateways.filter((x) => x.enabled && x.configured).length, [gateways]);

  return (
    <main className="min-h-screen bg-[var(--nst-dashboard-surface)] p-4 md:p-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <NstPageHeader icon={NstHdrCreditCard} title={<>Payment Gateway Manager</>} subtitle={<>SSLCommerz + PipraPay, encrypted secrets, server-side verification, logs and controlled refunds.</>} actions={<><div className="mt-4 flex items-center gap-2 text-sm font-black text-emerald-700"><ShieldCheck size={17}/> {activeCount} configured gateway{activeCount === 1 ? '' : 's'} active</div><button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black"><RefreshCw size={16} className={busy ? 'animate-spin' : ''}/> Refresh</button></>}/>

        <div className="flex flex-wrap gap-2">
          {[['gateways','Gateways'],['transactions','Transactions'],['webhooks','Webhook Logs']].map(([key, text]) => <button key={key} onClick={() => setTab(key)} className={`rounded-xl px-4 py-2.5 text-sm font-black ${tab === key ? 'bg-[var(--nst-dashboard-primary)] text-white' : 'border bg-white'}`}>{text}</button>)}
        </div>

        {tab === 'gateways' && <div className="grid gap-5 xl:grid-cols-2">{gateways.map((row) => <GatewayCard key={row.provider} row={row} busy={busy} onSave={save}/>)}</div>}

        {tab === 'transactions' && <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr>{['Transaction','Provider','Order','Amount','Status','Gateway Ref','Created','Action'].map((x) => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody>
            {transactions.map((row) => <tr key={row.id} className="border-t"><td className="px-4 py-3 font-black">{row.transaction_no}</td><td className="px-4 py-3 uppercase">{row.provider}</td><td className="px-4 py-3">{row.order?.order_no || row.customer_order_id || '—'}</td><td className="px-4 py-3 font-black">{money(row.amount,row.currency)}</td><td className="px-4 py-3">{row.status}</td><td className="px-4 py-3 font-mono text-xs">{row.provider_transaction_id || '—'}</td><td className="px-4 py-3 text-xs">{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td><td className="px-4 py-3">{row.provider === 'piprapay' && row.status === 'paid' ? <button disabled={busy} onClick={() => refund(row)} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700"><RotateCcw size={13}/> Full Refund</button> : '—'}</td></tr>)}
            {!transactions.length && <tr><td colSpan="8" className="p-10 text-center text-slate-500">No payment transactions found.</td></tr>}
          </tbody></table></div>
        </section>}

        {tab === 'webhooks' && <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr>{['Provider','Gateway Ref','Event','Status','HTTP','Message','Received'].map((x) => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody>
            {webhooks.map((row) => <tr key={row.id} className="border-t"><td className="px-4 py-3 font-black uppercase">{row.provider}</td><td className="px-4 py-3 font-mono text-xs">{row.provider_transaction_id || '—'}</td><td className="px-4 py-3">{row.event_key || '—'}</td><td className="px-4 py-3">{row.status}</td><td className="px-4 py-3">{row.response_code || '—'}</td><td className="max-w-md px-4 py-3 text-xs">{row.message || '—'}</td><td className="px-4 py-3 text-xs">{row.received_at ? new Date(row.received_at).toLocaleString() : '—'}</td></tr>)}
            {!webhooks.length && <tr><td colSpan="7" className="p-10 text-center text-slate-500">No webhook events found.</td></tr>}
          </tbody></table></div>
        </section>}
      </div>
    </main>
  );
}
