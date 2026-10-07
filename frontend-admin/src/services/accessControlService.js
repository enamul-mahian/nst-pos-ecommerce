import api from './api';

export const accessControlService = {
  show(userId) {
    return api.get(`/users/${userId}/access-control`);
  },

  update(userId, payload) {
    return api.post(`/users/${userId}/access-control`, payload);
  },
};

export default accessControlService;
