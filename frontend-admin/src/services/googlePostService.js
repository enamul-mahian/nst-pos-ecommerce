import api from './api';

const googlePostService = {
  list(params = {}) {
    return api.get('/google-posts', { params });
  },

  get(id) {
    return api.get(`/google-posts/${id}`);
  },

  save(payload, id = null) {
    const config = payload instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined;
    if (id) {
      if (payload instanceof FormData) {
        payload.append('_method', 'PUT');
        return api.post(`/google-posts/${id}`, payload, config);
      }
      return api.put(`/google-posts/${id}`, payload, config);
    }
    return api.post('/google-posts', payload, config);
  },

  delete(id) {
    return api.delete(`/google-posts/${id}`);
  },
};

export default googlePostService;
