import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Globe2, History, RefreshCw, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchWebsiteBuilderDraft, fetchWebsiteBuilderRevisions, publishWebsiteBuilderDraft } from '../../services/websiteBuilderService';
import { NstPageHeader } from '../../components/ui/nst-page-header';

export default function WebsiteOperations() {
  const [state,setState] = useState({ loading:true, draft:null, revisions:[], error:'' });
  const load = async () => {
    try {
      setState((v)=>({...v,loading:true,error:''}));
      const [draft,revisions] = await Promise.all([fetchWebsiteBuilderDraft(),fetchWebsiteBuilderRevisions()]);
      setState({loading:false,draft,revisions:Array.isArray(revisions)?revisions:[],error:''});
    } catch (error) {
      setState((v)=>({...v,loading:false,error:error?.response?.data?.message || error?.message || 'Website operations could not be loaded.'}));
    }
  };
  useEffect(()=>{ load(); },[]);
  const publish = async () => {
    try { await publishWebsiteBuilderDraft(); toast.success('Current saved draft published.'); await load(); }
    catch (error) { toast.error(error?.response?.data?.message || 'Publish failed.'); }
  };
  const pages = state.draft?.pages || state.draft?.builder?.pages || [];
  return <main className="min-h-full bg-[var(--nst-dashboard-bg)] p-4 text-[var(--nst-dashboard-text)] md:p-7">
    <div className="mx-auto max-w-6xl space-y-5">
      <NstPageHeader icon={Globe2} title={<>Publish & Revision Control</>} subtitle={<>Operational routing for the same Website Control Center source of truth.</>} actions={<><button onClick={load} className="rounded-xl border border-[var(--nst-dashboard-border)] p-3"><RefreshCw size={18}/></button></>}/>
      {state.error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">{state.error}</div>}
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5"><b>Saved Pages</b><div className="mt-2 text-3xl font-black">{pages.length}</div><Link to="/website-control-center" className="mt-4 inline-flex items-center gap-2 text-sm font-black text-[var(--nst-dashboard-primary)]"><Eye size={16}/>Open Editor</Link></article>
        <article className="rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5"><b>Revision History</b><div className="mt-2 text-3xl font-black">{state.revisions.length}</div><Link to="/website-control-center?history=1" className="mt-4 inline-flex items-center gap-2 text-sm font-black text-[var(--nst-dashboard-primary)]"><History size={16}/>Review / Rollback</Link></article>
        <article className="rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5"><b>Public Release</b><p className="mt-2 text-sm text-[var(--nst-dashboard-muted)]">Publishes the currently saved draft. Unsaved editor changes are never published.</p><button onClick={publish} disabled={state.loading} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><Send size={16}/>Publish Saved Draft</button></article>
      </section>
    </div>
  </main>;
}
