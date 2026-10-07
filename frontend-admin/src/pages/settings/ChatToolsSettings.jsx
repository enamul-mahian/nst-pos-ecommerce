import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, PhoneCall, Upload } from 'lucide-react';
import api from '../../services/api';

const initial = {
  enabled: '1',
  logo_url: '',
  launcher_title: 'NST Live Support',
  launcher_subtitle: 'Chat with our team',
  header_title: 'New Singapur Telecom Support',
  header_subtitle: 'Support & Sales',
  welcome_message: '',
  start_button_text: 'Start Conversation',
  default_reply_after_submit: '',
  whatsapp_business_enabled: '0',
  whatsapp_business_number: '',
  whatsapp_business_message: 'Hello New Singapur Telecom, I need assistance.',
  whatsapp_button_label: 'WhatsApp Us',
};

const flag = (value) => ['1', 'true', 'on', 'yes'].includes(String(value ?? '').toLowerCase());
const dataOf = (response) => response?.data?.data || response?.data || {};

export default function ChatToolsSettings() {
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const chatEnabled = flag(form.enabled);
  const whatsappEnabled = flag(form.whatsapp_business_enabled);
  const normalizedNumber = useMemo(() => String(form.whatsapp_business_number || '').replace(/\D+/g, ''), [form.whatsapp_business_number]);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/chatbox/settings');
      setForm((prev) => ({ ...prev, ...dataOf(response) }));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Chat tools settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    try {
      setSaving(true);
      setMessage('');
      setError('');
      const payload = {
        ...form,
        enabled: chatEnabled,
        whatsapp_business_enabled: whatsappEnabled,
      };
      const response = await api.post('/chatbox/settings', payload);
      setForm((prev) => ({ ...prev, ...dataOf(response) }));
      setMessage('Chatbox and WhatsApp settings saved.');
    } catch (err) {
      const errors = err?.response?.data?.errors;
      setError(errors ? Object.values(errors).flat().join(' ') : (err?.response?.data?.message || err?.message || 'Save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    try {
      setUploading(true);
      setMessage('');
      setError('');
      const body = new FormData();
      body.append('file', file);
      const response = await api.post('/website-builder/assets', body);
      const uploaded = dataOf(response);
      if (!uploaded?.url) throw new Error('Upload completed without a public URL.');
      set('logo_url', uploaded.url);
      setMessage('Chat logo uploaded. Save settings to publish it.');
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Logo upload failed.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <section className="rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5 text-sm text-[var(--nst-dashboard-muted)]">Loading chat tools…</section>;

  return (
    <section className="space-y-5 rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5">
      <div>
        <h2 className="text-lg font-black">Chatbox & WhatsApp Business</h2>
        <p className="mt-1 text-sm text-[var(--nst-dashboard-muted)]">Control the on-site NST live chat and the separate WhatsApp Business button.</p>
      </div>

      {message ? <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['Both', chatEnabled && whatsappEnabled],
          ['Live Chat Only', chatEnabled && !whatsappEnabled],
          ['WhatsApp Only', !chatEnabled && whatsappEnabled],
          ['Both Off', !chatEnabled && !whatsappEnabled],
        ].map(([label, active]) => (
          <div key={label} className={`rounded-xl border p-3 text-sm font-black ${active ? 'border-[var(--nst-dashboard-primary)] bg-[var(--nst-dashboard-primary-soft)]' : 'border-[var(--nst-dashboard-border)]'}`}>{label}</div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-[var(--nst-dashboard-border)] p-4">
          <div className="flex items-center gap-2"><MessageCircle size={18}/><h3 className="font-black">NST Live Chat</h3></div>
          <Toggle label="Enable NST live chat" checked={chatEnabled} onChange={(v) => set('enabled', v ? '1' : '0')} />
          <Field label="Launcher title"><input className={input} maxLength={60} value={form.launcher_title || ''} onChange={(e) => set('launcher_title', e.target.value)} /></Field>
          <Field label="Launcher subtitle"><input className={input} maxLength={80} value={form.launcher_subtitle || ''} onChange={(e) => set('launcher_subtitle', e.target.value)} /></Field>
          <Field label="Header title"><input className={input} maxLength={80} value={form.header_title || ''} onChange={(e) => set('header_title', e.target.value)} /></Field>
          <Field label="Header subtitle"><input className={input} maxLength={120} value={form.header_subtitle || ''} onChange={(e) => set('header_subtitle', e.target.value)} /></Field>
          <Field label="Welcome message"><textarea className={`${input} min-h-24`} maxLength={1000} value={form.welcome_message || ''} onChange={(e) => set('welcome_message', e.target.value)} /></Field>
          <Field label="Start button text"><input className={input} maxLength={60} value={form.start_button_text || ''} onChange={(e) => set('start_button_text', e.target.value)} /></Field>
        </div>

        <div className="space-y-4 rounded-2xl border border-[var(--nst-dashboard-border)] p-4">
          <div className="flex items-center gap-2"><PhoneCall size={18}/><h3 className="font-black">WhatsApp Business</h3></div>
          <Toggle label="Enable WhatsApp Business button" checked={whatsappEnabled} onChange={(v) => set('whatsapp_business_enabled', v ? '1' : '0')} />
          <Field label="WhatsApp number" hint={normalizedNumber ? 'Bangladesh local numbers and international numbers are accepted.' : 'Example: 01XXXXXXXXX or +8801XXXXXXXXX'}>
            <input className={input} inputMode="tel" maxLength={32} value={form.whatsapp_business_number || ''} onChange={(e) => set('whatsapp_business_number', e.target.value.replace(/[^0-9+()\-\s.]/g, ''))} />
          </Field>
          <Field label="Default WhatsApp message"><textarea className={`${input} min-h-24`} maxLength={500} value={form.whatsapp_business_message || ''} onChange={(e) => set('whatsapp_business_message', e.target.value)} /></Field>
          <Field label="WhatsApp button label"><input className={input} maxLength={40} value={form.whatsapp_button_label || ''} onChange={(e) => set('whatsapp_button_label', e.target.value)} /></Field>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--nst-dashboard-border)] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-black">Chat icon / logo</h3>
            <p className="text-xs text-[var(--nst-dashboard-muted)]">This image is used by the floating live-chat launcher and chat header.</p>
          </div>
          {form.logo_url ? <img src={form.logo_url} alt="Chat logo preview" className="h-12 w-12 rounded-full border object-contain" /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--nst-dashboard-border)] px-4 py-2 text-sm font-bold">
            <Upload size={16}/>{uploading ? 'Uploading…' : 'Upload logo'}
            <input type="file" className="hidden" accept="image/png,image/webp,image/jpeg,image/gif" disabled={uploading} onChange={(e) => uploadLogo(e.target.files?.[0])} />
          </label>
          <input className={`${input} min-w-[260px] flex-1`} value={form.logo_url || ''} onChange={(e) => set('logo_url', e.target.value)} placeholder="/storage/... or https://..." />
          {form.logo_url ? <button type="button" onClick={() => set('logo_url', '')} className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700">Remove</button> : null}
        </div>
      </div>

      <div className="flex justify-end"><button type="button" disabled={saving} onClick={save} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-black text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save Chat Tools'}</button></div>
    </section>
  );
}

const input = 'w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-transparent px-4 py-3 text-sm outline-none';
function Field({ label, hint, children }) { return <label className="block space-y-1.5 text-sm font-semibold"><span>{label}</span>{children}{hint ? <span className="block text-xs font-medium text-[var(--nst-dashboard-muted)]">{hint}</span> : null}</label>; }
function Toggle({ label, checked, onChange }) { return <label className="flex items-center justify-between gap-4 rounded-xl border border-[var(--nst-dashboard-border)] px-4 py-3 text-sm font-bold"><span>{label}</span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" /></label>; }
