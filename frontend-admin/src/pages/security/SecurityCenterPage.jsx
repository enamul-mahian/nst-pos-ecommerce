import { useEffect, useMemo, useState } from 'react';
import finalOperationsService from '../../services/finalOperationsService';
import api from '../../services/api';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { ShieldCheck as NstHdrShieldCheck } from 'lucide-react';
import { useT } from '../../i18n';
import TamperGuardTab from './TamperGuardTab';

const defaultSettings = {
  alert_email: '', high_critical_email_enabled: true, hcaptcha_enabled: false,
  hcaptcha_site_key: '', hcaptcha_secret_key: '', hcaptcha_secret_configured: false,
  hcaptcha_clear_secret: false, hcaptcha_test_mode: false, hcaptcha_customer_login: true,
  hcaptcha_customer_registration: true, hcaptcha_checkout_registration: true,
  hcaptcha_supplier_login: true, hcaptcha_admin_login: false,
};

const defaultProvider = {
  name: 'Authorized NID Verification Provider', mode: 'manual', api_url: '', http_method: 'POST',
  request_format: 'json', auth_type: 'bearer', auth_header: 'Authorization', auth_scheme: 'Bearer',
  authentication_url: '', request_headers: { Accept: 'application/json' },
  request_template: { nid: '{{nid_number}}', date_of_birth: '{{date_of_birth}}' },
  response_mapping: {}, success_path: '', success_values: ['true', 'success', 'verified', 'valid', '1'],
  timeout_seconds: 20, is_active: false, token_configured: false, token_valid: false,
};

const defaultField = {
  label: '', field_key: '', field_type: 'text', placeholder: '', optionsText: '', validation_rule: '',
  is_required: false, send_to_provider: true, internal_only: false, is_active: true, sort_order: 0,
};

export default function SecurityCenterPage() {
  const t = useT();
  const [tab, setTab] = useState('events');
  const [events, setEvents] = useState([]);
  const [checks, setChecks] = useState([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [provider, setProvider] = useState(defaultProvider);
  const [fields, setFields] = useState([]);
  const [nid, setNid] = useState({ nid_number: '', date_of_birth: '', short_note: '', consent_confirmed: false, custom_data: {} });
  const [extraRows, setExtraRows] = useState([{ key: '', value: '' }]);
  const [tokenForm, setTokenForm] = useState({ access_token: '', expires_in_minutes: 14, resume_pending: true, resume_limit: 10 });
  const [providerJson, setProviderJson] = useState({ request_headers: '{}', request_template: '{}', response_mapping: '{}', success_values: '[]' });
  const [fieldForm, setFieldForm] = useState(defaultField);
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [manualResult, setManualResult] = useState({ decision: 'verified', resultText: '{}', note: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessionPolicy, setSessionPolicy] = useState({ global_minutes: 20, role_minutes: {} });

  const activeFields = useMemo(() => fields.filter((field) => field.is_active), [fields]);

  const load = async () => {
    try {
      const [eventResponse, checkResponse, settingsResponse, nidConfigResponse] = await Promise.all([
        finalOperationsService.securityEvents(), finalOperationsService.nidVerifications(),
        finalOperationsService.securitySettings(), finalOperationsService.nidVerificationConfig(),
      ]);
      setEvents(eventResponse?.data?.data?.data || []);
      setChecks(checkResponse?.data?.data?.data || []);
      setSettings({ ...defaultSettings, ...(settingsResponse?.data?.data || {}), hcaptcha_secret_key: '', hcaptcha_clear_secret: false });
      const config = nidConfigResponse?.data?.data || {};
      const loadedProvider = { ...defaultProvider, ...(config.provider || {}) };
      setProvider(loadedProvider);
      setFields(config.fields || []);
      setProviderJson({
        request_headers: JSON.stringify(loadedProvider.request_headers || {}, null, 2),
        request_template: JSON.stringify(loadedProvider.request_template || {}, null, 2),
        response_mapping: JSON.stringify(loadedProvider.response_mapping || {}, null, 2),
        success_values: JSON.stringify(loadedProvider.success_values || [], null, 2),
      });
      const generalSettings = await api.get('/settings');
      setSessionPolicy(generalSettings?.data?.data?.session_security_policy || { global_minutes: 20, role_minutes: {} });
      setError('');
    } catch (err) { setError(err?.response?.data?.message || 'Security Center data could not be loaded.'); }
  };

  useEffect(() => { load(); }, []);

  const run = async (action, successMessage) => {
    setBusy(true); setError(''); setMessage('');
    try { const response = await action(); setMessage(response?.data?.message || successMessage); await load(); return response; }
    catch (err) { setError(err?.response?.data?.message || 'The operation could not be completed.'); return null; }
    finally { setBusy(false); }
  };

  const resolve = (id) => run(() => finalOperationsService.resolveSecurityEvent(id), 'Security event resolved.');
  const saveSettings = () => run(() => finalOperationsService.saveSecuritySettings(settings), 'Security settings saved.');
  const saveSessionPolicy = () => run(() => api.post('/settings', { session_security_policy: sessionPolicy }), 'Session timeout policy saved.');

  const submitNid = async () => {
    const adHoc = {};
    extraRows.forEach((row) => { if (row.key.trim()) adHoc[row.key.trim()] = row.value; });
    const payload = { ...nid, custom_data: { ...(nid.custom_data || {}), ...adHoc } };
    const response = await run(() => finalOperationsService.storeNidVerification(payload), 'NID request saved.');
    if (response) {
      setNid({ nid_number: '', date_of_birth: '', short_note: '', consent_confirmed: false, custom_data: {} });
      setExtraRows([{ key: '', value: '' }]);
      setSelected(response?.data?.data || null);
    }
  };

  const openRecord = async (id) => {
    setBusy(true); setError('');
    try { const response = await finalOperationsService.nidVerification(id); setSelected(response?.data?.data || null); }
    catch (err) { setError(err?.response?.data?.message || 'NID record could not be opened.'); }
    finally { setBusy(false); }
  };

  const resume = (id) => run(() => finalOperationsService.resumeNidVerification(id), 'NID request resumed.');
  const cancel = (id) => run(() => finalOperationsService.cancelNidVerification(id), 'NID request cancelled.');

  const saveProvider = async () => {
    try {
      const payload = {
        ...provider,
        request_headers: JSON.parse(providerJson.request_headers || '{}'),
        request_template: JSON.parse(providerJson.request_template || '{}'),
        response_mapping: JSON.parse(providerJson.response_mapping || '{}'),
        success_values: JSON.parse(providerJson.success_values || '[]'),
      };
      await run(() => finalOperationsService.saveNidProvider(payload), 'Provider settings saved.');
    } catch { setError('Provider JSON settings contain invalid JSON.'); }
  };

  const saveToken = async () => {
    if (!provider.id) { setError('Save the provider first.'); return; }
    const response = await run(() => finalOperationsService.saveNidProviderToken({ ...tokenForm, provider_id: provider.id }), 'Provider token saved.');
    if (response) setTokenForm({ ...tokenForm, access_token: '' });
  };

  const saveField = async () => {
    const payload = { ...fieldForm, options: fieldForm.optionsText.split('\n').map((v) => v.trim()).filter(Boolean) };
    const response = await run(() => finalOperationsService.saveNidField(payload, editingFieldId), 'Custom field saved.');
    if (response) { setFieldForm(defaultField); setEditingFieldId(null); }
  };

  const editField = (field) => {
    setEditingFieldId(field.id);
    setFieldForm({ ...defaultField, ...field, optionsText: (field.options || []).join('\n') });
  };

  const saveManual = async () => {
    try {
      const result = JSON.parse(manualResult.resultText || '{}');
      const response = await run(() => finalOperationsService.saveNidManualResult(selected.id, { decision: manualResult.decision, result, note: manualResult.note }), 'Manual result saved.');
      if (response) setSelected(response?.data?.data || null);
    } catch { setError('Manual result must be valid JSON.'); }
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <NstPageHeader icon={NstHdrShieldCheck} title={<>Security Center</>} subtitle={<>Security audit, safe NID verification workflow and customer-facing hCaptcha controls.</>}/>
      <div className="flex flex-wrap gap-2"><Tab active={tab === 'events'} onClick={() => setTab('events')}>Security Events</Tab><Tab active={tab === 'session'} onClick={() => setTab('session')}>Session Security</Tab><Tab active={tab === 'captcha'} onClick={() => setTab('captcha')}>hCaptcha</Tab><Tab active={tab === 'tamper'} onClick={() => setTab('tamper')}>{t('security_guard.tab')}</Tab><Tab active={tab === 'nid'} onClick={() => setTab('nid')}>NID Verification</Tab></div>
      {message && <Notice ok>{message}</Notice>}{error && <Notice>{error}</Notice>}

      {tab === 'session' && <SessionSecurityTab policy={sessionPolicy} setPolicy={setSessionPolicy} save={saveSessionPolicy} busy={busy} />}
      {tab === 'events' && <EventsTab events={events} settings={settings} setSettings={setSettings} resolve={resolve} saveSettings={saveSettings} />}
      {tab === 'tamper' && <TamperGuardTab/>}
      {tab === 'captcha' && <CaptchaTab settings={settings} setSettings={setSettings} saveSettings={saveSettings} />}

      {tab === 'nid' && (
        <div className="space-y-5">
          <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <div className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
              <div><h2 className="text-lg font-black">New NID Verification</h2><p className="text-sm text-slate-500">The request is saved before any provider call. Token expiry never removes NID, DOB or custom data.</p></div>
              <div className="grid gap-3 md:grid-cols-2"><Input label="NID Number" value={nid.nid_number} onChange={(value) => setNid({ ...nid, nid_number: value })}/><Input label="Date of Birth" type="date" value={nid.date_of_birth} onChange={(value) => setNid({ ...nid, date_of_birth: value })}/></div>
              {activeFields.map((field) => <DynamicField key={field.id} field={field} value={nid.custom_data?.[field.field_key]} onChange={(value) => setNid({ ...nid, custom_data: { ...(nid.custom_data || {}), [field.field_key]: value } })} />)}
              <label className="block text-sm font-bold">Short Note<textarea value={nid.short_note} onChange={(event) => setNid({ ...nid, short_note: event.target.value })} className="mt-1 min-h-24 w-full rounded-xl border p-3" /></label>
              <div className="rounded-xl border border-dashed p-4"><div className="mb-2 flex items-center justify-between"><b className="text-sm">One-time custom data</b><button onClick={() => setExtraRows([...extraRows, { key: '', value: '' }])} className="text-sm font-black text-[var(--nst-dashboard-primary)]">+ Add row</button></div>{extraRows.map((row, index) => <div key={index} className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-2"><input value={row.key} placeholder="field_key" onChange={(e) => setExtraRows(extraRows.map((item, i) => i === index ? { ...item, key: e.target.value } : item))} className="rounded-lg border p-2"/><input value={row.value} placeholder="value" onChange={(e) => setExtraRows(extraRows.map((item, i) => i === index ? { ...item, value: e.target.value } : item))} className="rounded-lg border p-2"/><button onClick={() => setExtraRows(extraRows.filter((_, i) => i !== index))} className="px-2 text-rose-600">×</button></div>)}</div>
              <Toggle label="I confirm customer consent and a lawful verification purpose" checked={Boolean(nid.consent_confirmed)} onChange={(value) => setNid({ ...nid, consent_confirmed: value })}/>
              <button disabled={busy} onClick={submitNid} className="w-full rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 font-black text-white disabled:opacity-50">Save & Verify</button>
            </div>

            <div className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
              <div><h2 className="text-lg font-black">Provider Authentication Session</h2><p className="text-sm text-slate-500">Complete the provider's own CAPTCHA/login, then paste the new authorized token once. Saved requests resume without re-entering customer data.</p></div>
              <div className="grid gap-2 rounded-xl bg-slate-50 p-4 text-sm"><p>Provider: <b>{provider.name}</b></p><p>Mode: <b>{provider.mode}</b></p><p>Token: <b className={provider.token_valid ? 'text-green-700' : 'text-amber-700'}>{provider.token_valid ? 'Valid' : provider.token_configured ? 'Expired / expiring' : 'Not configured'}</b></p><p>Expires: <b>{provider.token_expires_at || 'Not set'}</b></p></div>
              {provider.authentication_url && <a href={provider.authentication_url} target="_blank" rel="noreferrer" className="block rounded-xl border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-[var(--nst-dashboard-primary-soft)] px-4 py-3 text-center font-black text-[var(--nst-dashboard-primary)]">Open Authorized Provider Login / CAPTCHA</a>}
              <label className="block text-sm font-bold">New access token<textarea type="password" value={tokenForm.access_token} onChange={(e) => setTokenForm({ ...tokenForm, access_token: e.target.value })} className="mt-1 min-h-24 w-full rounded-xl border p-3 font-mono text-xs" placeholder="Token is encrypted and never returned to the browser" /></label>
              <div className="grid gap-3 md:grid-cols-2"><Input label="Expires in minutes" type="number" value={tokenForm.expires_in_minutes} onChange={(value) => setTokenForm({ ...tokenForm, expires_in_minutes: Number(value) })}/><Input label="Resume limit" type="number" value={tokenForm.resume_limit} onChange={(value) => setTokenForm({ ...tokenForm, resume_limit: Number(value) })}/></div>
              <Toggle label="Resume saved pending requests after token update" checked={Boolean(tokenForm.resume_pending)} onChange={(value) => setTokenForm({ ...tokenForm, resume_pending: value })}/>
              <button disabled={busy || !tokenForm.access_token} onClick={saveToken} className="w-full rounded-xl bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-50">Save Token & Resume Pending</button>
              <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">NST does not OCR, bypass or reuse CAPTCHA/OTP. CAPTCHA is completed only on the authorized provider page. This screen safely preserves and resumes the verification request.</p>
            </div>
          </section>

          <section className="overflow-auto rounded-2xl border bg-white shadow-sm"><table className="w-full min-w-[1050px] text-left text-sm"><thead><tr className="bg-slate-50"><Header items={['Request', 'NID', 'DOB', 'Status', 'Provider', 'Retries', 'Message', 'Created', 'Actions']} /></tr></thead><tbody>{checks.map((item) => <tr key={item.id} className="border-t"><td className="p-3 font-mono text-xs">#{item.id}<br/>{item.request_uuid?.slice(0, 8)}</td><td className="p-3 font-bold">{item.nid_masked || item.nid_number}</td><td className="p-3">{item.date_of_birth}</td><td className="p-3"><Status value={item.status}/></td><td className="p-3">{item.provider_name || '—'}</td><td className="p-3">{item.retry_count}</td><td className="max-w-xs p-3 text-xs text-slate-500">{item.error_message || item.short_note || '—'}</td><td className="p-3 text-xs">{item.created_at}</td><td className="p-3"><div className="flex gap-3"><button onClick={() => openRecord(item.id)} className="font-black text-[var(--nst-dashboard-primary)]">View</button>{['auth_required','failed','queued','configuration_required'].includes(item.status) && <button onClick={() => resume(item.id)} className="font-black text-blue-700">Resume</button>}{!['verified','rejected','cancelled'].includes(item.status) && <button onClick={() => cancel(item.id)} className="font-black text-rose-600">Cancel</button>}</div></td></tr>)}</tbody></table></section>

          <details className="rounded-2xl border bg-white p-5 shadow-sm"><summary className="cursor-pointer font-black">Provider Configuration (Super Admin)</summary><div className="mt-5 space-y-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Input label="Provider Name" value={provider.name} onChange={(value) => setProvider({ ...provider, name: value })}/><Select label="Mode" value={provider.mode} onChange={(value) => setProvider({ ...provider, mode: value })} options={[['manual','Manual Review'],['official_api','Authorized Official API']]}/><Input label="API URL" value={provider.api_url || ''} onChange={(value) => setProvider({ ...provider, api_url: value })}/><Input label="Authentication URL" value={provider.authentication_url || ''} onChange={(value) => setProvider({ ...provider, authentication_url: value })}/><Select label="Method" value={provider.http_method} onChange={(value) => setProvider({ ...provider, http_method: value })} options={['GET','POST','PUT','PATCH'].map((v) => [v,v])}/><Select label="Request Format" value={provider.request_format} onChange={(value) => setProvider({ ...provider, request_format: value })} options={[['json','JSON'],['form','Form']]}/><Select label="Auth Type" value={provider.auth_type} onChange={(value) => setProvider({ ...provider, auth_type: value })} options={[['none','None'],['bearer','Bearer'],['custom_header','Custom Header']]}/><Input label="Auth Header" value={provider.auth_header || ''} onChange={(value) => setProvider({ ...provider, auth_header: value })}/><Input label="Auth Scheme" value={provider.auth_scheme || ''} onChange={(value) => setProvider({ ...provider, auth_scheme: value })}/><Input label="Success Path" value={provider.success_path || ''} onChange={(value) => setProvider({ ...provider, success_path: value })}/><Input label="Timeout Seconds" type="number" value={provider.timeout_seconds} onChange={(value) => setProvider({ ...provider, timeout_seconds: Number(value) })}/><Toggle label="Active Provider" checked={Boolean(provider.is_active)} onChange={(value) => setProvider({ ...provider, is_active: value })}/></div><div className="grid gap-3 xl:grid-cols-2"><JsonBox label="Request Headers JSON" value={providerJson.request_headers} onChange={(value) => setProviderJson({ ...providerJson, request_headers: value })}/><JsonBox label="Request Template JSON" value={providerJson.request_template} onChange={(value) => setProviderJson({ ...providerJson, request_template: value })}/><JsonBox label="Response Mapping JSON" value={providerJson.response_mapping} onChange={(value) => setProviderJson({ ...providerJson, response_mapping: value })}/><JsonBox label="Success Values JSON" value={providerJson.success_values} onChange={(value) => setProviderJson({ ...providerJson, success_values: value })}/></div><p className="text-xs text-slate-500">Template placeholders: {'{{nid_number}}'}, {'{{date_of_birth}}'}, {'{{request_uuid}}'}, {'{{custom.field_key}}'}.</p><button onClick={saveProvider} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 font-black text-white">Save Provider</button></div></details>

          <details className="rounded-2xl border bg-white p-5 shadow-sm"><summary className="cursor-pointer font-black">Custom NID Field Builder (Super Admin)</summary><div className="mt-5 grid gap-5 xl:grid-cols-[380px_1fr]"><div className="space-y-3"><Input label="Label" value={fieldForm.label} onChange={(value) => setFieldForm({ ...fieldForm, label: value })}/><Input label="Field Key" value={fieldForm.field_key} onChange={(value) => setFieldForm({ ...fieldForm, field_key: value.toLowerCase().replace(/[^a-z0-9_.-]/g, '_') })}/><Select label="Field Type" value={fieldForm.field_type} onChange={(value) => setFieldForm({ ...fieldForm, field_type: value })} options={['text','textarea','number','date','select','checkbox','json'].map((v) => [v,v])}/><Input label="Placeholder" value={fieldForm.placeholder} onChange={(value) => setFieldForm({ ...fieldForm, placeholder: value })}/><label className="block text-sm font-bold">Select options, one per line<textarea value={fieldForm.optionsText} onChange={(e) => setFieldForm({ ...fieldForm, optionsText: e.target.value })} className="mt-1 min-h-24 w-full rounded-xl border p-3" /></label><div className="grid gap-2"><Toggle label="Required" checked={fieldForm.is_required} onChange={(value) => setFieldForm({ ...fieldForm, is_required: value })}/><Toggle label="Send to provider" checked={fieldForm.send_to_provider} onChange={(value) => setFieldForm({ ...fieldForm, send_to_provider: value })}/><Toggle label="Internal only" checked={fieldForm.internal_only} onChange={(value) => setFieldForm({ ...fieldForm, internal_only: value })}/></div><button onClick={saveField} className="w-full rounded-xl bg-slate-950 px-5 py-3 font-black text-white">{editingFieldId ? 'Update Field' : 'Add Field'}</button></div><div className="overflow-auto"><table className="w-full min-w-[700px] text-sm"><thead><tr className="bg-slate-50"><Header items={['Label','Key','Type','Required','Provider','Active','Actions']} /></tr></thead><tbody>{fields.map((field) => <tr key={field.id} className="border-t"><td className="p-3 font-bold">{field.label}</td><td className="p-3 font-mono text-xs">{field.field_key}</td><td className="p-3">{field.field_type}</td><td className="p-3">{field.is_required ? 'Yes' : 'No'}</td><td className="p-3">{field.send_to_provider ? 'Yes' : 'No'}</td><td className="p-3">{field.is_active ? 'Yes' : 'No'}</td><td className="p-3"><button onClick={() => editField(field)} className="mr-3 font-black text-[var(--nst-dashboard-primary)]">Edit</button><button onClick={() => run(() => finalOperationsService.deleteNidField(field.id), 'Field deleted.')} className="font-black text-rose-600">Delete</button></td></tr>)}</tbody></table></div></div></details>
        </div>
      )}

      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-xl font-black">NID Verification #{selected.id}</h2><p className="font-mono text-xs text-slate-400">{selected.request_uuid}</p></div><button onClick={() => setSelected(null)} className="text-2xl">×</button></div><div className="mt-4 grid gap-3 md:grid-cols-2"><Info label="NID" value={selected.nid_number}/><Info label="DOB" value={selected.date_of_birth}/><Info label="Status" value={selected.status}/><Info label="Provider" value={selected.provider_name || '—'}/><Info label="Retries" value={selected.retry_count}/><Info label="Error" value={selected.error_message || '—'}/></div><JsonView title="Custom Data" data={selected.custom_data}/><JsonView title="Mapped Result" data={selected.mapped_result}/>{['manual_review','failed','configuration_required'].includes(selected.status) && <div className="mt-5 space-y-3 rounded-xl border p-4"><h3 className="font-black">Authorized Manual Decision</h3><Select label="Decision" value={manualResult.decision} onChange={(value) => setManualResult({ ...manualResult, decision: value })} options={[['verified','Verified'],['rejected','Rejected']]}/><JsonBox label="Result JSON" value={manualResult.resultText} onChange={(value) => setManualResult({ ...manualResult, resultText: value })}/><Input label="Note" value={manualResult.note} onChange={(value) => setManualResult({ ...manualResult, note: value })}/><button onClick={saveManual} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 font-black text-white">Save Manual Result</button></div>}</div></div>}
    </div>
  );
}

function SessionSecurityTab({ policy, setPolicy, save, busy }) {
  const roles = ['super_admin','admin','accountant','branch_manager','salesman','staff'];
  const opts = [['','Inherit global'],['5','5 minutes'],['10','10 minutes'],['20','20 minutes'],['0','Infinity']];
  return <section className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm"><div><h2 className="text-lg font-black">Inactivity / Session Timeout</h2><p className="text-sm text-slate-500">Priority: user override → role policy → global default. Allowed values: 5, 10, 20 minutes or Infinity.</p></div><Select label="Global default" value={String(policy.global_minutes ?? 20)} onChange={(value)=>setPolicy({...policy,global_minutes:Number(value)})} options={opts.slice(1)}/><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{roles.map(role=><Select key={role} label={role.replace(/_/g,' ')} value={policy.role_minutes?.[role] == null ? '' : String(policy.role_minutes[role])} onChange={(value)=>setPolicy({...policy,role_minutes:{...(policy.role_minutes||{}),[role]:value===''?null:Number(value)}})} options={opts}/>)}</div><button disabled={busy} onClick={save} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 font-black text-white disabled:opacity-50">Save Session Policy</button></section>;
}

function EventsTab({ events, settings, setSettings, resolve, saveSettings }) { return <div className="space-y-5"><section className="grid gap-3 rounded-2xl border bg-white p-5 shadow-sm md:grid-cols-[1fr_auto_auto] md:items-end"><Input label="High/Critical Alert Email" type="email" value={settings.alert_email || ''} onChange={(value) => setSettings({ ...settings, alert_email: value })}/><Toggle label="Email alerts enabled" checked={Boolean(settings.high_critical_email_enabled)} onChange={(value) => setSettings({ ...settings, high_critical_email_enabled: value })}/><button onClick={saveSettings} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 font-black text-white">Save Settings</button></section><div className="overflow-auto rounded-2xl border bg-white shadow-sm"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="bg-slate-50"><Header items={['Time','Severity','Event','User / Role','IP','URL','Status','Action']} /></tr></thead><tbody>{events.map((item) => <tr key={item.id} className="border-t"><td className="p-3">{item.created_at}</td><td className="p-3 font-black uppercase">{item.severity}</td><td className="p-3">{item.event_type}</td><td className="p-3">{item.user_name || 'Guest'}<br/><span className="text-xs text-slate-400">{item.role_name}</span></td><td className="p-3">{item.ip_address}</td><td className="max-w-xs truncate p-3">{item.url}</td><td className="p-3">{item.status}</td><td className="p-3">{item.status !== 'resolved' && <button onClick={() => resolve(item.id)} className="font-bold text-[var(--nst-dashboard-primary)]">Resolve</button>}</td></tr>)}</tbody></table></div></div>; }
function CaptchaTab({ settings, setSettings, saveSettings }) { return <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><section className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm"><div><h2 className="text-lg font-black">hCaptcha Integration</h2><p className="mt-1 text-sm text-slate-500">The secret key is encrypted before storage and never returned to the browser.</p></div><div className="grid gap-4 md:grid-cols-2"><Toggle label="Enable hCaptcha" checked={Boolean(settings.hcaptcha_enabled)} onChange={(value) => setSettings({ ...settings, hcaptcha_enabled: value })}/><Toggle label="Test Mode" checked={Boolean(settings.hcaptcha_test_mode)} onChange={(value) => setSettings({ ...settings, hcaptcha_test_mode: value })}/><Input label="Site Key" value={settings.hcaptcha_site_key || ''} onChange={(value) => setSettings({ ...settings, hcaptcha_site_key: value })}/><Input label={settings.hcaptcha_secret_configured ? 'Secret Key (leave blank to keep)' : 'Secret Key'} type="password" value={settings.hcaptcha_secret_key || ''} onChange={(value) => setSettings({ ...settings, hcaptcha_secret_key: value, hcaptcha_clear_secret: false })}/></div><div className="grid gap-3 md:grid-cols-3"><Toggle label="Customer Login" checked={Boolean(settings.hcaptcha_customer_login)} onChange={(value) => setSettings({ ...settings, hcaptcha_customer_login: value })}/><Toggle label="Customer Registration" checked={Boolean(settings.hcaptcha_customer_registration)} onChange={(value) => setSettings({ ...settings, hcaptcha_customer_registration: value })}/><Toggle label="Checkout Registration" checked={Boolean(settings.hcaptcha_checkout_registration)} onChange={(value) => setSettings({ ...settings, hcaptcha_checkout_registration: value })}/><Toggle label="Supplier Login" checked={Boolean(settings.hcaptcha_supplier_login)} onChange={(value) => setSettings({ ...settings, hcaptcha_supplier_login: value })}/><Toggle label="Admin / POS Login" checked={Boolean(settings.hcaptcha_admin_login)} onChange={(value) => setSettings({ ...settings, hcaptcha_admin_login: value })}/></div><p className="text-xs text-slate-500">Turn on Admin / POS Login only after a real login with the captcha works on the customer or supplier page, so staff are never locked out by a wrong key.</p><button onClick={saveSettings} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 font-black text-white">Save hCaptcha Settings</button></section><aside className="rounded-2xl border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-[var(--nst-dashboard-primary-soft)] p-5 text-sm text-[var(--nst-dashboard-primary)]"><h3 className="font-black">Configuration status</h3><p className="mt-3">Site key: <b>{settings.hcaptcha_site_key ? 'Configured' : settings.hcaptcha_test_mode ? 'Test key' : 'Missing'}</b></p><p>Secret key: <b>{settings.hcaptcha_secret_configured ? 'Configured' : settings.hcaptcha_test_mode ? 'Test secret' : 'Missing'}</b></p></aside></div>; }
function DynamicField({ field, value, onChange }) { if (field.field_type === 'checkbox') return <Toggle label={field.label} checked={Boolean(value)} onChange={onChange}/>; if (field.field_type === 'select') return <Select label={field.label} value={value || ''} onChange={onChange} options={[['','Select'], ...(field.options || []).map((v) => [v,v])]}/>; if (field.field_type === 'textarea' || field.field_type === 'json') return <label className="block text-sm font-bold">{field.label}<textarea value={value || ''} placeholder={field.placeholder || ''} onChange={(e) => onChange(e.target.value)} className="mt-1 min-h-24 w-full rounded-xl border p-3" /></label>; return <Input label={field.label} type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'} value={value ?? ''} placeholder={field.placeholder || ''} onChange={onChange}/>; }
function Tab({ active, onClick, children }) { return <button onClick={onClick} className={`rounded-xl px-4 py-2 text-sm font-black ${active ? 'bg-[var(--nst-dashboard-primary)] text-white' : 'bg-white text-slate-600'}`}>{children}</button>; }
function Notice({ ok, children }) { return <div className={`rounded-xl border px-4 py-3 text-sm ${ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{children}</div>; }
function Header({ items }) { return <>{items.map((item) => <th key={item} className="p-3 font-black">{item}</th>)}</>; }
function Input({ label, value, onChange, type = 'text', placeholder = '' }) { return <label className="block text-sm font-bold">{label}<input type={type} value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label>; }
function Select({ label, value, onChange, options }) { return <label className="block text-sm font-bold">{label}<select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-xl border bg-white p-3">{options.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>; }
function Toggle({ label, checked, onChange }) { return <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}</label>; }
function JsonBox({ label, value, onChange }) { return <label className="block text-sm font-bold">{label}<textarea value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 min-h-36 w-full rounded-xl border p-3 font-mono text-xs" /></label>; }
function Status({ value }) { const style = value === 'verified' ? 'bg-green-100 text-green-700' : value === 'auth_required' ? 'bg-amber-100 text-amber-800' : value === 'failed' || value === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'; return <span className={`rounded-full px-2 py-1 text-xs font-black ${style}`}>{value}</span>; }
function Info({ label, value }) { return <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold text-slate-400">{label}</div><div className="mt-1 break-words font-bold">{String(value ?? '—')}</div></div>; }
function JsonView({ title, data }) { return <div className="mt-4"><h3 className="mb-2 font-black">{title}</h3><pre className="max-h-72 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(data || {}, null, 2)}</pre></div>; }
