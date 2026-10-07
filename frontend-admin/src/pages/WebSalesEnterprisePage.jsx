import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { NstPageHeader } from '../components/ui/nst-page-header';
import { ShoppingCart as NstHdrShoppingCart, FileSpreadsheet as NstHdrFileSpreadsheet, Barcode as NstHdrBarcode, ShieldCheck as NstHdrShieldCheck } from 'lucide-react';

const VISIBILITY_OPTIONS = [
  ['super_admin_only', 'Super Admin Only'],
  ['allow', 'Show / Allow'],
  ['deny', 'Hide / Deny'],
  ['maintenance', 'Maintenance Mode'],
  ['disabled', 'Completely Disabled'],
];
const DEFAULT_ACTIONS = ['view','create','edit','delete','approve','reject','print','invoice_print','invoice_reprint','barcode_print','barcode_reprint','export','import','transfer','history','change_status','change_payment','refund','cancel','complete'];
const DEFAULT_COLUMNS = ['sku','barcode','product_name','model_number','imei_1','imei_2','purchase_price','sale_price','supplier','profit','battery_health','branch','notes','customer_phone','customer_email','payment_method','payment_status'];
const ROW_SCOPES = [
  ['own_records','Only Own Records'],['own_sales','Only Own Sales'],['own_customers','Only Own Customers'],['own_branch','Only Own Branch'],['selected_branches','Selected Branches'],['all_branches','All Branches'],['all_records','All Records'],
];

function useSafeLoad(loader, deps = []) {
  useEffect(() => {
    let active = true;
    const run = async () => {
      try { await loader(() => active); } catch (_) { /* handled by caller */ }
    };
    run();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function WebSalesEnterprisePage(){
  const [rows,setRows]=useState([]); const [message,setMessage]=useState(''); const [loading,setLoading]=useState(true);
  const load=async()=>{setLoading(true);setMessage('');try{const r=await api.get('/web-sales');setRows(r.data?.data?.data||[]);}catch(e){setMessage(e.response?.data?.message||e.message);}finally{setLoading(false);}};
  useSafeLoad(async(isActive)=>{await load(); if(!isActive()) return;},[]);
  const authorize=async(id)=>{const branch_id=Number(prompt('Assigned Branch ID'));if(!branch_id)return;await api.post(`/web-sales/${id}/authorize`,{branch_id});await load();};
  const delivery=async(id,status)=>{await api.post(`/web-sales/${id}/delivery`,{delivery_status:status});await load();};
  return <div className="p-6"><NstPageHeader icon={NstHdrShoppingCart} title={<>Web Sales</>} subtitle={<>Pending website orders, payment verification, authorized POS conversion, invoice and delivery.</>}/>{message&&<p className="mt-3 rounded-xl bg-red-50 p-3 text-red-700">{message}</p>}{loading&&<p className="mt-4 text-sm text-slate-500">Loading web sales...</p>}<div className="mt-5 overflow-auto rounded-2xl border bg-white"><table className="min-w-full text-sm"><thead><tr>{['Order','Customer','Amount','Payment','Status','Branch','Invoice','Delivery','Actions'].map(x=><th className="p-3 text-left" key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr className="border-t" key={r.id}><td className="p-3 font-bold">{r.order_no}</td><td className="p-3">{r.customer_name}<br/>{r.customer_phone}</td><td className="p-3">৳{r.total_amount}</td><td className="p-3">{r.payment_method}<br/>{r.payment_status}</td><td className="p-3">{r.status}</td><td className="p-3">{r.branch?.name||'Unassigned'}</td><td className="p-3">{r.invoice_no||'—'}</td><td className="p-3">{r.delivery_status||'pending'}</td><td className="p-3 space-x-2">{!r.sale_id&&<button onClick={()=>authorize(r.id)} className="rounded bg-[var(--nst-dashboard-primary)] px-3 py-2 text-white">Authorize</button>}<select value={r.delivery_status||'pending'} onChange={e=>delivery(r.id,e.target.value)} className="rounded border p-2"><option>pending</option><option>ready_for_delivery</option><option>shipped</option><option>delivered</option><option>completed</option><option>cancelled</option></select></td></tr>)}{!loading&&!rows.length&&<tr><td colSpan="9" className="p-8 text-center text-slate-500">No web sales found.</td></tr>}</tbody></table></div></div>;
}

export function WebSalesReportPage(){const [d,setD]=useState({});const [error,setError]=useState('');useSafeLoad(async(isActive)=>{try{const r=await api.get('/reports/web-sales');if(isActive())setD(r.data?.data||{});}catch(e){if(isActive())setError(e.response?.data?.message||e.message);}},[]);return <div className="p-6"><NstPageHeader icon={NstHdrFileSpreadsheet} title={<>Web Sales Report</>} subtitle={<>Website orders, confirmed sales, pending payments, due and refunds.</>}/>{error && <p className="mt-3 text-red-600">{error}</p>}<div className="mt-5 grid gap-4 md:grid-cols-4">{Object.entries(d).filter(([,v])=>!Array.isArray(v)&&typeof v!=='object').map(([k,v])=><div className="rounded-2xl border bg-white p-5" key={k}><p className="text-xs uppercase text-slate-500">{k.replaceAll('_',' ')}</p><p className="mt-2 text-2xl font-black">{String(v)}</p></div>)}</div></div>}

export function BarcodeHistoryPage(){const [rows,setRows]=useState([]);const [error,setError]=useState('');useSafeLoad(async(isActive)=>{try{const r=await api.get('/barcode-tools/history');if(isActive())setRows(r.data?.data?.data||[]);}catch(e){if(isActive())setError(e.response?.data?.message||e.message);}},[]);return <div className="p-6"><NstPageHeader icon={NstHdrBarcode} title={<>Barcode Print / Reprint History</>}/>{error&&<p className="mt-3 text-red-600">{error}</p>}<div className="mt-5 overflow-auto rounded-2xl border bg-white"><table className="min-w-full text-sm"><thead><tr>{['Product','SKU','IMEI','Action','Reason','Label','Printer','Printed By','Date'].map(x=><th className="p-3 text-left" key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr className="border-t" key={r.id}><td className="p-3">{r.product_name}</td><td className="p-3">{r.sku}</td><td className="p-3">{r.imei_1}</td><td className="p-3">{r.action}</td><td className="p-3">{r.reason||'—'}</td><td className="p-3">{r.label_size}</td><td className="p-3">{r.printer_type}</td><td className="p-3">{r.printed_by_name}</td><td className="p-3">{r.created_at}</td></tr>)}</tbody></table></div></div>}

export function UsersAccessEnterprisePage(){
  const [pages,setPages]=useState([]); const [roles,setRoles]=useState([]); const [users,setUsers]=useState([]); const [branches,setBranches]=useState([]); const [history,setHistory]=useState([]);
  const [selectedKey,setSelectedKey]=useState(''); const [subjectType,setSubjectType]=useState('role'); const [subjectId,setSubjectId]=useState(''); const [visibility,setVisibility]=useState('super_admin_only');
  const [actions,setActions]=useState(['view']); const [columns,setColumns]=useState([]); const [rowScope,setRowScope]=useState('own_branch'); const [selectedBranches,setSelectedBranches]=useState([]); const [expiresAt,setExpiresAt]=useState('');
  const [status,setStatus]=useState(''); const [saving,setSaving]=useState(false);
  const selectedPage=useMemo(()=>pages.find(p=>p.page_key===selectedKey)||null,[pages,selectedKey]);
  const availableActions=useMemo(()=>{try{return JSON.parse(selectedPage?.available_actions||'[]')}catch{return []}},[selectedPage]);
  const availableColumns=useMemo(()=>{try{const v=JSON.parse(selectedPage?.available_columns||'[]');return v.length?v:DEFAULT_COLUMNS}catch{return DEFAULT_COLUMNS}},[selectedPage]);
  const actionList=availableActions.length?availableActions:DEFAULT_ACTIONS;
  const loadAll=async()=>{const [p,o,h]=await Promise.all([api.get('/users-access/pages'),api.get('/users-access/options'),api.get('/users-access/history')]);setPages(p.data?.data||[]);setRoles(o.data?.data?.roles||[]);setUsers(o.data?.data?.users||[]);setBranches(o.data?.data?.branches||[]);setHistory(h.data?.data?.data||h.data?.data||[]);const first=(p.data?.data||[])[0];if(first&&!selectedKey)setSelectedKey(first.page_key);};
  useSafeLoad(async(isActive)=>{try{await loadAll();if(!isActive())return;}catch(e){if(isActive())setStatus(e.response?.data?.message||e.message);}},[]);
  useEffect(()=>{setActions(['view']);setColumns([]);setRowScope('own_branch');setSelectedBranches([]);setVisibility('super_admin_only');},[selectedKey]);
  const toggle=(list,setter,value)=>setter(list.includes(value)?list.filter(x=>x!==value):[...list,value]);
  const save=async()=>{if(!selectedPage)return;if(subjectType!=='everyone'&&!subjectId){setStatus('Select a role or user first.');return;}setSaving(true);setStatus('');try{await api.post('/users-access/rules',{page_key:selectedPage.page_key,subject_type:subjectType,subject_id:subjectType==='everyone'?null:Number(subjectId),visibility,actions,columns,row_scope:rowScope,selected_branches:selectedBranches.map(Number),expires_at:expiresAt||null});setStatus('Permission saved successfully.');await loadAll();}catch(e){setStatus(e.response?.data?.message||e.message);}finally{setSaving(false);}};
  return <div className="p-6">
    <NstPageHeader icon={NstHdrShieldCheck} title={<>Users & Access</>} subtitle={<>Role defaults, user overrides, page visibility, actions, columns, row scope, branches and temporary access expiry.</>} actions={<><div className="rounded-xl bg-[var(--nst-dashboard-primary-soft)] px-4 py-2 text-sm font-semibold text-[var(--nst-dashboard-primary)]">Deny by default · Super Admin controls</div></>}/>
    {status&&<div className="mt-4 rounded-xl border bg-white p-3 text-sm">{status}</div>}
    <div className="mt-5 grid gap-5 xl:grid-cols-[320px_1fr]">
      <aside className="rounded-2xl border bg-white p-3"><p className="px-2 pb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Registered Pages</p><div className="max-h-[650px] space-y-2 overflow-auto">{pages.map(p=><button key={p.page_key} onClick={()=>setSelectedKey(p.page_key)} className={`w-full rounded-xl border p-3 text-left ${selectedKey===p.page_key?'border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-[var(--nst-dashboard-primary-soft)]':'hover:bg-slate-50'}`}><b>{p.page_name}</b><p className="mt-1 text-xs text-slate-500">{p.module} · {p.route}</p></button>)}</div></aside>
      <main className="space-y-5">
        <section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-black">{selectedPage?.page_name||'Select a page'}</h2><p className="text-xs text-slate-500">Page Key: {selectedPage?.page_key||'—'} · Default: {selectedPage?.default_visibility||'—'}</p><div className="mt-5 grid gap-4 md:grid-cols-3"><label className="text-sm font-semibold">Apply To<select value={subjectType} onChange={e=>{setSubjectType(e.target.value);setSubjectId('')}} className="mt-2 w-full rounded-xl border p-3"><option value="everyone">Everyone</option><option value="role">Selected Role</option><option value="user">Selected User</option></select></label>{subjectType!=='everyone'&&<label className="text-sm font-semibold">{subjectType==='role'?'Role':'User'}<select value={subjectId} onChange={e=>setSubjectId(e.target.value)} className="mt-2 w-full rounded-xl border p-3"><option value="">Select...</option>{(subjectType==='role'?roles:users).map(x=><option key={x.id} value={x.id}>{x.name}{x.email?` · ${x.email}`:''}</option>)}</select></label>}<label className="text-sm font-semibold">Page Visibility<select value={visibility} onChange={e=>setVisibility(e.target.value)} className="mt-2 w-full rounded-xl border p-3">{VISIBILITY_OPTIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div></section>
        <section className="rounded-2xl border bg-white p-5"><h3 className="font-black">Action Permissions</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{actionList.map(a=><label key={a} className="flex items-center gap-2 rounded-xl border p-3 text-sm"><input type="checkbox" checked={actions.includes(a)} onChange={()=>toggle(actions,setActions,a)}/>{a.replaceAll('_',' ')}</label>)}</div></section>
        <section className="rounded-2xl border bg-white p-5"><h3 className="font-black">Column Visibility</h3><p className="text-xs text-slate-500">Checked columns are allowed for this role/user. Sensitive columns remain hidden when unchecked.</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{availableColumns.map(c=><label key={c} className="flex items-center gap-2 rounded-xl border p-3 text-sm"><input type="checkbox" checked={columns.includes(c)} onChange={()=>toggle(columns,setColumns,c)}/>{c.replaceAll('_',' ')}</label>)}</div></section>
        <section className="rounded-2xl border bg-white p-5"><h3 className="font-black">Row & Branch Scope</h3><div className="mt-3 grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold">Row Scope<select value={rowScope} onChange={e=>setRowScope(e.target.value)} className="mt-2 w-full rounded-xl border p-3">{ROW_SCOPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="text-sm font-semibold">Temporary Access Expiry<input type="datetime-local" value={expiresAt} onChange={e=>setExpiresAt(e.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label></div>{rowScope==='selected_branches'&&<div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{branches.map(b=><label key={b.id} className="flex items-center gap-2 rounded-xl border p-3 text-sm"><input type="checkbox" checked={selectedBranches.includes(String(b.id))} onChange={()=>toggle(selectedBranches,setSelectedBranches,String(b.id))}/>{b.name}</label>)}</div>}</section>
        <div className="flex justify-end"><button disabled={saving||!selectedPage} onClick={save} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-6 py-3 font-bold text-white disabled:opacity-50">{saving?'Saving...':'Save Permission Rule'}</button></div>
        <section className="rounded-2xl border bg-white p-5"><h3 className="font-black">Recent Permission History</h3><div className="mt-3 overflow-auto"><table className="min-w-full text-sm"><thead><tr>{['Page','Subject','Visibility','Row Scope','Changed By','Date'].map(x=><th key={x} className="p-2 text-left">{x}</th>)}</tr></thead><tbody>{history.slice(0,20).map(h=><tr key={h.id} className="border-t"><td className="p-2">{h.page_name||h.page_key}</td><td className="p-2">{h.subject_type}{h.subject_name?` · ${h.subject_name}`:''}</td><td className="p-2">{h.visibility}</td><td className="p-2">{h.row_scope}</td><td className="p-2">{h.changed_by_name||'—'}</td><td className="p-2">{h.created_at}</td></tr>)}</tbody></table></div></section>
      </main>
    </div>
  </div>;
}
