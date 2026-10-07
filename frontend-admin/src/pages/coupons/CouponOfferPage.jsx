import { useEffect, useState } from 'react';
import finalOperationsService from '../../services/finalOperationsService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Megaphone as NstHdrMegaphone } from 'lucide-react';

const emptyTier = { minimum_amount: '', maximum_amount: '', discount_amount: '', sort_order: 0, is_active: true };
const emptyPromo = { phone: '', branch_id: '', purchase_amount: '' };
const emptyInvoice = { source_invoice_no: '', customer_phone: '', source_amount: '' };

const payloadData = (response) => response?.data?.data || response?.data || null;
const pageRows = (response) => payloadData(response)?.data || [];

export default function CouponOfferPage() {
  const [tab, setTab] = useState('tiers');
  const [tiers, setTiers] = useState([]);
  const [promos, setPromos] = useState([]);
  const [invoiceCoupons, setInvoiceCoupons] = useState([]);
  const [tier, setTier] = useState(emptyTier);
  const [promo, setPromo] = useState(emptyPromo);
  const [invoice, setInvoice] = useState(emptyInvoice);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [tierResponse, promoResponse, invoiceResponse] = await Promise.all([
        finalOperationsService.couponTiers(),
        finalOperationsService.registrationPromos(),
        finalOperationsService.invoiceCoupons(),
      ]);
      setTiers(payloadData(tierResponse) || []);
      setPromos(pageRows(promoResponse));
      setInvoiceCoupons(pageRows(invoiceResponse));
    } catch (err) {
      setError(err?.response?.data?.message || 'Promotion data could not be loaded.');
    }
  };

  useEffect(() => { load(); }, []);

  const run = async (action, success) => {
    try {
      setError(''); setMessage('');
      await action();
      setMessage(success);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || Object.values(err?.response?.data?.errors || {}).flat()[0] || 'Operation failed.');
    }
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <NstPageHeader icon={NstHdrMegaphone} title={<>Promotions & Coupon Rules</>} subtitle={<>Registration promo and invoice coupon use the same editable discount tiers.</>}/>
      <div className="flex flex-wrap gap-2">
        <Tab active={tab === 'tiers'} onClick={() => setTab('tiers')}>Discount Tiers</Tab>
        <Tab active={tab === 'registration'} onClick={() => setTab('registration')}>Registration Promo Codes</Tab>
        <Tab active={tab === 'invoice'} onClick={() => setTab('invoice')}>Invoice Coupons</Tab>
      </div>
      {message && <Notice type="success">{message}</Notice>}
      {error && <Notice type="error">{error}</Notice>}

      {tab === 'tiers' && (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <Panel title={tier.id ? 'Edit Tier' : 'Add Tier'}>
            <div className="space-y-3">
              <Input label="Minimum Amount" type="number" value={tier.minimum_amount} onChange={(value) => setTier({ ...tier, minimum_amount: value })} />
              <Input label="Maximum Amount (blank means no limit)" type="number" value={tier.maximum_amount || ''} onChange={(value) => setTier({ ...tier, maximum_amount: value })} />
              <Input label="Discount Amount" type="number" value={tier.discount_amount} onChange={(value) => setTier({ ...tier, discount_amount: value })} />
              <Input label="Order" type="number" value={tier.sort_order} onChange={(value) => setTier({ ...tier, sort_order: value })} />
              <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={Boolean(tier.is_active)} onChange={(event) => setTier({ ...tier, is_active: event.target.checked })} /> Active</label>
              <button onClick={() => run(() => finalOperationsService.saveCouponTier({ ...tier, maximum_amount: tier.maximum_amount || null }, tier.id), 'Coupon tier saved.').then(() => setTier(emptyTier))} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 font-black text-white">Save Tier</button>
            </div>
          </Panel>
          <Panel title="Editable Tier Table">
            <Table headers={['Range', 'Discount', 'Status', 'Action']}>
              {tiers.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="p-3 font-bold">৳{item.minimum_amount} – {item.maximum_amount ? `৳${item.maximum_amount}` : 'Above'}</td>
                  <td className="p-3 text-[var(--nst-dashboard-primary)]">৳{item.discount_amount}</td>
                  <td className="p-3">{item.is_active ? 'Active' : 'Inactive'}</td>
                  <td className="p-3"><button onClick={() => setTier(item)} className="text-sm font-bold text-[var(--nst-dashboard-primary)]">Edit</button> <button onClick={() => run(() => finalOperationsService.deleteCouponTier(item.id), 'Tier deleted.')} className="ml-3 text-sm font-bold text-red-600">Delete</button></td>
                </tr>
              ))}
            </Table>
          </Panel>
        </div>
      )}

      {tab === 'registration' && (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <Panel title="Generate Registration Promo">
            <div className="space-y-3">
              <Input label="Phone Number" value={promo.phone} onChange={(value) => setPromo({ ...promo, phone: value })} />
              <Input label="Branch ID (SuperAdmin/Admin)" type="number" value={promo.branch_id} onChange={(value) => setPromo({ ...promo, branch_id: value })} />
              <Input label="Purchase Amount" type="number" value={promo.purchase_amount} onChange={(value) => setPromo({ ...promo, purchase_amount: value })} />
              <button onClick={() => run(() => finalOperationsService.generateRegistrationPromo({ ...promo, branch_id: promo.branch_id || null, purchase_amount: promo.purchase_amount || null }), 'Single-use registration promo generated.').then(() => setPromo(emptyPromo))} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 font-black text-white">Generate Code</button>
            </div>
          </Panel>
          <Panel title="Registration Promo History">
            <Table headers={['Code', 'Phone', 'Branch', 'Discount', 'Status', 'Used At']}>
              {promos.map((item) => <tr key={item.id} className="border-b"><td className="p-3 font-black">{item.code}</td><td className="p-3">{item.phone}</td><td className="p-3">{item.branch_name || item.branch_id || '—'}</td><td className="p-3">৳{item.discount_amount}</td><td className="p-3">{item.status}</td><td className="p-3">{item.used_at || '—'}</td></tr>)}
            </Table>
          </Panel>
        </div>
      )}

      {tab === 'invoice' && (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <Panel title="Issue Invoice Coupon">
            <div className="space-y-3">
              <Input label="Source Invoice Number" value={invoice.source_invoice_no} onChange={(value) => setInvoice({ ...invoice, source_invoice_no: value })} />
              <Input label="Customer Phone" value={invoice.customer_phone} onChange={(value) => setInvoice({ ...invoice, customer_phone: value })} />
              <Input label="Source Amount" type="number" value={invoice.source_amount} onChange={(value) => setInvoice({ ...invoice, source_amount: value })} />
              <button onClick={() => run(() => finalOperationsService.issueInvoiceCoupon(invoice), 'Invoice coupon issued.').then(() => setInvoice(emptyInvoice))} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 font-black text-white">Issue Coupon</button>
            </div>
          </Panel>
          <Panel title="Issue and Use History">
            <Table headers={['Code', 'Source Invoice', 'Used Invoice', 'Phone', 'Discount', 'Status']}>
              {invoiceCoupons.map((item) => <tr key={item.id} className="border-b"><td className="p-3 font-black">{item.coupon_code}</td><td className="p-3">{item.source_invoice_no || item.source_sale_id}</td><td className="p-3">{item.used_invoice_no || '—'}</td><td className="p-3">{item.customer_phone || '—'}</td><td className="p-3">৳{item.discount_amount}</td><td className="p-3">{item.status}</td></tr>)}
            </Table>
          </Panel>
        </div>
      )}
    </div>
  );
}

function Tab({ active, onClick, children }) { return <button onClick={onClick} className={`rounded-xl px-4 py-2 text-sm font-black ${active ? 'bg-[var(--nst-dashboard-primary)] text-white' : 'bg-white text-slate-600'}`}>{children}</button>; }
function Panel({ title, children }) { return <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="mb-4 font-black text-slate-900">{title}</h2>{children}</section>; }
function Input({ label, value, onChange, type = 'text' }) { return <label className="block text-sm font-bold text-slate-700">{label}<input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]" /></label>; }
function Table({ headers, children }) { return <div className="overflow-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="bg-slate-50">{headers.map((item) => <th key={item} className="p-3 font-black">{item}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Notice({ type, children }) { return <div className={`rounded-xl border px-4 py-3 text-sm ${type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{children}</div>; }
