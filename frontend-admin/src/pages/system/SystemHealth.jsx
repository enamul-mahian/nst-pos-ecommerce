import { useEffect, useMemo, useState } from 'react';
import systemHealthService, { downloadBlob } from '../../services/systemHealthService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Activity as NstHdrActivity } from 'lucide-react';
import { useT } from '../../i18n';

const statusStyle = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  pass: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  warning: 'bg-amber-50 text-amber-700 border-amber-100',
  error: 'bg-red-50 text-red-700 border-red-100',
  fail: 'bg-red-50 text-red-700 border-red-100',
  skipped: 'bg-gray-50 text-gray-600 border-gray-100',
};

function normalizePayload(response) {
  return response?.data?.data || response?.data || response || null;
}

function statusText(status) {
  if (status === 'ok' || status === 'pass') return 'Passed';
  if (status === 'warning') return 'Warning';
  if (status === 'error' || status === 'fail') return 'Failed';
  return 'Skipped';
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-extrabold ${statusStyle[status] || statusStyle.skipped}`}>
      {statusText(status)}
    </span>
  );
}

function StatCard({ title, value, tone = 'ok', subtitle }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-500">{title}</p>
          <h3 className="mt-2 text-3xl font-extrabold text-[var(--nst-dashboard-text)]">{value}</h3>
          {subtitle && <p className="mt-2 text-xs text-gray-400">{subtitle}</p>}
        </div>
        <StatusBadge status={tone} />
      </div>
    </div>
  );
}

function DetailBlock({ value }) {
  if (!value || (typeof value === 'object' && Object.keys(value).length === 0)) {
    return <span className="text-gray-400">-</span>;
  }

  if (typeof value === 'string') {
    return <span>{value}</span>;
  }

  return (
    <pre className="max-h-32 overflow-auto rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function SystemHealth() {
  const t = useT();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState('');
  const [repairing, setRepairing] = useState(false);
  const [repairMessage, setRepairMessage] = useState('');
  const [error, setError] = useState('');
  const [openGroups, setOpenGroups] = useState({});

  const groups = payload?.groups || [];
  const totals = payload?.totals || { passed: 0, failed: 0, warnings: 0, skipped: 0 };
  const summary = payload?.summary || {};

  const fetchHealth = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await systemHealthService.get();
      const data = normalizePayload(response);
      setPayload(data);
      const nextOpen = {};
      (data?.groups || []).forEach((group) => {
        nextOpen[group.key] = group.status !== 'ok';
      });
      setOpenGroups(nextOpen);
    } catch (err) {
      console.error('System Health Error:', err);
      setError(err?.response?.data?.message || err?.message || t('system_health.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const exportReport = async (format) => {
    try {
      setExporting(format);
      const response = await systemHealthService.export(format);
      downloadBlob(response, `nst_system_health.${format}`);
    } catch (err) {
      console.error('System Health Export Error:', err);
      setError(err?.response?.data?.message || err?.message || `${format.toUpperCase()} export failed.`);
    } finally {
      setExporting('');
    }
  };


  const repairHealth = async () => {
    if (!window.confirm(t('system_health.confirm_repair'))) {
      return;
    }

    try {
      setRepairing(true);
      setError('');
      setRepairMessage('');
      const response = await systemHealthService.repair('all');
      const data = response?.data?.data || {};
      setRepairMessage(`Repair done. Sales fixed: ${data.sales_due_fixed || 0}, Purchases fixed: ${data.purchase_due_fixed || 0}, Users normalized: ${data.users_normalized || 0}`);
      await fetchHealth();
    } catch (err) {
      console.error('System Health Repair Error:', err);
      setError(err?.response?.data?.message || err?.message || 'System repair failed.');
    } finally {
      setRepairing(false);
    }
  };

  const moduleCounts = useMemo(
    () => [
      ['Users', summary.users],
      ['Products', summary.products],
      ['Branches', summary.branches],
      ['Customers', summary.customers],
      ['Suppliers', summary.suppliers],
      ['Purchases', summary.purchases],
      ['Sales', summary.sales],
      ['Device Units', summary.device_units],
      ['Expenses', summary.expenses],
      ['Audit Logs', summary.audit_logs],
    ],
    [summary]
  );

  return (
    <div className="p-4 md:p-6">
      <NstPageHeader icon={NstHdrActivity} title={<>System Health Check</>} subtitle={t('system_health.subtitle')} actions={<><div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={fetchHealth}
            disabled={loading}
            className="rounded-xl bg-[var(--nst-dashboard-secondary)] px-4 py-2.5 text-sm font-extrabold text-white hover:bg-[#26395f] disabled:opacity-60"
          >
            {loading ? 'Checking...' : 'Refresh Check'}
          </button>

          <button
            type="button"
            onClick={repairHealth}
            disabled={repairing}
            className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-amber-600 disabled:opacity-60"
          >
            {repairing ? 'Repairing...' : 'Auto Repair'}
          </button>
          {['csv', 'pdf', 'xlsx'].map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => exportReport(format)}
              disabled={Boolean(exporting)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-extrabold text-[var(--nst-dashboard-text)] hover:bg-gray-50 disabled:opacity-60"
            >
              {exporting === format ? 'Exporting...' : `${format.toUpperCase()} Export`}
            </button>
          ))}
        </div></>}>{payload?.generated_at && (
            <p className="mt-2 text-xs text-gray-400">Last generated: {payload.generated_at}</p>
          )}</NstPageHeader>

      {error && (
        <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {repairMessage && (
        <div className="mb-5 rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
          {repairMessage}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Overall" value={statusText(payload?.overall_status || 'skipped')} tone={payload?.overall_status || 'skipped'} subtitle="System status" />
        <StatCard title="Passed" value={totals.passed || 0} tone="pass" subtitle="Healthy checks" />
        <StatCard title="Warnings" value={totals.warnings || 0} tone="warning" subtitle="Need review" />
        <StatCard title="Failed" value={totals.failed || 0} tone="fail" subtitle="Must fix" />
        <StatCard title="Skipped" value={totals.skipped || 0} tone="skipped" subtitle="Not applicable/missing" />
      </div>

      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-[var(--nst-dashboard-text)]">Module Data Snapshot</h2>
            <p className="text-sm text-gray-500">Main table count overview.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {moduleCounts.map(([label, value]) => (
            <div key={label} className="rounded-xl bg-gray-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
              <p className="mt-1 text-2xl font-extrabold text-[var(--nst-dashboard-text)]">{value ?? '-'}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {groups.map((group) => {
          const isOpen = Boolean(openGroups[group.key]);
          return (
            <div key={group.key} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setOpenGroups((previous) => ({ ...previous, [group.key]: !previous[group.key] }))}
                className="flex w-full flex-col gap-3 px-5 py-4 text-left md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <h2 className="text-lg font-extrabold text-[var(--nst-dashboard-text)]">{group.title}</h2>
                  <p className="text-sm text-gray-500">{group.checks?.length || 0} checks</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={group.status} />
                  <span className="text-sm font-bold text-gray-400">{isOpen ? 'Hide' : 'Show'}</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100 text-sm">
                      <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-5 py-3">Check</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3">Message</th>
                          <th className="px-5 py-3">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(group.checks || []).map((check) => (
                          <tr key={`${group.key}-${check.name}`} className="align-top hover:bg-gray-50/60">
                            <td className="whitespace-nowrap px-5 py-4 font-extrabold text-[var(--nst-dashboard-text)]">{check.name}</td>
                            <td className="whitespace-nowrap px-5 py-4"><StatusBadge status={check.status} /></td>
                            <td className="min-w-[260px] px-5 py-4 text-gray-600">{check.message}</td>
                            <td className="min-w-[260px] px-5 py-4 text-xs text-gray-500"><DetailBlock value={check.details} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {payload?.recommendations?.length > 0 && (
        <div className="mt-6 rounded-2xl border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-[var(--nst-dashboard-primary-soft)] p-5 text-sm text-[var(--nst-dashboard-primary)]">
          <h2 className="mb-3 font-extrabold">Recommended Next Actions</h2>
          <ul className="list-disc space-y-2 pl-5">
            {payload.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}
