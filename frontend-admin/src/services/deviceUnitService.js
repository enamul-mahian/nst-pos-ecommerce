import api from './api';

export const deviceUnitService = {
  list(params = {}) {
    return api.get('/device-units', { params });
  },

  summary(params = {}) {
    return api.get('/device-units/summary', { params });
  },

  show(id) {
    return api.get(`/device-units/${id}`);
  },

  markPrinted(id) {
    return api.post(`/device-units/${id}/mark-printed`);
  },

  salePreparation(id, config = {}) {
    return api.get(`/device-units/${id}/sale-preparation`, config);
  },

  readyForSale(id, payload) {
    return api.post(`/device-units/${id}/ready-for-sale`, payload, {
      headers: payload instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
    });
  },
};

export default deviceUnitService;
