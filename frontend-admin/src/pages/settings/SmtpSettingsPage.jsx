import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Mail,
  RefreshCw,
  Save,
  Send,
  Server,
  ShieldCheck,
} from 'lucide-react';
import corporateOpsService from '../../services/corporateOpsService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Settings2 as NstHdrSettings2 } from 'lucide-react';
import { useT } from '../../i18n';

const DEFAULT_FORM = {
  default_sender_name: 'New Singapur Telecom',
  smtp_host: '',
  smtp_port: '587',
  smtp_username: '',
  smtp_password: '',
  smtp_encryption: 'tls',
  smtp_from_email: '',
  smtp_from_name: 'New Singapur Telecom',
  invoice_email_subject: 'Your Invoice from New Singapur Telecom - {invoice_no}',
  invoice_email_template:
    'Dear Customer,\n\nThank you for shopping with New Singapur Telecom. Your invoice PDF is attached.\n\nInvoice: {invoice_no}\nTotal: {total}\nPaid: {paid}\nDue: {due}\nView: {invoice_link}',
};

const encryptionOptions = [
  { value: 'tls', label: 'TLS / STARTTLS', helper: 'Recommended for port 587' },
  { value: 'ssl', label: 'SSL', helper: 'Usually port 465' },
  { value: '', label: 'None', helper: 'Only use for local/testing SMTP' },
];

const providerPresets = [
  {
    name: 'Gmail / Google Workspace',
    host: 'smtp.gmail.com',
    port: '587',
    encryption: 'tls',
    note: 'Use Google App Password, not your normal Gmail password.',
  },
  {
    name: 'Outlook / Microsoft 365',
    host: 'smtp.office365.com',
    port: '587',
    encryption: 'tls',
    note: 'SMTP AUTH must be enabled in Microsoft 365 if blocked.',
  },
  {
    name: 'Hostinger / cPanel Mail',
    host: 'mail.yourdomain.com',
    port: '465',
    encryption: 'ssl',
    note: 'Replace host with your domain mail server from hosting panel.',
  },
  {
    name: 'Zoho Mail',
    host: 'smtp.zoho.com',
    port: '587',
    encryption: 'tls',
    note: 'Use Zoho SMTP password or app-specific password if enabled.',
  },
];

const dataOf = (res) => res?.data?.data || res?.data || {};

export default function SmtpSettingsPage() {
  const t = useT();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [initialForm, setInitialForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadSettings = async () => {
    try {
      setLoading(true);
      setMessage('');
      setError('');
      const response = await corporateOpsService.getSection('communication');
      const data = { ...DEFAULT_FORM, ...dataOf(response) };
      setForm(data);
      setInitialForm(data);
    } catch (err) {
      setError(err?.response?.data?.message || t('smtp.errors.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);
  const canSendEmail = Boolean(form.smtp_host && form.smtp_port && form.smtp_from_email);

  const updateField = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const applyPreset = (preset) => {
    setForm((previous) => ({
      ...previous,
      smtp_host: preset.host,
      smtp_port: preset.port,
      smtp_encryption: preset.encryption,
    }));
    setMessage(t('smtp.preset_applied', { name: preset.name }));
    setError('');
  };

  const validate = () => {
    const portNumber = Number(form.smtp_port || 0);

    if (!form.smtp_host.trim()) return 'SMTP Host required.';
    if (!portNumber || portNumber < 1 || portNumber > 65535) return t('smtp.errors.port_range');
    if (!form.smtp_from_email.trim()) return 'From Email required.';
    if (!/^\S+@\S+\.\S+$/.test(form.smtp_from_email.trim())) return t('smtp.errors.from_email_invalid');
    if (form.smtp_username && /^\s|\s$/.test(form.smtp_username)) return t('smtp.errors.username_spaces');

    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setMessage('');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setMessage('');

      const payload = {
        ...form,
        smtp_host: form.smtp_host.trim(),
        smtp_port: String(form.smtp_port || '587').trim(),
        smtp_username: String(form.smtp_username || '').trim(),
        smtp_password: String(form.smtp_password || ''),
        smtp_encryption: form.smtp_encryption || '',
        smtp_from_email: form.smtp_from_email.trim(),
        smtp_from_name: form.smtp_from_name.trim() || 'New Singapur Telecom',
        default_sender_name: form.default_sender_name.trim() || 'New Singapur Telecom',
      };

      const response = await corporateOpsService.saveSection('communication', payload);
      const updated = { ...DEFAULT_FORM, ...dataOf(response) };
      setForm(updated);
      setInitialForm(updated);
      setMessage(t('smtp.saved'));
    } catch (err) {
      const errors = err?.response?.data?.errors;
      setError(errors ? Object.values(errors).flat().join(' ') : err?.response?.data?.message || t('smtp.errors.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--nst-dashboard-surface)] p-4 md:p-8">
        <div className="mx-auto max-w-6xl rounded-[1.75rem] border border-slate-100 bg-white p-8 text-slate-500 shadow-sm">
          SMTP settings loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--nst-dashboard-surface)] p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="overflow-hidden rounded-[2rem] border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-white shadow-sm">
          <NstPageHeader icon={NstHdrSettings2} title={<>SMTP Settings</>} subtitle={t('smtp.subtitle')} actions={<><div className={`rounded-2xl px-4 py-3 text-sm font-black ${canSendEmail ? 'bg-emerald-400/20 text-emerald-50' : 'bg-amber-400/20 text-amber-50'}`}>
                {canSendEmail ? 'SMTP Ready' : 'Not Configured'}
              </div></>}/>

          <div className="grid gap-4 p-5 md:grid-cols-3 md:p-6">
            <InfoCard icon={Server} title="Server" value={form.smtp_host || 'Not set'} helper={`Port ${form.smtp_port || '—'}`} />
            <InfoCard icon={ShieldCheck} title="Encryption" value={form.smtp_encryption ? form.smtp_encryption.toUpperCase() : 'None'} helper="TLS recommended" />
            <InfoCard icon={Send} title="From Email" value={form.smtp_from_email || 'Not set'} helper={form.smtp_from_name || 'Sender name'} />
          </div>
        </div>

        {message ? <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div> : null}
        {error ? <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Section
              title="SMTP Server Login"
              description={t('smtp.server_login_help')}
            >
              <Input label="SMTP Host" value={form.smtp_host} placeholder="smtp.gmail.com" onChange={(value) => updateField('smtp_host', value)} required />
              <Input label="SMTP Port" type="number" value={form.smtp_port} placeholder="587" onChange={(value) => updateField('smtp_port', value)} required />
              <Input label="SMTP Username" value={form.smtp_username} placeholder="email@yourdomain.com" onChange={(value) => updateField('smtp_username', value)} />
              <PasswordInput
                label="SMTP Password / App Password"
                value={form.smtp_password}
                showPassword={showPassword}
                onToggle={() => setShowPassword((previous) => !previous)}
                onChange={(value) => updateField('smtp_password', value)}
              />
              <Select label="Encryption" value={form.smtp_encryption} onChange={(value) => updateField('smtp_encryption', value)} options={encryptionOptions} />
            </Section>

            <Section
              title="Sender Profile"
              description={t('smtp.sender_profile_help')}
            >
              <Input label="Default Sender Name" value={form.default_sender_name} onChange={(value) => updateField('default_sender_name', value)} />
              <Input label="From Name" value={form.smtp_from_name} onChange={(value) => updateField('smtp_from_name', value)} />
              <Input label="From Email" type="email" value={form.smtp_from_email} placeholder="support@newsingapurtele.com" onChange={(value) => updateField('smtp_from_email', value)} required />
            </Section>

            <Section
              title="Invoice Email Template"
              description={t('smtp.invoice_template_help')}
            >
              <Input label="Invoice Email Subject" value={form.invoice_email_subject} onChange={(value) => updateField('invoice_email_subject', value)} wide />
              <Textarea label="Invoice Email Body" value={form.invoice_email_template} onChange={(value) => updateField('invoice_email_template', value)} />
            </Section>

            <div className="flex flex-col-reverse gap-3 rounded-[1.75rem] border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={loadSettings}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw size={17} /> Refresh
              </button>
              <button
                type="submit"
                disabled={saving || !isDirty}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--nst-dashboard-primary)] px-6 py-3 text-sm font-black text-white shadow-lg shadow-[var(--nst-dashboard-shadow)] transition hover:bg-[var(--nst-dashboard-primary)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save size={18} /> {saving ? 'Saving...' : isDirty ? 'Save SMTP Settings' : 'Saved'}
              </button>
            </div>
          </form>

          <aside className="space-y-5">
            <div className="rounded-[1.75rem] border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black text-slate-950">Provider Presets</h2>
              <p className="mt-1 text-sm text-slate-500">{t('smtp.presets_help')}</p>
              <div className="mt-4 space-y-3">
                {providerPresets.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] hover:bg-[var(--nst-dashboard-primary-soft)]"
                  >
                    <p className="text-sm font-black text-slate-900">{preset.name}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{preset.host}:{preset.port} • {preset.encryption.toUpperCase()}</p>
                    <p className="mt-2 text-xs text-slate-500">{preset.note}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50 p-5 text-amber-900 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-black">Important</h3>
                  <p className="mt-1 text-sm leading-6">
                    {t('smtp.important_note')}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50 p-5 text-emerald-900 shadow-sm">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-black">Used By System</h3>
                  <p className="mt-1 text-sm leading-6">
                    {t('smtp.used_by_system_note')}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, title, value, helper }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-white p-3 text-[var(--nst-dashboard-primary)] shadow-sm">
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">{title}</p>
          <p className="mt-1 truncate text-sm font-black text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{helper}</p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="rounded-[1.75rem] border border-slate-100 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-black text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Input({ label, type = 'text', value, placeholder = '', onChange, required = false, wide = false }) {
  return (
    <label className={`space-y-1.5 text-sm font-black text-slate-700 ${wide ? 'md:col-span-2' : ''}`}>
      <span>{label}{required ? <span className="text-red-500"> *</span> : null}</span>
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
      />
    </label>
  );
}

function PasswordInput({ label, value, showPassword, onToggle, onChange }) {
  return (
    <label className="space-y-1.5 text-sm font-black text-slate-700">
      <span>{label}</span>
      <span className="flex rounded-2xl border border-slate-200 bg-white focus-within:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus-within:ring-4 focus-within:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]">
        <input
          type={showPassword ? 'text' : 'password'}
          value={value ?? ''}
          placeholder="••••••••••••"
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 rounded-l-2xl px-4 py-3 text-sm font-semibold text-slate-800 outline-none"
        />
        <button type="button" onClick={onToggle} className="rounded-r-2xl px-4 text-slate-400 transition hover:text-[var(--nst-dashboard-primary)]">
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="space-y-1.5 text-sm font-black text-slate-700 md:col-span-2">
      <span>{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
      >
        {options.map((option) => (
          <option key={option.value || 'none'} value={option.value}>{option.label} — {option.helper}</option>
        ))}
      </select>
    </label>
  );
}

function Textarea({ label, value, onChange }) {
  return (
    <label className="space-y-1.5 text-sm font-black text-slate-700 md:col-span-2">
      <span>{label}</span>
      <textarea
        value={value ?? ''}
        rows={8}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
      />
    </label>
  );
}
