import api from './api';

export async function fetchWebsiteBuilderDraft() {
  const response = await api.get('/website-builder/draft');
  return response.data?.data?.draft || response.data?.data || response.data;
}

export async function saveWebsiteBuilderDraft(content) {
  const response = await api.put('/website-builder/draft', { content });
  return response.data?.data || response.data;
}

export async function publishWebsiteBuilderDraft() {
  const response = await api.post('/website-builder/publish');
  return response.data?.data || response.data;
}

export async function fetchWebsiteBuilderRevisions() {
  const response = await api.get('/website-builder/revisions');
  return response.data?.data || [];
}

export async function rollbackWebsiteBuilderRevision(revisionId) {
  const response = await api.post(`/website-builder/rollback/${revisionId}`);
  return response.data?.data || response.data;
}

export async function deleteWebsiteBuilderRevision(revisionId) {
  const response = await api.delete(`/website-builder/revisions/${encodeURIComponent(revisionId)}`);
  return response.data;
}
