import axios from 'axios';
import { getLanguage } from '../i18n';

function resolveApiBaseUrl() {
  const configured = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');

  const host = window.location.hostname;
  if (host === '127.0.0.1' || host === 'localhost') {
    return 'http://127.0.0.1:8000/api';
  }

  return `${window.location.origin}/api`;
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: {
    Accept: 'application/json',
  },
});

function resolveAccessToken() {
  const keys = [
    'nst_admin_token',
    'token',
    'authToken',
    'access_token',
    'admin_token',
    'pos_token',
    'nst_token',
    'nst_auth_token',
    'auth_token',
  ];

  for (const key of keys) {
    const value = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (value) return String(value).replace(/^Bearer\s+/i, '');
  }

  return '';
}

api.interceptors.request.use((config) => {
  const token = resolveAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  config.headers['X-Locale'] = getLanguage();

  return config;
});

/*
 * Successful business mutations immediately ask the Topbar to refresh.
 * This keeps payment/refund/sale/purchase notifications from waiting for
 * the next polling interval. GET requests never trigger this bridge.
 */
api.interceptors.response.use(
  (response) => {
    const method = String(response?.config?.method || 'get').toLowerCase();
    const url = String(response?.config?.url || '');

    if (
      method !== 'get'
      && /\/(payment-gateways\/transactions\/.*\/refund|payment\/|sales|purchases|used-purchases|exchanges|orders|deliveries|warranty-services)(\/|$|\?)/i.test(url)
    ) {
      window.dispatchEvent(new Event('nst-operating-event-refresh'));
    }

    return response;
  },
  (error) => Promise.reject(error),
);

/*
 * Every Save / Update / Publish / Delete call shows "Saving…" while the request is in flight,
 * then "Saved ✓" only when the server confirms it, or the server's error reason.
 * Opt out per call with { nstSaveFeedback: false }.
 */
const SAVE_FEEDBACK_SKIP = /\/(login|logout|refresh|token|heartbeat|presence|ping|typing|search|central-search|lookup|check|verify|calculate|preview|validate|export|print|track|otp|2fa|two-factor|read|seen|read-all)(\/|$|\?|-)/i;
let saveSeq = 0;

const emitSave = (detail) => window.dispatchEvent(new CustomEvent('nst-save-status', { detail }));

const saveKind = (method, url) => {
  if (method === 'delete') return 'delete';
  if (/publish/i.test(url)) return 'publish';
  return 'save';
};

export const apiErrorMessage = (error) => {
  const data = error?.response?.data;
  const firstFieldError = data?.errors && typeof data.errors === 'object' ? Object.values(data.errors).flat()[0] : '';
  if (data?.message && firstFieldError && data.message !== firstFieldError) return String(firstFieldError);
  if (data?.message) return String(data.message);
  if (firstFieldError) return String(firstFieldError);
  if (error?.response?.status) return `Server returned ${error.response.status}.`;
  return error?.message === 'Network Error' ? 'Cannot reach the server. Check your connection.' : (error?.message || 'Unknown error.');
};

api.interceptors.request.use((config) => {
  const method = String(config.method || 'get').toLowerCase();
  const url = String(config.url || '');
  if (method !== 'get' && method !== 'head' && method !== 'options' && config.nstSaveFeedback !== false && !SAVE_FEEDBACK_SKIP.test(url)) {
    saveSeq += 1;
    config.nstSaveId = saveSeq;
    emitSave({ id: saveSeq, phase: 'start', kind: saveKind(method, url) });
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const id = response?.config?.nstSaveId;
    if (id) {
      const failed = response?.data && (response.data.success === false || response.data.status === false);
      emitSave(failed
        ? { id, phase: 'error', message: String(response.data.message || 'The server did not save the change.') }
        : { id, phase: 'success', kind: saveKind(String(response.config.method).toLowerCase(), String(response.config.url || '')), message: response?.data?.message ? String(response.data.message) : '' });
    }
    return response;
  },
  (error) => {
    const id = error?.config?.nstSaveId;
    if (id) emitSave({ id, phase: 'error', message: apiErrorMessage(error) });
    return Promise.reject(error);
  },
);

export default api;
