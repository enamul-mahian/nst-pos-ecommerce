import api from './api';

export const corporateOpsService = {
  getCorporateSummary: (params = {}) => api.get('/dashboard/corporate-summary', { params }),
  centralSearch: (q) => api.get('/dashboard/central-search', { params: { q } }),
  notifications: () => api.get('/dashboard/notifications'),
  getEffectiveDashboardTheme: () => api.get('/dashboard/theme/effective'),
  getDashboardThemeManagement: () => api.get('/dashboard/theme/manage'),
  saveDashboardThemeDraft: (payload) => api.post('/dashboard/theme/drafts', payload),
  publishDashboardTheme: (id) => api.post(`/dashboard/theme/${id}/publish`),
  rollbackDashboardTheme: (id) => api.post(`/dashboard/theme/${id}/rollback`),

  getSettings: () => api.get('/corporate-settings'),
  getSection: (section) => api.get(`/corporate-settings/${section}`),
  saveSection: (section, settings) => api.post(`/corporate-settings/${section}`, { settings }),
  getTracking: () => api.get('/tracking-integrations'),
  createTracking: (payload) => api.post('/tracking-integrations', payload),
  updateTracking: (id, payload) => api.put(`/tracking-integrations/${id}`, payload),
  deleteTracking: (id) => api.delete(`/tracking-integrations/${id}`),

  listEmiBanks: () => api.get('/emi-banks'),
  saveEmiBank: (payload, id = null) => id ? api.put(`/emi-banks/${id}`, payload) : api.post('/emi-banks', payload),
  deleteEmiBank: (id) => api.delete(`/emi-banks/${id}`),
  calculateEmi: (params) => api.get('/emi-banks/calculate', { params }),

  listBookings: (params = {}) => api.get('/bookings', { params }),
  createBooking: (payload) => api.post('/bookings', payload),
  updateBooking: (id, payload) => api.put(`/bookings/${id}`, payload),
  bookingStatus: (id, payload) => api.post(`/bookings/${id}/status`, payload),

  listMessages: (params = {}) => api.get('/customer-messages', { params }),
  createMessage: (payload) => api.post('/customer-messages', payload),
  showMessage: (id) => api.get(`/customer-messages/${id}`),
  replyMessage: (id, payload) => api.post(`/customer-messages/${id}/reply`, payload),
  closeMessage: (id) => api.post(`/customer-messages/${id}/close`),
  deleteMessage: (id) => api.delete(`/customer-messages/${id}`),
  updateMessageStatus: (id, status) => api.patch(`/customer-messages/${id}/status`, { status }),

  listLogs: (params = {}) => api.get('/communications/logs', { params }),
  sendManual: (payload) => api.post('/communications/send-manual', payload),
  sendBulk: (payload) => api.post('/communications/send-bulk', payload),
  sendInvoice: (saleId, payload) => api.post(`/sales/${saleId}/send-invoice`, payload),

  listCoupons: (params = {}) => api.get('/coupons', { params }),
  saveCoupon: (payload, id = null) => id ? api.put(`/coupons/${id}`, payload) : api.post('/coupons', payload),
  deleteCoupon: (id) => api.delete(`/coupons/${id}`),
  validateCoupon: (params) => api.get('/coupons/validate', { params }),

  barcodeSettings: () => api.get('/barcode-tools/settings'),
  saveBarcodeSettings: (settings) => api.post('/barcode-tools/settings', { settings }),
  barcodeSearch: (q) => api.get('/barcode-tools/search', { params: { q } }),
  updateBarcodes: (items) => api.post('/barcode-tools/update-barcodes', { items }),
  printData: (items) => api.post('/barcode-tools/print-data', { items }),

  invoiceData: (saleId) => api.get(`/sales/${saleId}/invoice-data`),
  downloadInvoicePdf: (saleId) => api.get(`/sales/${saleId}/invoice-pdf`, { responseType: 'blob' }),
  // Keep this for copy/debug only. Do not use direct <a href> for protected downloads because it cannot send auth headers.
  invoicePdfUrl: (saleId) => `${api.defaults.baseURL}/sales/${saleId}/invoice-pdf`,
  updateDeviceWarranty: (deviceId, payload) => api.post(`/device-units/${deviceId}/warranty`, payload),
};

export default corporateOpsService;
