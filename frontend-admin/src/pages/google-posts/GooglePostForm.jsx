import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import googlePostService from '../../services/googlePostService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { MapPin as NstHdrMapPin } from 'lucide-react';
import { useT } from '../../i18n';

const emptyForm = {
  title: '',
  description: '',
  status: 'draft',
  scheduled_at: '',
  external_post_id: '',
  external_reference_url: '',
  cta_url: '',
  sync_status: 'pending',
  sync_error: '',
  branch_id: '',
};

export default function GooglePostForm() {
  const t = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);
  const [form, setForm] = useState(emptyForm);
  const [featureImage, setFeatureImage] = useState(null);
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editing) return;
    (async () => {
      try {
        const response = await googlePostService.get(id);
        const post = response?.data?.data || response?.data || {};
        setForm({
          ...emptyForm,
          ...post,
          scheduled_at: post.scheduled_at ? String(post.scheduled_at).slice(0, 16) : '',
          branch_id: post.branch_id || '',
        });
        setPreview(post.feature_image_url || '');
      } catch (err) {
        setError(err?.response?.data?.message || t('google_posts.errors.load_one_failed'));
      }
    })();
  }, [editing, id]);

  const setField = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== null && value !== undefined) payload.append(key, value);
      });
      if (featureImage) payload.append('feature_image', featureImage);
      await googlePostService.save(payload, editing ? id : null);
      navigate('/google-posts');
    } catch (err) {
      setError(err?.response?.data?.message || t('google_posts.errors.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <form onSubmit={submit} className="mx-auto max-w-5xl space-y-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm md:p-7">
        <NstPageHeader icon={NstHdrMapPin} title={<>{editing ? 'Edit Google Post' : 'Create Google Post'}</>} subtitle={<>Future Google API/eCommerce sync-ready fields included.</>} actions={<><Link to="/google-posts" className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-200">Back</Link></>}/>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Title" value={form.title} onChange={(value) => setField('title', value)} required />
          <Select label="Status" value={form.status} onChange={(value) => setField('status', value)} options={['draft', 'scheduled', 'published', 'failed']} />
          <Input label="Scheduled Date" type="datetime-local" value={form.scheduled_at || ''} onChange={(value) => setField('scheduled_at', value)} />
          <Input label="CTA/Button URL" value={form.cta_url || ''} onChange={(value) => setField('cta_url', value)} />
          <Input label="External Post ID" value={form.external_post_id || ''} onChange={(value) => setField('external_post_id', value)} />
          <Input label="External Reference URL" value={form.external_reference_url || ''} onChange={(value) => setField('external_reference_url', value)} />
          <Select label="Sync Status" value={form.sync_status || 'pending'} onChange={(value) => setField('sync_status', value)} options={['pending', 'synced', 'failed', 'skipped']} />
          <Input label="Branch ID (Optional)" value={form.branch_id || ''} onChange={(value) => setField('branch_id', value)} />
        </div>

        <label className="block text-sm font-bold text-slate-700">
          Description
          <textarea value={form.description} onChange={(event) => setField('description', event.target.value)} rows={5} required className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]" />
        </label>

        <label className="block text-sm font-bold text-slate-700">
          Sync Error / API Note
          <textarea value={form.sync_error || ''} onChange={(event) => setField('sync_error', event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]" />
        </label>

        <div className="grid gap-4 md:grid-cols-[0.65fr_0.35fr] md:items-start">
          <label className="block text-sm font-bold text-slate-700">
            Feature Image
            <input type="file" accept="image/*" onChange={(event) => {
              const file = event.target.files?.[0] || null;
              setFeatureImage(file);
              if (file) setPreview(URL.createObjectURL(file));
            }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" />
            <span className="mt-1 block text-xs text-slate-400">{t('google_posts.image_help')}</span>
          </label>
          {preview ? <img src={preview} alt="Preview" className="h-40 w-full rounded-2xl object-cover" /> : <div className="flex h-40 items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-400">No Preview</div>}
        </div>

        <div className="flex justify-end">
          <button disabled={saving} type="submit" className="rounded-xl bg-[var(--nst-dashboard-primary)] px-6 py-3 text-sm font-black text-white hover:bg-[var(--nst-dashboard-primary)] disabled:opacity-60">
            {saving ? 'Saving...' : 'Save Google Post'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', required = false }) {
  return (
    <label className="block text-sm font-bold text-slate-700">
      {label}
      <input type={type} required={required} value={value || ''} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]" />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block text-sm font-bold text-slate-700">
      {label}
      <select value={value || options[0]} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}
