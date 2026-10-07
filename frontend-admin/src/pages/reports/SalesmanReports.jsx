import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import ReportExportPanel from '../../components/reports/ReportExportPanel';
import { localDateString } from '../../utils/localDate';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { FileSpreadsheet as NstHdrFileSpreadsheet } from 'lucide-react';
import { useT } from '../../i18n';

const BDT = new Intl.NumberFormat('en-BD', {
  style: 'currency',
  currency: 'BDT',
  maximumFractionDigits: 0,
});

function todayDate() {
  return localDateString();
}

function monthStartDate() {
  const now = new Date();
  return localDateString(new Date(now.getFullYear(), now.getMonth(), 1));
}

function unwrap(response) {
  return response?.data?.data || response?.data || {};
}

function money(value) {
  return BDT.format(Number(value || 0));
}

function number(value) {
  return Number(value || 0).toLocaleString('en-BD');
}

function StatCard({ title, value, subtitle }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md md:p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
      <h3 className="mt-2 text-2xl font-extrabold text-[var(--nst-dashboard-text)] md:text-3xl">{value}</h3>
      {subtitle && <p className="mt-2 text-xs text-slate-500">{subtitle}</p>}
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">{text}</div>;
}

function SalesmanTable({ rows }) {
  const t = useT();
  if (!rows?.length) {
    return <EmptyState text={t('reports.salesman.empty')} />;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="whitespace-nowrap px-4 py-3 font-bold">#</th>
            <th className="whitespace-nowrap px-4 py-3 font-bold">Salesman</th>
            <th className="whitespace-nowrap px-4 py-3 font-bold">Email</th>
            <th className="whitespace-nowrap px-4 py-3 text-right font-bold">Invoices</th>
            <th className="whitespace-nowrap px-4 py-3 text-right font-bold">Sales</th>
            <th className="whitespace-nowrap px-4 py-3 text-right font-bold">Paid</th>
            <th className="whitespace-nowrap px-4 py-3 text-right font-bold">Due</th>
            <th className="whitespace-nowrap px-4 py-3 text-right font-bold">Profit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={row.salesman_id || row.salesman_email || index} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-500">{index + 1}</td>
              <td className="whitespace-nowrap px-4 py-3 font-bold text-[var(--nst-dashboard-text)]">
                {row.salesman_name || 'Unknown Salesman'}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{row.salesman_email || '-'}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-700">{number(row.sale_count)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-700">{money(row.sale_amount)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-emerald-700">{money(row.paid_amount)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-amber-700">{money(row.due_amount)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-[var(--nst-dashboard-primary)]">{money(row.profit_amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyTrend({ rows }) {
  const t = useT();
  if (!rows?.length) {
    return <EmptyState text={t('reports.salesman.trend_empty')} />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map((row) => (
        <div key={row.date} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-400">{row.date}</p>
          <p className="mt-2 text-xl font-extrabold text-[var(--nst-dashboard-text)]">{money(row.sale_amount)}</p>
          <p className="mt-1 text-xs text-slate-500">Invoices: {number(row.sale_count)} | Profit: {money(row.profit_amount)}</p>
        </div>
      ))}
    </div>
  );
}

export default function SalesmanReports() {
  const t = useT();
  const [mode, setMode] = useState('daily');
  const [dateFrom, setDateFrom] = useState(todayDate());
  const [dateTo, setDateTo] = useState(todayDate());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const params = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      latest_limit: 8,
    }),
    [dateFrom, dateTo]
  );

  const applyDaily = () => {
    const today = todayDate();
    setMode('daily');
    setDateFrom(today);
    setDateTo(today);
  };

  const applyMonthly = () => {
    setMode('monthly');
    setDateFrom(monthStartDate());
    setDateTo(todayDate());
  };

  const loadReport = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/reports/sales', { params });
      setReport(unwrap(response));
    } catch (err) {
      console.error('Salesman report load failed:', err);
      setError(err?.response?.data?.message || err?.message || t('reports.salesman.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [params]);

  const summary = report?.summary || {};
  const salesmen = report?.by_salesman || [];
  const dailyTrend = report?.daily_trend || [];

  return (
    <div className="p-4 md:p-6">
      <NstPageHeader icon={NstHdrFileSpreadsheet} title={<>Salesman Reports</>} subtitle={t('reports.salesman.subtitle')} actions={<><div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={applyDaily}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${mode === 'daily' ? 'bg-[var(--nst-dashboard-primary)] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Today Daily
            </button>
            <button
              type="button"
              onClick={applyMonthly}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${mode === 'monthly' ? 'bg-[var(--nst-dashboard-primary)] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              This Month
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="text-xs font-bold uppercase text-slate-500">
              From
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
              />
            </label>
            <label className="text-xs font-bold uppercase text-slate-500">
              To
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
              />
            </label>
            <button
              type="button"
              onClick={loadReport}
              disabled={loading}
              className="rounded-xl bg-[var(--nst-dashboard-secondary)] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#111B31] disabled:opacity-60 sm:self-end"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div></>}/>

      <div className="mb-5">
        <ReportExportPanel dateFrom={dateFrom} dateTo={dateTo} defaultReportType="salesmen" compact />
      </div>

      {error && <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Sales" value={money(summary.total_sale_amount)} subtitle={`Period: ${dateFrom} to ${dateTo}`} />
        <StatCard title="Invoices" value={number(summary.sale_count)} subtitle="Total POS invoices" />
        <StatCard title="Paid" value={money(summary.total_paid_amount)} subtitle="Cash / Bank / Mobile received" />
        <StatCard title="Due" value={money(summary.total_due_amount)} subtitle="Customer due from this period" />
      </div>

      <div className="mb-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-[var(--nst-dashboard-text)]">Salesman Performance</h2>
            <p className="text-sm text-slate-500">{t('reports.salesman.performance_help')}</p>
          </div>
          <span className="rounded-full bg-[var(--nst-dashboard-primary-soft)] px-3 py-1 text-xs font-bold text-[var(--nst-dashboard-primary)]">
            {mode === 'daily' ? 'Daily View' : 'Monthly View'}
          </span>
        </div>
        <SalesmanTable rows={salesmen} />
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4">
          <h2 className="text-lg font-extrabold text-[var(--nst-dashboard-text)]">Daily Sales Trend</h2>
          <p className="text-sm text-slate-500">{t('reports.salesman.trend_help')}</p>
        </div>
        <DailyTrend rows={dailyTrend} />
      </div>
    </div>
  );
}
