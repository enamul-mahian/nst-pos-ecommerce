import { useState } from 'react';
import api from '../../services/api';
import { useT } from '../../i18n';
import LanguageSwitcher from '../../i18n/LanguageSwitcher';

export default function PublicWarrantyCheck() {
  const t = useT();
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const check = async () => {
    try {
      setError('');
      const response = await api.get('/public/warranty-check', { params: { query } });
      setData(response.data.data);
    } catch (err) {
      setData(null);
      setError(err?.response?.data?.message || t('public_warranty.not_found'));
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white text-slate-900 rounded-3xl p-6 md:p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-black text-slate-900">{t('public_warranty.title')}</h1>
          <LanguageSwitcher className="nst-login-language" />
        </div>
        <p className="text-slate-500 mt-2">{t('public_warranty.subtitle')}</p>
        <form className="flex gap-2 mt-5" onSubmit={(event) => { event.preventDefault(); check(); }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="flex-1 border border-slate-300 bg-white text-slate-900 rounded-xl px-4 py-3" placeholder={t('public_warranty.placeholder')} />
          <button type="submit" className="bg-[#8d39e4] text-white rounded-xl px-5 font-bold">{t('public_warranty.check')}</button>
        </form>
        {error && <p className="mt-4 text-red-600">{error}</p>}
        {data && (
          <div className="mt-5 bg-slate-50 text-slate-800 rounded-2xl p-5 space-y-2">
            <h2 className="text-xl font-black">{data.product_name}</h2>
            <p>{t('public_warranty.imei')}: {data.imei_1} {data.imei_2}</p>
            <p>{t('public_warranty.warranty')}: {data.warranty_type}</p>
            <p>{t('public_warranty.start')}: {data.warranty_start_date || '-'} | {t('public_warranty.end')}: {data.warranty_end_date || '-'}</p>
            <p>{t('public_warranty.status')}: <b>{data.status}</b> {data.remaining_days !== null && t('public_warranty.days_remaining', { days: data.remaining_days })}</p>
            <p className="text-sm text-slate-500">{data.terms}</p>
          </div>
        )}
      </div>
    </div>
  );
}
