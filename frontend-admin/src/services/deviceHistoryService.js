import api from './api';

export async function searchDeviceHistory(params = {}) {
  const response = await api.get('/pos/main/device-history/search', { params });
  return response.data;
}

export default {
  searchDeviceHistory,
};
