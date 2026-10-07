import api from './api';

export const systemHealthService = {
  get() {
    return api.get('/system-health');
  },

  export(format = 'xlsx') {
    return api.get('/system-health/export', {
      params: { format },
      responseType: 'blob',
    });
  },

  repair(type = 'all') {
    return api.post('/system-health/repair', { type });
  },
};

export function downloadBlob(response, fallbackName) {
  const blob = new Blob([response.data], {
    type: response.headers?.['content-type'] || 'application/octet-stream',
  });

  let filename = fallbackName;
  const disposition = response.headers?.['content-disposition'];
  const match = disposition?.match(/filename="?([^";]+)"?/i);

  if (match?.[1]) {
    filename = match[1];
  }

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default systemHealthService;
