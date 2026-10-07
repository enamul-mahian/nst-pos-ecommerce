import { useEffect, useState } from 'react';
import finalOperationsService from '../../services/finalOperationsService';
import corporateOpsService from '../../services/corporateOpsService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Megaphone as NstHdrMegaphone } from 'lucide-react';

const emptySettings = { provider_name: '', sender_id: '', api_url: '', api_key: '', request_headers: {}, request_parameters: {}, is_active: false };
const emptyTemplate = { name: '', purpose: '', message: '', is_active: true };

export default function MarketingMessagingPage() {
  const [settings, setSettings] = useState(emptySettings);
  const [templates, setTemplates] = useState([]);
  const [template, setTemplate] = useState(emptyTemplate);
  const [testMessage, setTestMessage] = useState({ phone: '', message: '' });
  const [logs, setLogs] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [settingsResponse, templatesResponse, logsResponse] = await Promise.all([
        finalOperationsService.smsSettings(),
        finalOperationsService.smsTemplates(),
        corporateOpsService.listLogs({ channel: 'sms' }),
      ]);
      const row = settingsResponse?.data?.data;
      if (row) setSettings({ ...emptySettings, ...row, api_key: '' });
      setTemplates(templatesResponse?.data?.data || []);
      setLogs(logsResponse?.data?.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'SMS panel could not be loaded.');
    }
  };
  useEffect(() => { load(); }, []);

  const saveSettings = async () => {
    try {
      setError('');
      await finalOperationsService.saveSmsSettings({
        ...settings,
        request_headers: settings.request_headers || {},
        request_parameters: settings.request_parameters || {},
      });
      setMessage('SMS provider settings saved. API key remains backend-only and masked.');
      await load();
    } catch (err) { setError(err?.response?.data?.message || 'SMS settings could not be saved.'); }
  };

  const saveTemplate = async () => {
    try {
      setError('');
      await finalOperationsService.saveSmsTemplate(template, template.id);
      setTemplate(emptyTemplate);
      setMessage('SMS template saved.');
      await load();
    } catch (err) { setError(err?.response?.data?.message || 'SMS template could not be saved.'); }
  };

  const sendTest = async () => {
    try {
      setError('');
      await corporateOpsService.sendManual({ channel: 'sms', phone: testMessage.phone, message: testMessage.message });
      setTestMessage({ phone: '', message: '' });
      setMessage('Test SMS processed and added to the delivery log.');
      await load();
    } catch (err) { setError(err?.response?.data?.message || 'Test SMS could not be processed.'); }
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <NstPageHeader icon={NstHdrMegaphone} title={<>SMS Panel</>} subtitle={<>Secure SMS provider settings, templates, balance information and delivery foundation. SMTP is not duplicated here.</>}/>
      {message && <Notice ok>{message}</Notice>}{error && <Notice>{error}</Notice>}
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-black">Provider Settings</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Provider Name" value={settings.provider_name} onChange={(value) => setSettings({ ...settings, provider_name: value })} />
            <Input label="Sender ID" value={settings.sender_id} onChange={(value) => setSettings({ ...settings, sender_id: value })} />
          </div>
          <Input label="API URL" value={settings.api_url} onChange={(value) => setSettings({ ...settings, api_url: value })} />
          <Input label={`API Key ${settings.api_key_masked ? `(${settings.api_key_masked})` : ''}`} type="password" value={settings.api_key} onChange={(value) => setSettings({ ...settings, api_key: value })} />
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={Boolean(settings.is_active)} onChange={(event) => setSettings({ ...settings, is_active: event.target.checked })} /> Provider Enabled</label>
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><p>Last balance: {settings.last_known_balance ?? 'Not checked'}</p><p>Checked at: {settings.balance_checked_at || '—'}</p></div>
          <button onClick={saveSettings} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 font-black text-white">Save SMS Settings</button>
        </section>

        <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-black">Message Template</h2>
          <Input label="Template Name" value={template.name} onChange={(value) => setTemplate({ ...template, name: value })} />
          <Input label="Purpose" value={template.purpose} onChange={(value) => setTemplate({ ...template, purpose: value })} />
          <label className="block text-sm font-bold">Message<textarea value={template.message} onChange={(event) => setTemplate({ ...template, message: event.target.value })} className="mt-1 min-h-36 w-full rounded-xl border border-slate-200 p-3" /></label>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={Boolean(template.is_active)} onChange={(event) => setTemplate({ ...template, is_active: event.target.checked })} /> Active</label>
          <button onClick={saveTemplate} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 font-black text-white">Save Template</button>
        </section>
      </div>
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <section className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-black">Test SMS</h2>
          <Input label="Test Number" value={testMessage.phone} onChange={(value) => setTestMessage({ ...testMessage, phone: value })} />
          <label className="block text-sm font-bold">Test Message<textarea value={testMessage.message} onChange={(event) => setTestMessage({ ...testMessage, message: event.target.value })} className="mt-1 min-h-28 w-full rounded-xl border border-slate-200 p-3" /></label>
          <button onClick={sendTest} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 font-black text-white">Send Test SMS</button>
        </section>
        <section className="overflow-auto rounded-2xl border bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="bg-slate-50"><th className="p-3">Recipient</th><th className="p-3">Purpose</th><th className="p-3">Status</th><th className="p-3">Cost</th><th className="p-3">Sent By</th><th className="p-3">Time</th></tr></thead><tbody>{logs.map((item) => <tr key={item.id} className="border-t"><td className="p-3">{item.recipient_phone}</td><td className="p-3">{item.purpose}</td><td className="p-3">{item.status}</td><td className="p-3">{item.cost || '—'}</td><td className="p-3">{item.sent_by || '—'}</td><td className="p-3">{item.created_at}</td></tr>)}</tbody></table>
        </section>
      </div>
      <section className="overflow-auto rounded-2xl border bg-white shadow-sm">
        <table className="w-full min-w-[700px] text-left text-sm"><thead><tr className="bg-slate-50"><th className="p-3">Name</th><th className="p-3">Purpose</th><th className="p-3">Message</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody>{templates.map((item) => <tr key={item.id} className="border-t"><td className="p-3 font-bold">{item.name}</td><td className="p-3">{item.purpose || '—'}</td><td className="max-w-xl p-3">{item.message}</td><td className="p-3">{item.is_active ? 'Active' : 'Inactive'}</td><td className="p-3"><button onClick={() => setTemplate(item)} className="font-bold text-[var(--nst-dashboard-primary)]">Edit</button></td></tr>)}</tbody></table>
      </section>
    </div>
  );
}
function Notice({ ok, children }) { return <div className={`rounded-xl border px-4 py-3 text-sm ${ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{children}</div>; }
function Input({ label, value, onChange, type = 'text' }) { return <label className="block text-sm font-bold">{label}<input type={type} value={value || ''} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3" /></label>; }
