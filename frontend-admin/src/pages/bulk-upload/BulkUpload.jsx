import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, History, Loader2, Save, Upload, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { useT } from '../../i18n';
import { Upload as NstHdrUpload } from 'lucide-react';

const dataOf = (response) => response?.data?.data ?? response?.data ?? {};
const pill = 'rounded-full border px-3 py-1 text-xs font-black';

function Button({ children, busy = false, tone = 'primary', ...props }) {
  const styles = tone === 'soft'
    ? 'border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] text-[var(--nst-dashboard-text)]'
    : tone === 'danger'
      ? 'bg-red-600 text-white'
      : 'bg-[var(--nst-dashboard-primary)] text-white';
  return <button type="button" {...props} disabled={busy || props.disabled} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}>{busy ? <Loader2 size={16} className="animate-spin"/> : null}{children}</button>;
}

export default function BulkUpload() {
  const t = useT();
  const [modules, setModules] = useState([]);
  const [moduleKey, setModuleKey] = useState('suppliers');
  const [selectedFields, setSelectedFields] = useState([]);
  const [defaults, setDefaults] = useState({});
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const currentModule = useMemo(() => modules.find((item) => item.key === moduleKey) || null, [modules, moduleKey]);
  const availableFields = useMemo(() => (currentModule?.fields || []).filter((field) => field.available), [currentModule]);
  const requiredFields = useMemo(() => availableFields.filter((field) => field.required).map((field) => field.key), [availableFields]);

  const load = async () => {
    setBusy(true);
    try {
      const [moduleResponse, templateResponse, historyResponse] = await Promise.all([
        api.get('/bulk-import-studio/modules'),
        api.get('/bulk-import-studio/templates', { params: { module_key: moduleKey } }),
        api.get('/bulk-import-studio/history', { params: { module_key: moduleKey, per_page: 20 } }),
      ]);
      const moduleRows = dataOf(moduleResponse) || [];
      setModules(moduleRows);
      const active = moduleRows.find((item) => item.key === moduleKey) || moduleRows.find((item) => item.available);
      if (active && active.key !== moduleKey) setModuleKey(active.key);
      const fields = (active?.fields || []).filter((field) => field.available);
      setSelectedFields((current) => current.length ? current.filter((key) => fields.some((field) => field.key === key)) : fields.map((field) => field.key));
      setTemplates(dataOf(templateResponse) || []);
      const historyPayload = dataOf(historyResponse);
      setHistory(historyPayload?.data || historyPayload || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Bulk Import Studio could not load.');
    } finally { setBusy(false); }
  };

  useEffect(() => { load(); }, [moduleKey]);

  const toggleField = (field) => {
    if (field.required) return;
    setSelectedFields((current) => current.includes(field.key) ? current.filter((key) => key !== field.key) : [...current, field.key]);
  };

  const applyTemplate = (templateId) => {
    setSelectedTemplateId(templateId);
    const selected = templates.find((template) => String(template.id) === String(templateId));
    if (!selected) return;
    setSelectedFields(Array.from(new Set([...(selected.columns || []), ...requiredFields])));
    setDefaults(selected.defaults || {});
    setTemplateName(selected.name || '');
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return toast.error('Template name is required.');
    if (!selectedFields.length) return toast.error('Select at least one field.');
    setBusy(true);
    try {
      await api.post('/bulk-import-studio/templates', {
        id: selectedTemplateId ? Number(selectedTemplateId) : null,
        name: templateName.trim(),
        module_key: moduleKey,
        columns: selectedFields,
        defaults,
      });
      toast.success('Import template saved.');
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Template could not be saved.');
    } finally { setBusy(false); }
  };

  const downloadTemplate = async () => {
    setBusy(true);
    try {
      const response = await api.get(`/bulk-import-studio/template/${moduleKey}`, {
        params: { columns: selectedFields.join(',') },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${moduleKey}_custom_template.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'CSV template could not be generated.');
    } finally { setBusy(false); }
  };

  const previewImport = async () => {
    if (!file) return toast.error('Select a CSV file first.');
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('mapping', JSON.stringify({}));
      form.append('defaults', JSON.stringify(defaults));
      if (selectedTemplateId) form.append('template_id', selectedTemplateId);
      const response = await api.post(`/bulk-import-studio/preview/${moduleKey}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(dataOf(response));
      toast.success('Preview complete. No data has been imported yet.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'CSV preview failed.');
    } finally { setBusy(false); }
  };

  const commitImport = async () => {
    if (!preview?.history_id) return;
    setBusy(true);
    try {
      const response = await api.post(`/bulk-import-studio/commit/${preview.history_id}`);
      const result = dataOf(response);
      toast.success(`Import complete: ${result.successful || 0} successful, ${result.failed || 0} failed.`);
      setPreview(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Import could not be committed.');
    } finally { setBusy(false); }
  };

  return <main className="min-h-full bg-[var(--nst-dashboard-bg)] p-4 text-[var(--nst-dashboard-text)] md:p-7">
    <div className="mx-auto max-w-[1600px] space-y-5">
      <NstPageHeader icon={NstHdrUpload} title={t('bulk_upload.title')} subtitle={t('bulk_upload.subtitle')} actions={<><span className={`${pill} border-emerald-300 bg-emerald-50 text-emerald-700`}>{t('bulk_upload.preview_before_commit')}</span></>}/>

      <section className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <aside className="space-y-4 rounded-3xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5 shadow-[var(--nst-dashboard-shadow)]">
          <label className="block text-xs font-black uppercase text-[var(--nst-dashboard-muted)]">1. Module/Table
            <select value={moduleKey} onChange={(event) => { setModuleKey(event.target.value); setPreview(null); setSelectedTemplateId(''); }} className="mt-2 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-3 text-sm font-bold">
              {modules.map((module) => <option key={module.key} value={module.key} disabled={!module.available}>{module.label}{module.available ? '' : ' (Unavailable)'}</option>)}
            </select>
          </label>
          <div><p className="text-xs font-black uppercase text-[var(--nst-dashboard-muted)]">Saved Templates</p><select value={selectedTemplateId} onChange={(event) => applyTemplate(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-3 text-sm"><option value="">Custom selection</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></div>
          <label className="block text-xs font-black uppercase text-[var(--nst-dashboard-muted)]">Template Name<input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Supplier Basic Import" className="mt-2 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-3 text-sm normal-case"/></label>
          <div className="flex flex-wrap gap-2"><Button busy={busy} tone="soft" onClick={saveTemplate}><Save size={16}/>Save</Button><Button busy={busy} onClick={downloadTemplate}><Download size={16}/>CSV</Button></div>
        </aside>

        <div className="space-y-5">
          <section className="rounded-3xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5 shadow-[var(--nst-dashboard-shadow)]">
            <h2 className="text-lg font-black">2. Choose Fields</h2><p className="mt-1 text-sm text-[var(--nst-dashboard-muted)]">Required fields remain selected. Optional fields may be included, ignored or supplied with a default value.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{availableFields.map((field) => <article key={field.key} className={`rounded-2xl border p-4 ${selectedFields.includes(field.key) ? 'border-[var(--nst-dashboard-primary)] bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_7%,transparent)]' : 'border-[var(--nst-dashboard-border)]'}`}>
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={selectedFields.includes(field.key)} disabled={field.required} onChange={() => toggleField(field)} className="mt-1"/><span><b className="block">{field.label}</b><small className="text-[var(--nst-dashboard-muted)]">{field.required ? 'Required' : 'Optional'} · {field.key}</small></span></label>
              <input value={defaults[field.key] || ''} onChange={(event) => setDefaults((current) => ({ ...current, [field.key]: event.target.value }))} placeholder="Default value (optional)" className="mt-3 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] px-3 py-2 text-xs"/>
            </article>)}</div>
          </section>

          <section className="rounded-3xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5 shadow-[var(--nst-dashboard-shadow)]">
            <h2 className="text-lg font-black">3. Upload and Validate</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]"><label className="rounded-2xl border border-dashed border-[var(--nst-dashboard-border)] p-5"><span className="flex items-center gap-2 font-black"><FileSpreadsheet size={18}/>CSV file</span><input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); }} className="mt-3 block w-full text-sm"/><small className="mt-2 block text-[var(--nst-dashboard-muted)]">Maximum 10 MB. Data is not imported until you confirm after preview.</small></label><Button busy={busy} onClick={previewImport}><Upload size={16}/>Preview & Validate</Button></div>
          </section>

          {preview && <section className="rounded-3xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5 shadow-[var(--nst-dashboard-shadow)]">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">4. Preview Result</h2><p className="text-sm text-[var(--nst-dashboard-muted)]">Review row errors and duplicate warnings before final import.</p></div><Button busy={busy} disabled={(preview.summary?.valid || 0) < 1} onClick={commitImport}><CheckCircle2 size={16}/>Commit Valid Rows</Button></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">{Object.entries(preview.summary || {}).map(([key, value]) => <div key={key} className="rounded-2xl border border-[var(--nst-dashboard-border)] p-4"><p className="text-xs font-black uppercase text-[var(--nst-dashboard-muted)]">{key}</p><p className="mt-1 text-2xl font-black">{String(value)}</p></div>)}</div>
            <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-[var(--nst-dashboard-border)]"><table className="min-w-full text-left text-xs"><thead className="sticky top-0 bg-[var(--nst-dashboard-surface)]"><tr><th className="p-3">Row</th><th className="p-3">Status</th><th className="p-3">Data</th><th className="p-3">Reason</th></tr></thead><tbody>{(preview.rows || []).map((row) => <tr key={row.row_number} className="border-t border-[var(--nst-dashboard-border)]"><td className="p-3 font-black">{row.row_number}</td><td className="p-3">{row.errors?.length ? <span className="inline-flex items-center gap-1 text-red-600"><XCircle size={14}/>Failed</span> : row.duplicate ? <span className="text-amber-600">Duplicate</span> : <span className="text-emerald-600">Valid</span>}</td><td className="p-3 font-mono">{JSON.stringify(row.data)}</td><td className="p-3 text-red-600">{row.errors?.join(' ') || (row.duplicate ? `${row.duplicate.field}: ${row.duplicate.value}` : '—')}</td></tr>)}</tbody></table></div>
          </section>}
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5 shadow-[var(--nst-dashboard-shadow)]"><div className="flex items-center gap-2"><History size={18}/><h2 className="text-lg font-black">Import History</h2></div><div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--nst-dashboard-border)]"><table className="min-w-full text-left text-sm"><thead><tr>{['File','Module','Status','Total','Success','Skipped','Duplicate','Failed','Date'].map((title) => <th key={title} className="p-3 text-xs font-black uppercase">{title}</th>)}</tr></thead><tbody>{history.map((row) => <tr key={row.id} className="border-t border-[var(--nst-dashboard-border)]"><td className="p-3">{row.filename}</td><td className="p-3">{row.module_key}</td><td className="p-3">{row.status}</td><td className="p-3">{row.total_rows}</td><td className="p-3">{row.success_rows}</td><td className="p-3">{row.skipped_rows}</td><td className="p-3">{row.duplicate_rows}</td><td className="p-3">{row.failed_rows}</td><td className="p-3">{row.created_at}</td></tr>)}</tbody></table>{!history.length && <div className="p-8 text-center text-sm text-[var(--nst-dashboard-muted)]">No import history found.</div>}</div></section>
    </div>
  </main>;
}
