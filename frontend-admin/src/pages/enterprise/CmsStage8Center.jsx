import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Code2, FileClock, FileText, Globe2, History, Layers3, Loader2, MonitorSmartphone, RefreshCw, RotateCcw, Save, Search, ShieldCheck, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

const unwrap = (response) => response?.data?.data ?? response?.data ?? {};
const todayPath = () => `/stage-8-preview-${new Date().toISOString().slice(0, 10)}`;

function Metric({ label, value, note, icon: Icon = Sparkles }) {
  return <article className="rounded-3xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5 shadow-[var(--nst-dashboard-shadow)]">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-black uppercase tracking-wider text-[var(--nst-dashboard-muted)]">{label}</p><p className="mt-2 text-2xl font-black text-[var(--nst-dashboard-text)]">{value}</p>{note && <p className="mt-1 text-xs text-[var(--nst-dashboard-muted)]">{note}</p>}</div>
      <span className="rounded-2xl bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_14%,transparent)] p-3 text-[var(--nst-dashboard-primary)]"><Icon size={20}/></span>
    </div>
  </article>;
}

function Panel({ title, description, action, children }) {
  return <section className="rounded-3xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5 shadow-[var(--nst-dashboard-shadow)]">
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-black text-[var(--nst-dashboard-text)]">{title}</h2>{description && <p className="mt-1 text-sm text-[var(--nst-dashboard-muted)]">{description}</p>}</div>{action}</div>{children}
  </section>;
}

function Button({ children, busy, tone = 'primary', ...props }) {
  const tones = { primary: 'bg-[var(--nst-dashboard-primary)] text-white', soft: 'bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_12%,transparent)] text-[var(--nst-dashboard-primary)]', danger: 'bg-red-500/10 text-red-500' };
  return <button type="button" {...props} disabled={busy || props.disabled} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}>{busy ? <Loader2 size={16} className="animate-spin"/> : null}{children}</button>;
}

function Input({ label, ...props }) {
  return <label className="text-xs font-black uppercase tracking-wide text-[var(--nst-dashboard-muted)]">{label}<input {...props} className="mt-1.5 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] px-3 py-2.5 text-sm text-[var(--nst-dashboard-text)] outline-none focus:border-[var(--nst-dashboard-primary)]"/></label>;
}

function Textarea({ label, ...props }) {
  return <label className="text-xs font-black uppercase tracking-wide text-[var(--nst-dashboard-muted)]">{label}<textarea {...props} className="mt-1.5 min-h-28 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] px-3 py-2.5 text-sm text-[var(--nst-dashboard-text)] outline-none focus:border-[var(--nst-dashboard-primary)]"/></label>;
}

function Table({ columns, rows = [], empty = 'No records found.' }) {
  if (!rows.length) return <div className="rounded-2xl border border-dashed border-[var(--nst-dashboard-border)] p-8 text-center text-sm text-[var(--nst-dashboard-muted)]">{empty}</div>;
  return <div className="overflow-x-auto rounded-2xl border border-[var(--nst-dashboard-border)]"><table className="min-w-full text-left text-sm"><thead className="bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_8%,transparent)] text-xs uppercase text-[var(--nst-dashboard-muted)]"><tr>{columns.map(c => <th key={c.key} className="whitespace-nowrap px-4 py-3 font-black">{c.label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--nst-dashboard-border)]">{rows.map((row, index) => <tr key={row.id ?? index} className="hover:bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_5%,transparent)]">{columns.map(c => <td key={c.key} className="whitespace-nowrap px-4 py-3 text-[var(--nst-dashboard-text)]">{c.render ? c.render(row) : (row[c.key] ?? '-')}</td>)}</tr>)}</tbody></table></div>;
}

export default function CmsStage8Center({ refreshToken }) {
  const [overview, setOverview] = useState({});
  const [pages, setPages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [ops, setOps] = useState([]);
  const [components, setComponents] = useState([]);
  const [acceptance, setAcceptance] = useState({});
  const [canonical, setCanonical] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ title: 'CMS Test Page', route: todayPath(), meta_title: 'CMS Test Page', meta_description: 'Database-backed CMS draft preview publish rollback test page.', content: 'This page is stored from CMS database source of truth.', faq_question: 'Is this CMS editable?', faq_answer: 'Yes, it uses draft, preview, publish, rollback and WYSIWYG component mapping.' });
  const [componentForm, setComponentForm] = useState({ page_id: '', component_id: 'hero-title', display_name: 'Hero Title', value: 'Editable hero title from POS Website Control Center' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, p, l, a, c, op] = await Promise.all([
        api.get('/cms-operations/overview'),
        api.get('/cms-operations/pages'),
        api.get('/cms-operations/publication-logs'),
        api.get('/cms-operations/acceptance-status'),
        api.get('/cms-operations/components'),
        api.get('/cms-operations/operation-logs'),
      ]);
      setOverview(unwrap(o));
      setPages(unwrap(p) || []);
      setLogs(unwrap(l) || []);
      setAcceptance(unwrap(a));
      setComponents(unwrap(c) || []);
      setOps(unwrap(op)?.logs || []);
      const first = (unwrap(p) || [])[0];
      if (first?.id) {
        setComponentForm(v => ({ ...v, page_id: String(v.page_id || first.id) }));
        const state = await api.get('/cms-operations/canonical-state', { params: { path: first.route } });
        setCanonical(unwrap(state));
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'CMS data load failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshToken]);

  const createDraft = async () => {
    if (!form.title || !form.route) return toast.error('Title and route are required.');
    setSaving(true);
    try {
      await api.post('/cms-operations/pages', {
        title: form.title,
        route: form.route,
        page_type: 'custom',
        content: { sections: [{ component_id: 'main-content', component_type: 'rich_text', title: 'Main Content', content: { html: form.content }, sort_order: 1 }] },
        seo: { meta_title: form.meta_title || form.title, meta_description: form.meta_description, robots: 'index,follow' },
        faq: [{ question: form.faq_question, answer: form.faq_answer, is_visible: true }],
        settings: { responsive: true, editable_from_pos: true, animation: 'soft-fade' },
        is_visible: true,
        change_note: 'CMS draft created from Website Control Center.',
      });
      toast.success('Draft saved to CMS database source of truth.');
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Draft save failed.');
    } finally {
      setSaving(false);
    }
  };

  const preview = async (page) => {
    try {
      const response = await api.post(`/cms-operations/pages/${page.id}/preview`, { change_note: 'Preview requested from Website Control Center.' });
      const data = unwrap(response);
      toast.success(`Preview token ready: ${String(data.preview_token || '').slice(0, 8)}…`);
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Preview failed.');
    }
  };

  const publish = async (page) => {
    try {
      await api.post(`/cms-operations/pages/${page.id}/publish`, { change_note: 'Published from Website Control Center.' });
      toast.success('Page published atomically.');
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Publish failed.');
    }
  };

  const rollbackLatest = async (page) => {
    try {
      const versions = await api.get(`/cms-operations/pages/${page.id}/versions`);
      const row = (unwrap(versions) || []).find(v => v.status === 'published') || (unwrap(versions) || [])[0];
      if (!row?.id) return toast.error('No content version found for rollback.');
      await api.post(`/cms-operations/pages/${page.id}/versions/${row.id}/rollback`, { change_note: 'Rollback requested from Website Control Center.' });
      toast.success('Rollback restored as draft.');
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Rollback failed.');
    }
  };

  const saveComponentDraft = async () => {
    if (!componentForm.page_id || !componentForm.component_id) return toast.error('Page and component ID are required.');
    try {
      await api.put(`/cms-operations/pages/${componentForm.page_id}/components/${componentForm.component_id}`, {
        component_type: 'text',
        display_name: componentForm.display_name,
        draft_value: { text: componentForm.value },
        editable_fields: ['text'],
        is_visible: true,
        change_note: 'Live WYSIWYG click-to-edit component draft saved.',
      });
      toast.success('Component draft saved.');
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Component draft failed.');
    }
  };

  const summary = overview.summary || {};
  const health = overview.content_health || {};
  const businessRules = acceptance.business_rules || {};
  const ready = acceptance.database_ready && acceptance.routes_ready;
  const canonicalLabel = useMemo(() => canonical?.source_of_truth || 'database:nst_cms_*', [canonical]);

  return <div className="space-y-5">
    {loading && <div className="flex items-center gap-2 text-sm text-[var(--nst-dashboard-muted)]"><Loader2 size={16} className="animate-spin"/>Loading Website CMS & Operations…</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Website CMS & Operations" value={ready ? 'Ready' : 'Checking'} note="Acceptance Status" icon={Globe2}/>
      <Metric label="CMS Pages" value={summary.cms_pages || 0} note={`${summary.published_pages || 0} published`} icon={FileText}/>
      <Metric label="Content Versions" value={summary.content_versions || 0} note="Immutable draft/published history" icon={FileClock}/>
      <Metric label="Components" value={summary.registered_components || 0} note="Live WYSIWYG map" icon={Layers3}/>
    </div>

    <Panel title="Acceptance Status" description="An item is treated complete only when database tables, routes and business rules are ready." action={<Button tone="soft" onClick={load}><RefreshCw size={16}/>Refresh</Button>}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Object.entries(businessRules).map(([key, value]) => <div key={key} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--nst-dashboard-border)] px-4 py-3"><span className="text-sm font-bold text-[var(--nst-dashboard-text)]">{key.replaceAll('_', ' ')}</span>{value ? <CheckCircle2 className="text-emerald-500" size={18}/> : <FileClock className="text-amber-500" size={18}/>}</div>)}</div>
    </Panel>

    <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
      <Panel title="Canonical Database Source" description={canonicalLabel}>
        <div className="space-y-3"><div className="rounded-2xl border border-[var(--nst-dashboard-border)] p-4"><p className="text-xs font-black uppercase text-[var(--nst-dashboard-muted)]">One Source of Truth</p><p className="mt-2 text-sm text-[var(--nst-dashboard-text)]">CMS admin, preview, public storefront and WYSIWYG editor now read/write the same database-backed content/version service.</p></div><div className="grid gap-3 sm:grid-cols-2"><Metric label="Missing SEO" value={health.missing_seo_count || 0} icon={Search}/><Metric label="Draft Versions" value={health.draft_version_count || 0} icon={FileClock}/></div></div>
      </Panel>

      <Panel title="Draft → Preview → Publish → Rollback" description="Create a page draft, generate isolated preview, publish atomically and restore old versions as draft.">
        <div className="grid gap-3 sm:grid-cols-2"><Input label="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}/><Input label="Route" value={form.route} onChange={e => setForm({ ...form, route: e.target.value })}/><Input label="Meta Title" value={form.meta_title} onChange={e => setForm({ ...form, meta_title: e.target.value })}/><Input label="Meta Description" value={form.meta_description} onChange={e => setForm({ ...form, meta_description: e.target.value })}/><div className="sm:col-span-2"><Textarea label="Page Content" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}/></div></div>
        <div className="mt-4 flex flex-wrap gap-2"><Button busy={saving} onClick={createDraft}><Save size={16}/>Save Draft</Button></div>
      </Panel>
    </div>

    <Panel title="Live WYSIWYG Click-to-Edit" description="The storefront renders data-cms-page-id and data-cms-component-id markers. Selecting a rendered component saves a draft, not live content.">
      <div className="grid gap-3 sm:grid-cols-4"><select className="rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] px-3 py-2.5 text-sm text-[var(--nst-dashboard-text)]" value={componentForm.page_id} onChange={e => setComponentForm({ ...componentForm, page_id: e.target.value })}><option value="">Select page</option>{pages.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select><Input label="Component ID" value={componentForm.component_id} onChange={e => setComponentForm({ ...componentForm, component_id: e.target.value })}/><Input label="Display Name" value={componentForm.display_name} onChange={e => setComponentForm({ ...componentForm, display_name: e.target.value })}/><Input label="Draft Value" value={componentForm.value} onChange={e => setComponentForm({ ...componentForm, value: e.target.value })}/></div>
      <div className="mt-4"><Button tone="soft" onClick={saveComponentDraft}><Code2 size={16}/>Save Component Draft</Button></div>
    </Panel>

    <Panel title="SEO / FAQ Page Control" description="Meta title, meta description, canonical, robots, social image, structured data and FAQ stay page-level editable from POS.">
      <Table rows={pages} columns={[{ key: 'title', label: 'Title' }, { key: 'route', label: 'Route' }, { key: 'page_type', label: 'Type' }, { key: 'status', label: 'Status' }, { key: 'content_hash', label: 'Hash', render: r => String(r.content_hash || '-').slice(0, 10) }, { key: 'actions', label: 'Actions', render: r => <div className="flex gap-2"><Button tone="soft" onClick={() => preview(r)}><MonitorSmartphone size={14}/>Preview</Button><Button tone="soft" onClick={() => publish(r)}><Globe2 size={14}/>Publish</Button><Button tone="danger" onClick={() => rollbackLatest(r)}><RotateCcw size={14}/>Rollback</Button></div> }]}/>
    </Panel>

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Component Registry"><Table rows={components} columns={[{ key: 'component_id', label: 'Component' }, { key: 'component_type', label: 'Type' }, { key: 'display_name', label: 'Name' }, { key: 'page_route', label: 'Page' }]}/></Panel>
      <Panel title="CMS Operation History"><Table rows={ops} columns={[{ key: 'action', label: 'Action' }, { key: 'resource_type', label: 'Resource' }, { key: 'resource_id', label: 'ID' }, { key: 'user_name', label: 'User' }, { key: 'created_at', label: 'Time' }]}/></Panel>
    </div>

    <Panel title="Publication Audit"><Table rows={logs} columns={[{ key: 'action', label: 'Action' }, { key: 'resource_type', label: 'Resource' }, { key: 'resource_id', label: 'ID' }, { key: 'user_name', label: 'User' }, { key: 'environment', label: 'Environment' }, { key: 'created_at', label: 'Time' }]}/></Panel>

    <div className="rounded-3xl border border-[var(--nst-dashboard-border)] bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_8%,transparent)] p-5 text-sm text-[var(--nst-dashboard-muted)]"><ShieldCheck className="mb-2 text-[var(--nst-dashboard-primary)]"/>Completion gate: CMS/storefront one source of truth, live WYSIWYG click-to-edit, Draft → Preview → Publish → Rollback, immutable history, SEO/FAQ, operation audit and public render markers must all pass together.</div>
  </div>;
}
