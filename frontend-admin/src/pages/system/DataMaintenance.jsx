import { useEffect, useMemo, useState } from 'react';
import dataMaintenanceService from '../../services/dataMaintenanceService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Activity as NstHdrActivity } from 'lucide-react';
import { useT } from '../../i18n';

const priorityTables = [
  'sales',
  'sale_items',
  'purchases',
  'purchase_items',
  'device_units',
  'products',
  'customers',
  'suppliers',
  'expenses',
  'stock_movements',
  'branch_stocks',
  'settings',
  'audit_logs',
];

export default function DataMaintenance() {
  const t = useT();
  const [overview, setOverview] = useState({ tables: [], backups: [] });
  const [selectedTables, setSelectedTables] = useState([]);
  const [exportTable, setExportTable] = useState('sales');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedDangerOptions, setSelectedDangerOptions] = useState([]);
  const [dangerPassword, setDangerPassword] = useState('');
  const [dangerConfirmText, setDangerConfirmText] = useState('');
  const [driveStatus, setDriveStatus] = useState(null);

  const tables = overview.tables || [];
  const backups = overview.backups || [];
  const dangerOptions = overview.danger_zone_options || [];

  const totalRows = useMemo(() => tables.reduce((sum, table) => sum + Number(table.rows || 0), 0), [tables]);

  const loadOverview = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await dataMaintenanceService.overview();
      const data = response.data || { tables: [], backups: [] };
      setOverview(data);
      try { const drive = await dataMaintenanceService.driveBackupStatus(); setDriveStatus(drive?.data || null); } catch { setDriveStatus(null); }
      const availableNames = (data.tables || []).map((table) => table.name);
      setSelectedTables(priorityTables.filter((name) => availableNames.includes(name)));
      if (availableNames.length && !availableNames.includes(exportTable)) {
        setExportTable(availableNames[0]);
      }
    } catch (err) {
      setError(err?.response?.data?.message || t('maintenance.errors.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const toggleTable = (name) => {
    setSelectedTables((previous) =>
      previous.includes(name) ? previous.filter((item) => item !== name) : [...previous, name]
    );
  };


  const toggleDangerOption = (value) => {
    setSelectedDangerOptions((previous) =>
      previous.includes(value) ? previous.filter((item) => item !== value) : [...previous, value]
    );
  };

  const cleanBusinessData = async () => {
    if (selectedDangerOptions.length === 0) {
      setError(t('maintenance.errors.select_option'));
      return;
    }
    if (!dangerPassword || dangerConfirmText !== 'DELETE BUSINESS DATA') {
      setError(t('maintenance.errors.confirmation_required'));
      return;
    }
    if (!window.confirm(t('maintenance.confirm_danger'))) {
      return;
    }

    try {
      setWorking(true);
      setError('');
      setMessage('');
      const response = await dataMaintenanceService.cleanBusinessData({
        password: dangerPassword,
        confirmation_text: dangerConfirmText,
        options: selectedDangerOptions,
      });
      setMessage(response?.message || 'Business data clean completed.');
      setDangerPassword('');
      setDangerConfirmText('');
      setSelectedDangerOptions([]);
      await loadOverview();
    } catch (err) {
      const errors = err?.response?.data?.errors;
      const firstError = errors ? Object.values(errors).flat()[0] : null;
      setError(firstError || err?.response?.data?.message || t('maintenance.errors.danger_failed'));
    } finally {
      setWorking(false);
    }
  };

  const createBackup = async () => {
    try {
      setWorking(true);
      setMessage('');
      setError('');
      const response = await dataMaintenanceService.createBackup(selectedTables);
      setMessage(`${response.message || 'Backup created.'} File: ${response.data?.file || ''}`);
      await loadOverview();
    } catch (err) {
      setError(err?.response?.data?.message || t('maintenance.errors.backup_create_failed'));
    } finally {
      setWorking(false);
    }
  };

  const downloadBackup = async (file) => {
    try {
      setWorking(true);
      setError('');
      await dataMaintenanceService.downloadBackup(file);
    } catch (err) {
      setError(err?.response?.data?.message || t('maintenance.errors.backup_download_failed'));
    } finally {
      setWorking(false);
    }
  };

  const deleteBackup = async (file) => {
    if (!window.confirm(t('maintenance.confirm_delete_backup'))) {
      return;
    }

    try {
      setWorking(true);
      setError('');
      await dataMaintenanceService.deleteBackup(file);
      setMessage('Backup deleted.');
      await loadOverview();
    } catch (err) {
      setError(err?.response?.data?.message || t('maintenance.errors.backup_delete_failed'));
    } finally {
      setWorking(false);
    }
  };

  const connectDrive = async () => { try { const r=await dataMaintenanceService.driveBackupAuthorize(); if(r?.data?.authorization_url) window.open(r.data.authorization_url,'_blank','noopener,noreferrer'); } catch(err){ setError(err?.response?.data?.message || 'Google Drive authorization could not start.'); } };
  const uploadDrive = async () => { try { setWorking(true); const r=await dataMaintenanceService.driveBackupUploadLatest(); setMessage(r?.message || 'Backup uploaded to Google Drive.'); await loadOverview(); } catch(err){ setError(err?.response?.data?.message || 'Google Drive upload failed.'); } finally { setWorking(false); } };
  const disconnectDrive = async () => { try { await dataMaintenanceService.driveBackupDisconnect(); setMessage('Google Drive disconnected.'); await loadOverview(); } catch(err){ setError(err?.response?.data?.message || 'Google Drive disconnect failed.'); } };

  const exportData = async (format) => {
    try {
      setWorking(true);
      setError('');
      await dataMaintenanceService.exportTable({ table: exportTable, format, date_from: dateFrom, date_to: dateTo });
      setMessage(`${format.toUpperCase()} export downloaded.`);
    } catch (err) {
      setError(err?.response?.data?.message || t('maintenance.errors.export_failed', { format: format.toUpperCase() }));
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-gray-500">Backup & Export loading...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <NstPageHeader icon={NstHdrActivity} title={<>Backup & Data Export</>} subtitle={t('maintenance.subtitle')} actions={<><button
          type="button"
          onClick={loadOverview}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button></>}/>

      {message && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Available Tables" value={tables.length} />
        <Metric title="Total Rows" value={totalRows.toLocaleString()} />
        <Metric title="Backup Files" value={backups.length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)]">Database Backup</h2>
              <p className="text-sm text-gray-500">{t('maintenance.backup_help')}</p>
            </div>
            <button
              type="button"
              disabled={working || selectedTables.length === 0}
              onClick={createBackup}
              className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-bold text-white hover:bg-[var(--nst-dashboard-primary)] disabled:opacity-60"
            >
              {working ? 'Working...' : 'Create Backup'}
            </button>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((table) => (
              <label key={table.name} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={selectedTables.includes(table.name)}
                    onChange={() => toggleTable(table.name)}
                  />
                  {table.name}
                </span>
                <span className="text-xs text-gray-400">{Number(table.rows || 0).toLocaleString()}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)]">Data Export</h2>
          <p className="text-sm text-gray-500">{t('maintenance.export_help')}</p>

          <div className="mt-4 space-y-3">
            <label className="block text-sm font-semibold text-gray-700">
              Table
              <select
                value={exportTable}
                onChange={(event) => setExportTable(event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]"
              >
                {tables.map((table) => (
                  <option key={table.name} value={table.name}>{table.name}</option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Date From" type="date" value={dateFrom} onChange={setDateFrom} />
              <Input label="Date To" type="date" value={dateTo} onChange={setDateTo} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={working || !exportTable}
                onClick={() => exportData('xlsx')}
                className="rounded-xl bg-emerald-600 px-3 py-3 text-xs font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                XLSX
              </button>
              <button
                type="button"
                disabled={working || !exportTable}
                onClick={() => exportData('pdf')}
                className="rounded-xl bg-red-600 px-3 py-3 text-xs font-extrabold text-white hover:bg-red-700 disabled:opacity-60"
              >
                PDF
              </button>
              <button
                type="button"
                disabled={working || !exportTable}
                onClick={() => exportData('csv')}
                className="rounded-xl bg-[var(--nst-dashboard-secondary)] px-3 py-3 text-xs font-extrabold text-white hover:bg-[var(--nst-dashboard-secondary)] disabled:opacity-60"
              >
                CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="text-lg font-bold text-[var(--nst-dashboard-text)]">Google Drive Backup</h2><p className="text-sm text-gray-500">OAuth-based upload of the latest local SQL backup. Tokens are encrypted at rest.</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${driveStatus?.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{driveStatus?.connected ? 'Connected' : driveStatus?.configured ? 'Ready to connect' : 'Not configured'}</span></div>
        <p className="mt-3 text-sm text-gray-500">{driveStatus?.message || 'Status unavailable.'}</p><div className="mt-4 flex flex-wrap gap-2">{!driveStatus?.connected && <button type="button" onClick={connectDrive} disabled={!driveStatus?.configured} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Connect Google Drive</button>}{driveStatus?.connected && <><button type="button" onClick={uploadDrive} disabled={working || backups.length===0} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Upload Latest Backup</button><button type="button" onClick={disconnectDrive} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold">Disconnect</button></>}</div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)]">Backup Files</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {backups.length === 0 ? (
                <tr><td className="px-4 py-6 text-center text-gray-400" colSpan={4}>No backup file found.</td></tr>
              ) : backups.map((backup) => (
                <tr key={backup.file}>
                  <td className="px-4 py-3 font-semibold text-gray-700">{backup.file}</td>
                  <td className="px-4 py-3 text-gray-500">{formatBytes(backup.size)}</td>
                  <td className="px-4 py-3 text-gray-500">{backup.created_at}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => downloadBackup(backup.file)} className="rounded-lg bg-[var(--nst-dashboard-primary-soft)] px-3 py-2 font-bold text-[var(--nst-dashboard-primary)] hover:bg-[var(--nst-dashboard-primary-soft)]">Download</button>
                    <button onClick={() => deleteBackup(backup.file)} className="rounded-lg bg-red-50 px-3 py-2 font-bold text-red-600 hover:bg-red-100">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-black text-red-700">Super Admin Danger Zone</h2>
            <p className="mt-1 text-sm text-red-600">{t('maintenance.danger_help')}</p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-red-600">Password Required</span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {dangerOptions.map((option) => (
            <label key={option.key} className="rounded-2xl border border-red-100 bg-white p-4 text-sm shadow-sm">
              <span className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedDangerOptions.includes(option.key)}
                  onChange={() => toggleDangerOption(option.key)}
                />
                <span>
                  <span className="block font-black text-slate-900">{option.label}</span>
                  <span className="mt-1 block text-xs text-slate-500">{option.description}</span>
                </span>
              </span>
            </label>
          ))}
          {dangerOptions.length === 0 && <div className="text-sm text-red-600">{t('maintenance.danger_options_missing')}</div>}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Input label="Super Admin Password" type="password" value={dangerPassword} onChange={setDangerPassword} />
          <Input label="Type Confirmation: DELETE BUSINESS DATA" type="text" value={dangerConfirmText} onChange={setDangerConfirmText} />
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            disabled={working || selectedDangerOptions.length === 0}
            onClick={cleanBusinessData}
            className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-60"
          >
            {working ? 'Working...' : 'Clean Selected Business Data'}
          </button>
        </div>
      </div>

    </div>
  );
}

function Metric({ title, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <h3 className="mt-2 text-3xl font-extrabold text-[var(--nst-dashboard-text)]">{value}</h3>
    </div>
  );
}

function Input({ label, type, value, onChange }) {
  return (
    <label className="block text-sm font-semibold text-gray-700">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]"
      />
    </label>
  );
}

function formatBytes(bytes = 0) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
