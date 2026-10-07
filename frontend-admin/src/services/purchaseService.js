import api from './api';

export const purchaseService = {
  getPurchases: async (params = {}) => {
    const response = await api.get('/purchases', { params });
    return response.data;
  },

  getPurchase: async (id) => {
    const response = await api.get(`/purchases/${id}`);
    return response.data;
  },

  createPurchase: async (data) => {
    const isFormData = data instanceof FormData;
    const response = await api.post('/purchases', data, isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined);
    return response.data;
  },

  updatePurchase: async (id, data) => {
    const isFormData = data instanceof FormData;
    const response = await api.post(`/purchases/${id}?_method=PUT`, data, isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined);
    return response.data;
  },

  deletePurchase: async (id) => {
    const response = await api.delete(`/purchases/${id}`);
    return response.data;
  },
};

export default purchaseService;
