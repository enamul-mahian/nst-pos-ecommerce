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

const dataMaintenanceService = {
  async overview() {
    const response = await api.get('/data-maintenance/overview');
    return response.data;
  },

  async createBackup(tables = []) {
    const response = await api.post('/data-maintenance/backup', { tables });
    return response.data;
  },

  async downloadBackup(file) {
    const response = await api.get(`/data-maintenance/backups/${encodeURIComponent(file)}/download`, {
      responseType: 'blob',
    });
    downloadBlob(response.data, file);
  },

  async deleteBackup(file) {
    const response = await api.delete(`/data-maintenance/backups/${encodeURIComponent(file)}`);
    return response.data;
  },

  async exportTable({ table, format = 'csv', date_from, date_to }) {
    const params = new URLSearchParams();
    params.set('table', table);
    params.set('format', format);
    if (date_from) params.set('date_from', date_from);
    if (date_to) params.set('date_to', date_to);

    const response = await api.get(`/data-maintenance/export-table?${params.toString()}`, {
      responseType: 'blob',
    });

    downloadBlob(response.data, `nst_${table}_${suffix()}.${format}`);
  },

  async exportCsv({ table, date_from, date_to }) {
    return this.exportTable({ table, format: 'csv', date_from, date_to });
  },

  async driveBackupStatus() { return (await api.get('/google-drive-backup/status')).data; },
  async driveBackupAuthorize() { return (await api.get('/google-drive-backup/authorize')).data; },
  async driveBackupUploadLatest() { return (await api.post('/google-drive-backup/upload-latest')).data; },
  async driveBackupDisconnect() { return (await api.delete('/google-drive-backup/connection')).data; },

  async dangerOptions() {
    const response = await api.get('/data-maintenance/danger-zone/options');
    return response.data;
  },

  async cleanBusinessData(payload) {
    const response = await api.post('/data-maintenance/danger-zone/clean-business-data', payload);
    return response.data;
  },
};

export default dataMaintenanceService;
