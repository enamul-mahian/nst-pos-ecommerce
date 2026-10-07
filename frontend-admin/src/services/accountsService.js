import api from './api';

export const accountsService = {
  getCashbook: async (params = {}) => {
    const response = await api.get('/accounts/cashbook', { params });
    return response.data;
  },

  getDueCenter: async (params = {}) => {
    const response = await api.get('/accounts/due-center', { params });
    return response.data;
  },
};

export default accountsService;
