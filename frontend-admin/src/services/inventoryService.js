import api from './api';

const inventoryService = {
  overview: (params = {}) => api.get('/inventory/overview', { params }),
  branches: (params = {}) => api.get('/inventory/branches', { params }),
  lowStock: (params = {}) => api.get('/inventory/low-stock', { params }),
  movements: (params = {}) => api.get('/inventory/movements', { params }),
  reconciliation: () => api.get('/inventory/reconciliation'),
  reconcile: (payload) => api.post('/inventory/reconcile', payload),
  updateThreshold: (id, payload) => api.patch(`/inventory/branch-stocks/${id}/threshold`, payload),
  updateDeviceStatus: (id, payload) => api.patch(`/inventory/device-units/${id}/status`, payload),
};

export default inventoryService;
