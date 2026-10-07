import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Plus, RefreshCw, Save, ShieldCheck, Truck, Wifi, XCircle } from 'lucide-react';
import api from '../../services/api';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Truck as NstHdrTruck } from 'lucide-react';

const emptyForm = {
  id: null,
  name: '',
  code: '',
  adapter: 'generic',
  is_enabled: false,
  is_default: false,
  base_url: '',
  credentials: {
    api_key: '',
    secret_key: '',
    client_id: '',
    client_secret: '',
    username: '',
    password: '',
    token: '',
    webhook_token: '',
  },
  settings: {
    auth_type: 'bearer',
    header_name: 'Authorization',
    test_endpoint: '',
    test_method: 'GET',
    token_endpoint: '',
    stores_endpoint: '',
    create_endpoint: '',
    track_endpoint: '',
    store_id: '',
    delivery_type: 48,
    item_type: 2,
    default_weight: 0.5,
    response_consignment_path: 'data.consignment_id',
    response_tracking_path: 'data.tracking_code',
    response_status_path: 'data.status',
    response_fee_path: 'data.delivery_fee',
    field_map: {
      order_no: 'order_no',
      recipient_name: 'recipient_name',
      recipient_phone: 'recipient_phone',
      recipient_address: 'recipient_address',
      cod_amount: 'cod_amount',
      note: 'note',
      item_description: 'item_description',
      quantity: 'quantity',
      weight: 'weight',
    },
  },
};

const fieldClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--nst-dashboard-primary)]';
const labelClass = 'space-y-1 text-sm font-black text-slate-700';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function providerToForm(provider) {
  const base = clone(emptyForm);

  return {
    ...base,
    ...provider,
    credentials: { ...base.credentials },
    settings: {
      ...base.settings,
      ...(provider.settings || {}),
      field_map: {
        ...base.settings.field_map,
        ...(provider.settings?.field_map || {}),
      },
    },
  };
}

function SecretInput({ label, name, value, configured, onChange }) {
  return (
    <label className={labelClass}>
      <span>{label}</span>
      <input
        type="password"
        autoComplete="new-password"
        value={value || ''}
        onChange={(event) => onChange(name, event.target.value)}
        placeholder={configured ? 'Configured — leave blank to keep current value' : 'Enter credential'}
        className={fieldClass}
      />
    </label>
  );
}

export default function DeliveryGatewayManagerPage() {
  const [providers, setProviders] = useState([]);
  const [form, setForm] = useState(clone(emptyForm));
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [testData, setTestData] = useState(null);

  const selectedProvider = useMemo(
    () => providers.find((row) => Number(row.id) === Number(selectedId)),
    [providers, selectedId],
  );

  const load = async (preferredId = null) => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get('/delivery-gateways');
      const rows = response?.data?.data || [];
      setProviders(rows);

      const nextId = preferredId ?? selectedId ?? rows[0]?.id ?? null;
      const selected = rows.find((row) => Number(row.id) === Number(nextId)) || rows[0];

      if (selected) {
        setSelectedId(selected.id);
        setForm(providerToForm(selected));
      } else {
        setSelectedId(null);
        setForm(clone(emptyForm));
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Delivery API settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const choose = (provider) => {
    setSelectedId(provider.id);
    setForm(providerToForm(provider));
    setMessage('');
    setError('');
    setTestData(null);
  };

  const setCredential = (name, value) => {
    setForm((old) => ({
      ...old,
      credentials: { ...old.credentials, [name]: value },
    }));
  };

  const setSetting = (name, value) => {
    setForm((old) => ({
      ...old,
      settings: { ...old.settings, [name]: value },
    }));
  };

  const setFieldMap = (name, value) => {
    setForm((old) => ({
      ...old,
      settings: {
        ...old.settings,
        field_map: {
          ...(old.settings.field_map || {}),
          [name]: value,
        },
      },
    }));
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const payload = {
        name: form.name,
        code: form.code,
        adapter: form.adapter,
        is_enabled: Boolean(form.is_enabled),
        is_default: Boolean(form.is_default),
        base_url: form.base_url || null,
        credentials: form.credentials,
        settings: {
          ...form.settings,
          store_id: form.settings.store_id || '',
          delivery_type: Number(form.settings.delivery_type || 48),
          item_type: Number(form.settings.item_type || 2),
          default_weight: Number(form.settings.default_weight || 0.5),
        },
      };

      const response = form.id
        ? await api.put(`/delivery-gateways/${form.id}`, payload)
        : await api.post('/delivery-gateways', payload);

      const id = response?.data?.data?.id || form.id;
      setMessage(response?.data?.message || 'Delivery API settings saved.');
      await load(id);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Delivery API settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!form.id) {
      setError('Save the provider first, then test the connection.');
      return;
    }

    setTesting(true);
    setError('');
    setMessage('');
    setTestData(null);

    try {
      const response = await api.post(`/delivery-gateways/${form.id}/test`);
      setMessage(response?.data?.message || 'Connection successful.');
      setTestData(response?.data?.data || null);
      await load(form.id);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Connection test failed.');
      await load(form.id);
    } finally {
      setTesting(false);
    }
  };

  const newCustom = () => {
    const next = clone(emptyForm);
    next.name = 'New Courier API';
    next.code = `courier_${Date.now()}`;
    setSelectedId(null);
    setForm(next);
    setMessage('');
    setError('');
    setTestData(null);
  };

  const copyWebhook = async () => {
    const value = selectedProvider?.webhook_url;
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    setMessage('Webhook URL copied.');
  };

  const credentialStatus = selectedProvider?.credential_status || {};

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-7">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <NstPageHeader icon={NstHdrTruck} title={<>Delivery API Manager</>} subtitle={<>Connect Steadfast, Pathao, Sundarban or any courier API. Credentials are encrypted by Laravel and are never returned to the browser.
              </>} actions={<><div className="flex flex-wrap gap-2">
              <button onClick={() => load()} disabled={loading} className={`${buttonClass} border border-slate-200 bg-white text-slate-700`}>
                <RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
              <button onClick={newCustom} className={`${buttonClass} bg-slate-950 text-white`}>
                <Plus size={17} /> Add Custom Courier
              </button>
            </div></>}/>

        {message && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-800">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-black text-rose-800">
            {error}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[330px_1fr]">
          <aside className="space-y-3">
            {providers.map((provider) => (
              <button
                key={provider.id}
                onClick={() => choose(provider)}
                className={`w-full rounded-[1.6rem] border bg-white p-5 text-left shadow-sm transition ${
                  Number(selectedId) === Number(provider.id)
                    ? 'border-[var(--nst-dashboard-primary)] ring-2 ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_18%,transparent)]'
                    : 'border-slate-100'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Truck size={18} className="text-[var(--nst-dashboard-primary)]" />
                      <p className="font-black text-slate-950">{provider.name}</p>
                    </div>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{provider.adapter}</p>
                  </div>
                  {provider.connection_status === 'connected'
                    ? <CheckCircle2 size={20} className="text-emerald-500" />
                    : provider.connection_status === 'failed'
                      ? <XCircle size={20} className="text-rose-500" />
                      : <Wifi size={20} className="text-slate-300" />}
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
                  <span className={`rounded-full px-2.5 py-1 ${provider.is_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {provider.is_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  {provider.is_default && <span className="rounded-full bg-violet-100 px-2.5 py-1 text-violet-700">Default</span>}
                </div>
              </button>
            ))}
          </aside>

          <main className="space-y-5 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <label className={labelClass}>
                <span>Provider Name</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldClass} />
              </label>

              <label className={labelClass}>
                <span>Provider Code</span>
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={fieldClass} />
              </label>

              <label className={labelClass}>
                <span>Adapter</span>
                <select value={form.adapter} onChange={(e) => setForm({ ...form, adapter: e.target.value })} className={fieldClass}>
                  <option value="steadfast">Steadfast</option>
                  <option value="pathao">Pathao</option>
                  <option value="generic">Sundarban / Generic API</option>
                </select>
              </label>

              <label className={labelClass}>
                <span>API Base URL</span>
                <input value={form.base_url || ''} onChange={(e) => setForm({ ...form, base_url: e.target.value })} className={fieldClass} placeholder="https://..." />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black">
                <input type="checkbox" checked={Boolean(form.is_enabled)} onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })} />
                Enable this courier
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black">
                <input type="checkbox" checked={Boolean(form.is_default)} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
                Default courier
              </label>
            </div>

            <section className="rounded-[1.6rem] bg-slate-50 p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-[var(--nst-dashboard-primary)]" />
                <h2 className="text-lg font-black text-slate-950">Credentials</h2>
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Saved credentials are encrypted at rest. Leave an already configured secret blank to keep it unchanged.
              </p>

              {form.adapter === 'steadfast' && (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <SecretInput label="API Key" name="api_key" value={form.credentials.api_key} configured={credentialStatus.api_key} onChange={setCredential} />
                  <SecretInput label="Secret Key" name="secret_key" value={form.credentials.secret_key} configured={credentialStatus.secret_key} onChange={setCredential} />
                  <SecretInput label="Webhook Bearer Token (optional)" name="webhook_token" value={form.credentials.webhook_token} configured={credentialStatus.webhook_token} onChange={setCredential} />
                </div>
              )}

              {form.adapter === 'pathao' && (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <SecretInput label="Client ID" name="client_id" value={form.credentials.client_id} configured={credentialStatus.client_id} onChange={setCredential} />
                  <SecretInput label="Client Secret" name="client_secret" value={form.credentials.client_secret} configured={credentialStatus.client_secret} onChange={setCredential} />
                  <SecretInput label="Developer API Username" name="username" value={form.credentials.username} configured={credentialStatus.username} onChange={setCredential} />
                  <SecretInput label="Developer API Password" name="password" value={form.credentials.password} configured={credentialStatus.password} onChange={setCredential} />
                  <SecretInput label="Webhook Token (optional)" name="webhook_token" value={form.credentials.webhook_token} configured={credentialStatus.webhook_token} onChange={setCredential} />
                </div>
              )}

              {form.adapter === 'generic' && (
                <>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className={labelClass}>
                      <span>Authentication Type</span>
                      <select value={form.settings.auth_type || 'bearer'} onChange={(e) => setSetting('auth_type', e.target.value)} className={fieldClass}>
                        <option value="bearer">Bearer Token</option>
                        <option value="header">API Key Header</option>
                        <option value="basic">Basic Auth</option>
                        <option value="none">No Auth</option>
                      </select>
                    </label>
                    {form.settings.auth_type === 'header' && (
                      <label className={labelClass}>
                        <span>Header Name</span>
                        <input value={form.settings.header_name || ''} onChange={(e) => setSetting('header_name', e.target.value)} className={fieldClass} placeholder="X-API-Key" />
                      </label>
                    )}
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {(form.settings.auth_type === 'bearer' || form.settings.auth_type === 'header') && (
                      <SecretInput
                        label={form.settings.auth_type === 'bearer' ? 'Bearer Token' : 'API Key'}
                        name={form.settings.auth_type === 'bearer' ? 'token' : 'api_key'}
                        value={form.settings.auth_type === 'bearer' ? form.credentials.token : form.credentials.api_key}
                        configured={form.settings.auth_type === 'bearer' ? credentialStatus.token : credentialStatus.api_key}
                        onChange={setCredential}
                      />
                    )}
                    {form.settings.auth_type === 'basic' && (
                      <>
                        <SecretInput label="Username" name="username" value={form.credentials.username} configured={credentialStatus.username} onChange={setCredential} />
                        <SecretInput label="Password" name="password" value={form.credentials.password} configured={credentialStatus.password} onChange={setCredential} />
                      </>
                    )}
                    <SecretInput label="Webhook Token (optional)" name="webhook_token" value={form.credentials.webhook_token} configured={credentialStatus.webhook_token} onChange={setCredential} />
                  </div>
                </>
              )}
            </section>

            <section className="rounded-[1.6rem] border border-slate-200 p-5">
              <h2 className="text-lg font-black text-slate-950">API Endpoints & Order Rules</h2>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {form.adapter === 'pathao' && (
                  <>
                    <label className={labelClass}><span>Token Endpoint</span><input value={form.settings.token_endpoint || ''} onChange={(e) => setSetting('token_endpoint', e.target.value)} className={fieldClass} /></label>
                    <label className={labelClass}><span>Stores Endpoint</span><input value={form.settings.stores_endpoint || ''} onChange={(e) => setSetting('stores_endpoint', e.target.value)} className={fieldClass} /></label>
                    <label className={labelClass}><span>Pathao Store ID</span><input value={form.settings.store_id || ''} onChange={(e) => setSetting('store_id', e.target.value)} className={fieldClass} /></label>
                    <label className={labelClass}><span>Delivery Type</span><input type="number" value={form.settings.delivery_type || 48} onChange={(e) => setSetting('delivery_type', e.target.value)} className={fieldClass} /></label>
                    <label className={labelClass}><span>Item Type</span><input type="number" value={form.settings.item_type || 2} onChange={(e) => setSetting('item_type', e.target.value)} className={fieldClass} /></label>
                  </>
                )}

                <label className={labelClass}><span>Test Endpoint</span><input value={form.settings.test_endpoint || ''} onChange={(e) => setSetting('test_endpoint', e.target.value)} className={fieldClass} placeholder="/health or /get_balance" /></label>
                <label className={labelClass}><span>Create Order Endpoint</span><input value={form.settings.create_endpoint || ''} onChange={(e) => setSetting('create_endpoint', e.target.value)} className={fieldClass} placeholder="/orders" /></label>
                <label className={labelClass}><span>Tracking Endpoint</span><input value={form.settings.track_endpoint || ''} onChange={(e) => setSetting('track_endpoint', e.target.value)} className={fieldClass} placeholder="/track/{tracking}" /></label>
                <label className={labelClass}><span>Default Weight (KG)</span><input type="number" min="0.1" step="0.1" value={form.settings.default_weight || 0.5} onChange={(e) => setSetting('default_weight', e.target.value)} className={fieldClass} /></label>
              </div>

              {form.adapter === 'generic' && (
                <div className="mt-5">
                  <p className="text-sm font-black text-slate-800">Generic Field Mapping</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Left side is NST data; enter the exact field name required by the courier API.</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {Object.keys(emptyForm.settings.field_map).map((key) => (
                      <label key={key} className={labelClass}>
                        <span>{key}</span>
                        <input value={form.settings.field_map?.[key] || ''} onChange={(e) => setFieldMap(key, e.target.value)} className={fieldClass} />
                      </label>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className={labelClass}><span>Response Consignment Path</span><input value={form.settings.response_consignment_path || ''} onChange={(e) => setSetting('response_consignment_path', e.target.value)} className={fieldClass} /></label>
                    <label className={labelClass}><span>Response Tracking Path</span><input value={form.settings.response_tracking_path || ''} onChange={(e) => setSetting('response_tracking_path', e.target.value)} className={fieldClass} /></label>
                    <label className={labelClass}><span>Response Status Path</span><input value={form.settings.response_status_path || ''} onChange={(e) => setSetting('response_status_path', e.target.value)} className={fieldClass} /></label>
                    <label className={labelClass}><span>Response Delivery Fee Path</span><input value={form.settings.response_fee_path || ''} onChange={(e) => setSetting('response_fee_path', e.target.value)} className={fieldClass} /></label>
                  </div>
                </div>
              )}
            </section>

            {selectedProvider?.webhook_url && (
              <section className="rounded-[1.6rem] bg-slate-950 p-5 text-white">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Webhook / Callback URL</p>
                <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-center">
                  <code className="min-w-0 flex-1 break-all rounded-xl bg-white/10 px-4 py-3 text-xs font-bold">{selectedProvider.webhook_url}</code>
                  <button onClick={copyWebhook} className={`${buttonClass} bg-white text-slate-950`}><Copy size={16} /> Copy</button>
                </div>
              </section>
            )}

            {testData?.stores?.length > 0 && (
              <section className="rounded-[1.6rem] border border-emerald-200 bg-emerald-50 p-5">
                <p className="font-black text-emerald-900">Pathao Stores Returned by API</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {testData.stores.map((store) => (
                    <button
                      key={store.store_id}
                      type="button"
                      onClick={() => setSetting('store_id', String(store.store_id))}
                      className="rounded-xl border border-emerald-200 bg-white p-3 text-left text-sm"
                    >
                      <p className="font-black text-emerald-900">{store.store_name || `Store #${store.store_id}`}</p>
                      <p className="text-xs font-semibold text-emerald-700">{store.store_id} · {store.store_address}</p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="flex flex-wrap gap-3">
              <button onClick={save} disabled={saving} className={`${buttonClass} bg-[var(--nst-dashboard-primary)] text-white`}>
                <Save size={17} /> {saving ? 'Saving…' : 'Save Provider'}
              </button>
              <button onClick={testConnection} disabled={testing || !form.id} className={`${buttonClass} bg-emerald-600 text-white`}>
                <Wifi size={17} /> {testing ? 'Testing…' : 'Test Connection'}
              </button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
