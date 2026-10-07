import api from './api';

export const warrantyService = {
  getSummary: async (params = {}) => {
    const response = await api.get('/warranty-services/summary', { params });
    return response.data;
  },

  getJobs: async (params = {}) => {
    const response = await api.get('/warranty-services', { params });
    return response.data;
  },

  getJob: async (id) => {
    const response = await api.get(`/warranty-services/${id}`);
    return response.data;
  },

  createJob: async (data) => {
    const response = await api.post('/warranty-services', data);
    return response.data;
  },

  updateJob: async (id, data) => {
    const response = await api.put(`/warranty-services/${id}`, data);
    return response.data;
  },

  updateStatus: async (id, data) => {
    const response = await api.post(`/warranty-services/${id}/status`, data);
    return response.data;
  },

  receivePayment: async (id, data) => {
    const response = await api.post(`/warranty-services/${id}/receive-payment`, data);
    return response.data;
  },

  searchDevices: async (q) => {
    const response = await api.get('/warranty-services/search-devices', { params: { q } });
    return response.data;
  },
};

export default warrantyService;
