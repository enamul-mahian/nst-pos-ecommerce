import { apiClient } from '../api/client';
import { normalizeWebsite } from '../builder/schema/guards';
import type { BuilderSite } from '../builder/schema/website.schema';

const noCacheRequest = {
  params: { _t: Date.now() },
  headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
};

export const fetchPublishedWebsite = async (): Promise<BuilderSite> => {
  const response = await apiClient.get('/website-builder/published', noCacheRequest);
  return normalizeWebsite(response.data);
};

export const fetchPublishedWebsitePage = async (path: string): Promise<BuilderSite> => {
  const response = await apiClient.get('/website-builder/page', {
    ...noCacheRequest,
    params: { ...noCacheRequest.params, path },
  });
  return normalizeWebsite(response.data);
};
