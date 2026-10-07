import api from './api';

const ACTION_SUMMARY_CACHE_MS = 20000;
let actionSummaryCache = null;
let actionSummaryInFlight = null;

function nowMs() {
  return Date.now();
}

async function loadActionSummary({ force = false } = {}) {
  if (!force && actionSummaryCache && actionSummaryCache.expiresAt > nowMs()) {
    return actionSummaryCache.response;
  }

  if (actionSummaryInFlight) return actionSummaryInFlight;

  actionSummaryInFlight = api.get('/dashboard/action-summary')
    .then((response) => {
      actionSummaryCache = {
        response,
        expiresAt: nowMs() + ACTION_SUMMARY_CACHE_MS,
      };
      return response;
    })
    .catch((error) => {
      if (actionSummaryCache?.response) {
        const staleResponse = {
          ...actionSummaryCache.response,
          nstStale: true,
          nstStaleReason: error?.message || 'Dashboard action summary refresh failed',
        };
        return staleResponse;
      }
      throw error;
    })
    .finally(() => {
      actionSummaryInFlight = null;
    });

  return actionSummaryInFlight;
}

const dashboardOperatingService = {
  actionSummary: (options = {}) => loadActionSummary(options),
  invalidateActionSummary: () => {
    actionSummaryCache = null;
  },
  welcome: () => api.get('/dashboard/welcome'),
  saveWelcome: (payload) => api.post('/dashboard/welcome', payload),
  targets: (params = {}) => api.get('/dashboard/targets', { params }),
  saveTargets: (payload) => api.post('/dashboard/targets', payload),
  businessHealth: () => api.get('/dashboard/business-health'),

  searchCustomers: (q) => api.get('/customer-support/search', { params: { q } }),
  customerSupportProfile: (id) => api.get(`/customer-support/customers/${id}`),

  chatUsers: () => api.get('/staff-chat/users'),
  chatThreads: () => api.get('/staff-chat/threads'),
  createChatThread: (payload) => api.post('/staff-chat/threads', payload),
  chatMessages: (threadId) => api.get(`/staff-chat/threads/${threadId}/messages`),
  sendChatMessage: (threadId, formData) => api.post(`/staff-chat/threads/${threadId}/messages`, formData, { nstSaveFeedback: false, headers: { 'Content-Type': 'multipart/form-data' } }),
  chatPresence: (threadId) => api.get(`/staff-chat/threads/${threadId}/presence`),
  updateChatPresence: (threadId, typing = false) => api.post(`/staff-chat/threads/${threadId}/presence`, { typing }),
  heartbeat: () => api.post('/staff-chat/presence'),
  downloadProtected: async (url, filename = 'attachment') => {
    const response = await api.get(url, { responseType: 'blob' });
    const objectUrl = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = objectUrl; anchor.download = filename; anchor.click();
    URL.revokeObjectURL(objectUrl);
  },

  bulletins: () => api.get('/business-bulletins'),
  createBulletin: (formData) => api.post('/business-bulletins', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateBulletin: (id, formData) => {
    formData.append('_method', 'PUT');
    return api.post(`/business-bulletins/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  markBulletinRead: (id) => api.post(`/business-bulletins/${id}/read`),
};

export default dashboardOperatingService;
