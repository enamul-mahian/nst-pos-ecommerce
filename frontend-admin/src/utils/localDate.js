/**
 * YYYY-MM-DD in the user's local calendar (Bangladesh time for NST staff).
 * Date.toISOString() is UTC, so before 6 AM it returned yesterday and "1st of the month"
 * came out as the last day of the previous month.
 */
export function localDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
