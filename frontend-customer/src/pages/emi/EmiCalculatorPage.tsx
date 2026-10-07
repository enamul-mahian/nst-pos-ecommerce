import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Calculator, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../../api/client';

type Bank = { id: number; bank_name: string; minimum_amount?: number; note?: string; tenure_charges?: Record<string, number> };
type Result = { bank_id: number; bank_name: string; tenure: number; charge_percent: number; monthly_emi: number; total_amount: number; eligible: boolean; minimum_amount: number; note?: string };

const money = (value: number) => `৳${Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 0 })}`;

export default function EmiCalculatorPage() {
  const [params] = useSearchParams();
  const [price, setPrice] = useState(params.get('price') || '');
  const [bankId, setBankId] = useState('');
  const [tenure, setTenure] = useState('');
  const [banks, setBanks] = useState<Bank[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.get('/public/emi-banks', { params: { active_only: true } })
      .then((response) => setBanks(response.data?.data || []))
      .catch(() => setError('EMI plans could not be loaded right now.'));
  }, []);

  const calculate = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.get('/public/emi-calculate', { params: { price: Number(price), bank_id: bankId || undefined, tenure: tenure || undefined } });
      setResults(response.data?.data || []);
    } catch {
      setResults([]);
      setError('Enter a valid purchase amount to calculate available plans.');
    } finally {
      setLoading(false);
    }
  };

  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
    <Helmet><title>EMI Calculator | New Singapur Telecom</title><meta name="description" content="Calculate available New Singapur Telecom EMI plans from current bank rules." /></Helmet>
    <header className="mb-7 max-w-2xl"><p className="text-xs font-black uppercase tracking-[.18em] text-[#138a52]">NST Finance</p><h1 className="mt-2 text-3xl font-black text-slate-900">EMI Calculator</h1><p className="mt-2 text-sm font-semibold leading-6 text-slate-500">View monthly payments using the currently published bank plans and NST rules.</p></header>
    <form onSubmit={calculate} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
      <label className="text-xs font-black text-slate-600">Purchase amount<input required min="1" type="number" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold outline-none focus:border-[#138a52]" /></label>
      <label className="text-xs font-black text-slate-600">Bank<select value={bankId} onChange={(event) => setBankId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold outline-none focus:border-[#138a52]"><option value="">All active banks</option>{banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.bank_name}</option>)}</select></label>
      <label className="text-xs font-black text-slate-600">Tenure<select value={tenure} onChange={(event) => setTenure(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold outline-none focus:border-[#138a52]"><option value="">All tenures</option>{[3,6,9,12,18,24,30,36].map((item) => <option key={item} value={item}>{item} months</option>)}</select></label>
      <button type="submit" disabled={loading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#138a52] px-5 text-sm font-black text-white disabled:opacity-60"><Calculator className="h-4 w-4" />{loading ? 'Calculating' : 'Calculate'}</button>
    </form>
    {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
    <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{results.filter((result) => result.eligible).map((result) => <article key={`${result.bank_id}-${result.tenure}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><h2 className="font-black text-slate-900">{result.bank_name}</h2><span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">{result.tenure} months</span></div><p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-400">Monthly payment</p><p className="mt-1 text-2xl font-black text-[#138a52]">{money(result.monthly_emi)}</p><p className="mt-2 text-xs font-semibold text-slate-500">Total {money(result.total_amount)} · Charge {result.charge_percent}%</p>{result.note && <p className="mt-3 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500">{result.note}</p>}</article>)}</section>
    {!loading && !results.length && <div className="mt-7 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500"><RefreshCw className="mx-auto mb-2 h-5 w-5 text-slate-400" />Enter an amount to view eligible plans.</div>}
  </main>;
}
