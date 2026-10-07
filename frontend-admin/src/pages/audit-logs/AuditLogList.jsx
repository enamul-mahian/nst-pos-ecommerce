import { useEffect, useMemo, useState } from 'react';
import auditLogService from '../../services/auditLogService';
import { localDateString } from '../../utils/localDate';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { History as NstHdrHistory } from 'lucide-react';
import { useT } from '../../i18n';

const today = localDateString();
const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  .toISOString()
  .slice(0, 10);

const moduleOptions = [
  { label: 'All Modules', value: '' },
  { label: 'Sales', value: 'sales' },
  { label: 'Purchases', value: 'purchases' },
  { label: 'Customers', value: 'customers' },
  { label: 'Suppliers', value: 'suppliers' },
  { label: 'Expenses', value: 'expenses' },
  { label: 'Accounts', value: 'accounts' },
  { label: 'Products', value: 'products' },
  { label: 'Device Units', value: 'device_units' },
  { label: 'Branch Stock', value: 'branch_stocks' },
  { label: 'Stock Transfers', value: 'stock_transfers' },
  { label: 'Settings', value: 'settings' },
  { label: 'Auth', value: 'logout' },
];

const methodOptions = [
  { label: 'All Methods', value: '' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'PATCH', value: 'PATCH' },
  { label: 'DELETE', value: 'DELETE' },
];

const statusOptions = [
  { label: 'All Status', value: '' },
  { label: 'Success', value: 'success' },
  { label: 'Failed', value: 'failed' },
];

function StatCard({ title, value, subtitle }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <h3 className="mt-2 text-2xl font-extrabold text-[var(--nst-dashboard-text)]">{value}</h3>
      {subtitle && <p className="mt-2 text-xs text-gray-400">{subtitle}</p>}
    </div>
  );
}

function StatusBadge({ statusCode }) {
  const code = Number(statusCode || 0);
  const failed = code >= 400;

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
        failed ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
      }`}
    >
      {failed ? `Failed ${code}` : code ? `Success ${code}` : 'Success'}
    </span>
  );
}

function formatDateTime(value) {
  if (!value) return '-';

  try {
    return new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatJson(value) {
  if (!value || (typeof value === 'object' && Object.keys(value).length === 0)) {
    return '-';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getData(response) {
  return response?.data?.data || [];
}

export default function AuditLogList() {
  const t = useT();
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({ total: 0, success: 0, failed: 0, unique_users: 0 });
  const [globalSummary, setGlobalSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [filters, setFilters] = useState({
    search: '',
    module: '',
    method: '',
    status: '',
    date_from: firstDayOfMonth,
    date_to: today,
  });

  const params = useMemo(
    () => ({
      ...filters,
      page,
      per_page: 25,
    }),
    [filters, page]
  );

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError('');

      const [listResponse, summaryResponse] = await Promise.all([
        auditLogService.list(params),
        auditLogService.summary(),
      ]);

      setLogs(listResponse?.data?.data || []);
      setSummary(listResponse?.data?.summary || { total: 0, success: 0, failed: 0, unique_users: 0 });
      setPagination({
        current_page: Number(listResponse?.data?.current_page || 1),
        last_page: Number(listResponse?.data?.last_page || 1),
        total: Number(listResponse?.data?.total || 0),
      });
      setGlobalSummary(getData(summaryResponse));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Audit logs load failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const handleFilterChange = (key, value) => {
    setPage(1);
    setFilters((previous) => ({ ...previous, [key]: value }));
  };

  const resetFilters = () => {
    setPage(1);
    setFilters({
      search: '',
      module: '',
      method: '',
      status: '',
      date_from: firstDayOfMonth,
      date_to: today,
    });
  };

  return (
    <div className="p-4 md:p-6">
      <NstPageHeader icon={NstHdrHistory} title={<>Activity Logs / Audit Trail</>} subtitle={t('audit.subtitle')} actions={<><button
          type="button"
          onClick={fetchLogs}
          disabled={loading}
          className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[var(--nst-dashboard-primary)] disabled:opacity-60"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button></>}/>

      {error && (
        <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Filtered Logs" value={summary.total || 0} subtitle={t('audit.stats.filtered_subtitle')} />
        <StatCard title="Success" value={summary.success || 0} subtitle="Successful write actions" />
        <StatCard title="Failed" value={summary.failed || 0} subtitle="Failed write attempts" />
        <StatCard title="Today Total" value={globalSummary?.today_total || 0} subtitle={t('audit.stats.today_subtitle')} />
      </div>

      <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <input
            type="text"
            value={filters.search}
            onChange={(event) => handleFilterChange('search', event.target.value)}
            placeholder="Search user/action/path/IP..."
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)] md:col-span-2"
          />

          <select
            value={filters.module}
            onChange={(event) => handleFilterChange('module', event.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
          >
            {moduleOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select
            value={filters.method}
            onChange={(event) => handleFilterChange('method', event.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
          >
            {methodOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(event) => handleFilterChange('status', event.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={resetFilters}
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100"
          >
            Reset
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
            From
            <input
              type="date"
              value={filters.date_from}
              onChange={(event) => handleFilterChange('date_from', event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-normal text-gray-700 outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
            />
          </label>

          <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
            To
            <input
              type="date"
              value={filters.date_to}
              onChange={(event) => handleFilterChange('date_to', event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-normal text-gray-700 outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
            />
          </label>

          <div className="flex items-end text-sm text-gray-500">
            Showing {logs.length} of {pagination.total} logs
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Path</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan="6" className="px-4 py-10 text-center text-gray-500">Loading activity logs...</td>
                </tr>
              )}

              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-4 py-10 text-center text-gray-500">No audit log found.</td>
                </tr>
              )}

              {!loading && logs.map((log) => (
                <tr key={log.id} className="align-top hover:bg-gray-50/70">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDateTime(log.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-[var(--nst-dashboard-text)]">{log.user_name || log.user?.name || 'System'}</div>
                    <div className="text-xs text-gray-400">{log.user_email || log.user?.email || '-'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-gray-800">{log.action}</div>
                    <div className="mt-1 text-xs text-gray-400">{log.method} · {log.module || '-'}</div>
                  </td>
                  <td className="max-w-xs px-4 py-3">
                    <div className="truncate font-mono text-xs text-gray-600">/{log.path}</div>
                    <div className="mt-1 text-xs text-gray-400">{log.description || '-'}</div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge statusCode={log.status_code} /></td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-200"
                    >
                      {expandedId === log.id ? 'Hide' : 'View'}
                    </button>

                    {expandedId === log.id && (
                      <div className="mt-3 rounded-xl bg-gray-900 p-3 text-left text-xs text-gray-100">
                        <p className="mb-2 font-bold text-white">Request Payload</p>
                        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words">{formatJson(log.request_payload)}</pre>
                        {log.response_payload && (
                          <>
                            <p className="mb-2 mt-4 font-bold text-white">Error Response</p>
                            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words">{formatJson(log.response_payload)}</pre>
                          </>
                        )}
                        <p className="mb-2 mt-4 font-bold text-white">Meta</p>
                        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words">{formatJson(log.meta)}</pre>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">
            Page {pagination.current_page} of {pagination.last_page}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              disabled={pagination.current_page <= 1 || loading}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(current + 1, pagination.last_page))}
              disabled={pagination.current_page >= pagination.last_page || loading}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
