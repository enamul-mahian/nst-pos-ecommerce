import api from './api';

export const supplierService = {
  getSuppliers: async (params = {}) => {
    const response = await api.get('/suppliers', { params });
    return response.data;
  },

  getAllSuppliers: async (params = {}) => {
    const response = await api.get('/suppliers/all', { params });
    return response.data;
  },

  getSupplier: async (id) => {
    const response = await api.get(`/suppliers/${id}`);
    return response.data;
  },

  getSupplierLedger: async (id) => {
    const response = await api.get(`/suppliers/${id}/ledger`);
    return response.data;
  },

  payDue: async (id, data) => {
    const response = await api.post(`/suppliers/${id}/pay-due`, data, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },

  recalculateDue: async (id) => {
    const response = await api.post(`/suppliers/${id}/recalculate-due`);
    return response.data;
  },

  createSupplier: async (data) => {
    const response = await api.post('/suppliers', data);
    return response.data;
  },

  updateSupplier: async (id, data) => {
    const response = await api.put(`/suppliers/${id}`, data);
    return response.data;
  },

  deleteSupplier: async (id) => {
    const response = await api.delete(`/suppliers/${id}`);
    return response.data;
  },
};

export default supplierService;