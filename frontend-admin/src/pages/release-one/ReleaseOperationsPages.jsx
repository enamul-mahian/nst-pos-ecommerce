import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, CheckCircle2, PackagePlus, RefreshCw, Truck } from 'lucide-react';
import api from '../../services/api';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Rocket as NstHdrRocket } from 'lucide-react';

const unwrapRows = (response) => {
  const payload = response?.data?.data ?? response?.data ?? [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};
const money = (value) => `৳${Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 0 })}`;
const field = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]';
const button = 'rounded-2xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-black text-white disabled:opacity-50';

function Header({ eyebrow, title, description, loading, onRefresh }) {
  return <NstPageHeader icon={NstHdrRocket} title={<>{title}</>} subtitle={<>{description}</>} actions={<><button type="button" onClick={onRefresh} className={button}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Refresh</button></>}/>;
}

export function StockAdjustmentPage() {
  const [rows, setRows] = useState([]); const [branches, setBranches] = useState([]); const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false); const [message, setMessage] = useState(''); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ branch_id:'', product_id:'', product_variant_id:'', direction:'increase', quantity:1, reason:'physical_count', note:'', post_now:true });
  const selectedProduct = useMemo(() => products.find((row) => String(row.id) === String(form.product_id)), [products, form.product_id]);
  const load = async () => { setLoading(true); setMessage(''); try { const [adjustments, branchResponse, productResponse] = await Promise.all([api.get('/stock-adjustments', { params:{ per_page:100 } }), api.get('/branches/all'), api.get('/products/all')]); setRows(unwrapRows(adjustments)); setBranches(unwrapRows(branchResponse)); setProducts(unwrapRows(productResponse)); } catch (error) { setMessage(error?.response?.data?.message || error?.message || 'Stock adjustment data could not be loaded.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const submit = async (event) => { event.preventDefault(); setSaving(true); setMessage(''); try { await api.post('/stock-adjustments', { ...form, branch_id:Number(form.branch_id), product_id:Number(form.product_id), product_variant_id:form.product_variant_id ? Number(form.product_variant_id) : null, quantity:Number(form.quantity) }); setMessage('Stock adjustment saved successfully.'); setForm((old) => ({...old, product_id:'', product_variant_id:'', quantity:1, note:''})); await load(); } catch (error) { setMessage(error?.response?.data?.message || error?.message || 'Stock adjustment failed.'); } finally { setSaving(false); } };
  const action = async (row, name) => { const reason = name === 'reverse' ? window.prompt('Reason for reversal:') : null; if (name === 'reverse' && !reason) return; setSaving(true); try { await api.post(`/stock-adjustments/${row.id}/${name}`, reason ? { reason } : {}); await load(); } catch (error) { setMessage(error?.response?.data?.message || error?.message); } finally { setSaving(false); } };
  return <div className="min-h-screen bg-slate-50 p-4 md:p-7"><div className="mx-auto max-w-[1500px] space-y-5"><Header eyebrow="Inventory" title="Stock Adjustment" description="Draft, post and reverse audited stock corrections while keeping branch, catalog and IMEI balances synchronized." loading={loading} onRefresh={load} />
    {message && <p className="rounded-2xl bg-white p-4 text-sm font-bold text-slate-700 shadow-sm">{message}</p>}
    <form onSubmit={submit} className="grid gap-3 rounded-[1.8rem] border border-slate-100 bg-white p-6 shadow-sm md:grid-cols-2 xl:grid-cols-4"><select required className={field} value={form.branch_id} onChange={(e)=>setForm({...form,branch_id:e.target.value})}><option value="">Select branch</option>{branches.map((row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select><select required className={field} value={form.product_id} onChange={(e)=>setForm({...form,product_id:e.target.value,product_variant_id:''})}><option value="">Select product</option>{products.map((row)=><option key={row.id} value={row.id}>{row.name} · {row.sku || 'No SKU'}</option>)}</select><select className={field} value={form.product_variant_id} onChange={(e)=>setForm({...form,product_variant_id:e.target.value})}><option value="">Base product / no variant</option>{(selectedProduct?.variants || []).map((row)=><option key={row.id} value={row.id}>{row.variant_name || row.display_name || row.sku}</option>)}</select><select className={field} value={form.direction} onChange={(e)=>setForm({...form,direction:e.target.value})}><option value="increase">Increase</option><option value="decrease">Decrease</option></select><input required min="1" type="number" className={field} value={form.quantity} onChange={(e)=>setForm({...form,quantity:e.target.value})} placeholder="Quantity"/><select className={field} value={form.reason} onChange={(e)=>setForm({...form,reason:e.target.value})}>{['physical_count','damage','loss','found','data_correction','return','service','other'].map((value)=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select><input className={field} value={form.note} onChange={(e)=>setForm({...form,note:e.target.value})} placeholder="Audit note"/><label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold"><input type="checkbox" checked={form.post_now} onChange={(e)=>setForm({...form,post_now:e.target.checked})}/>Post immediately</label><button disabled={saving} className={`${button} md:col-span-2 xl:col-span-4`}><PackagePlus size={17}/> {saving ? 'Saving…' : 'Create Adjustment'}</button></form>
    <div className="overflow-auto rounded-[1.8rem] border border-slate-100 bg-white shadow-sm"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{['Adjustment','Branch','Product','Direction','Quantity','Before → After','Reason','Status','Actions'].map((x)=><th key={x} className="p-4">{x}</th>)}</tr></thead><tbody>{rows.map((row)=><tr key={row.id} className="border-t"><td className="p-4 font-black">{row.adjustment_no}</td><td className="p-4">{row.branch?.name}</td><td className="p-4">{row.product?.name}{row.variant?.variant_name ? ` · ${row.variant.variant_name}` : ''}</td><td className="p-4 capitalize">{row.direction}</td><td className="p-4 font-black">{row.quantity}</td><td className="p-4">{row.quantity_before} → {row.quantity_after}</td><td className="p-4 capitalize">{row.reason?.replaceAll('_',' ')}</td><td className="p-4 font-black capitalize">{row.status}</td><td className="p-4"><div className="flex gap-2">{row.status === 'draft' && <button disabled={saving} onClick={()=>action(row,'post')} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Post</button>}{row.status === 'posted' && <button disabled={saving} onClick={()=>action(row,'reverse')} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white">Reverse</button>}</div></td></tr>)}</tbody></table></div>
  </div></div>;
}

export function ExchangePage() {
  const [sales,setSales]=useState([]); const [products,setProducts]=useState([]); const [options,setOptions]=useState([]); const [history,setHistory]=useState([]); const [loading,setLoading]=useState(false); const [message,setMessage]=useState(''); const [saving,setSaving]=useState(false);
  const [form,setForm]=useState({sale_id:'',return_item_id:'',return_qty:1,replacement_product_id:'',replacement_variant_id:'',replacement_qty:1,unit_price:'',device_ids:'',paid_amount:0,payment_method:'cash',reason:'Customer exchange',note:''});
  const selectedProduct=useMemo(()=>products.find((row)=>String(row.id)===String(form.replacement_product_id)),[products,form.replacement_product_id]);
  const load=async()=>{setLoading(true);try{const [s,p,h]=await Promise.all([api.get('/sales',{params:{per_page:100}}),api.get('/products/all'),api.get('/exchanges',{params:{per_page:100}})]);setSales(unwrapRows(s));setProducts(unwrapRows(p));setHistory(unwrapRows(h));}catch(error){setMessage(error?.response?.data?.message||error?.message);}finally{setLoading(false);}};
  useEffect(()=>{void load();},[]);
  const chooseSale=async(id)=>{setForm({...form,sale_id:id,return_item_id:''});setOptions([]);if(!id)return;try{const response=await api.get(`/sales/${id}/exchange-options`);setOptions(response.data?.data?.items||[]);}catch(error){setMessage(error?.response?.data?.message||error?.message);}};
  const submit=async(event)=>{event.preventDefault();setSaving(true);setMessage('');try{await api.post('/exchanges',{sale_id:Number(form.sale_id),reason:form.reason,note:form.note||null,payment_method:form.payment_method,paid_amount:Number(form.paid_amount||0),returned_items:[{sale_item_id:Number(form.return_item_id),quantity:Number(form.return_qty)}],replacement_items:[{product_id:Number(form.replacement_product_id),product_variant_id:form.replacement_variant_id?Number(form.replacement_variant_id):null,quantity:Number(form.replacement_qty),unit_price:Number(form.unit_price),device_unit_ids:form.device_ids.split(',').map(x=>Number(x.trim())).filter(Boolean)}]});setMessage('Exchange completed and inventory updated.');await load();}catch(error){setMessage(error?.response?.data?.message||error?.message||'Exchange failed.');}finally{setSaving(false);}};
  return <div className="min-h-screen bg-slate-50 p-4 md:p-7"><div className="mx-auto max-w-[1500px] space-y-5"><Header eyebrow="Sales" title="Sale Exchange" description="Exchange sold items against available replacement stock with IMEI validation, value difference, payment and due tracking." loading={loading} onRefresh={load}/>{message&&<p className="rounded-2xl bg-white p-4 text-sm font-bold">{message}</p>}<form onSubmit={submit} className="grid gap-3 rounded-[1.8rem] bg-white p-6 shadow-sm md:grid-cols-2 xl:grid-cols-4"><select required className={field} value={form.sale_id} onChange={(e)=>chooseSale(e.target.value)}><option value="">Select invoice</option>{sales.map((row)=><option key={row.id} value={row.id}>{row.invoice_no} · {row.customer_name || 'Walk-in'} · {money(row.final_amount)}</option>)}</select><select required className={field} value={form.return_item_id} onChange={(e)=>setForm({...form,return_item_id:e.target.value})}><option value="">Returned sale item</option>{options.filter(x=>x.exchangeable_quantity>0).map((row)=><option key={row.id} value={row.id}>{row.product_name} · available {row.exchangeable_quantity} · credit {money(row.unit_credit)}</option>)}</select><input required min="1" type="number" className={field} value={form.return_qty} onChange={(e)=>setForm({...form,return_qty:e.target.value})} placeholder="Return quantity"/><input required className={field} value={form.reason} onChange={(e)=>setForm({...form,reason:e.target.value})} placeholder="Exchange reason"/><select required className={field} value={form.replacement_product_id} onChange={(e)=>setForm({...form,replacement_product_id:e.target.value,replacement_variant_id:''})}><option value="">Replacement product</option>{products.map((row)=><option key={row.id} value={row.id}>{row.name} · stock {row.stock_quantity ?? 0}</option>)}</select><select className={field} value={form.replacement_variant_id} onChange={(e)=>setForm({...form,replacement_variant_id:e.target.value})}><option value="">No variant</option>{(selectedProduct?.variants||[]).map((row)=><option key={row.id} value={row.id}>{row.variant_name||row.sku} · stock {row.stock_quantity??0}</option>)}</select><input required min="1" type="number" className={field} value={form.replacement_qty} onChange={(e)=>setForm({...form,replacement_qty:e.target.value})} placeholder="Replacement quantity"/><input required min="0" step="0.01" type="number" className={field} value={form.unit_price} onChange={(e)=>setForm({...form,unit_price:e.target.value})} placeholder="Replacement unit price"/><input className={field} value={form.device_ids} onChange={(e)=>setForm({...form,device_ids:e.target.value})} placeholder="Replacement device IDs, comma-separated"/><input min="0" step="0.01" type="number" className={field} value={form.paid_amount} onChange={(e)=>setForm({...form,paid_amount:e.target.value})} placeholder="Paid difference"/><select className={field} value={form.payment_method} onChange={(e)=>setForm({...form,payment_method:e.target.value})}><option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank</option><option value="mobile_banking">Mobile banking</option></select><input className={field} value={form.note} onChange={(e)=>setForm({...form,note:e.target.value})} placeholder="Internal note"/><button disabled={saving} className={`${button} md:col-span-2 xl:col-span-4`}><ArrowDownUp size={17}/> {saving?'Processing…':'Complete Exchange'}</button></form><div className="grid gap-3">{history.map((row)=><article key={row.id} className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black text-[var(--nst-dashboard-primary)]">{row.exchange_no}</p><p className="text-sm font-bold text-slate-700">{row.sale?.invoice_no} · {row.sale?.customer_name}</p></div><div className="text-right"><p className="font-black">Return {money(row.returned_value)} · Replacement {money(row.replacement_value)}</p><p className="text-xs font-bold text-slate-500">Due {money(row.due_amount)} · Refund {money(row.refund_amount)}</p></div></div></article>)}</div></div></div>;
}

export function DeliveryPage(){
  const [orders,setOrders]=useState([]);
  const [providers,setProviders]=useState([]);
  const [shipments,setShipments]=useState({});
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('');
  const [saving,setSaving]=useState(null);
  const [apiSaving,setApiSaving]=useState(null);
  const [forms,setForms]=useState({});

  const load=async()=>{
    setLoading(true);
    try{
      const [orderResponse,providerResponse,shipmentResponse]=await Promise.all([
        api.get('/web-sales',{params:{per_page:100}}),
        api.get('/delivery-gateways/enabled'),
        api.get('/delivery-gateways/shipments',{params:{per_page:200}}),
      ]);

      const rows=unwrapRows(orderResponse);
      const providerRows=unwrapRows(providerResponse);
      const shipmentRows=unwrapRows(shipmentResponse);
      const defaultProvider=providerRows.find(row=>row.is_default)||providerRows[0];

      setOrders(rows);
      setProviders(providerRows);
      setShipments(Object.fromEntries(shipmentRows.map(row=>[row.customer_order_id,row])));

      setForms((previous)=>Object.fromEntries(rows.map(row=>{
        const old=previous[row.id]||{};
        const shipment=shipmentRows.find(item=>Number(item.customer_order_id)===Number(row.id));
        return [row.id,{
          status:old.status||row.delivery_status||'pending',
          courier_name:old.courier_name||shipment?.provider?.name||'',
          tracking_number:old.tracking_number||shipment?.tracking_code||shipment?.consignment_id||'',
          driver_name:old.driver_name||'',
          driver_phone:old.driver_phone||'',
          received_by:old.received_by||'',
          note:old.note||'',
          provider_id:old.provider_id||shipment?.delivery_gateway_setting_id||defaultProvider?.id||'',
          weight:old.weight||'0.5',
          api_note:old.api_note||'',
        }];
      })));
    }catch(error){
      setMessage(error?.response?.data?.message||error?.message||'Delivery data could not be loaded.');
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{void load();},[]);

  const save=async(order)=>{
    setSaving(order.id);
    setMessage('');
    try{
      await api.post(`/orders/${order.id}/delivery`,forms[order.id]);
      setMessage(`Delivery updated for ${order.order_no}.`);
      await load();
    }catch(error){
      setMessage(error?.response?.data?.message||error?.message);
    }finally{
      setSaving(null);
    }
  };

  const sendToCourier=async(order)=>{
    const form=forms[order.id]||{};
    if(!form.provider_id){
      setMessage('Select an enabled courier API first.');
      return;
    }

    setApiSaving(`send-${order.id}`);
    setMessage('');
    try{
      const response=await api.post(`/orders/${order.id}/courier-shipment`,{
        provider_id:Number(form.provider_id),
        weight:Number(form.weight||0.5),
        note:form.api_note||form.note||null,
      });
      const shipment=response?.data?.data;
      setMessage(response?.data?.message||`Order ${order.order_no} sent to courier.`);
      if(shipment){
        setShipments({...shipments,[order.id]:shipment});
      }
      await load();
    }catch(error){
      setMessage(error?.response?.data?.message||error?.message||'Courier API booking failed.');
    }finally{
      setApiSaving(null);
    }
  };

  const syncCourier=async(order)=>{
    const shipment=shipments[order.id];
    if(!shipment?.id)return;

    setApiSaving(`sync-${order.id}`);
    setMessage('');
    try{
      const response=await api.post(`/delivery-gateways/shipments/${shipment.id}/sync`);
      setMessage(response?.data?.message||'Courier status synchronized.');
      await load();
    }catch(error){
      setMessage(error?.response?.data?.message||error?.message||'Courier status sync failed.');
    }finally{
      setApiSaving(null);
    }
  };

  return <div className="min-h-screen bg-slate-50 p-4 md:p-7">
    <div className="mx-auto max-w-[1500px] space-y-5">
      <Header
        eyebrow="Fulfilment"
        title="Delivery Control"
        description="Manual delivery control plus direct Steadfast, Pathao, Sundarban or custom courier API booking and tracking."
        loading={loading}
        onRefresh={load}
      />

      {message&&<p className="rounded-2xl bg-white p-4 text-sm font-bold shadow-sm">{message}</p>}

      {providers.length===0&&!loading&&
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-900">
          No courier API is enabled. Super Admin can configure one from Settings → Delivery APIs.
        </div>
      }

      <div className="grid gap-4">
        {orders.map(order=>{
          const form=forms[order.id]||{};
          const shipment=shipments[order.id];
          const canSend=Boolean(order.sale_id)&&providers.length>0&&!['refunded','failed','rejected'].includes(String(order.payment_status||'').toLowerCase());

          return <article key={order.id} className="rounded-[1.8rem] bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-3 border-b pb-4 md:flex-row">
              <div>
                <p className="font-black text-[var(--nst-dashboard-primary)]">{order.order_no}</p>
                <h2 className="text-xl font-black">{order.customer_name}</h2>
                <p className="text-sm font-semibold text-slate-500">
                  {order.customer_phone} · {order.branch?.name||'Branch pending'} · {money(order.total_amount)}
                </p>
                {!order.sale_id&&
                  <p className="mt-1 text-xs font-black text-amber-600">
                    Authorize/convert this Web Sale before courier API booking.
                  </p>
                }
              </div>
              <span className="h-fit rounded-xl bg-slate-100 px-3 py-2 text-xs font-black capitalize">
                {String(order.delivery_status||'pending').replaceAll('_',' ')}
              </span>
            </div>

            <section className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-[var(--nst-dashboard-primary)]">Courier API</p>
                  {shipment?
                    <p className="mt-1 text-sm font-bold text-slate-700">
                      {shipment.provider?.name||'Courier'} · Tracking: {shipment.tracking_code||shipment.consignment_id||'Pending'}
                      {shipment.provider_status?` · ${shipment.provider_status}`:''}
                    </p>
                    :
                    <p className="mt-1 text-sm font-semibold text-slate-500">Not sent to a courier API yet.</p>
                  }
                </div>
                {shipment?.id&&
                  <button
                    type="button"
                    disabled={apiSaving===`sync-${order.id}`}
                    onClick={()=>syncCourier(order)}
                    className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-700 disabled:opacity-50"
                  >
                    <RefreshCw size={14} className="mr-1 inline" />
                    {apiSaving===`sync-${order.id}`?'Syncing…':'Sync Courier Status'}
                  </button>
                }
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <select
                  className={field}
                  value={form.provider_id||''}
                  onChange={(e)=>setForms({...forms,[order.id]:{...form,provider_id:e.target.value}})}
                >
                  <option value="">Select Courier API</option>
                  {providers.map(provider=>
                    <option key={provider.id} value={provider.id}>
                      {provider.name}{provider.is_default?' · Default':''}
                    </option>
                  )}
                </select>

                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  className={field}
                  value={form.weight||'0.5'}
                  onChange={(e)=>setForms({...forms,[order.id]:{...form,weight:e.target.value}})}
                  placeholder="Weight KG"
                />

                <input
                  className={field}
                  value={form.api_note||''}
                  onChange={(e)=>setForms({...forms,[order.id]:{...form,api_note:e.target.value}})}
                  placeholder="Courier instruction"
                />

                <button
                  type="button"
                  disabled={!canSend||apiSaving===`send-${order.id}`||Boolean(shipment?.tracking_code||shipment?.consignment_id)}
                  onClick={()=>sendToCourier(order)}
                  className={`${button} disabled:cursor-not-allowed`}
                >
                  <Truck size={17}/>
                  {shipment?.tracking_code||shipment?.consignment_id
                    ? 'Already Sent'
                    : apiSaving===`send-${order.id}`?'Sending…':'Send to Courier API'}
                </button>
              </div>
            </section>

            <section className="mt-4">
              <p className="mb-3 text-xs font-black uppercase tracking-wider text-slate-400">Manual Delivery Status</p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <select className={field} value={form.status||'pending'} onChange={(e)=>setForms({...forms,[order.id]:{...form,status:e.target.value}})}>
                  {['pending','scheduled','ready_for_delivery','dispatched','delivered','failed','completed','returned','cancelled'].map(x=>
                    <option key={x} value={x}>{x.replaceAll('_',' ')}</option>
                  )}
                </select>
                {['courier_name','tracking_number','driver_name','driver_phone','received_by','note'].map(name=>
                  <input
                    key={name}
                    className={field}
                    value={form[name]||''}
                    onChange={(e)=>setForms({...forms,[order.id]:{...form,[name]:e.target.value}})}
                    placeholder={name.replaceAll('_',' ')}
                  />
                )}
                <button disabled={saving===order.id} onClick={()=>save(order)} className={button}>
                  <Truck size={17}/>{saving===order.id?'Saving…':'Update Delivery'}
                </button>
              </div>
            </section>
          </article>;
        })}

        {!loading&&orders.length===0&&
          <div className="rounded-3xl bg-white p-12 text-center">
            <CheckCircle2 className="mx-auto text-slate-300" size={48}/>
            <p className="mt-3 font-black text-slate-600">No web orders found.</p>
          </div>
        }
      </div>
    </div>
  </div>;
}

