import { useEffect, useState } from 'react';
import { Save, ImageUp } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import settingsService from '../../services/settingsService';
import { Settings2 } from 'lucide-react';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { NstBrandEditor } from '../../components/system/NstBrand';
import ChatToolsSettings from './ChatToolsSettings';
import { t as translate, useT } from '../../i18n';

const emptyForm = {
  company_name: '', company_legal_name: '', phone: '', email: '', website: '', address: '', logo_url: '',
  invoice_prefix: 'NST', invoice_terms: '', print_footer: '', currency_code: 'BDT', currency_symbol: 'à§³', vat_percent: 0,
  default_branch_id: '', low_stock_alert_qty: 3, timezone: 'Asia/Dhaka', enable_auto_print: true,
  ui_card_radius: 8, ui_card_gap: 14, ui_card_padding: 16, ui_section_gap: 18, ui_border_width: 1,
  scanner_enabled: true, scanner_auto_search: true,
  ui_page_content: {}, ui_page_layout: {},
};

function parseObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function normalize(source = {}) {
  return {
    ...emptyForm,
    ...source,
    ui_page_content: parseObject(source.ui_page_content),
    ui_page_layout: parseObject(source.ui_page_layout),
  };
}

export default function SettingsPage() {
  const t = useT();
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [brandEditorOpen, setBrandEditorOpen] = useState(false);
  const [error, setError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [tab, setTab] = useState(() => ['ui', 'designer', 'content'].includes(requestedTab) ? 'ui' : 'general');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setError('');
        const response = await settingsService.getSettings();
        setForm(normalize(response.data || {}));
      } catch (err) {
        setError(err?.response?.data?.message || translate('settings.load_failed'));
      } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    const requested = searchParams.get('tab');
    setTab(['ui', 'designer', 'content'].includes(requested) ? 'ui' : 'general');
  }, [searchParams]);

  const selectTab = (next) => {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'general') params.delete('tab'); else params.set('tab', 'ui');
    setSearchParams(params, { replace: true });
  };

  const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    try {
      setSaving(true); setMessage(''); setError('');
      const { timezone_options: _timezoneOptions, active_timezone: _activeTimezone, ...values } = form;
      const payload = {
        ...values,
        vat_percent: Number(form.vat_percent || 0),
        low_stock_alert_qty: Number(form.low_stock_alert_qty || 0),
        default_branch_id: form.default_branch_id ? Number(form.default_branch_id) : null,
        ui_card_radius: Number(form.ui_card_radius || 0),
        ui_card_gap: Number(form.ui_card_gap || 0),
        ui_card_padding: Number(form.ui_card_padding || 0),
        ui_section_gap: Number(form.ui_section_gap || 0),
        ui_border_width: Number(form.ui_border_width || 0),
        enable_auto_print: Boolean(form.enable_auto_print),
        scanner_enabled: Boolean(form.scanner_enabled),
        scanner_auto_search: Boolean(form.scanner_auto_search),
      };
      const response = await settingsService.updateSettings(payload);
      setForm(normalize(response.data || payload));
      setMessage(t('settings.saved'));
      window.dispatchEvent(new Event('nst-system-settings-refresh'));
    } catch (err) {
      const errors = err?.response?.data?.errors;
      setError(errors ? Object.values(errors).flat().join(' ') : (err?.response?.data?.message || t('settings.save_failed')));
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-6 text-[var(--nst-dashboard-muted)]">{t('settings.loading')}</div>;

  return <div className="space-y-5 p-4 md:p-6">
    <NstPageHeader icon={Settings2} title={tab === 'ui' ? t('settings.design.title') : t('settings.general.title')} subtitle={tab === 'ui' ? t('settings.design.subtitle') : t('settings.general.subtitle')}/>
    <div className="flex flex-wrap gap-2">
      <Tab active={tab === 'general'} onClick={() => selectTab('general')}>{t('settings.tabs.general')}</Tab>
      <Tab active={tab === 'ui'} onClick={() => selectTab('ui')}>{t('settings.tabs.design')}</Tab>
    </div>

    {message && <Notice tone="success">{message}</Notice>}
    {error && <Notice tone="error">{error}</Notice>}

    <form onSubmit={save} className="space-y-5">
      {tab === 'general' && <>
        <Section title={t('settings.general.company')}>
          <Input label={t('settings.general.company_name')} value={form.company_name} onChange={(v)=>updateField('company_name',v)} />
          <Input label={t('settings.general.legal_name')} value={form.company_legal_name} onChange={(v)=>updateField('company_legal_name',v)} />
          <Input label={t('settings.general.phone')} value={form.phone} onChange={(v)=>updateField('phone',v)} />
          <Input label={t('settings.general.email')} type="email" value={form.email} onChange={(v)=>updateField('email',v)} />
          <Input label={t('settings.general.website')} value={form.website} onChange={(v)=>updateField('website',v)} />
          <Input label={t('settings.general.logo_url')} value={form.logo_url} onChange={(v)=>updateField('logo_url',v)} />
          <Textarea label={t('settings.general.address')} value={form.address} onChange={(v)=>updateField('address',v)} />
        </Section>
        <Section title={t('settings.general.invoice')}>
          <Input label={t('settings.general.invoice_prefix')} value={form.invoice_prefix} onChange={(v)=>updateField('invoice_prefix',v)} />
          <Input label={t('settings.general.currency_code')} value={form.currency_code} onChange={(v)=>updateField('currency_code',v)} />
          <Input label={t('settings.general.currency_symbol')} value={form.currency_symbol} onChange={(v)=>updateField('currency_symbol',v)} />
          <Input label={t('settings.general.vat')} type="number" value={form.vat_percent} onChange={(v)=>updateField('vat_percent',v)} />
          <Textarea label={t('settings.general.invoice_terms')} value={form.invoice_terms} onChange={(v)=>updateField('invoice_terms',v)} />
          <Textarea label={t('settings.general.print_footer')} value={form.print_footer} onChange={(v)=>updateField('print_footer',v)} />
          <Toggle label={t('settings.general.auto_print')} checked={form.enable_auto_print} onChange={(v)=>updateField('enable_auto_print',v)} />
        </Section>
        <Section title={t('settings.general.inventory')}>
          <Input label={t('settings.general.default_branch')} type="number" value={form.default_branch_id || ''} onChange={(v)=>updateField('default_branch_id',v)} />
          <Input label={t('settings.general.low_stock')} type="number" value={form.low_stock_alert_qty} onChange={(v)=>updateField('low_stock_alert_qty',v)} />
          <TimezoneSelect label={t('settings.general.timezone')} hint={form.active_timezone ? t('settings.general.timezone_active', { zone: form.active_timezone, offset: timezoneOffset(form.active_timezone) }) : ''} value={form.timezone} options={form.timezone_options} onChange={(v)=>updateField('timezone',v)} />
        </Section>
      </>}

      {tab === 'ui' && <>

        <section className="rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black">Brand Logo & Favicon</h2>
              <p className="mt-1 max-w-2xl text-sm text-[var(--nst-dashboard-muted)]">
                Manage the central New Singapur Telecom logo and browser favicon from one place.
                These values are stored in the system UI brand settings.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setBrandEditorOpen(true)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-black text-white"
            >
              <ImageUp size={17} />
              Manage Logo & Favicon
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--nst-dashboard-border)] p-4">
              <div className="text-sm font-black">Main Brand Logo</div>
              <div className="mt-1 text-xs text-[var(--nst-dashboard-muted)]">
                Used for NST branding, login screens, sidebar and other branded areas.
              </div>
            </div>

            <div className="rounded-xl border border-[var(--nst-dashboard-border)] p-4">
              <div className="text-sm font-black">Browser Favicon</div>
              <div className="mt-1 text-xs text-[var(--nst-dashboard-muted)]">
                Choose the main logo, upload a custom favicon, or use the default app icon.
              </div>
            </div>
          </div>
        </section>
        <section className="rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5">
          <div className="mb-4">
            <h2 className="text-lg font-black">{t('settings.design.card_title')}</h2>
            <p className="mt-1 text-sm text-[var(--nst-dashboard-muted)]">{t('settings.design.card_help')}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <NumberInput label={t('settings.design.radius')} min="0" max="40" suffix="px" value={form.ui_card_radius} onChange={(v)=>updateField('ui_card_radius',v)} />
            <NumberInput label={t('settings.design.gap')} min="0" max="40" suffix="px" value={form.ui_card_gap} onChange={(v)=>updateField('ui_card_gap',v)} />
            <NumberInput label={t('settings.design.padding')} min="0" max="40" suffix="px" value={form.ui_card_padding} onChange={(v)=>updateField('ui_card_padding',v)} />
            <NumberInput label={t('settings.design.section_gap')} min="0" max="48" suffix="px" value={form.ui_section_gap} onChange={(v)=>updateField('ui_section_gap',v)} />
            <NumberInput label={t('settings.design.border_width')} min="0" max="3" step="0.5" suffix="px" value={form.ui_border_width} onChange={(v)=>updateField('ui_border_width',v)} />
          </div>
        </section>
        <Section title={t('settings.scanner.title')}>
          <Toggle label={t('settings.scanner.enabled')} checked={form.scanner_enabled} onChange={(v)=>updateField('scanner_enabled',v)} />
          <Toggle label={t('settings.scanner.auto_search')} checked={form.scanner_auto_search} onChange={(v)=>updateField('scanner_auto_search',v)} />
        </Section>
        <ChatToolsSettings />
      </>}

      {brandEditorOpen ? (
        <NstBrandEditor
          branding={{
            shortName: 'NST',
            logoText: 'NST',
            name: 'New Singapur Telecom',
            adminName: 'Admin Control Panel'
          }}
          onClose={() => setBrandEditorOpen(false)}
        />
      ) : null}

      <div className="flex justify-end"><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[var(--nst-dashboard-primary)] px-6 py-3 text-sm font-bold text-white disabled:opacity-60"><Save size={17}/>{saving ? t('settings.saving') : t('settings.save')}</button></div>
    </form>
  </div>;
}

function Tab({ active, onClick, children }) { return <button type="button" onClick={onClick} className={`rounded-xl border px-4 py-2 text-sm font-black ${active ? 'border-[var(--nst-dashboard-primary)] bg-[var(--nst-dashboard-primary)] text-white' : 'border-[var(--nst-dashboard-border)] text-[var(--nst-dashboard-muted)]'}`}>{children}</button>; }
function Section({ title, children }) { return <section className="rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5"><h2 className="mb-4 text-lg font-black">{title}</h2><div className="grid gap-4 md:grid-cols-2">{children}</div></section>; }
function timezoneOffset(zone) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((item) => item.type === 'timeZoneName');
    return part ? part.value.replace('GMT', 'UTC') : '';
  } catch { return ''; }
}
function TimezoneSelect({ label, hint, value, options, onChange }) {
  const zones = Array.isArray(options) && options.length ? options : (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []);
  const list = value && !zones.includes(value) ? [value, ...zones] : zones;
  return <label className="space-y-1.5 text-sm font-semibold"><span>{label}</span><select value={value ?? ''} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-transparent px-4 py-3 text-sm outline-none">{list.map((zone)=><option key={zone} value={zone}>{zone} ({timezoneOffset(zone)})</option>)}</select>{hint && <span className="block text-xs font-medium text-[var(--nst-dashboard-muted)]">{hint}</span>}</label>;
}
function Input({ label, type='text', value, onChange }) { return <label className="space-y-1.5 text-sm font-semibold"><span>{label}</span><input type={type} value={value ?? ''} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-transparent px-4 py-3 text-sm outline-none"/></label>; }
function NumberInput({ label, value, onChange, min, max, step='1', suffix='' }) { return <label className="space-y-1.5 text-sm font-semibold"><span>{label}</span><div className="flex items-center gap-2 rounded-xl border border-[var(--nst-dashboard-border)] px-3"><input type="number" min={min} max={max} step={step} value={value ?? ''} onChange={(e)=>onChange(e.target.value)} className="min-w-0 flex-1 bg-transparent py-3 outline-none"/><b className="text-xs text-[var(--nst-dashboard-muted)]">{suffix}</b></div></label>; }
function Textarea({ label, value, onChange }) { return <label className="space-y-1.5 text-sm font-semibold"><span>{label}</span><textarea rows={4} value={value ?? ''} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-transparent px-4 py-3 text-sm outline-none"/></label>; }
function Toggle({ label, checked, onChange }) { return <label className="flex items-center gap-3 rounded-xl border border-[var(--nst-dashboard-border)] px-4 py-3 text-sm font-semibold"><input type="checkbox" checked={Boolean(checked)} onChange={(e)=>onChange(e.target.checked)} className="h-4 w-4"/>{label}</label>; }
function Notice({ tone, children }) { return <div className={`rounded-xl border px-4 py-3 text-sm ${tone === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-rose-500/30 bg-rose-500/10 text-rose-400'}`}>{children}</div>; }

