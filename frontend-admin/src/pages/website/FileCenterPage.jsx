import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Download,
  ExternalLink,
  FilePlus2,
  FileText,
  Image,
  Link2,
  Package,
  Pencil,
  Save,
  UploadCloud,
  X,
} from 'lucide-react';
import api from '../../services/api';
import { NstPageHeader } from '../../components/ui/nst-page-header';

const blank = {
  title: '',
  description: '',
  category: 'general',
  external_url: '',
  icon_url: '',
  version: '',
  changelog: '',
  checksum: '',
  status: 'draft',
  file: null,
};

const CATEGORY_OPTIONS = [
  ['general', 'General'],
  ['apk', 'APK / Mobile App'],
  ['manual', 'Manual / Guide'],
  ['document', 'Document'],
  ['software', 'Software Package'],
  ['firmware', 'Firmware'],
  ['image', 'Image / Media'],
  ['other', 'Other'],
];

const unwrap = (response) => response?.data?.data || response?.data || [];

function FieldLabel({ label, hint, required, children, className = '' }) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="flex items-center gap-1 text-xs font-black uppercase tracking-[0.08em] text-slate-600">
        {label}
        {required ? <span className="text-rose-500">*</span> : null}
      </span>
      {children}
      {hint ? <span className="block text-xs font-medium leading-5 text-slate-400">{hint}</span> : null}
    </label>
  );
}

function StatusBadge({ value }) {
  const published = value === 'published';
  const archived = value === 'archived';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black ${
      published
        ? 'bg-emerald-50 text-emerald-700'
        : archived
          ? 'bg-slate-100 text-slate-500'
          : 'bg-amber-50 text-amber-700'
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${published ? 'bg-emerald-500' : archived ? 'bg-slate-400' : 'bg-amber-500'}`} />
      {value || 'draft'}
    </span>
  );
}

export default function FileCenterPage() {
  const [files, setFiles] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [sourceMode, setSourceMode] = useState('upload');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const visibleFiles = useMemo(() => (Array.isArray(files) ? files : []), [files]);

  const load = async () => {
    try {
      const result = unwrap(await api.get('/downloads/files'));
      setFiles(Array.isArray(result) ? result : []);
      setError('');
    } catch (e) {
      setError(e?.response?.data?.message || 'File Center could not be loaded.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setEditing(null);
    setForm(blank);
    setSourceMode('upload');
    setMessage('');
    setError('');
  };

  const save = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');

    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!editing && sourceMode === 'upload' && !form.file) {
      setError('Choose a file to upload, or switch to External URL.');
      return;
    }
    if (sourceMode === 'external' && !form.external_url) {
      setError('External URL is required when External URL is selected.');
      return;
    }

    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (key === 'file' && sourceMode !== 'upload') return;
      if (key === 'external_url' && sourceMode !== 'external') return;
      if (value !== null && value !== '') data.append(key, value);
    });

    try {
      if (editing) {
        await api.post(`/downloads/files/${editing}?_method=PUT`, data);
      } else {
        await api.post('/downloads/files', data);
      }
      setMessage(editing ? 'File updated successfully.' : 'File added successfully.');
      setForm(blank);
      setEditing(null);
      setSourceMode('upload');
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || 'File could not be saved.');
    }
  };

  const edit = (file) => {
    setEditing(file.id);
    setSourceMode(file.external_url ? 'external' : 'upload');
    setForm({
      ...blank,
      ...file,
      external_url: file.external_url || '',
      icon_url: file.icon_url || '',
      version: file.version || '',
      changelog: file.changelog || '',
      checksum: file.checksum || '',
      file: null,
    });
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeForever = async (file) => {
    if (!window.confirm(`Delete "${file.title}" permanently? The file and its download link will be removed. This cannot be undone.`)) return;
    try {
      await api.delete(`/downloads/files/${file.id}/permanent`);
      await load();
    } catch (error) {
      window.alert(error?.response?.data?.message || 'Delete failed. Please try again.');
    }
  };
  const archive = async (file) => {
    if (!window.confirm(`Archive "${file.title}"? The file will disappear from customer downloads.`)) return;
    try {
      await api.delete(`/downloads/files/${file.id}`);
      setMessage(`"${file.title}" archived.`);
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || 'File could not be archived.');
    }
  };

  const selectedFileName = form.file?.name || (editing && sourceMode === 'upload' ? 'Keep current uploaded file' : 'No file selected');

  return (
    <div className="nst-file-center space-y-5 p-4 md:p-6">
      <NstPageHeader actions={<><div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">
            <FileText size={17} className="text-emerald-700" />
            {visibleFiles.length} total files
          </div></>} icon={Download} title={<>File Center</>} subtitle={<>Publish APK, PDF, ZIP, documents, images, manuals and software packages for the customer Downloads page.
              </>}/>

      {message ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>
      ) : null}

      <form onSubmit={save} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-black text-slate-900">
              <FilePlus2 size={18} className="text-emerald-700" />
              {editing ? 'Edit file' : 'Add a new file'}
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Fields marked with * are required. Choose either an uploaded file or an external URL.
            </p>
          </div>
          {editing ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
            >
              <X size={15} />
              Cancel edit
            </button>
          ) : null}
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldLabel label="Title" required hint="Customer-facing file name, e.g. NST Android App or Warranty Guide.">
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. NST Android App"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                />
              </FieldLabel>

              <FieldLabel label="Category" hint="Used for grouping files on /downloads.">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                >
                  {CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </FieldLabel>
            </div>

            <FieldLabel label="Description" hint="Short explanation shown to customers before they download.">
              <textarea
                rows={4}
                value={form.description || ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What is this file and who should download it?"
                className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              />
            </FieldLabel>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-600">File source *</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSourceMode('upload')}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left ${
                    sourceMode === 'upload'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <UploadCloud size={20} />
                  <span><b className="block text-sm">Upload file</b><small className="text-xs font-medium">Store the file in NST</small></span>
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode('external')}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left ${
                    sourceMode === 'external'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <Link2 size={20} />
                  <span><b className="block text-sm">External URL</b><small className="text-xs font-medium">Redirect to another website</small></span>
                </button>
              </div>

              {sourceMode === 'upload' ? (
                <div className="mt-4">
                  <FieldLabel label="Choose file" hint="APK, PDF, ZIP, DOC/DOCX, XLS/XLSX, image, TXT or MP4. Maximum 500 MB.">
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4 hover:border-emerald-400 hover:bg-emerald-50/40">
                      <span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><UploadCloud size={20} /></span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-sm text-slate-800">{selectedFileName}</b>
                        <small className="text-xs font-medium text-slate-400">Click to browse from this computer</small>
                      </span>
                      <input
                        type="file"
                        onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
                        className="sr-only"
                      />
                    </label>
                  </FieldLabel>
                </div>
              ) : (
                <div className="mt-4">
                  <FieldLabel label="External URL" required hint="Full https:// URL. Customers will be redirected here when they click Download.">
                    <div className="relative">
                      <ExternalLink size={17} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                      <input
                        type="url"
                        value={form.external_url || ''}
                        onChange={(e) => setForm({ ...form, external_url: e.target.value })}
                        placeholder="https://example.com/file.zip"
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                      />
                    </div>
                  </FieldLabel>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2">
              <Package size={18} className="text-emerald-700" />
              <h3 className="text-sm font-black text-slate-900">Publishing details</h3>
            </div>

            <FieldLabel label="Status" hint="Draft stays in Admin. Published appears on /downloads.">
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500"
              >
                <option value="draft">Draft — Admin only</option>
                <option value="published">Published — Visible to customers</option>
              </select>
            </FieldLabel>

            <FieldLabel label="Icon / Image URL" hint="Optional preview image for the file card.">
              <div className="relative">
                <Image size={17} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                <input
                  type="url"
                  value={form.icon_url || ''}
                  onChange={(e) => setForm({ ...form, icon_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500"
                />
              </div>
            </FieldLabel>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <FieldLabel label="Version" hint="Optional, e.g. 3.1.0">
                <input
                  value={form.version || ''}
                  onChange={(e) => setForm({ ...form, version: e.target.value })}
                  placeholder="3.1.0"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-emerald-500"
                />
              </FieldLabel>
              <FieldLabel label="Checksum" hint="Optional SHA256/MD5. Uploads can be generated server-side.">
                <input
                  value={form.checksum || ''}
                  onChange={(e) => setForm({ ...form, checksum: e.target.value })}
                  placeholder="SHA256 / MD5"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-emerald-500"
                />
              </FieldLabel>
            </div>

            <FieldLabel label="Changelog" hint="Optional release notes or what changed in this version.">
              <textarea
                rows={4}
                value={form.changelog || ''}
                onChange={(e) => setForm({ ...form, changelog: e.target.value })}
                placeholder="Version notes..."
                className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-emerald-500"
              />
            </FieldLabel>
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-4">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--nst-dashboard-primary)] px-4 py-2.5 text-sm font-black text-white shadow-sm"
          >
            <Save size={17} />
            {editing ? 'Update file' : 'Add file'}
          </button>
          <span className="text-xs font-medium text-slate-400">No file is shown publicly until Status is set to Published.</span>
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900">Published & draft files</h2>
            <p className="text-xs font-medium text-slate-500">Edit metadata, publish a draft or archive an obsolete file.</p>
          </div>
          <span className="text-xs font-bold text-slate-400">{visibleFiles.length} records</span>
        </div>

        {visibleFiles.length ? (
          <div className="overflow-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Downloads</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleFiles.map((file) => (
                  <tr key={file.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                          <FileText size={17} />
                        </span>
                        <div className="min-w-0">
                          <p className="max-w-[300px] truncate font-black text-slate-900">{file.title}</p>
                          <p className="mt-0.5 text-xs font-medium text-slate-400">
                            {file.version ? `v${file.version}` : 'No version'}
                            {file.file_size ? ` · ${Math.max(1, Math.round(file.file_size / 1024))} KB` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold capitalize text-slate-600">{file.category || 'general'}</td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-500">{file.external_url ? 'External URL' : 'Uploaded file'}</td>
                    <td className="px-4 py-3"><StatusBadge value={file.status} /></td>
                    <td className="px-4 py-3 font-black text-slate-700">{file.download_count || 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => edit(file)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-black text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => archive(file)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-100 px-2.5 py-2 text-xs font-black text-rose-600 hover:bg-rose-50"
                        >
                          <Archive size={14} />
                          Archive
                        </button>
                        <button
                          type="button"
                          onClick={() => removeForever(file)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-2.5 py-2 text-xs font-black text-white hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid place-items-center px-6 py-14 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><FileText size={22} /></span>
            <h3 className="mt-3 font-black text-slate-800">No files yet</h3>
            <p className="mt-1 text-sm font-medium text-slate-400">Use the form above to add the first downloadable file.</p>
          </div>
        )}
      </section>
    </div>
  );
}
