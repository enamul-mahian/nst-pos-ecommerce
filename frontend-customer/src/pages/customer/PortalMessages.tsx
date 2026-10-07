import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Cloud, ImagePlus, Loader2, MessageCircle, Plus, RefreshCw, Send, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../api/client';

type ThreadItem = { id: string | number; sender_type: string; sender_name?: string; message: string; cloud_link?: string | null; attachments?: Array<{ name?: string; url?: string }>; created_at?: string };
type Conversation = { id: number; ticket_no: string; subject: string; category: string; status: string; preview?: string; customer_unread?: boolean; last_message_at?: string; thread?: ThreadItem[] };

const categories = [
  ['general_support', 'General Support'], ['order', 'Order'], ['invoice', 'Invoice'], ['preorder', 'Preorder'],
  ['service', 'Service & Repair'], ['return_exchange', 'Return / Exchange'], ['payment', 'Payment'], ['complaint', 'Complaint'],
];
const formatTime = (value?: string) => value ? new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dhaka' }).format(new Date(value)) : '';

export default function PortalMessages() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [compose, setCompose] = useState(false);
  const [form, setForm] = useState({ subject: '', category: 'general_support', invoice_no: '', message: '', cloud_link: '' });
  const [reply, setReply] = useState('');
  const [replyLink, setReplyLink] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/portal/messages');
      const rows = response.data?.data ?? response.data?.messages ?? [];
      setItems(Array.isArray(rows) ? rows : []);
      if (selected) {
        const fresh = (Array.isArray(rows) ? rows : []).find((row: Conversation) => row.id === selected.id);
        if (!fresh) setSelected(null);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Support conversations could not be loaded.');
    } finally { setLoading(false); }
  }, [selected]);

  useEffect(() => { load(); }, []);

  const openConversation = async (row: Conversation) => {
    try {
      const response = await apiClient.get(`/portal/messages/${row.id}`);
      setSelected(response.data?.data ?? row);
      setCompose(false);
      setItems(current => current.map(item => item.id === row.id ? { ...item, customer_unread: false } : item));
    } catch (error: any) { toast.error(error?.response?.data?.message || 'Conversation could not be opened.'); }
  };

  const validateFiles = (next: File[]) => {
    if (next.length > 2) { toast.error('Maximum 2 images are allowed. Share a Google Drive, OneDrive or Dropbox link for more files.'); return false; }
    if (next.reduce((total, file) => total + file.size, 0) > 10 * 1024 * 1024) { toast.error('Total image size cannot exceed 10 MB. Use a cloud link for larger files.'); return false; }
    return true;
  };

  const addFiles = (list: FileList | null) => {
    const next = [...files, ...Array.from(list || [])];
    if (validateFiles(next)) setFiles(next);
  };

  const createConversation = async () => {
    if (!form.subject.trim() || !form.message.trim()) return toast.error('Subject and message are required.');
    setSending(true);
    try {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => { if (value) body.append(key, String(value)); });
      files.forEach(file => body.append('attachments[]', file));
      const response = await apiClient.post('/portal/messages', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Support conversation created.');
      setForm({ subject: '', category: 'general_support', invoice_no: '', message: '', cloud_link: '' }); setFiles([]); setCompose(false);
      await load();
      if (response.data?.data) await openConversation(response.data.data);
    } catch (error: any) { toast.error(error?.response?.data?.message || 'Message could not be sent.'); }
    finally { setSending(false); }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return toast.error('Write a reply first.');
    setSending(true);
    try {
      const body = new FormData(); body.append('message', reply); if (replyLink) body.append('cloud_link', replyLink); files.forEach(file => body.append('attachments[]', file));
      const response = await apiClient.post(`/portal/messages/${selected.id}/reply`, body, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSelected(response.data?.data ?? selected); setReply(''); setReplyLink(''); setFiles([]); toast.success('Reply sent.'); await load();
    } catch (error: any) { toast.error(error?.response?.data?.message || 'Reply could not be sent.'); }
    finally { setSending(false); }
  };

  const unread = useMemo(() => items.filter(item => item.customer_unread).length, [items]);
  return <>
    <Helmet><title>Messages & Support | New Singapur Telecom</title><meta name="description" content="Contact New Singapur Telecom support and follow your customer service conversations." /></Helmet>
    <section className="space-y-5">
      <header className="flex flex-col gap-3 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[var(--nst-primary)]">Customer Support</p><h1 className="mt-1 text-2xl font-black text-slate-900">Messages & Support</h1><p className="mt-1 text-sm text-slate-500">{unread} unread conversation{unread === 1 ? '' : 's'}</p></div>
        <div className="flex gap-2"><button type="button" onClick={() => load()} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-700"><RefreshCw size={16}/>Refresh</button><button type="button" onClick={() => { setCompose(true); setSelected(null); }} className="inline-flex items-center gap-2 rounded-xl bg-[var(--nst-primary)] px-4 py-2.5 text-sm font-black text-white"><Plus size={16}/>New Message</button></div>
      </header>
      <div className="grid min-h-[560px] gap-5 xl:grid-cols-[340px_1fr]">
        <aside className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          {loading ? <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-[var(--nst-primary)]"/></div> : items.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No support conversation yet.</div> : <div className="divide-y divide-gray-100">{items.map(row => <button type="button" key={row.id} onClick={() => openConversation(row)} className={`w-full p-4 text-left transition ${selected?.id === row.id ? 'bg-purple-50' : 'hover:bg-slate-50'}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-black text-slate-900">{row.subject}</span>{row.customer_unread && <span className="h-2.5 w-2.5 rounded-full bg-[var(--nst-primary)]"/>}</div><p className="mt-1 line-clamp-2 text-xs text-slate-500">{row.preview}</p><div className="mt-2 flex justify-between text-[10px] font-bold uppercase text-slate-400"><span>{row.ticket_no}</span><span>{row.status}</span></div></button>)}</div>}
        </aside>
        <main className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          {compose ? <div className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-lg font-black text-slate-900">New Support Message</h2><button type="button" onClick={() => setCompose(false)}><X/></button></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-black uppercase text-slate-500">Subject<input value={form.subject} onChange={e => setForm({...form, subject:e.target.value})} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm"/></label><label className="text-xs font-black uppercase text-slate-500">Category<select value={form.category} onChange={e => setForm({...form, category:e.target.value})} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm">{categories.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-black uppercase text-slate-500">Order / Invoice Reference<input value={form.invoice_no} onChange={e => setForm({...form, invoice_no:e.target.value})} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm"/></label><label className="text-xs font-black uppercase text-slate-500">Cloud Link<input type="url" value={form.cloud_link} onChange={e => setForm({...form, cloud_link:e.target.value})} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm"/></label></div><label className="block text-xs font-black uppercase text-slate-500">Message<textarea value={form.message} onChange={e => setForm({...form, message:e.target.value})} className="mt-1.5 min-h-40 w-full rounded-xl border px-3 py-2.5 text-sm"/></label><AttachmentPicker files={files} onFiles={addFiles} onRemove={index => setFiles(files.filter((_,i)=>i!==index))}/><button type="button" disabled={sending} onClick={createConversation} className="inline-flex items-center gap-2 rounded-xl bg-[var(--nst-primary)] px-5 py-3 text-sm font-black text-white disabled:opacity-50">{sending?<Loader2 className="animate-spin" size={16}/>:<Send size={16}/>}Send Message</button></div> : selected ? <div className="flex h-full flex-col"><div className="border-b pb-4"><h2 className="text-lg font-black text-slate-900">{selected.subject}</h2><p className="text-xs font-bold uppercase text-slate-400">{selected.ticket_no} · {selected.status}</p></div><div className="flex-1 space-y-4 py-5">{(selected.thread || []).map(item => <article key={item.id} className={`max-w-[85%] rounded-2xl p-4 ${item.sender_type === 'customer' ? 'ml-auto bg-purple-100' : 'bg-slate-100'}`}><div className="flex items-center justify-between gap-4"><strong className="text-xs text-slate-800">{item.sender_name}</strong><time className="text-[10px] text-slate-400">{formatTime(item.created_at)}</time></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.message}</p>{item.cloud_link && <a href={item.cloud_link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[var(--nst-primary)]"><Cloud size={14}/>Open shared files</a>}{item.attachments?.map((file,index)=><a key={index} href={file.url} target="_blank" rel="noreferrer" className="mt-2 block text-xs font-bold text-[var(--nst-primary)]">{file.name || `Attachment ${index+1}`}</a>)}</article>)}</div>{selected.status !== 'closed' && <div className="space-y-3 border-t pt-4"><textarea value={reply} onChange={e=>setReply(e.target.value)} placeholder="Write your reply…" className="min-h-24 w-full rounded-xl border px-3 py-2.5 text-sm"/><input type="url" value={replyLink} onChange={e=>setReplyLink(e.target.value)} placeholder="Optional Google Drive / OneDrive / Dropbox link" className="w-full rounded-xl border px-3 py-2.5 text-sm"/><AttachmentPicker files={files} onFiles={addFiles} onRemove={index => setFiles(files.filter((_,i)=>i!==index))}/><button type="button" disabled={sending} onClick={sendReply} className="inline-flex items-center gap-2 rounded-xl bg-[var(--nst-primary)] px-5 py-3 text-sm font-black text-white disabled:opacity-50">{sending?<Loader2 className="animate-spin" size={16}/>:<Send size={16}/>}Send Reply</button></div>}</div> : <div className="flex h-full min-h-96 flex-col items-center justify-center text-center"><MessageCircle size={44} className="text-purple-300"/><h2 className="mt-4 text-lg font-black text-slate-900">Select a conversation</h2><p className="mt-1 max-w-sm text-sm text-slate-500">Open an existing ticket or create a new message. Staff replies appear in the same thread.</p></div>}
        </main>
      </div>
    </section>
  </>;
}

function AttachmentPicker({ files, onFiles, onRemove }: { files: File[]; onFiles: (files: FileList | null) => void; onRemove: (index: number) => void }) {
  return <div className="rounded-2xl border border-dashed p-4"><label className="inline-flex cursor-pointer items-center gap-2 text-sm font-black text-[var(--nst-primary)]"><ImagePlus size={18}/>Attach images<input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => { onFiles(e.target.files); e.target.value=''; }}/></label><p className="mt-1 text-xs text-slate-400">Maximum 2 images and 10 MB total. For more or larger files, use a cloud link.</p>{files.length>0 && <div className="mt-3 flex flex-wrap gap-2">{files.map((file,index)=><span key={`${file.name}-${index}`} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">{file.name}<button type="button" onClick={()=>onRemove(index)}><X size={13}/></button></span>)}</div>}</div>;
}
