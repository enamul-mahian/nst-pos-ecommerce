import api from './api';

export const brandService = {
  getBrands: async (params = {}) => {
    const response = await api.get('/brands', { params });
    return response.data;
  },

  getAllBrands: async (params = {}) => {
    const response = await api.get('/brands/all', { params });
    return response.data;
  },

  getLogoSuggestion: async (params = {}) => {
    const response = await api.get('/brands/logo-suggestion', { params });
    return response.data;
  },

  getBrand: async (id) => {
    const response = await api.get(`/brands/${id}`);
    return response.data;
  },

  createBrand: async (data) => {
    const response = await api.post('/brands', data);
    return response.data;
  },

  updateBrand: async (id, data) => {
    const response = await api.put(`/brands/${id}`, data);
    return response.data;
  },

  deleteBrand: async (id) => {
    const response = await api.delete(`/brands/${id}`);
    return response.data;
  },

  bulkDeleteBrands: async (ids = []) => {
    const response = await api.delete('/brands/bulk-delete', {
      data: { ids },
    });
    return response.data;
  },
};
