import { useEffect, useState } from 'react';
import { apiClient, handleApiError } from '../../api/client';

export const SUPPLIER_HEADERS = { 'X-NST-Portal': 'supplier' };

/** ৳ amount with Bangladeshi (lakh) grouping, e.g. ৳ 8,75,200 */
export const taka = (value: unknown) => `৳ ${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

export const shortDate = (value: unknown) => {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const humanize = (value: unknown) => String(value ?? '-').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Accepts `{data:[...]}`, `{data:{data:[...]}}` (Laravel paginator) or a bare array. */
export const rowsOf = (payload: any): any[] => {
  const candidates = [payload?.data?.data, payload?.data, payload];
  return (candidates.find(Array.isArray) as any[]) || [];
};

export type Tone = 'green' | 'amber' | 'blue' | 'red' | 'violet' | 'slate';

export const statusTone = (status: unknown): Tone => {
  const s = String(status || '').toLowerCase();
  if (/(cancel|reject|fail|return|dispute|expired|void)/.test(s)) return 'red';
  if (/(pending|process|placed|submitted|due|unpaid|partial|review|waiting|requested|draft)/.test(s)) return 'amber';
  if (/(deliver|complete|paid|accept|active|confirm|received|approved|success)/.test(s)) return 'green';
  if (/(ship|transit|dispatch)/.test(s)) return 'blue';
  return 'slate';
};

export function usePortalData(endpoint: string | null, options: { supplier?: boolean } = {}) {
  const [payload, setPayload] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(Boolean(endpoint));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!endpoint) return;
    let alive = true;
    setIsLoading(true);
    setError(null);
    apiClient
      .get(endpoint, options.supplier ? { headers: SUPPLIER_HEADERS } : undefined)
      .then((response) => { if (alive) setPayload(response.data); })
      .catch((err) => { if (alive) setError(handleApiError(err).message); })
      .finally(() => { if (alive) setIsLoading(false); });
    return () => { alive = false; };
  }, [endpoint, options.supplier]);

  return { payload, rows: rowsOf(payload), isLoading, error };
}
