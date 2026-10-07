import { useState } from 'react';
import reportExportService from '../../services/reportExportService';
import { FileDown } from 'lucide-react';
import { useT } from '../../i18n';
import { NstPageHeader, NstHeaderField, NstButton } from '../ui';

const reportTypes = [
  { value: 'summary', label: 'Summary' },
  { value: 'sales', label: 'Sales' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'stock', label: 'Stock' },
  { value: 'device-units', label: 'Device / IMEI Stock' },
  { value: 'profit-loss', label: 'Profit / Loss' },
  { value: 'branch-wise', label: 'Branch Wise' },
  { value: 'customer-due', label: 'Customer Due' },
  { value: 'supplier-due', label: 'Supplier Due' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'salesmen', label: 'Salesmen Sales' },
  { value: 'cashbook', label: 'Cashbook' },
  { value: 'customer-collections', label: 'Customer Collections' },
  { value: 'supplier-payments', label: 'Supplier Payments' },
  { value: 'audit-logs', label: 'Activity Logs' },
];

const formats = [
  { value: 'xlsx', label: 'XLSX' },
  { value: 'pdf', label: 'PDF' },
  { value: 'csv', label: 'CSV' },
];

export default function ReportExportPanel({ dateFrom, dateTo, defaultReportType = 'sales', compact = false }) {
  const t = useT();
  const [reportType, setReportType] = useState(defaultReportType);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');

  const download = async (format) => {
    try {
      setWorking(format);
      setError('');
      await reportExportService.exportReport({
        reportType,
        format,
        date_from: dateFrom,
        date_to: dateTo,
      });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Export download failed.');
    } finally {
      setWorking('');
    }
  };

  const formatVariant = { xlsx: 'success', pdf: 'danger', csv: 'neutral' };
  return (
    <div>
      <NstPageHeader
        variant="section"
        icon={FileDown}
        title="Export Reports"
        subtitle={t('reports.export.subtitle')}
        filters={<NstHeaderField label="Report">
          <select value={reportType} onChange={(event) => setReportType(event.target.value)}>
            {reportTypes.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </NstHeaderField>}
        actions={<>
          {formats.map((format) => (
            <NstButton
              key={format.value}
              variant={formatVariant[format.value] || 'neutral'}
              disabled={!!working}
              onClick={() => download(format.value)}
            >
              {working === format.value ? '...' : format.label}
            </NstButton>
          ))}
        </>}
      />
      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}
