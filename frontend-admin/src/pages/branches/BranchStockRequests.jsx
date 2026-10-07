import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, CircleX, PackagePlus, RefreshCw, Send, Truck } from 'lucide-react';
import api from '../../services/api';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { ArrowDownUp as NstHdrArrowDownUp } from 'lucide-react';

const unwrapRows = (response) => {
  const payload = response?.data?.data ?? response?.data ?? [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};
const labelize = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const field = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]';
const primary = 'inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-black text-white disabled:opacity-50';
const secondary = 'inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 disabled:opacity-50';
const emptyItem = () => ({ product_id: '', product_variant_id: '', requested_quantity: 1, note: '' });

export default function BranchStockRequests() {
  const [requests, setRequests] = useState([]);
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [filters, setFilters] = useState({ status: '', branch_id: '', search: '' });
  const [form, setForm] = useState({ from_branch_id: '', to_branch_id: '', request_note: '', items: [emptyItem()] });
  const [actionState, setActionState] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [transferResponse, branchResponse, productResponse] = await Promise.all([
        api.get('/stock-transfers', { params: { ...filters, per_page: 100 } }),
        api.get('/branches/all'),
        api.get('/products/all', { params: { status: 'active', per_page: 500 } }),
      ]);
      const transferRows = unwrapRows(transferResponse);
      setRequests(transferRows);
      setBranches(unwrapRows(branchResponse));
      setProducts(unwrapRows(productResponse));
      setActionState((current) => {
        const next = { ...current };
        transferRows.forEach((row) => {
          if (!next[row.id]) {
            next[row.id] = {
              admin_note: '', dispatch_note: '', receive_note: '',
              approvals: Object.fromEntries((row.items || []).map((item) => [item.id, item.requested_quantity || 0])),
              device_ids: Object.fromEntries((row.items || []).map((item) => [item.id, ''])),
            };
          }
        });
        return next;
      });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Stock transfer pipeline could not be loaded.');
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  const selectedProducts = useMemo(() => Object.fromEntries(products.map((row) => [String(row.id), row])), [products]);

  const updateItem = (index, key, value) => setForm((old) => ({ ...old, items: old.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value, ...(key === 'product_id' ? { product_variant_id: '' } : {}) } : item) }));
  const addItem = () => setForm((old) => ({ ...old, items: [...old.items, emptyItem()] }));
  const removeItem = (index) => setForm((old) => ({ ...old, items: old.items.filter((_, itemIndex) => itemIndex !== index) }));
  const updateAction = (requestId, key, value) => setActionState((old) => ({ ...old, [requestId]: { ...(old[requestId] || {}), [key]: value } }));
  const updateNestedAction = (requestId, key, itemId, value) => setActionState((old) => ({ ...old, [requestId]: { ...(old[requestId] || {}), [key]: { ...((old[requestId] || {})[key] || {}), [itemId]: value } } }));

  const createTransfer = async (event) => {
    event.preventDefault(); setSaving('create'); setError(''); setMessage('');
    try {
      await api.post('/stock-transfers', {
        from_branch_id: form.from_branch_id ? Number(form.from_branch_id) : null,
        to_branch_id: Number(form.to_branch_id),
        request_note: form.request_note || null,
        items: form.items.map((item) => ({
          product_id: Number(item.product_id),
          product_variant_id: item.product_variant_id ? Number(item.product_variant_id) : null,
          requested_quantity: Number(item.requested_quantity),
          note: item.note || null,
        })),
      });
      setMessage('Stock transfer request created. Destination inventory will not change until receiving.');
      setForm({ from_branch_id: '', to_branch_id: '', request_note: '', items: [emptyItem()] });
      await load();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || Object.values(requestError?.response?.data?.errors || {})?.[0]?.[0] || 'Transfer request failed.');
    } finally { setSaving(''); }
  };

  const approve = async (transfer) => {
    const action = actionState[transfer.id] || {};
    setSaving(`approve-${transfer.id}`); setError(''); setMessage('');
    try {
      await api.post(`/stock-transfers/${transfer.id}/approve`, {
        admin_note: action.admin_note || null,
        items: (transfer.items || []).map((item) => ({ id: item.id, approved_quantity: Number(action.approvals?.[item.id] ?? item.requested_quantity) })),
      });
      setMessage(`${transfer.request_no} approved.`); await load();
    } catch (requestError) { setError(requestError?.response?.data?.message || 'Approval failed.'); }
    finally { setSaving(''); }
  };

  const reject = async (transfer) => {
    const action = actionState[transfer.id] || {};
    const note = action.admin_note || window.prompt('Rejection reason:');
    if (!note) return;
    setSaving(`reject-${transfer.id}`); setError('');
    try { await api.post(`/stock-transfers/${transfer.id}/reject`, { admin_note: note }); setMessage(`${transfer.request_no} rejected.`); await load(); }
    catch (requestError) { setError(requestError?.response?.data?.message || 'Rejection failed.'); }
    finally { setSaving(''); }
  };

  const assign = async (transfer) => {
    const action = actionState[transfer.id] || {};
    setSaving(`assign-${transfer.id}`); setError(''); setMessage('');
    try {
      await api.post(`/stock-transfers/${transfer.id}/assign`, {
        dispatch_note: action.dispatch_note || null,
        items: (transfer.items || []).map((item) => ({
          id: item.id,
          device_unit_ids: String(action.device_ids?.[item.id] || '').split(',').map((value) => Number(value.trim())).filter(Boolean),
        })),
      });
      setMessage(`${transfer.request_no} dispatched. Stock is now in transit.`); await load();
    } catch (requestError) { setError(requestError?.response?.data?.message || 'Dispatch failed.'); }
    finally { setSaving(''); }
  };

  const receive = async (transfer) => {
    const action = actionState[transfer.id] || {};
    setSaving(`receive-${transfer.id}`); setError(''); setMessage('');
    try { await api.post(`/stock-transfers/${transfer.id}/receive`, { receive_note: action.receive_note || null }); setMessage(`${transfer.request_no} received and destination stock updated.`); await load(); }
    catch (requestError) { setError(requestError?.response?.data?.message || 'Receive failed.'); }
    finally { setSaving(''); }
  };

  const cancel = async (transfer) => {
    if (!window.confirm(`Cancel ${transfer.request_no}?`)) return;
    setSaving(`cancel-${transfer.id}`); setError('');
    try { await api.post(`/stock-transfers/${transfer.id}/cancel`); setMessage(`${transfer.request_no} cancelled.`); await load(); }
    catch (requestError) { setError(requestError?.response?.data?.message || 'Cancel failed.'); }
    finally { setSaving(''); }
  };

  const statusTone = (status) => ({ pending: 'bg-amber-100 text-amber-700', approved: 'bg-sky-100 text-sky-700', assigned: 'bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)]', received: 'bg-emerald-100 text-emerald-700', rejected: 'bg-rose-100 text-rose-700', cancelled: 'bg-slate-100 text-slate-600' }[status] || 'bg-slate-100 text-slate-700');

  return <div className="min-h-screen bg-slate-50 p-4 md:p-7"><div className="mx-auto max-w-[1600px] space-y-5">
    <NstPageHeader icon={NstHdrArrowDownUp} title={<>Stock Transfer</>} subtitle={<>Request → approve → dispatch/in-transit → destination receive. Destination stock increases only after receiving; selected IMEI devices move with the transfer.</>} actions={<><button onClick={load} className={primary}><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/>Refresh</button></>}/>
    {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-700">{message}</div>}
    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700">{error}</div>}

    <form onSubmit={createTransfer} className="space-y-4 rounded-[1.8rem] border border-slate-100 bg-white p-6 shadow-sm"><div><h2 className="text-xl font-black">New Transfer Request</h2><p className="text-sm font-semibold text-slate-500">Leave source blank for Prime Stock. Serialized devices may be selected by device-unit ID during dispatch.</p></div><div className="grid gap-3 md:grid-cols-3"><select className={field} value={form.from_branch_id} onChange={(event) => setForm({ ...form, from_branch_id: event.target.value })}><option value="">Prime Stock / no source branch</option>{branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select required className={field} value={form.to_branch_id} onChange={(event) => setForm({ ...form, to_branch_id: event.target.value })}><option value="">Destination branch</option>{branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><input className={field} value={form.request_note} onChange={(event) => setForm({ ...form, request_note: event.target.value })} placeholder="Request note"/></div><div className="space-y-3">{form.items.map((item, index) => { const product = selectedProducts[String(item.product_id)]; return <div key={index} className="grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-5"><select required className={field} value={item.product_id} onChange={(event) => updateItem(index, 'product_id', event.target.value)}><option value="">Product</option>{products.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.sku || 'No SKU'}</option>)}</select><select className={field} value={item.product_variant_id} onChange={(event) => updateItem(index, 'product_variant_id', event.target.value)}><option value="">Base / no variant</option>{(product?.variants || []).map((variant) => <option key={variant.id} value={variant.id}>{variant.variant_name || variant.sku}</option>)}</select><input required min="1" type="number" className={field} value={item.requested_quantity} onChange={(event) => updateItem(index, 'requested_quantity', event.target.value)} placeholder="Quantity"/><input className={field} value={item.note} onChange={(event) => updateItem(index, 'note', event.target.value)} placeholder="Item note"/><div className="flex gap-2"><button type="button" onClick={addItem} className={secondary}><PackagePlus size={16}/>Add</button>{form.items.length > 1 && <button type="button" onClick={() => removeItem(index)} className="rounded-2xl bg-rose-100 px-4 font-black text-rose-700">Remove</button>}</div></div>; })}</div><button disabled={saving === 'create'} className={primary}><Send size={17}/>{saving === 'create' ? 'Submitting…' : 'Create Transfer Request'}</button></form>

    <section className="grid gap-3 rounded-[1.8rem] bg-white p-5 shadow-sm md:grid-cols-4"><input className={field} value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Request no or note"/><select className={field} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option>{['pending','approved','assigned','received','rejected','cancelled'].map((status) => <option key={status} value={status}>{labelize(status)}</option>)}</select><select className={field} value={filters.branch_id} onChange={(event) => setFilters({ ...filters, branch_id: event.target.value })}><option value="">All branches</option>{branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><button onClick={load} className={secondary}>Apply Filters</button></section>

    <div className="grid gap-4">{requests.map((transfer) => { const action = actionState[transfer.id] || {}; return <article key={transfer.id} className="rounded-[1.8rem] border border-slate-100 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-3"><p className="text-lg font-black text-[var(--nst-dashboard-primary)]">{transfer.request_no}</p><span className={`rounded-xl px-3 py-2 text-xs font-black ${statusTone(transfer.status)}`}>{labelize(transfer.status)}</span>{transfer.serialized_device_count > 0 && <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black">{transfer.serialized_device_count} IMEI</span>}</div><div className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-600"><span>{transfer.from_branch?.name || 'Prime Stock'}</span><ArrowRight size={16}/><span>{transfer.to_branch?.name || '-'}</span></div><p className="mt-1 text-xs font-semibold text-slate-500">Requested by {transfer.requested_by?.name || '-'} · {transfer.request_note || 'No request note'}</p></div><div className="text-right text-xs font-bold text-slate-500"><p>Requested: {transfer.requested_at ? new Date(transfer.requested_at).toLocaleString() : '-'}</p>{transfer.assigned_at && <p>Dispatched: {new Date(transfer.assigned_at).toLocaleString()}</p>}{transfer.received_at && <p>Received: {new Date(transfer.received_at).toLocaleString()}</p>}</div></div><div className="mt-4 overflow-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr>{['Product','Requested','Approved','In Transit','Received','Serialized Device IDs'].map((title) => <th key={title} className="p-3">{title}</th>)}</tr></thead><tbody>{(transfer.items || []).map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="p-3"><p className="font-black">{item.product?.name}</p><p className="text-xs text-slate-500">{item.variant?.variant_name || item.product?.sku}</p></td><td className="p-3 font-black">{item.requested_quantity}</td><td className="p-3">{transfer.status === 'pending' ? <input type="number" min="0" max={item.requested_quantity} className="w-24 rounded-xl border p-2 font-black" value={action.approvals?.[item.id] ?? item.requested_quantity} onChange={(event) => updateNestedAction(transfer.id, 'approvals', item.id, event.target.value)}/> : item.approved_quantity}</td><td className="p-3 font-black text-[var(--nst-dashboard-primary)]">{item.in_transit_quantity || 0}</td><td className="p-3 font-black text-emerald-700">{item.received_quantity || 0}</td><td className="p-3">{transfer.status === 'approved' ? <input className="min-w-64 rounded-xl border p-2" value={action.device_ids?.[item.id] || ''} onChange={(event) => updateNestedAction(transfer.id, 'device_ids', item.id, event.target.value)} placeholder="Optional device-unit IDs: 10,11,12"/> : <span className="text-xs font-bold text-slate-500">{(transfer.device_units || []).filter((row) => Number(row.stock_transfer_request_item_id) === Number(item.id)).map((row) => row.imei_1 || row.barcode || `#${row.device_unit_id}`).join(', ') || '-'}</span>}</td></tr>)}</tbody></table></div><div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"><div>{transfer.status === 'pending' && <input className={field} value={action.admin_note || ''} onChange={(event) => updateAction(transfer.id, 'admin_note', event.target.value)} placeholder="Approval / rejection note"/>}{transfer.status === 'approved' && <input className={field} value={action.dispatch_note || ''} onChange={(event) => updateAction(transfer.id, 'dispatch_note', event.target.value)} placeholder="Dispatch note"/>}{transfer.status === 'assigned' && <input className={field} value={action.receive_note || ''} onChange={(event) => updateAction(transfer.id, 'receive_note', event.target.value)} placeholder="Receiving note"/>}</div><div className="flex flex-wrap justify-end gap-2">{transfer.status === 'pending' && <><button disabled={Boolean(saving)} onClick={() => approve(transfer)} className={primary}><Check size={16}/>Approve</button><button disabled={Boolean(saving)} onClick={() => reject(transfer)} className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white"><CircleX size={16} className="inline mr-2"/>Reject</button><button disabled={Boolean(saving)} onClick={() => cancel(transfer)} className={secondary}>Cancel</button></>}{transfer.status === 'approved' && <button disabled={Boolean(saving)} onClick={() => assign(transfer)} className={primary}><Truck size={16}/>Dispatch / Assign</button>}{transfer.status === 'assigned' && <button disabled={Boolean(saving)} onClick={() => receive(transfer)} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white"><Check size={16}/>Receive Stock</button>}</div></div></article>; })}{!loading && requests.length === 0 && <div className="rounded-[1.8rem] border border-dashed border-slate-200 bg-white p-12 text-center"><Truck className="mx-auto text-slate-300" size={48}/><p className="mt-4 text-lg font-black text-slate-700">No stock transfer found</p><p className="text-sm font-semibold text-slate-500">Create a request or change the filters.</p></div>}</div>
  </div></div>;
}
