import api from './api';

export const customerService = {
  getCustomers: async (params = {}) => {
    const response = await api.get('/customers', { params });
    return response.data;
  },

  getAllCustomers: async (params = {}) => {
    const response = await api.get('/customers/all', { params });
    return response.data;
  },

  getCustomer: async (id) => {
    const response = await api.get(`/customers/${id}`);
    return response.data;
  },

  getCustomerLedger: async (id) => {
    const response = await api.get(`/customers/${id}/ledger`);
    return response.data;
  },

  receiveDue: async (id, data) => {
    const response = await api.post(`/customers/${id}/receive-due`, data);
    return response.data;
  },

  recalculateDue: async (id) => {
    const response = await api.post(`/customers/${id}/recalculate-due`);
    return response.data;
  },

  createCustomer: async (data) => {
    const response = await api.post('/customers', data);
    return response.data;
  },

  updateCustomer: async (id, data) => {
    const response = await api.put(`/customers/${id}`, data);
    return response.data;
  },

  deleteCustomer: async (id) => {
    const response = await api.delete(`/customers/${id}`);
    return response.data;
  },
};

export default customerService;