import api from './api';

export const userManagementService = {
  options() {
    return api.get('/users/options');
  },

  list(params = {}) {
    return api.get('/users', { params });
  },

  show(id) {
    return api.get(`/users/${id}`);
  },

  create(payload) {
    return api.post('/users', payload);
  },

  update(id, payload) {
    return api.put(`/users/${id}`, payload);
  },

  remove(id) {
    return api.delete(`/users/${id}`);
  },

  resetPassword(id, payload = {}) {
    return api.post(`/users/${id}/reset-password`, payload);
  },
};

export default userManagementService;
