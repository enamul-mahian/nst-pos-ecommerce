const SENSITIVE_KEY = /(password|passcode|secret|token|authorization|cookie|otp|two.?factor|recovery|card|cvv|pin|bank|account.?number|nid|passport|fingerprint|document|attachment.?body)/i;
const EMAIL_PATTERN = /\b([A-Z0-9._%+-]{1,64})@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const PHONE_PATTERN = /(?<!\d)(?:\+?88)?01\d{9}(?!\d)/g;
const IMEI_PATTERN = /(?<!\d)\d{15}(?!\d)/g;
const LONG_ID_PATTERN = /(?<!\d)\d{12,20}(?!\d)/g;
const TOKEN_PATTERN = /\b(?:eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}|(?:bearer\s+)?[a-f0-9]{32,}|[A-Za-z0-9_-]{40,})\b/gi;

export function maskEmail(value) {
  return String(value).replace(EMAIL_PATTERN, (_, local, domain) => {
    const visible = local.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(2, Math.min(8, local.length - 2)))}@${domain}`;
  });
}

export function maskPhone(value) {
  return String(value).replace(PHONE_PATTERN, (phone) => `${phone.slice(0, 4)}*****${phone.slice(-2)}`);
}

export function maskImei(value) {
  return String(value).replace(IMEI_PATTERN, (imei) => `${'*'.repeat(11)}${imei.slice(-4)}`);
}

export function redactText(value, stats = null) {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : safeSerialize(value);
  const before = text;
  text = maskEmail(text);
  text = maskPhone(text);
  text = maskImei(text);
  text = text.replace(TOKEN_PATTERN, '[REDACTED_TOKEN]');
  text = text.replace(LONG_ID_PATTERN, (digits) => `${'*'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`);
  if (stats && before !== text) stats.redactedValues = (stats.redactedValues || 0) + 1;
  return text;
}

export function safeSerialize(value) {
  try {
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (typeof value === 'string') return value;
    return JSON.stringify(value, (_key, item) => {
      if (item instanceof Error) return { name: item.name, message: item.message, stack: item.stack };
      if (typeof item === 'bigint') return String(item);
      return item;
    });
  } catch {
    try { return String(value); } catch { return '[Unserializable]'; }
  }
}

export function sanitizeLabel(value) {
  return redactText(String(value || '').replace(/\s+/g, ' ').trim()).slice(0, 180);
}

export function sanitizeUrl(input) {
  try {
    const url = new URL(String(input || ''), window.location.origin);
    const allowed = new Set(['tab', 'task', 'view', 'mode', 'page', 'status', 'section', 'type']);
    const query = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      query.set(key, allowed.has(key) ? redactText(value).slice(0, 80) : '[REDACTED]');
    });
    return `${url.origin === window.location.origin ? '' : url.origin}${url.pathname}${query.toString() ? `?${query}` : ''}`;
  } catch {
    return redactText(String(input || '')).slice(0, 500);
  }
}

export function redactObject(value, stats = { redactedFields: 0, redactedValues: 0 }, depth = 0) {
  if (depth > 8) return '[DEPTH_LIMIT]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactText(value, stats);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: redactText(value.name, stats),
      message: redactText(value.message, stats),
      stack: redactText(value.stack || '', stats).slice(0, 4000),
    };
  }
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => redactObject(item, stats, depth + 1));
  if (typeof value === 'object') {
    const result = {};
    Object.entries(value).slice(0, 500).forEach(([key, item]) => {
      if (SENSITIVE_KEY.test(key)) {
        result[key] = '[REDACTED_SENSITIVE_FIELD]';
        stats.redactedFields += 1;
      } else {
        result[key] = redactObject(item, stats, depth + 1);
      }
    });
    return result;
  }
  return redactText(String(value), stats);
}

export function roleList(auth) {
  const values = [
    ...(Array.isArray(auth?.roles) ? auth.roles : []),
    ...(Array.isArray(auth?.role_names) ? auth.role_names : []),
    ...(Array.isArray(auth?.user?.roles) ? auth.user.roles : []),
    ...(Array.isArray(auth?.user?.role_names) ? auth.user.role_names : []),
    auth?.role,
    auth?.role_name,
    auth?.user?.role,
    auth?.user?.role_name,
  ].filter(Boolean).map((value) => typeof value === 'string' ? value : value?.name || value?.slug || '').filter(Boolean);
  return [...new Set(values.map((value) => String(value).toLowerCase().replace(/\s+/g, '_')))];
}

export function isQaAuthorized(auth) {
  return roleList(auth).includes('super_admin') || Boolean(auth?.permissions?.includes?.('qa_tracker'));
}

export function userSummary(auth) {
  const person = auth?.user || auth || {};
  return {
    id: person.id || auth?.id || null,
    name: redactText(person.name || person.username || 'Authenticated User'),
    roles: roleList(auth),
    branch: redactText(person.branch?.name || person.branch_name || auth?.branch?.name || auth?.branch_name || 'Unassigned'),
  };
}
