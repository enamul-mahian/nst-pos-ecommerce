import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Banknote,
  CheckCircle2,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import api from '../../services/api';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { ArrowDownUp as NstHdrArrowDownUp } from 'lucide-react';

const unwrapRows = (response) => {
  const payload = response?.data?.data ?? response?.data ?? [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const money = (value) => `৳${Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
const field = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]';
const button = 'inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-black text-white disabled:opacity-50';

const emptyNormal = {
  sale_id: '',
  return_item_id: '',
  return_qty: 1,
  replacement_product_id: '',
  replacement_variant_id: '',
  replacement_qty: 1,
  unit_price: '',
  device_ids: '',
  paid_amount: 0,
  payment_method: 'cash',
  reason: 'Customer exchange',
  note: '',
};

const emptyCash = {
  sale_id: '',
  return_item_id: '',
  accepted_value: '',
  customer_payout_amount: '',
  payment_method: 'cash',
  payment_reference: '',
  provider_name: '',
  transaction_id: '',
  condition_note: '',
  reason: 'Customer cash exchange',
  note: '',
  payout_note: '',
};

function Header({ loading, onRefresh }) {
  return (
    <NstPageHeader icon={NstHdrArrowDownUp} title={<>Exchange & Cash Exchange</>} subtitle={<>Normal Exchange replaces a sold item with another saleable device. Cash Exchange receives the sold IMEI back,
            records accepted value and the actual amount paid to the customer, then moves the device to Awaiting Inspection.
          </>} actions={<><button type="button" onClick={onRefresh} className={button}>
          <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button></>}/>
  );
}

function SaleItemInfo({ item }) {
  if (!item) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
      <div className="font-black text-slate-900">{item.product_name}</div>
      <div className="mt-1 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
        <span>Credit: {money(item.unit_credit)}</span>
        {item.imei_1 ? <span>· IMEI1: {item.imei_1}</span> : null}
        {item.imei_2 ? <span>· IMEI2: {item.imei_2}</span> : null}
        {item.device_barcode ? <span>· Barcode: {item.device_barcode}</span> : null}
      </div>
    </div>
  );
}

export default function ExchangePage() {
  const [mode, setMode] = useState('replacement');
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [options, setOptions] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [normal, setNormal] = useState(emptyNormal);
  const [cash, setCash] = useState(emptyCash);

  const selectedProduct = useMemo(
    () => products.find((row) => String(row.id) === String(normal.replacement_product_id)),
    [products, normal.replacement_product_id]
  );

  const selectedNormalItem = useMemo(
    () => options.find((row) => String(row.id) === String(normal.return_item_id)),
    [options, normal.return_item_id]
  );

  const selectedCashItem = useMemo(
    () => options.find((row) => String(row.id) === String(cash.return_item_id)),
    [options, cash.return_item_id]
  );

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const [salesResponse, productResponse, historyResponse] = await Promise.all([
        api.get('/sales', { params: { per_page: 100 } }),
        api.get('/products/all'),
        api.get('/exchanges', { params: { per_page: 100 } }),
      ]);

      setSales(unwrapRows(salesResponse));
      setProducts(unwrapRows(productResponse));
      setHistory(unwrapRows(historyResponse));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Exchange data could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const loadOptions = async (saleId) => {
    setOptions([]);
    if (!saleId) return;

    try {
      const response = await api.get(`/sales/${saleId}/exchange-options`);
      setOptions(response?.data?.data?.items || []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Exchange options could not be loaded.');
    }
  };

  const selectNormalSale = async (saleId) => {
    setNormal((current) => ({ ...current, sale_id: saleId, return_item_id: '' }));
    await loadOptions(saleId);
  };

  const selectCashSale = async (saleId) => {
    setCash((current) => ({ ...current, sale_id: saleId, return_item_id: '', accepted_value: '', customer_payout_amount: '' }));
    await loadOptions(saleId);
  };

  const selectCashItem = (itemId) => {
    const item = options.find((row) => String(row.id) === String(itemId));
    const credit = Number(item?.unit_credit || 0);

    setCash((current) => ({
      ...current,
      return_item_id: itemId,
      accepted_value: credit ? String(credit) : '',
      customer_payout_amount: credit ? String(credit) : '',
    }));
  };

  const submitNormal = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await api.post('/exchanges', {
        sale_id: Number(normal.sale_id),
        reason: normal.reason,
        note: normal.note || null,
        payment_method: normal.payment_method,
        paid_amount: Number(normal.paid_amount || 0),
        returned_items: [
          {
            sale_item_id: Number(normal.return_item_id),
            quantity: Number(normal.return_qty),
          },
        ],
        replacement_items: [
          {
            product_id: Number(normal.replacement_product_id),
            product_variant_id: normal.replacement_variant_id ? Number(normal.replacement_variant_id) : null,
            quantity: Number(normal.replacement_qty),
            unit_price: Number(normal.unit_price),
            device_unit_ids: normal.device_ids
              .split(',')
              .map((value) => Number(value.trim()))
              .filter(Boolean),
          },
        ],
      });

      setMessage('Normal Exchange completed. Returned tracked IMEI is now Awaiting Inspection before resale.');
      setNormal(emptyNormal);
      setOptions([]);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Exchange failed.');
    } finally {
      setSaving(false);
    }
  };

  const submitCash = async (event) => {
    event.preventDefault();

    const accepted = Number(cash.accepted_value || 0);
    const payout = Number(cash.customer_payout_amount || 0);

    if (accepted <= 0) {
      setError('Accepted Device Value must be greater than zero.');
      return;
    }

    if (payout <= 0) {
      setError('Actual Customer Payout must be greater than zero.');
      return;
    }

    if (payout > accepted) {
      setError('Actual Customer Payout cannot exceed Accepted Device Value.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await api.post('/cash-exchanges', {
        sale_id: Number(cash.sale_id),
        reason: cash.reason,
        note: cash.note || null,
        returned_items: [
          {
            sale_item_id: Number(cash.return_item_id),
            accepted_value: accepted,
            condition_note: cash.condition_note || null,
          },
        ],
        customer_payout_amount: payout,
        payment_method: cash.payment_method,
        provider_name: cash.provider_name || null,
        transaction_id: cash.transaction_id || null,
        payment_reference: cash.payment_reference || null,
        payout_note: cash.payout_note || null,
      });

      setMessage(
        `Cash Exchange completed. Accepted value ${money(accepted)} and actual customer payout ${money(payout)} were recorded in lifetime Device History.`
      );
      setCash(emptyCash);
      setOptions([]);
      await load();
    } catch (err) {
      const validation = err?.response?.data?.errors
        ? Object.values(err.response.data.errors).flat().join(' ')
        : '';
      setError(validation || err?.response?.data?.message || err?.message || 'Cash Exchange failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-7">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <Header loading={loading} onRefresh={load} />

        <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-2 shadow-sm">
          <button
            type="button"
            onClick={() => { setMode('replacement'); setOptions([]); setError(''); setMessage(''); }}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${mode === 'replacement' ? 'bg-[var(--nst-dashboard-primary)] text-white' : 'text-slate-600'}`}
          >
            <ArrowDownUp size={17} />
            Normal Exchange
          </button>
          <button
            type="button"
            onClick={() => { setMode('cash'); setOptions([]); setError(''); setMessage(''); }}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${mode === 'cash' ? 'bg-[var(--nst-dashboard-primary)] text-white' : 'text-slate-600'}`}
          >
            <Banknote size={17} />
            Cash Exchange
          </button>
        </div>

        {message ? <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</div> : null}
        {error ? <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div> : null}

        {mode === 'replacement' ? (
          <form onSubmit={submitNormal} className="grid gap-3 rounded-[1.8rem] bg-white p-6 shadow-sm md:grid-cols-2 xl:grid-cols-4">
            <select required className={field} value={normal.sale_id} onChange={(e) => selectNormalSale(e.target.value)}>
              <option value="">Select invoice</option>
              {sales.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.invoice_no} · {row.customer_name || 'Walk-in'} · {money(row.final_amount)}
                </option>
              ))}
            </select>

            <select
              required
              className={field}
              value={normal.return_item_id}
              onChange={(e) => setNormal((current) => ({ ...current, return_item_id: e.target.value }))}
            >
              <option value="">Returned sale item</option>
              {options.filter((row) => Number(row.exchangeable_quantity) > 0).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.product_name} · available {row.exchangeable_quantity} · credit {money(row.unit_credit)}
                </option>
              ))}
            </select>

            <input required min="1" type="number" className={field} value={normal.return_qty} onChange={(e) => setNormal({ ...normal, return_qty: e.target.value })} placeholder="Return quantity" />
            <input required className={field} value={normal.reason} onChange={(e) => setNormal({ ...normal, reason: e.target.value })} placeholder="Exchange reason" />

            <div className="md:col-span-2 xl:col-span-4">
              <SaleItemInfo item={selectedNormalItem} />
            </div>

            <select required className={field} value={normal.replacement_product_id} onChange={(e) => setNormal({ ...normal, replacement_product_id: e.target.value, replacement_variant_id: '' })}>
              <option value="">Replacement product</option>
              {products.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · stock {row.stock_quantity ?? 0}
                </option>
              ))}
            </select>

            <select className={field} value={normal.replacement_variant_id} onChange={(e) => setNormal({ ...normal, replacement_variant_id: e.target.value })}>
              <option value="">No variant</option>
              {(selectedProduct?.variants || []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.variant_name || row.sku} · stock {row.stock_quantity ?? 0}
                </option>
              ))}
            </select>

            <input required min="1" type="number" className={field} value={normal.replacement_qty} onChange={(e) => setNormal({ ...normal, replacement_qty: e.target.value })} placeholder="Replacement quantity" />
            <input required min="0" step="0.01" type="number" className={field} value={normal.unit_price} onChange={(e) => setNormal({ ...normal, unit_price: e.target.value })} placeholder="Replacement unit price" />
            <input className={field} value={normal.device_ids} onChange={(e) => setNormal({ ...normal, device_ids: e.target.value })} placeholder="Replacement device IDs, comma-separated" />
            <input min="0" step="0.01" type="number" className={field} value={normal.paid_amount} onChange={(e) => setNormal({ ...normal, paid_amount: e.target.value })} placeholder="Paid difference" />

            <select className={field} value={normal.payment_method} onChange={(e) => setNormal({ ...normal, payment_method: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank">Bank</option>
              <option value="mobile_banking">Mobile banking</option>
            </select>

            <input className={field} value={normal.note} onChange={(e) => setNormal({ ...normal, note: e.target.value })} placeholder="Internal note" />

            <button disabled={saving} className={`${button} md:col-span-2 xl:col-span-4`}>
              <ArrowDownUp size={17} />
              {saving ? 'Processing…' : 'Complete Normal Exchange'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCash} className="grid gap-4 rounded-[1.8rem] bg-white p-6 shadow-sm md:grid-cols-2 xl:grid-cols-4">
            <div className="md:col-span-2 xl:col-span-4">
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <Smartphone className="mt-0.5 text-amber-700" size={20} />
                  <div>
                    <div className="font-black text-amber-900">Cash Exchange financial rule</div>
                    <p className="mt-1 text-sm font-semibold text-amber-800">
                      Accepted Device Value is the current agreed value of the returned phone. Actual Customer Payout is the money the customer actually receives.
                      Both values remain in the IMEI lifetime history.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <label className="text-xs font-black uppercase text-slate-500">
              Original Invoice *
              <select required className={`${field} mt-1 normal-case`} value={cash.sale_id} onChange={(e) => selectCashSale(e.target.value)}>
                <option value="">Select invoice</option>
                {sales.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.invoice_no} · {row.customer_name || 'Walk-in'} · {money(row.final_amount)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-black uppercase text-slate-500">
              Returned Device *
              <select required className={`${field} mt-1 normal-case`} value={cash.return_item_id} onChange={(e) => selectCashItem(e.target.value)}>
                <option value="">Select sold device</option>
                {options.filter((row) => Number(row.exchangeable_quantity) > 0).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.product_name} · previous sale value {money(row.unit_credit)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-black uppercase text-slate-500">
              Accepted Device Value *
              <input required min="0.01" step="0.01" type="number" className={`${field} mt-1 normal-case`} value={cash.accepted_value} onChange={(e) => setCash({ ...cash, accepted_value: e.target.value })} />
            </label>

            <label className="text-xs font-black uppercase text-slate-500">
              Actual Customer Payout *
              <input required min="0.01" step="0.01" type="number" className={`${field} mt-1 normal-case`} value={cash.customer_payout_amount} onChange={(e) => setCash({ ...cash, customer_payout_amount: e.target.value })} />
            </label>

            <div className="md:col-span-2 xl:col-span-4">
              <SaleItemInfo item={selectedCashItem} />
            </div>

            <label className="text-xs font-black uppercase text-slate-500">
              Payment Method *
              <select required className={`${field} mt-1 normal-case`} value={cash.payment_method} onChange={(e) => setCash({ ...cash, payment_method: e.target.value })}>
                <option value="cash">Cash</option>
                <option value="bkash">bKash</option>
                <option value="nagad">Nagad</option>
                <option value="rocket">Rocket</option>
                <option value="upay">Upay</option>
                <option value="bank">Bank</option>
                <option value="card">Card</option>
                <option value="other_mfs">Other MFS</option>
              </select>
            </label>

            <label className="text-xs font-black uppercase text-slate-500">
              Payment / Transaction Reference
              <input className={`${field} mt-1 normal-case`} value={cash.payment_reference} onChange={(e) => setCash({ ...cash, payment_reference: e.target.value })} placeholder="Cash voucher / MFS txn / bank ref" />
            </label>

            <label className="text-xs font-black uppercase text-slate-500">
              Provider
              <input className={`${field} mt-1 normal-case`} value={cash.provider_name} onChange={(e) => setCash({ ...cash, provider_name: e.target.value })} placeholder="bKash / Nagad / Bank..." />
            </label>

            <label className="text-xs font-black uppercase text-slate-500">
              Transaction ID
              <input className={`${field} mt-1 normal-case`} value={cash.transaction_id} onChange={(e) => setCash({ ...cash, transaction_id: e.target.value })} />
            </label>

            <label className="text-xs font-black uppercase text-slate-500 md:col-span-2">
              Device Condition Note
              <textarea className={`${field} mt-1 min-h-24 normal-case`} value={cash.condition_note} onChange={(e) => setCash({ ...cash, condition_note: e.target.value })} placeholder="Scratches, dents, display, battery, accessories..." />
            </label>

            <label className="text-xs font-black uppercase text-slate-500 md:col-span-2">
              Reason *
              <input required className={`${field} mt-1 normal-case`} value={cash.reason} onChange={(e) => setCash({ ...cash, reason: e.target.value })} />
            </label>

            <label className="text-xs font-black uppercase text-slate-500 md:col-span-2">
              Payout Note
              <textarea className={`${field} mt-1 min-h-20 normal-case`} value={cash.payout_note} onChange={(e) => setCash({ ...cash, payout_note: e.target.value })} />
            </label>

            <label className="text-xs font-black uppercase text-slate-500 md:col-span-2">
              Internal Note
              <textarea className={`${field} mt-1 min-h-20 normal-case`} value={cash.note} onChange={(e) => setCash({ ...cash, note: e.target.value })} />
            </label>

            <div className="md:col-span-2 xl:col-span-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-black uppercase text-slate-400">Accepted Value</div>
                <div className="mt-1 text-xl font-black">{money(cash.accepted_value)}</div>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-4">
                <div className="text-xs font-black uppercase text-emerald-600">Paid to Customer</div>
                <div className="mt-1 text-xl font-black text-emerald-700">{money(cash.customer_payout_amount)}</div>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4">
                <div className="text-xs font-black uppercase text-amber-600">Adjustment / Difference</div>
                <div className="mt-1 text-xl font-black text-amber-700">
                  {money(Math.max(0, Number(cash.accepted_value || 0) - Number(cash.customer_payout_amount || 0)))}
                </div>
              </div>
            </div>

            <button disabled={saving} className={`${button} md:col-span-2 xl:col-span-4`}>
              <Banknote size={17} />
              {saving ? 'Processing…' : 'Complete Cash Exchange & Record Payout'}
            </button>
          </form>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-black text-slate-900">Exchange History</h2>
          {history.map((row) => {
            const cashMode = row.exchange_mode === 'cash_exchange';
            return (
              <article key={row.id} className="rounded-3xl bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-[var(--nst-dashboard-primary)]">{row.exchange_no}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${cashMode ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                        {cashMode ? 'Cash Exchange' : 'Normal Exchange'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-bold text-slate-700">
                      {row.sale?.invoice_no} · {row.sale?.customer_name || row.customer?.name || 'Customer'}
                    </p>
                    {row.reason ? <p className="mt-1 text-xs font-semibold text-slate-500">{row.reason}</p> : null}
                  </div>

                  <div className="grid gap-2 text-right sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-400">Accepted / Return</p>
                      <p className="font-black">{money(row.returned_value)}</p>
                    </div>
                    {cashMode ? (
                      <>
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400">Customer Payout</p>
                          <p className="font-black text-emerald-700">{money(row.customer_payout_amount || row.refund_amount)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400">Adjustment</p>
                          <p className="font-black">{money(row.payout_adjustment_amount)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400">Method / Ref</p>
                          <p className="font-black">{row.payout_method || row.payment_method || '—'}</p>
                          <p className="text-xs font-semibold text-slate-500">{row.payout_reference || '—'}</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400">Replacement</p>
                          <p className="font-black">{money(row.replacement_value)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400">Due</p>
                          <p className="font-black">{money(row.due_amount)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400">Refund</p>
                          <p className="font-black">{money(row.refund_amount)}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}

          {!history.length && !loading ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center">
              <CheckCircle2 className="mx-auto text-slate-300" size={42} />
              <p className="mt-2 font-bold text-slate-500">No exchange history found.</p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
