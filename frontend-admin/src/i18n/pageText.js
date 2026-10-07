/**
 * Page header text saved from the header editor.
 * English lives in `title` / `subtitle`; other languages live in `i18n.<code>.title|subtitle`.
 * A language without its own text returns '' so the page's translated default is shown.
 */
export function localizedPageText(page, field, language) {
  if (!page || typeof page !== 'object') return '';
  if (language === 'en') return page[field] || '';
  return page.i18n?.[language]?.[field] || '';
}
