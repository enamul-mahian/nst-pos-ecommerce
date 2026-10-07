import api from './api';

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(new Blob([blob]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function suffix() {
  return new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
}

const reportExportService = {
  async exportReport({ reportType = 'sales', format = 'xlsx', date_from, date_to, extra = {} }) {
    const params = new URLSearchParams();
    params.set('report_type', reportType);
    params.set('format', format);
    if (date_from) params.set('date_from', date_from);
    if (date_to) params.set('date_to', date_to);
    Object.entries(extra || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value);
    });

    const response = await api.get(`/reports/export?${params.toString()}`, {
      responseType: 'blob',
    });

    downloadBlob(response.data, `nst_${reportType}_${suffix()}.${format}`);
  },
};

export default reportExportService;
