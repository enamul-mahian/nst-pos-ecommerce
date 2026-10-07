import api from './api';

export const auditLogService = {
  list(params = {}) {
    return api.get('/audit-logs', { params });
  },

  summary(params = {}) {
    return api.get('/audit-logs/summary', { params });
  },
};

export default auditLogService;
