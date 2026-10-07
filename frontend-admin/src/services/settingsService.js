import api from './api';

const settingsService = {
  async getSettings() {
    const response = await api.get('/settings');
    return response.data;
  },

  async getPublicSettings() {
    const response = await api.get('/public/system-ui-settings');
    return response.data;
  },

  async updateSettings(payload) {
    const response = await api.post('/settings', payload);
    return response.data;
  },
};

export default settingsService;
