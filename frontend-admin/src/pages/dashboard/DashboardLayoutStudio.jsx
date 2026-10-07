import { Eye, EyeOff, GripVertical, LayoutGrid, RotateCcw, Save, Smartphone, Tablet, Monitor } from 'lucide-react';
import { dashboardWidgetDefinitions, DashboardWidgetIdentityIcon } from '../../config/dashboardWidgetRegistry';
import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { LayoutDashboard as NstHdrLayoutDashboard } from 'lucide-react';

const WIDGETS = dashboardWidgetDefinitions.map(({ id, title }) => [id, title]);
// Sizes in the SAME units the Dashboard grid uses (12 columns).
const PRESETS={small:{colSpan:3,rowSpan:4},medium:{colSpan:4,rowSpan:6},large:{colSpan:6,rowSpan:9},full:{colSpan:12,rowSpan:6}};
const dashboardDefaultSize=(id)=>({colSpan:id.startsWith('kpi-')?3:id.startsWith('secondary-')?2:id==='sales-overview'?6:['top-products','recent-activities'].includes(id)?3:id==='system-status'?12:id==='module-shortcuts'?6:id==='today-target'?6:id==='business-bulletin'?6:3,rowSpan:id.startsWith('kpi-')?4:id.startsWith('secondary-')?4:id==='sales-overview'?9:['top-products','recent-activities'].includes(id)?9:id==='quick-access'?9:id==='module-shortcuts'?7:id==='system-status'?4:id==='today-target'?6:id==='business-bulletin'?6:6});
const DASHBOARD_DEFAULT_ORDER=['kpi-0','kpi-1','kpi-2','kpi-3','kpi-4','secondary-0','secondary-1','secondary-2','secondary-3','secondary-4','secondary-5','today-target','sales-overview','top-products','recent-activities','website-orders','sales-branch','order-status','profit-overview','quick-access','module-shortcuts','notifications','business-bulletin','nst-chat','system-status'];

export default function DashboardLayoutStudio(){
 const {user}=useAuth(); const id=user?.user?.id||user?.id||user?.email||'default'; const key=`nst-dashboard-layout:${id}`;
 const defaults=useMemo(()=>{const known=new Set(WIDGETS.map(x=>x[0]));return {order:DASHBOARD_DEFAULT_ORDER.filter(id=>known.has(id)),sizes:Object.fromEntries(WIDGETS.map(([wid])=>[wid,dashboardDefaultSize(wid)]))};},[]);
 const [layout,setLayout]=useState(()=>{try{const x=JSON.parse(localStorage.getItem(key)||'null');return x?.order?{order:x.order,sizes:{...defaults.sizes,...x.sizes}}:defaults}catch{return defaults}});
 const [drag,setDrag]=useState(null); const visible=new Set(layout.order);
 const [saveState,setSaveState]=useState('idle'); const [saveMessage,setSaveMessage]=useState('');
 // Layout Studio now reads/writes the SAME server layout the Dashboard uses (survives logout/login).
 useEffect(()=>{let alive=true;api.get('/dashboard/stage1-state').then(r=>{const st=r?.data?.data;const ws=st?.workspaces?.find(w=>w.id===st.activeWorkspaceId)||st?.workspaces?.[0];const d=ws?.layouts?.desktop;if(!alive||!d?.order?.length)return;const known=new Set(WIDGETS.map(w=>w[0]));const sizes={...defaults.sizes};for(const wid of d.order){const pos=d.positions?.[wid];if(pos)sizes[wid]={colSpan:Number(pos.w)||4,rowSpan:Number(pos.h)||7};}setLayout({order:d.order.filter(wid=>known.has(wid)),sizes});}).catch(()=>{});return()=>{alive=false};},[]);
 const save=async()=>{
  try{localStorage.setItem(key,JSON.stringify(layout));}catch{}
  setSaveState('saving');setSaveMessage('');
  try{
   const r=await api.get('/dashboard/stage1-state');const st=r?.data?.data;
   const base=st?.workspaces?.length?st:{activeWorkspaceId:'workspace-1',workspaces:[{id:'workspace-1',name:'Workspace 1',layouts:{}}],quickActions:[],moduleShortcuts:[],version:1};
   const positions={};let x=0,y=0,rowH=0;
   for(const wid of layout.order){const sz=layout.sizes[wid]||PRESETS.medium;const w=Math.max(2,Math.min(12,Number(sz.colSpan)||4));const h=Math.max(2,Math.min(40,Number(sz.rowSpan)||7));if(x+w>12){x=0;y+=rowH;rowH=0;}positions[wid]={x,y,w,h,locked:false};x+=w;rowH=Math.max(rowH,h);}
   const next=JSON.parse(JSON.stringify(base));let wi=next.workspaces.findIndex(w=>w.id===next.activeWorkspaceId);if(wi<0){wi=0;next.activeWorkspaceId=next.workspaces[0].id;}
   const ws=next.workspaces[wi];ws.layouts=ws.layouts||{};ws.layouts.desktop={order:[...layout.order],positions};
   for(const bp of ['tablet','mobile']){const cur=ws.layouts[bp]||{};ws.layouts[bp]={order:[...layout.order],positions:{...(cur.positions||{})}};}
   delete next.history;
   await api.post('/dashboard/stage1-state',{state:next,client_version:Number(base.version||0)});
   try{Object.keys(localStorage).filter(k=>k.startsWith('nst-dashboard-stage1:')).forEach(k=>localStorage.removeItem(k));}catch{}
   setSaveState('saved');setSaveMessage('Saved. The Dashboard will use this layout, also after logout/login.');
   window.setTimeout(()=>setSaveState('idle'),2500);
  }catch(e){setSaveState('error');setSaveMessage((e?.response?.data?.message)||e?.message||'Save failed. Please try again.');}
 };
 const toggle=id=>setLayout(p=>({...p,order:visible.has(id)?p.order.filter(x=>x!==id):[...p.order,id]}));
 const size=(id,preset)=>setLayout(p=>({...p,sizes:{...p.sizes,[id]:PRESETS[preset]}}));
 const drop=id=>{if(!drag||drag===id)return;setLayout(p=>{const o=p.order.filter(x=>x!==drag);o.splice(Math.max(0,o.indexOf(id)),0,drag);return {...p,order:o}});setDrag(null)};
 return <div className="min-h-full bg-[var(--nst-dashboard-bg)] p-4 text-[var(--nst-dashboard-text)] md:p-7"><div className="mx-auto max-w-6xl">
  <NstPageHeader icon={NstHdrLayoutDashboard} title={<>Simple, smooth layout control</>} subtitle={<>Show, hide, reorder and choose a practical size. No corner dragging is required.</>} actions={<><div className="flex flex-wrap gap-2"><button onClick={()=>setLayout(defaults)} className="rounded-xl border border-[var(--nst-dashboard-border)] px-4 py-3 text-sm font-black"><RotateCcw size={16} className="mr-2 inline"/>Reset</button><button onClick={save} disabled={saveState==='saving'} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-black text-white disabled:opacity-60"><Save size={16} className="mr-2 inline"/>{saveState==='saving'?'Saving...':saveState==='saved'?'Saved':'Save My Layout'}</button></div></>}/>
  {saveMessage && <p role="status" className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${saveState==='error'?'border-red-500/40 text-red-500':'border-[var(--nst-dashboard-border)] text-[var(--nst-dashboard-text)]'}`}>{saveMessage}</p>}
  <div className="mt-6 flex gap-2"><span className="rounded-xl border border-[var(--nst-dashboard-primary)] bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_12%,transparent)] px-3 py-2 text-xs font-black"><Monitor size={15} className="mr-2 inline"/>Desktop</span><span className="rounded-xl border border-[var(--nst-dashboard-border)] px-3 py-2 text-xs font-bold text-[var(--nst-dashboard-muted)]"><Tablet size={15} className="mr-2 inline"/>Tablet auto-fit</span><span className="rounded-xl border border-[var(--nst-dashboard-border)] px-3 py-2 text-xs font-bold text-[var(--nst-dashboard-muted)]"><Smartphone size={15} className="mr-2 inline"/>Mobile stacked</span></div>
  <div className="mt-5 space-y-3">{WIDGETS.map(([wid,label])=>{const shown=visible.has(wid);return <article key={wid} draggable={shown} onDragStart={()=>setDrag(wid)} onDragOver={e=>e.preventDefault()} onDrop={()=>drop(wid)} className={`grid gap-3 rounded-2xl border p-4 transition md:grid-cols-[36px_1fr_auto_auto] md:items-center ${shown?'border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)]':'border-dashed border-[var(--nst-dashboard-border)] opacity-65'}`}><button type="button" aria-label={`Drag ${label}`} className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--nst-dashboard-border)] text-[var(--nst-dashboard-muted)]"><GripVertical size={18}/></button><div className="flex items-center gap-3"><DashboardWidgetIdentityIcon id={wid}/><div><h2 className="font-black">{label}</h2><p className="text-xs text-[var(--nst-dashboard-muted)]">{shown?'Visible on Dashboard':'Hidden from Dashboard'}</p></div></div><select disabled={!shown} value={Object.entries(PRESETS).find(([,v])=>v.colSpan===(layout.sizes[wid]?.colSpan)&&v.rowSpan===(layout.sizes[wid]?.rowSpan))?.[0]||'medium'} onChange={e=>size(wid,e.target.value)} className="rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] px-3 py-2 text-sm font-bold"><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option><option value="full">Full Width</option></select><button onClick={()=>toggle(wid)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--nst-dashboard-border)] px-3 py-2 text-sm font-black">{shown?<><EyeOff size={16}/>Hide</>:<><Eye size={16}/>Show</>}</button></article>})}</div>
 </div></div>
}
