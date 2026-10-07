import { useEffect, useMemo, useState } from 'react';
import { Megaphone, Plus, RefreshCw, Paperclip, CheckCircle2, Clock3, AlertTriangle, X, Save, Eye } from 'lucide-react';
import dashboardOperatingService from '../../services/dashboardOperatingService';
import { NstPageHeader } from '../../components/ui/nst-page-header';

const priorities = {
  urgent: 'border-rose-500/40 bg-rose-500/10 text-rose-500',
  important: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
  normal: 'border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] text-[var(--nst-dashboard-text)]',
};

function Card({ children, className = '' }) {
  return <section className={`rounded-[26px] border bg-[var(--nst-dashboard-surface)] shadow-[var(--nst-dashboard-shadow)] ${className}`}>{children}</section>;
}

export default function BusinessBulletinCenter() {
  const [items, setItems] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title:'', body:'', priority:'normal', audience_roles:'', branch_ids:'', publish_at:'', expires_at:'', status:'published', attachment:null });

  const load = async () => {
    setLoading(true); setError('');
    try { const res = await dashboardOperatingService.bulletins(); setItems(res?.data?.data || []); setCanManage(Boolean(res?.data?.can_manage)); }
    catch (err) { setError(err?.response?.data?.message || 'Business Bulletins could not load.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => items.filter((item) => filter === 'all' || (filter === 'unread' ? !item.is_read : item.priority === filter)), [items, filter]);

  const read = async (item) => {
    if (item.is_read) return;
    try { await dashboardOperatingService.markBulletinRead(item.id); setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, is_read:true } : row)); }
    catch {}
  };

  const save = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const payload = new FormData();
      payload.append('title', form.title); payload.append('body', form.body); payload.append('priority', form.priority); payload.append('status', form.status);
      if (form.publish_at) payload.append('publish_at', form.publish_at); if (form.expires_at) payload.append('expires_at', form.expires_at);
      form.audience_roles.split(',').map((x) => x.trim()).filter(Boolean).forEach((role, index) => payload.append(`audience_roles[${index}]`, role));
      form.branch_ids.split(',').map((x) => x.trim()).filter(Boolean).forEach((id, index) => payload.append(`branch_ids[${index}]`, id));
      if (form.attachment) payload.append('attachment', form.attachment);
      await dashboardOperatingService.createBulletin(payload);
      setFormOpen(false); setForm({ title:'', body:'', priority:'normal', audience_roles:'', branch_ids:'', publish_at:'', expires_at:'', status:'published', attachment:null }); await load();
    } catch (err) { setError(err?.response?.data?.message || 'Bulletin could not be saved.'); }
    finally { setSaving(false); }
  };

  return <main className="min-h-full bg-[var(--nst-dashboard-bg)] p-4 text-[var(--nst-dashboard-text)] md:p-6">
    <div className="mx-auto max-w-[1550px] space-y-5">
      <NstPageHeader icon={Megaphone} title={<>Business Bulletin Center</>} subtitle={<>Priority notices with role, branch, schedule, expiry, attachment and read tracking.</>} actions={<><div className="flex gap-2"><button onClick={load} className="rounded-xl border border-[var(--nst-dashboard-border)] p-3"><RefreshCw size={18}/></button>{canManage && <button onClick={() => setFormOpen(true)} className="flex items-center gap-2 rounded-xl bg-[var(--nst-dashboard-primary)] px-4 py-3 text-sm font-black text-white"><Plus size={17}/>New Bulletin</button>}</div></>}/>
      {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-500">{error}</div>}
      <div className="flex flex-wrap gap-2">{[['all','All'],['unread','Unread'],['urgent','Urgent'],['important','Important'],['normal','Normal']].map(([id,label]) => <button key={id} onClick={() => setFilter(id)} className={`rounded-full border px-4 py-2 text-xs font-black ${filter === id ? 'border-[var(--nst-dashboard-primary)] bg-[var(--nst-dashboard-primary)] text-white' : 'border-[var(--nst-dashboard-border)]'}`}>{label}</button>)}</div>
      {loading && <div className="grid min-h-[420px] place-items-center"><RefreshCw className="animate-spin text-[var(--nst-dashboard-primary)]" size={36}/></div>}
      {!loading && <div className="grid gap-4 xl:grid-cols-2">{visible.map((item) => <Card key={item.id} className={`overflow-hidden ${priorities[item.priority] || priorities.normal}`}><button onClick={() => read(item)} className="w-full p-5 text-left"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><span className="mt-1"><Megaphone size={20}/></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-black">{item.title}</h2><span className="rounded-full border border-current/30 px-2 py-0.5 text-[10px] font-black uppercase">{item.priority}</span>{!item.is_read && <span className="rounded-full bg-[var(--nst-dashboard-primary)] px-2 py-0.5 text-[10px] font-black text-white">Unread</span>}</div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--nst-dashboard-text)]">{item.body}</p></div></div>{item.is_read ? <CheckCircle2 className="shrink-0 text-emerald-500" size={18}/> : <Eye className="shrink-0" size={18}/>}</div><div className="mt-5 flex flex-wrap gap-3 border-t border-current/10 pt-3 text-[11px] font-semibold"><span className="flex items-center gap-1"><Clock3 size={13}/>Published {item.publish_at ? new Date(item.publish_at).toLocaleString('en-BD') : 'now'}</span>{item.expires_at && <span className="flex items-center gap-1"><AlertTriangle size={13}/>Expires {new Date(item.expires_at).toLocaleString('en-BD')}</span>}{item.attachment_url && <button type="button" onClick={(event) => { event.stopPropagation(); dashboardOperatingService.downloadProtected(item.attachment_url, `bulletin-${item.id}`).catch(() => setError('Attachment could not be downloaded.')); }} className="flex items-center gap-1 underline"><Paperclip size={13}/>Attachment</button>}</div></button></Card>)}{visible.length === 0 && <div className="xl:col-span-2 rounded-[26px] border border-dashed border-[var(--nst-dashboard-border)] p-12 text-center text-sm text-[var(--nst-dashboard-muted)]">No active bulletin matches this filter.</div>}</div>}
    </div>

    {formOpen && <div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/60 p-4"><Card className="w-full max-w-3xl border-[var(--nst-dashboard-border)] p-5"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black">Create Business Bulletin</h2><p className="text-sm text-[var(--nst-dashboard-muted)]">Only intended roles and branches will see it.</p></div><button onClick={() => setFormOpen(false)}><X/></button></div><form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="text-xs font-black">Title</span><input required value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} className="mt-1 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-3 outline-none"/></label><label className="sm:col-span-2"><span className="text-xs font-black">Message</span><textarea required rows={6} value={form.body} onChange={(e)=>setForm({...form,body:e.target.value})} className="mt-1 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-3 outline-none"/></label><label><span className="text-xs font-black">Priority</span><select value={form.priority} onChange={(e)=>setForm({...form,priority:e.target.value})} className="mt-1 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-3"><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></label><label><span className="text-xs font-black">Status</span><select value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})} className="mt-1 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-3"><option value="published">Published</option><option value="draft">Draft</option></select></label><label><span className="text-xs font-black">Roles (comma-separated)</span><input value={form.audience_roles} onChange={(e)=>setForm({...form,audience_roles:e.target.value})} placeholder="admin, accountant, salesman" className="mt-1 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-3"/></label><label><span className="text-xs font-black">Branch IDs (comma-separated)</span><input value={form.branch_ids} onChange={(e)=>setForm({...form,branch_ids:e.target.value})} placeholder="1, 2" className="mt-1 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-3"/></label><label><span className="text-xs font-black">Publish at</span><input type="datetime-local" value={form.publish_at} onChange={(e)=>setForm({...form,publish_at:e.target.value})} className="mt-1 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-3"/></label><label><span className="text-xs font-black">Expires at</span><input type="datetime-local" value={form.expires_at} onChange={(e)=>setForm({...form,expires_at:e.target.value})} className="mt-1 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-3"/></label><label className="sm:col-span-2"><span className="text-xs font-black">Attachment</span><input type="file" onChange={(e)=>setForm({...form,attachment:e.target.files?.[0] || null})} className="mt-1 block w-full rounded-xl border border-[var(--nst-dashboard-border)] p-3 text-sm"/></label><button disabled={saving} className="sm:col-span-2 flex items-center justify-center gap-2 rounded-xl bg-[var(--nst-dashboard-primary)] py-3 text-sm font-black text-white disabled:opacity-50">{saving ? <RefreshCw className="animate-spin" size={17}/> : <Save size={17}/>}Save Bulletin</button></form></Card></div>}
  </main>;
}
