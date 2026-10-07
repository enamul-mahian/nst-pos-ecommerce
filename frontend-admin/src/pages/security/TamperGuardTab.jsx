import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useT } from '../../i18n';

const FIELDS = ['enabled', 'website', 'admin', 'detect_devtools', 'whitelist_super_admin'];

export default function TamperGuardTab() {
  const t = useT();
  const [values, setValues] = useState(null);
  const [state, setState] = useState({ busy: false, message: '', error: '' });

  useEffect(() => {
    api.get('/security/tamper-guard-settings')
      .then((response) => setValues(response?.data?.data || {}))
      .catch((error) => setState({ busy: false, message: '', error: error?.response?.data?.message || t('security_guard.load_failed') }));
  }, [t]);

  const save = async () => {
    setState({ busy: true, message: '', error: '' });
    try {
      const response = await api.put('/security/tamper-guard-settings', values);
      setValues(response?.data?.data || values);
      setState({ busy: false, message: response?.data?.message || t('security_guard.saved'), error: '' });
    } catch (error) {
      setState({ busy: false, message: '', error: error?.response?.data?.message || t('security_guard.save_failed') });
    }
  };

  return <section className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm">
    <div>
      <h2 className="text-lg font-black">{t('security_guard.title')}</h2>
      <p className="mt-1 text-sm text-slate-500">{t('security_guard.subtitle')}</p>
    </div>
    {state.message && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{state.message}</div>}
    {state.error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</div>}
    {values && <div className="grid gap-3 md:grid-cols-2">
      {FIELDS.map((field) => <label key={field} className={`flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm ${field !== 'enabled' && !values.enabled ? 'opacity-60' : ''}`}>
        <input type="checkbox" className="mt-1" checked={Boolean(values[field])} disabled={field !== 'enabled' && !values.enabled} onChange={(event) => setValues({ ...values, [field]: event.target.checked })}/>
        <span><b className="block text-slate-800">{t(`security_guard.fields.${field}`)}</b><span className="text-slate-500">{t(`security_guard.help.${field}`)}</span></span>
      </label>)}
    </div>}
    <div className="rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-800">{t('security_guard.limits')}</div>
    <button type="button" disabled={!values || state.busy} onClick={save} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-black text-white disabled:opacity-50">{state.busy ? t('security_guard.saving') : t('security_guard.save')}</button>
  </section>;
}
