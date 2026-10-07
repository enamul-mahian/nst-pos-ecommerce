import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, Eye, Palette, RotateCcw, Save, Undo2, Redo2, X, History } from 'lucide-react';
import { applyDashboardTheme, cacheDashboardTheme, dashboardThemes, defaultDashboardTheme, normalizeDashboardTheme, updateCustomDashboardTheme } from '../../theme/dashboardThemes';
import corporateOpsService from '../../services/corporateOpsService';

const ROLES = ['super_admin','admin','accountant','branch_manager','salesman','customer_support','marketing','inventory','reports'];

export default function DashboardThemeControl({ enabled, branches = [] }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(defaultDashboardTheme);
  const [published, setPublished] = useState(defaultDashboardTheme);
  const [draftVersionId, setDraftVersionId] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [page, setPage] = useState(0);
  const [available, setAvailable] = useState(() => dashboardThemes.map(t => t.id));
  const [roles, setRoles] = useState([]);
  const [branchIds, setBranchIds] = useState([]);
  const [userIds, setUserIds] = useState([]);
  const [userIdInput, setUserIdInput] = useState('');
  const [historyRows, setHistoryRows] = useState([]);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historyDetail, setHistoryDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const history = useRef([defaultDashboardTheme]);
  const pointer = useRef(0);
  const perPage = 12;

  const loadManagement = async () => {
    if (!enabled) return;
    try {
      const response = await corporateOpsService.getDashboardThemeManagement();
      const data = response?.data?.data || response?.data || {};
      const savedDraft = data.draft;
      const savedPublished = data.published;
      if (savedPublished?.theme) {
        const theme = normalizeDashboardTheme(savedPublished.theme);
        setPublished(theme);
        cacheDashboardTheme(theme);
        applyDashboardTheme(theme);
      }
      const editableBase = savedDraft?.theme ? savedDraft : savedPublished;
      if (editableBase?.theme) {
        const theme = normalizeDashboardTheme(editableBase.theme);
        setDraft(theme);
        setDraftVersionId(savedDraft?.id || null);
        history.current = [theme]; pointer.current = 0;
        setAvailable(editableBase.available_theme_ids?.length ? editableBase.available_theme_ids : dashboardThemes.map(t => t.id));
        setRoles((editableBase.assignments || []).filter(a => a.assignable_type === 'role').map(a => a.assignable_key));
        setUserIds((editableBase.assignments || []).filter(a => a.assignable_type === 'user').map(a => String(a.assignable_key)));
        setUserIdInput((editableBase.assignments || []).filter(a => a.assignable_type === 'user').map(a => String(a.assignable_key)).join(', '));
        setBranchIds([...new Set((editableBase.assignments || []).map(a => a.branch_id).filter(Boolean).map(String))]);
      }
      setHistoryRows(data.history || []);
    } catch { setMessage('Theme management data could not be loaded.'); }
  };

  useEffect(() => { loadManagement(); }, [enabled]);
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => { if (event.key === 'Escape') { stopPreview(); setOpen(false); } };
    window.addEventListener('keydown', closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', closeOnEscape); };
  }, [open, previewing, published]);

  const visible = useMemo(() => dashboardThemes.slice(page * perPage, page * perPage + perPage), [page]);
  const pages = Math.ceil(dashboardThemes.length / perPage);
  const filteredHistory = useMemo(() => historyRows.filter(row => row.status === 'published' && (historyFilter === 'all' || (historyFilter === 'global' ? row.is_global : !row.is_global))), [historyRows, historyFilter]);
  if (!enabled) return null;

  const commit = (next) => {
    const resolved = normalizeDashboardTheme(next);
    history.current = history.current.slice(0, pointer.current + 1);
    history.current.push(resolved); pointer.current = history.current.length - 1;
    setDraft(resolved); if (previewing) applyDashboardTheme(resolved);
  };
  const travel = (direction) => {
    const next = Math.max(0, Math.min(history.current.length - 1, pointer.current + direction));
    pointer.current = next; setDraft(history.current[next]); if (previewing) applyDashboardTheme(history.current[next]);
  };
  const preview = () => { setPreviewing(true); applyDashboardTheme(draft); };
  const stopPreview = () => { setPreviewing(false); applyDashboardTheme(published); };
  const reset = () => commit(defaultDashboardTheme);
  const toggle = (list, value, setter) => setter(list.includes(value) ? list.filter(x => x !== value) : [...list, value]);

  const assignmentPayload = () => {
    const selectedBranches = branchIds.length ? branchIds : [null];
    const cleanUserIds = [...new Set(userIds.map(String).map(value => value.trim()).filter(value => /^\d+$/.test(value)))];
    const rows = [
      ...roles.flatMap(role => selectedBranches.map(branchId => ({ assignable_type:'role', assignable_key:role, branch_id:branchId, enabled:true }))),
      ...cleanUserIds.flatMap(userId => selectedBranches.map(branchId => ({ assignable_type:'user', assignable_key:userId, branch_id:branchId, enabled:true }))),
    ];
    return rows.length ? rows : selectedBranches.map(branchId => ({ assignable_type:'all', assignable_key:'all', branch_id:branchId, enabled:true }));
  };

  const updateUserIds = (value) => {
    setUserIdInput(value);
    setUserIds([...new Set(value.split(/[\s,]+/).map(item => item.trim()).filter(item => /^\d+$/.test(item)))]);
  };

  const assignmentLabel = (row) => {
    const assignments = row.assignments || [];
    if (!assignments.length || row.is_global) return 'All roles · All branches';
    return assignments.map(item => `${item.assignable_type}:${item.assignable_key}${item.branch_id ? `@branch-${item.branch_id}` : ''}`).join(', ');
  };

  const saveDraft = async () => {
    setBusy(true); setMessage('');
    try {
      const response = await corporateOpsService.saveDashboardThemeDraft({ theme:draft, available_theme_ids:available, assignments:assignmentPayload() });
      const row = response?.data?.data || response?.data;
      setDraftVersionId(row?.id || null); setMessage('Draft saved to the central database.'); await loadManagement();
    } catch (error) { setMessage(error?.response?.data?.message || error?.message || 'Draft save failed.'); }
    finally { setBusy(false); }
  };

  const publish = async () => {
    setBusy(true); setMessage('');
    try {
      const draftResponse = await corporateOpsService.saveDashboardThemeDraft({
        theme: draft,
        available_theme_ids: available,
        assignments: assignmentPayload(),
      });
      const versionId = (draftResponse?.data?.data || draftResponse?.data)?.id;
      if (!versionId) throw new Error('The latest draft could not be prepared for publishing.');
      const response = await corporateOpsService.publishDashboardTheme(versionId);
      const row = response?.data?.data || response?.data;
      const theme = normalizeDashboardTheme(row.theme || draft);
      setPublished(theme); setDraft(theme); setPreviewing(false); cacheDashboardTheme(theme); applyDashboardTheme(theme); setDraftVersionId(null);
      setMessage('Theme published for assigned roles and branches.'); await loadManagement();
    } catch (error) { setMessage(error?.response?.data?.message || error?.message || 'Publish failed.'); }
    finally { setBusy(false); }
  };

  const rollback = async (id) => {
    setBusy(true); setMessage('');
    try {
      const response = await corporateOpsService.rollbackDashboardTheme(id);
      const row = response?.data?.data || response?.data;
      const theme = normalizeDashboardTheme(row.theme);
      setPublished(theme); setDraft(theme); cacheDashboardTheme(theme); applyDashboardTheme(theme); setMessage('Selected version restored and published.'); await loadManagement();
    } catch (error) { setMessage(error?.response?.data?.message || error?.message || 'Restore failed.'); }
    finally { setBusy(false); }
  };

  return <>
    <button type="button" onClick={() => { setOpen(true); loadManagement(); }} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] px-4 py-3 text-sm font-black text-[var(--nst-dashboard-text)] shadow-sm transition hover:-translate-y-0.5"><Palette size={17}/> Themes <span className="rounded-full bg-[var(--nst-dashboard-primary)] px-2 py-0.5 text-[10px] text-white">99</span></button>
    {open ? createPortal(<div className="nst-theme-modal fixed inset-0 z-[99999] flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-md md:items-center md:p-5" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) { stopPreview(); setOpen(false); } }}>
      <div className="max-h-[94vh] w-full overflow-auto rounded-t-[2rem] border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-5 text-[var(--nst-dashboard-text)] shadow-[var(--nst-dashboard-shadow)] md:max-w-6xl md:rounded-[2rem] md:p-7">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[var(--nst-dashboard-primary)]">Dashboard Theme Control</p><h2 className="mt-1 text-2xl font-black text-[var(--nst-dashboard-text)]">99 themes, assignments and publishing</h2><p className="mt-2 text-sm text-[var(--nst-dashboard-muted)]">Drafts, publishing and restore history are stored centrally.</p></div><button onClick={() => { stopPreview(); setOpen(false); }} className="rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-2 text-[var(--nst-dashboard-text)]"><X/></button></div>
        {message ? <div className="mt-4 rounded-xl bg-[var(--nst-dashboard-primary-soft)] px-4 py-3 text-sm font-bold text-[var(--nst-dashboard-text)]">{message}</div> : null}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map(theme => <div key={theme.id} data-nst-selected={draft.id === theme.id ? 'true' : 'false'} className={`rounded-2xl border p-3 transition ${draft.id === theme.id ? 'border-[var(--nst-dashboard-selected-border)] bg-[var(--nst-dashboard-selected)] ring-4 ring-[var(--nst-dashboard-focus-ring)]' : 'border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)]'}`}>
            <button onClick={() => { if (available.includes(theme.id)) { commit(theme); setPreviewing(true); applyDashboardTheme(theme); } }} disabled={!available.includes(theme.id)} className="w-full text-left disabled:opacity-35"><div className="flex h-16 overflow-hidden rounded-xl border border-black/5" style={{background: theme.background}}><span className="w-1/3" style={{background: theme.primary}}/><span className="m-2 flex-1 rounded-lg" style={{background: theme.surface}}/></div><div className="mt-2 flex items-center justify-between"><span className="text-xs font-black text-[var(--nst-dashboard-text)]">{theme.name}</span>{draft.id === theme.id ? <Check size={15} className="text-[var(--nst-dashboard-primary)]"/> : null}</div></button>
            <label data-nst-choice="true" data-nst-selected={available.includes(theme.id) ? 'true' : 'false'} className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-input)] px-2 py-1.5 text-[11px] font-bold text-[var(--nst-dashboard-muted)]"><input type="checkbox" checked={available.includes(theme.id)} onChange={() => toggle(available,theme.id,setAvailable)}/> Available</label>
          </div>)}
        </div>
        <div className="mt-4 flex items-center justify-between"><button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="rounded-xl border p-2 disabled:opacity-30"><ChevronLeft/></button><span className="text-xs font-black text-[var(--nst-dashboard-muted)]">{page + 1} / {pages}</span><button disabled={page === pages - 1} onClick={() => setPage(p => p + 1)} className="rounded-xl border p-2 disabled:opacity-30"><ChevronRight/></button></div>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-4"><h3 className="font-black text-[var(--nst-dashboard-text)]">Custom Theme</h3><div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">{[['primary','Primary'],['accent','Accent'],['background','Background'],['surface','Cards'],['text','Text']].map(([key,label]) => <label key={key} className="text-xs font-bold text-[var(--nst-dashboard-muted)]"><span className="flex items-center justify-between gap-2"><span>{label}</span><code className="text-[9px] font-black uppercase text-[var(--nst-dashboard-text)]">{draft[key]}</code></span><input type="color" value={draft[key]} onChange={e => commit(updateCustomDashboardTheme(draft, key, e.target.value))} className="mt-1 h-11 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-1"/></label>)}</div></section>
          <section className="rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-4"><h3 className="font-black text-[var(--nst-dashboard-text)]">Role, User and Branch Assignment</h3><div className="mt-3 flex flex-wrap gap-2">{ROLES.map(role => <label key={role} data-nst-choice="true" data-nst-selected={roles.includes(role) ? 'true' : 'false'} className="rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-input)] px-3 py-2 text-xs font-bold text-[var(--nst-dashboard-text)]"><input type="checkbox" className="mr-2" checked={roles.includes(role)} onChange={() => toggle(roles,role,setRoles)}/>{role.replaceAll('_',' ')}</label>)}</div><label className="mt-3 block text-xs font-bold text-[var(--nst-dashboard-muted)]">Individual User IDs<input value={userIdInput} onChange={e => updateUserIds(e.target.value)} inputMode="numeric" placeholder="Example: 2, 7, 15" className="mt-1 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] px-3 py-2 text-sm text-[var(--nst-dashboard-text)]"/></label><div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-auto">{branches.map(branch => <label key={branch.id} data-nst-choice="true" data-nst-selected={branchIds.includes(String(branch.id)) ? 'true' : 'false'} className="rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-input)] px-3 py-2 text-xs font-bold text-[var(--nst-dashboard-text)]"><input type="checkbox" className="mr-2" checked={branchIds.includes(String(branch.id))} onChange={() => toggle(branchIds,String(branch.id),setBranchIds)}/>{branch.name}</label>)}</div><p className="mt-3 text-xs text-[var(--nst-dashboard-muted)]">No role or user selection means all users. No branch selection means every branch.</p></section>
        </div>
        <section className="mt-6 rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 font-black"><History size={18}/> Publish & Audit History</div><select value={historyFilter} onChange={e => setHistoryFilter(e.target.value)} className="nst-state-control rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-input)] px-3 py-2 text-xs font-bold text-[var(--nst-dashboard-text)]"><option value="all">All scopes</option><option value="global">Global</option><option value="targeted">Targeted</option></select></div><div className="mt-3 max-h-64 divide-y overflow-auto">{filteredHistory.map(row => <div key={row.id} className="grid gap-2 py-3 text-xs md:grid-cols-[1fr_auto]"><button type="button" data-nst-selected={historyDetail?.id === row.id ? 'true' : 'false'} onClick={() => setHistoryDetail(historyDetail?.id === row.id ? null : row)} className="rounded-xl border border-transparent p-2 text-left transition"><span className="font-black text-[var(--nst-dashboard-text)]">{row.theme?.name || 'Theme'}</span><span className="ml-2 rounded-full border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] px-2 py-1 font-bold">{row.is_global ? 'Global' : 'Targeted'}</span><p className="mt-1 text-[var(--nst-dashboard-muted)]">{assignmentLabel(row)}</p><p className="mt-1 text-[var(--nst-dashboard-muted)]">{row.audit?.user_name || 'System'} · {row.audit?.roles?.join(', ') || 'Role unavailable'} · {row.published_at || row.created_at || ''}</p></button><button disabled={busy || row.is_current_scope} onClick={() => rollback(row.id)} className="self-start rounded-lg border border-[var(--nst-dashboard-selected-border)] bg-[var(--nst-dashboard-primary-soft)] px-3 py-1.5 font-bold text-[var(--nst-dashboard-primary)] transition hover:bg-[var(--nst-dashboard-hover)] disabled:border-[var(--nst-dashboard-border)] disabled:bg-[var(--nst-dashboard-input)] disabled:text-[var(--nst-dashboard-muted)] disabled:opacity-60">{row.is_current_scope ? 'Current' : 'Restore'}</button>{historyDetail?.id === row.id ? <div className="rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-3 md:col-span-2"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><span><b>Branch:</b> {row.audit?.branch_id || 'Global'}</span><span><b>IP:</b> {row.audit?.ip_address || 'Unavailable'}</span><span><b>Action:</b> {row.audit?.action || 'Published'}</span><span><b>Rollback:</b> {row.audit?.rollback_available ? 'Available' : 'Unavailable'}</span></div><p className="mt-2 break-words text-[var(--nst-dashboard-muted)]"><b>Browser:</b> {row.audit?.user_agent || 'Unavailable'}</p></div> : null}</div>)}</div></section>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2"><button onClick={() => travel(-1)} className="rounded-xl border p-3" title="Undo"><Undo2 size={18}/></button><button onClick={() => travel(1)} className="rounded-xl border p-3" title="Redo"><Redo2 size={18}/></button><button onClick={reset} className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-black"><RotateCcw size={17}/> Reset</button></div><div className="flex flex-wrap gap-2">{previewing ? <button onClick={stopPreview} className="rounded-xl border px-4 py-3 text-sm font-black">Exit Preview</button> : <button onClick={preview} className="inline-flex items-center gap-2 rounded-xl bg-[var(--nst-dashboard-primary)] px-4 py-3 text-sm font-black text-white"><Eye size={17}/> Preview</button>}<button disabled={busy} onClick={saveDraft} className="inline-flex items-center gap-2 rounded-xl border border-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-black text-[var(--nst-dashboard-primary)] disabled:opacity-50"><Save size={17}/> Save Draft</button><button disabled={busy} onClick={publish} className="inline-flex items-center gap-2 rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={17}/> Publish</button></div></div>
      </div>
    </div>, document.body) : null}
  </>;
}
