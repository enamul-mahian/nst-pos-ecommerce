export const youtubeEmbedUrl = (url) => {
  if (!url) return '';
  const text = String(url).trim();
  const short = text.match(/youtu\.be\/([^?&]+)/);
  const watch = text.match(/[?&]v=([^?&]+)/);
  const embed = text.match(/youtube\.com\/embed\/([^?&]+)/);
  const id = short?.[1] || watch?.[1] || embed?.[1];
  return id ? `https://www.youtube.com/embed/${id}` : '';
};
export const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .slice(0, 120);
export function buildSeoSuggestion({ brandName = '', categoryName = '', name = '', ram = '', storage = '', region = '', colorName = '', simNetwork = '', condition = '' }) {
  const ramPart = ram && !['default', 'initial/unknown'].includes(String(ram).toLowerCase()) ? ram : '';
  const conditionPart = condition && condition !== 'new' ? String(condition).replace('_', '-') : '';
  const titleParts = [brandName, name, ramPart, storage, region].filter(Boolean);
  const title = `${[...titleParts, conditionPart].filter(Boolean).join(' ')} Price in Bangladesh`.replace(/\s+/g, ' ').trim();
  const slug = slugify([brandName, name, ramPart, storage, region, colorName, conditionPart].filter(Boolean).join(' '));
  const description = `Buy ${titleParts.join(' ')} from New Singapur Telecom. ${colorName ? `Color: ${colorName}. ` : ''}${simNetwork ? `SIM: ${simNetwork}. ` : ''}Warranty, EMI, booking and after-sales support available.`.replace(/\s+/g, ' ').trim();
  const keywords = [brandName, name, categoryName || 'Mobile Phone', storage, region, colorName, name ? `${name} price in Bangladesh` : '', 'New Singapur Telecom'].filter(Boolean).join(', ');
  return { title, slug, description, keywords };
}

/** add / update / remove helpers for the list fields (key_features, specifications, faqs, add_ons). */
export function contentListHelpers(setForm) {
  return {
    addListItem: (field, emptyItem) => {
      setForm((previous) => ({ ...previous, [field]: [...(previous[field] || []), emptyItem] }));
    },
    updateListItem: (field, index, key, value) => {
      setForm((previous) => ({
        ...previous,
        [field]: (previous[field] || []).map((item, itemIndex) => (
          itemIndex === index
            ? (typeof item === 'string' ? value : { ...item, [key]: value })
            : item
        )),
      }));
    },
    removeListItem: (field, index) => {
      setForm((previous) => ({
        ...previous,
        [field]: (previous[field] || []).filter((_, itemIndex) => itemIndex !== index),
      }));
    },
  };
}
