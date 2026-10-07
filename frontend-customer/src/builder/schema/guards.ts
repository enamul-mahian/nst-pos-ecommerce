import type { BuilderBlock, BuilderPage, BuilderSite, JsonRecord } from './website.schema';

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string => typeof value === 'string' ? value : '';
const numberValue = (value: unknown, fallback: number): number => typeof value === 'number' ? value : fallback;

export const normalizeBlock = (value: unknown, index = 0): BuilderBlock | null => {
  if (!isRecord(value)) return null;
  const type = stringValue(value.type || value.blockType || value.component);
  if (!type) return null;
  const childrenSource = Array.isArray(value.children) ? value.children : [];
  const settings = isRecord(value.settings) ? value.settings : undefined;
  return {
    id: stringValue(value.id) || `${type}-${index}`,
    type,
    enabled: value.enabled !== false,
    order: numberValue(value.order, index),
    props: isRecord(value.props) ? value.props : settings,
    content: isRecord(value.content) ? value.content : value,
    style: isRecord(value.style) ? value.style : undefined,
    responsive: isRecord(value.responsive) ? value.responsive : undefined,
    animation: isRecord(value.animation) ? value.animation : undefined,
    dataSource: isRecord(value.dataSource) ? value.dataSource : undefined,
    visibility: isRecord(value.visibility) ? value.visibility : undefined,
    children: childrenSource.map((child, childIndex) => normalizeBlock(child, childIndex)).filter(Boolean) as BuilderBlock[],
  };
};

const normalizeBlockList = (value: unknown): BuilderBlock[] =>
  (Array.isArray(value) ? value : [])
    .map((block, blockIndex) => normalizeBlock(block, blockIndex))
    .filter(Boolean) as BuilderBlock[];

export const normalizePage = (value: unknown, index = 0): BuilderPage | null => {
  if (!isRecord(value)) return null;
  const routeSource = value.route || value.path || value.link || value.slug;
  const route = stringValue(routeSource) || (index === 0 ? '/' : '');
  if (!route) return null;
  const blockSource = Array.isArray(value.blocks)
    ? value.blocks
    : Array.isArray(value.sections)
      ? value.sections
      : [];
  return {
    id: stringValue(value.id) || `page-${index}`,
    name: stringValue(value.name || value.title),
    slug: stringValue(value.slug) || route,
    route: route.startsWith('/') ? route : `/${route}`,
    status: value.status === 'draft' || value.status === 'archived' ? value.status : 'published',
    template: stringValue(value.template),
    seo: isRecord(value.seo) ? value.seo : undefined,
    theme: isRecord(value.theme) ? value.theme : undefined,
    blocks: blockSource.map((block, blockIndex) => normalizeBlock(block, blockIndex)).filter(Boolean) as BuilderBlock[],
  };
};

const legacyPage = (source: JsonRecord): BuilderPage => {
  const blocks: BuilderBlock[] = [];
  if (Array.isArray(source.sections)) {
    source.sections.forEach((section, index) => {
      const normalized = normalizeBlock(section, index);
      if (normalized) blocks.push(normalized);
    });
  }
  if (isRecord(source.hero)) {
    blocks.unshift({ id: 'hero-0', type: 'hero', enabled: source.hero.enabled !== false, order: -1, content: source.hero });
  }
  return {
    id: 'home',
    name: stringValue(isRecord(source.site) ? source.site.name : ''),
    slug: '/',
    route: '/',
    status: 'published',
    seo: isRecord(source.seo) ? source.seo : undefined,
    blocks,
  };
};

export const normalizeWebsite = (payload: unknown): BuilderSite => {
  const envelope = isRecord(payload) ? payload : {};
  const source = isRecord(envelope.published)
    ? envelope.published
    : isRecord(envelope.data) && isRecord(envelope.data.published)
      ? envelope.data.published
      : isRecord(envelope.data)
        ? envelope.data
        : envelope;

  const nestedBuilder = isRecord(source.builder) ? source.builder : {};
  const pageSource = Array.isArray(source.pages)
    ? source.pages
    : Array.isArray(nestedBuilder.pages)
      ? nestedBuilder.pages
      : [];
  const normalizedPages = pageSource
    .map((page, pageIndex) => normalizePage(page, pageIndex))
    .filter(Boolean) as BuilderPage[];

  const globalsSource = isRecord(source.globals)
    ? source.globals
    : isRecord(nestedBuilder.globals)
      ? nestedBuilder.globals
      : {};

  const header = normalizeBlockList(globalsSource.header);
  const footer = normalizeBlockList(globalsSource.footer);
  const overlays = normalizeBlockList(globalsSource.overlays);

  if (header.length === 0 && (isRecord(source.header) || isRecord(source.site))) {
    header.push({
      id: 'global-site-header',
      type: 'site_header',
      enabled: true,
      order: 0,
      content: { site: source.site, header: source.header },
    });
  }

  if (footer.length === 0 && isRecord(source.footer)) {
    footer.push({
      id: 'global-site-footer',
      type: 'site_footer',
      enabled: source.footer.enabled !== false,
      order: 0,
      content: source.footer,
    });
  }

  return {
    id: stringValue(source.id),
    version: numberValue(source.version, 1),
    schemaVersion: numberValue(source.schemaVersion || nestedBuilder.schemaVersion, 1),
    releaseId: stringValue(source.releaseId),
    site: isRecord(source.site) ? source.site : undefined,
    theme: isRecord(source.theme) ? source.theme : isRecord(nestedBuilder.theme) ? nestedBuilder.theme : undefined,
    globals: { header, footer, overlays },
    pages: normalizedPages.length > 0 ? normalizedPages : [legacyPage(source)],
  };
};
