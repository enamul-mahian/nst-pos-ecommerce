import api from './api';

const usedPurchaseService = {
  getOptions: () => {
    return api.get('/used-purchases/options');
  },

  getUsedPurchases: (params = {}) => {
    return api.get('/used-purchases', { params });
  },

  getUsedPurchase: (id) => {
    return api.get(`/used-purchases/${id}`);
  },

  createUsedPurchase: (data) => {
    return api.post('/used-purchases', data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
    });
  },

  updateUsedPurchase: (id, data) => {
    if (data instanceof FormData) {
      data.append('_method', 'PUT');

      return api.post(`/used-purchases/${id}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }

    return api.put(`/used-purchases/${id}`, data);
  },

  deleteUsedPurchase: (id) => {
    return api.delete(`/used-purchases/${id}`);
  },

  salePreparation: (id, config = {}) => {
    return api.get(`/used-purchases/${id}/sale-preparation`, config);
  },

  markReadyForSale: (id, data = {}) => {
    return api.post(`/used-purchases/${id}/mark-ready-for-sale`, data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
    });
  },
};

export default usedPurchaseService;
