import api from './api';

const productDraftService = {
  list() {
    return api.get('/product-drafts');
  },

  get(draftKey) {
    return api.get(`/product-drafts/${encodeURIComponent(draftKey)}`);
  },

  save(payload) {
    return api.put('/product-drafts', payload);
  },

  complete(draftKey) {
    return api.post(`/product-drafts/${encodeURIComponent(draftKey)}/complete`);
  },

  remove(draftKey) {
    return api.delete(`/product-drafts/${encodeURIComponent(draftKey)}`);
  },
};

export default productDraftService;
