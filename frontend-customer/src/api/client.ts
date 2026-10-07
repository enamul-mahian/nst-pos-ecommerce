import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getLanguage, t } from '../i18n';

// ==========================================
// 1. Base URL Resolution
// ==========================================
// Dynamic base URL resolved from environment variables with safe default
const ENV_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const BASE_URL = ENV_BASE_URL || '/api';

// ==========================================
// 2. Custom Normalized Error Type
// ==========================================
export interface NormalizedApiError {
  status: number;
  message: string;
  errors: Record<string, string[]> | null;
  raw: any;
}

/** A message that says what actually failed: no connection, missing route, rate limit or server error. */
function describeError(error: AxiosError<any>): string {
  const response = error.response;
  const data = response?.data || {};
  const serverMessage = typeof data.message === 'string' ? data.message.trim() : '';
  const fieldError = data.errors && typeof data.errors === 'object'
    ? (Object.values(data.errors).flat().find((item) => typeof item === 'string') as string | undefined)
    : undefined;

  if (!response) {
    if (error.code === 'ECONNABORTED') return t('errors.timeout');
    return t('errors.network', { url: error.config?.baseURL || BASE_URL });
  }
  const status = response.status;
  if (status === 404) return t('errors.not_found', { url: `${response.config?.baseURL || ''}${response.config?.url || ''}` });
  if (status === 419) return t('errors.session_expired');
  if (status === 422) return fieldError || serverMessage || t('errors.validation');
  if (status === 429) return t('errors.too_many');
  if (status >= 500) return t('errors.server', { status, detail: serverMessage && serverMessage !== 'Server Error' ? ` ${serverMessage}` : '' });
  return serverMessage || t('errors.unknown');
}

// ==========================================
// 3. Create Axios Instance
// ==========================================
export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000, // 30 seconds timeout
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  withCredentials: true, // Crucial for Sanctum cookies / sessions if used
});

// ==========================================
// 4. Request Interceptor (Token Injection)
// ==========================================
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Inject the Sanctum token from localStorage if exists
    const portal = String(config.headers?.['X-NST-Portal'] || 'customer');
    const token = portal === 'supplier' ? localStorage.getItem('nst_supplier_token') : localStorage.getItem('nst_customer_token');

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (config.headers) {
      config.headers['X-Locale'] = getLanguage();
    }

    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// ==========================================
// 5. Response Interceptor (Error Normalization & Auto-Logout)
// ==========================================
apiClient.interceptors.response.use(
  (response) => {
    // Seamlessly return data for successful calls
    return response;
  },
  (error: AxiosError<any>) => {
    const response = error.response;

    // Build a standardized error payload for all UI consumption
    const normalizedError: NormalizedApiError = {
      status: response?.status || 500,
      message: describeError(error),
      errors: response?.data?.errors || null,
      raw: error,
    };

    // Global session expiry management
    if (response?.status === 401) {
      // Clear only the session belonging to the failed portal request.
      // A supplier expiry must never log out a customer, and a customer expiry
      // must never remove the isolated supplier session.
      const portal = String(error.config?.headers?.['X-NST-Portal'] || 'customer');
      if (portal === 'supplier') {
        localStorage.removeItem('nst_supplier_token');
        localStorage.removeItem('nst_supplier_session');
      } else {
        localStorage.removeItem('nst_customer_token');
        localStorage.removeItem('nst_customer_user');
      }

      // Emit custom session-expired event if page-wide listeners are active
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(portal === 'supplier' ? 'nst-supplier-session-expired' : 'nst-customer-session-expired'));
      }
    }

    return Promise.reject(normalizedError);
  }
);

// ==========================================
// 6. Helper for safe API call error handling
// ==========================================
export const handleApiError = (error: any): NormalizedApiError => {
  if (error && 'status' in error && 'message' in error) {
    return error as NormalizedApiError;
  }

  return {
    status: 500,
    message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    errors: null,
    raw: error,
  };
};

export default apiClient;
