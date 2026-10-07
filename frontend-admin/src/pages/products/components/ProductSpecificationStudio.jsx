import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, FileInput, Loader2, Plus, Save, Search, Table2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../services/api';

const starterGroups = [
  { name: 'Network', is_visible: true, rows: [{ label: 'Technology', value: '', is_visible: true, is_searchable: true }] },
  { name: 'Launch', is_visible: true, rows: [{ label: 'Announced', value: '', is_visible: true, is_searchable: true }] },
  { name: 'Body', is_visible: true, rows: [{ label: 'Dimensions', value: '', is_visible: true, is_searchable: true }] },
  { name: 'Display', is_visible: true, rows: [{ label: 'Type', value: '', is_visible: true, is_searchable: true }] },
  { name: 'Platform', is_visible: true, rows: [{ label: 'OS', value: '', is_visible: true, is_searchable: true }] },
  { name: 'Memory', is_visible: true, rows: [{ label: 'Internal', value: '', is_visible: true, is_searchable: true }] },
  { name: 'Camera', is_visible: true, rows: [{ label: 'Main Camera', value: '', is_visible: true, is_searchable: true }] },
  { name: 'Battery', is_visible: true, rows: [{ label: 'Type', value: '', is_visible: true, is_searchable: true }] },
];
const blankRow = () => ({ label: '', value: '', is_visible: true, is_searchable: true });
const normalizeGroups = (groups) => (groups || []).map((group) => ({ ...group, is_visible: group.is_visible !== false, rows: (group.rows || []).map((row) => ({ ...row, is_visible: row.is_visible !== false, is_searchable: row.is_searchable !== false })) }));

function Button({ children, busy = false, tone = 'primary', ...props }) {
  const style = tone === 'soft' ? 'border border-slate-200 bg-white text-slate-700' : tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-[var(--nst-dashboard-primary)] text-white';
  return <button type="button" {...props} disabled={busy || props.disabled} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-black disabled:opacity-50 ${style}`}>{busy ? <Loader2 size={15} className="animate-spin"/> : null}{children}</button>;
}

export default function ProductSpecificationStudio({ productId }) {
  const [groups, setGroups] = useState(starterGroups);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('replace');
  const [format, setFormat] = useState('auto');
  const [source, setSource] = useState('');
  const [query, setQuery] = useState('');

  const load = async () => {
    if (!productId) return;
    setBusy(true);
    try {
      const response = await api.get(`/products/${productId}/specifications`);
      const rows = response?.data?.data || [];
      setGroups(rows.length ? normalizeGroups(rows) : starterGroups);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Specification Studio could not load.');
    } finally { setBusy(false); }
  };
  useEffect(() => { load(); }, [productId]);

  const updateGroup = (groupIndex, patch) => setGroups((current) => current.map((group, index) => index === groupIndex ? { ...group, ...patch } : group));
  const updateRow = (groupIndex, rowIndex, patch) => setGroups((current) => current.map((group, index) => index !== groupIndex ? group : { ...group, rows: group.rows.map((row, rIndex) => rIndex === rowIndex ? { ...row, ...patch } : row) }));
  const addGroup = () => setGroups((current) => [...current, { name: 'New Group', is_visible: true, rows: [blankRow()] }]);
  const removeGroup = (index) => setGroups((current) => current.filter((_, groupIndex) => groupIndex !== index));
  const moveGroup = (index, direction) => setGroups((current) => { const target = index + direction; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const addRow = (groupIndex) => updateGroup(groupIndex, { rows: [...groups[groupIndex].rows, blankRow()] });
  const removeRow = (groupIndex, rowIndex) => updateGroup(groupIndex, { rows: groups[groupIndex].rows.filter((_, index) => index !== rowIndex) });

  const save = async () => {
    if (!productId) return toast.error('Save the product first, then open Edit to save structured specifications.');
    const clean = groups.map((group) => ({ ...group, name: group.name.trim(), rows: group.rows.filter((row) => row.label.trim()).map((row) => ({ ...row, label: row.label.trim() })) })).filter((group) => group.name && group.rows.length);
    if (!clean.length) return toast.error('Add at least one specification group and row.');
    setBusy(true);
    try {
      const response = await api.put(`/products/${productId}/specifications`, { mode, groups: clean });
      setGroups(normalizeGroups(response?.data?.data || clean));
      toast.success('Structured specifications saved.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Specifications could not be saved.');
    } finally { setBusy(false); }
  };

  const importSource = async () => {
    if (!productId) return toast.error('Save the product first.');
    if (!source.trim()) return toast.error('Paste GSMArena, Excel, Word, CSV, HTML table or label:value text first.');
    setBusy(true);
    try {
      const response = await api.post(`/products/${productId}/specifications/import`, { source, format, mode });
      setGroups(normalizeGroups(response?.data?.data || []));
      setSource('');
      toast.success('Specifications imported and cleaned.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Specification import failed.');
    } finally { setBusy(false); }
  };

  const extractTables = async (extractMode) => {
    if (!productId) return toast.error('Save the product first.');
    setBusy(true);
    try {
      const response = await api.post(`/products/${productId}/specifications/extract-description-tables`, { mode: extractMode });
      const extracted = response?.data?.data?.groups || [];
      if (extractMode === 'preview') {
        if (!extracted.length) toast('No technical table was found inside Description.');
        else setGroups((current) => [...current, ...normalizeGroups(extracted)]);
      } else {
        await load();
        toast.success('Technical tables moved from Description to grouped Specifications.');
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Description table extraction failed.');
    } finally { setBusy(false); }
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups.map((group) => ({ ...group, rows: group.rows.filter((row) => `${group.name} ${row.label} ${row.value}`.toLowerCase().includes(needle)) })).filter((group) => group.rows.length);
  }, [groups, query]);

  if (!productId) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-800">Create and save the product first. Then open Edit to use GSMArena/Excel/Word import, grouped specifications, Description-table migration and customer preview.</div>;

  return <div className="space-y-5">
    <div className="rounded-2xl border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-[var(--nst-dashboard-primary-soft)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-black text-[var(--nst-dashboard-primary)]">Premium Product Specification Studio</h3><p className="text-sm text-[var(--nst-dashboard-primary)]">GSMArena/Excel/Word import, grouped rows, Merge/Replace, reordering, search and customer-page preview.</p></div><div className="flex gap-2"><select value={mode} onChange={(event) => setMode(event.target.value)} className="rounded-xl border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-white px-3 py-2 text-sm font-bold"><option value="replace">Replace</option><option value="merge">Merge</option></select><Button busy={busy} onClick={save}><Save size={15}/>Save Specifications</Button></div></div></div>

    <div className="grid gap-4 lg:grid-cols-[1fr_auto]"><textarea value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste a GSMArena/Excel/Word table, CSV, HTML or lines such as Display: 6.7 inch..." className="min-h-36 rounded-2xl border border-slate-200 p-4 text-sm"/><div className="flex min-w-48 flex-col gap-2"><select value={format} onChange={(event) => setFormat(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold"><option value="auto">Auto Detect</option><option value="html">HTML Table</option><option value="csv">CSV</option><option value="text">Label: Value Text</option></select><Button busy={busy} onClick={importSource}><FileInput size={15}/>Import</Button><Button busy={busy} tone="soft" onClick={() => extractTables('preview')}><Table2 size={15}/>Preview Description Tables</Button><Button busy={busy} tone="soft" onClick={() => extractTables('move')}><Table2 size={15}/>Move Tables from Description</Button></div></div>

    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-black">Specification Groups</h3><Button tone="soft" onClick={addGroup}><Plus size={15}/>Add Group</Button></div>
    <div className="space-y-4">{groups.map((group, groupIndex) => <section key={`${group.id || group.name}-${groupIndex}`} className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2"><input value={group.name} onChange={(event) => updateGroup(groupIndex, { name: event.target.value })} className="min-w-56 flex-1 rounded-xl border border-slate-200 px-3 py-2 font-black"/><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={group.is_visible !== false} onChange={(event) => updateGroup(groupIndex, { is_visible: event.target.checked })}/>Visible</label><Button tone="soft" onClick={() => moveGroup(groupIndex, -1)}><ArrowUp size={14}/></Button><Button tone="soft" onClick={() => moveGroup(groupIndex, 1)}><ArrowDown size={14}/></Button><Button tone="danger" onClick={() => removeGroup(groupIndex)}><Trash2 size={14}/></Button></div>
      <div className="mt-3 space-y-2">{group.rows.map((row, rowIndex) => <div key={`${row.id || row.label}-${rowIndex}`} className="grid gap-2 md:grid-cols-[220px_1fr_auto_auto_auto]"><input value={row.label} onChange={(event) => updateRow(groupIndex, rowIndex, { label: event.target.value })} placeholder="Display" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"/><textarea value={row.value || ''} onChange={(event) => updateRow(groupIndex, rowIndex, { value: event.target.value })} placeholder="6.7 inch Super Retina XDR" rows={1} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"/><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={row.is_visible !== false} onChange={(event) => updateRow(groupIndex, rowIndex, { is_visible: event.target.checked })}/>Show</label><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={row.is_searchable !== false} onChange={(event) => updateRow(groupIndex, rowIndex, { is_searchable: event.target.checked })}/>Search</label><Button tone="danger" onClick={() => removeRow(groupIndex, rowIndex)}><Trash2 size={14}/></Button></div>)}</div><Button tone="soft" onClick={() => addRow(groupIndex)}><Plus size={14}/>Add Row</Button>
    </section>)}</div>

    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer specification preview" className="w-full bg-transparent text-sm outline-none"/></div></div>
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-lg font-black">Customer Product Details Preview</h3>{filtered.filter((group) => group.is_visible !== false).map((group) => <section key={group.name}><h4 className="rounded-xl bg-slate-100 px-4 py-3 font-black">{group.name}</h4><div>{group.rows.filter((row) => row.is_visible !== false).map((row) => <div key={row.label} className="grid grid-cols-[180px_1fr] gap-4 border-b border-slate-100 px-4 py-3 text-sm"><b>{row.label}</b><span dangerouslySetInnerHTML={{ __html: row.value || '—' }}/></div>)}</div></section>)}</div>
  </div>;
}
