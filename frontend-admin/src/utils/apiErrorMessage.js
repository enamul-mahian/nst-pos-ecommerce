import { t } from '../i18n';

/**
 * Turns an axios error into a message that says what actually went wrong
 * (server not reachable, wrong credentials, validation, rate limit, server error).
 */
export function apiErrorMessage(error, fallbackKey = 'errors.unknown') {
  const response = error?.response;
  const data = response?.data || {};
  const serverMessage = typeof data.message === 'string' ? data.message.trim() : '';
  const firstFieldError = data.errors && typeof data.errors === 'object'
    ? Object.values(data.errors).flat().find((item) => typeof item === 'string')
    : '';

  if (!response) {
    if (error?.code === 'ECONNABORTED') return t('errors.timeout');
    const base = error?.config?.baseURL || '';
    return t('errors.network', { url: base || '/api' });
  }

  const status = response.status;
  if (status === 401) return serverMessage || t('errors.unauthorized');
  if (status === 403) return serverMessage || t('errors.forbidden');
  if (status === 404) return t('errors.not_found', { url: `${response.config?.baseURL || ''}${response.config?.url || ''}` });
  if (status === 419) return t('errors.session_expired');
  if (status === 422) return firstFieldError || serverMessage || t('errors.validation');
  if (status === 429) return t('errors.too_many');
  if (status >= 500) return t('errors.server', { status, detail: serverMessage && serverMessage !== 'Server Error' ? ` ${serverMessage}` : '' });
  return serverMessage || t(fallbackKey);
}

export default apiErrorMessage;
