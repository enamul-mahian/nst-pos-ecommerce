import { useEffect, useState } from 'react';
import finalOperationsService from '../../services/finalOperationsService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Rocket as NstHdrRocket } from 'lucide-react';

export default function PatchManagerPage() {
  const [status, setStatus] = useState(null);
  const [runs, setRuns] = useState([]);
  const [file, setFile] = useState(null);
  const [validation, setValidation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [statusResponse, runsResponse] = await Promise.all([finalOperationsService.patchStatus(), finalOperationsService.patchRuns()]);
      setStatus(statusResponse?.data?.data || {});
      setRuns(runsResponse?.data?.data || []);
    } catch (err) { setError(err?.response?.data?.message || 'Patch Manager could not be loaded.'); }
  };
  useEffect(() => { load(); }, []);

  const validate = async () => {
    if (!file) return;
    try { setBusy(true); setError(''); const response = await finalOperationsService.validatePatch(file); setValidation(response?.data?.data || null); setMessage('Preflight validation passed. Review before execution.'); }
    catch (err) { setError(err?.response?.data?.message || 'Patch validation failed.'); }
    finally { setBusy(false); }
  };

  const execute = async () => {
    try { setBusy(true); setError(''); await finalOperationsService.executePatch(validation.validation_token); setValidation(null); setFile(null); setMessage('Patch applied with timestamped backup.'); await load(); }
    catch (err) { setError(err?.response?.data?.message || 'Patch execution failed.'); }
    finally { setBusy(false); }
  };

  const rollback = async (runId) => {
    if (!window.confirm(`Rollback patch run ${runId}?`)) return;
    try { setBusy(true); await finalOperationsService.rollbackPatch(runId); setMessage('Rollback completed.'); await load(); }
    catch (err) { setError(err?.response?.data?.message || 'Rollback failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <NstPageHeader icon={NstHdrRocket} title={<>Patch Manager</>} subtitle={<>SuperAdmin-only checked ZIP upload, checksums, protected-path blocking, backup and rollback.</>}/>
      {message && <Notice ok>{message}</Notice>}{error && <Notice>{error}</Notice>}
      <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
        <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-black">Replacement-only ZIP</h2>
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><p>Mode: {status?.mode || '—'}</p><p>ZIP support: {status?.zip_supported ? 'Yes' : 'No'}</p><p>Protected: {(status?.protected_paths || []).join(', ') || '—'}</p></div>
          <input type="file" accept=".zip,application/zip" onChange={(event) => { setFile(event.target.files?.[0] || null); setValidation(null); }} className="w-full rounded-xl border p-3" />
          <button disabled={!file || busy} onClick={validate} className="w-full rounded-xl border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] px-4 py-3 font-black text-[var(--nst-dashboard-primary)] disabled:opacity-50">Validate ZIP</button>
          {validation && <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"><p className="font-black">Preflight passed</p><p>Patch: {validation.patch_id}</p><p>Files: {validation.file_count}</p><button disabled={busy} onClick={execute} className="mt-3 w-full rounded-xl bg-[var(--nst-dashboard-primary)] px-4 py-3 font-black text-white">Apply Patch</button></div>}
        </section>
        <section className="overflow-auto rounded-2xl border bg-white shadow-sm"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="bg-slate-50"><th className="p-3">Run</th><th className="p-3">Patch</th><th className="p-3">Applied At</th><th className="p-3">Files</th><th className="p-3">Rollback</th></tr></thead><tbody>{runs.map((run) => <tr key={run.run_id} className="border-t"><td className="p-3 font-bold">{run.run_id}</td><td className="p-3">{run.patch_id}</td><td className="p-3">{run.applied_at}</td><td className="p-3">{run.files?.length || 0}</td><td className="p-3">{run.rolled_back_at ? <span className="text-slate-400">Rolled back</span> : <button disabled={busy} onClick={() => rollback(run.run_id)} className="font-bold text-red-600">Rollback</button>}</td></tr>)}</tbody></table></section>
      </div>
    </div>
  );
}
function Notice({ ok, children }) { return <div className={`rounded-xl border px-4 py-3 text-sm ${ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{children}</div>; }
