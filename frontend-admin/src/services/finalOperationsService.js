import api from './api';

const finalOperationsService = {
  couponTiers: () => api.get('/final-operations/coupon-tiers'),
  saveCouponTier: (payload, id) => id
    ? api.put(`/final-operations/coupon-tiers/${id}`, payload)
    : api.post('/final-operations/coupon-tiers', payload),
  deleteCouponTier: (id) => api.delete(`/final-operations/coupon-tiers/${id}`),
  registrationPromos: (params = {}) => api.get('/final-operations/registration-promos', { params }),
  generateRegistrationPromo: (payload) => api.post('/final-operations/registration-promos', payload),
  invoiceCoupons: () => api.get('/final-operations/invoice-coupons'),
  issueInvoiceCoupon: (payload) => api.post('/final-operations/invoice-coupons/issue', payload),
  useInvoiceCoupon: (payload) => api.post('/final-operations/invoice-coupons/use', payload),
  externalPreorders: (params = {}) => api.get('/final-operations/external-preorders', { params }),
  updateExternalPreorder: (id, payload) => api.put(`/final-operations/external-preorders/${id}`, payload),
  reviewExternalPreorderPayment: (id, payload) => api.post(`/final-operations/external-preorders/${id}/payment-review`, payload),
  securitySettings: () => api.get('/final-operations/security-settings'),
  saveSecuritySettings: (payload) => api.put('/final-operations/security-settings', payload),
  securityEvents: (params = {}) => api.get('/final-operations/security-events', { params }),
  resolveSecurityEvent: (id) => api.post(`/final-operations/security-events/${id}/resolve`),
  nidVerifications: (params = {}) => api.get('/final-operations/nid-verifications', { params }),
  nidVerification: (id) => api.get(`/final-operations/nid-verifications/${id}`),
  nidVerificationConfig: () => api.get('/final-operations/nid-verifications/config'),
  storeNidVerification: (payload) => api.post('/final-operations/nid-verifications', payload),
  resumeNidVerification: (id) => api.post(`/final-operations/nid-verifications/${id}/resume`),
  saveNidManualResult: (id, payload) => api.post(`/final-operations/nid-verifications/${id}/manual-result`, payload),
  cancelNidVerification: (id) => api.post(`/final-operations/nid-verifications/${id}/cancel`),
  saveNidProvider: (payload) => api.put('/final-operations/nid-verifications/provider', payload),
  saveNidProviderToken: (payload) => api.post('/final-operations/nid-verifications/provider/token', payload),
  clearNidProviderToken: (providerId) => api.delete('/final-operations/nid-verifications/provider/token', { data: { provider_id: providerId } }),
  saveNidField: (payload, id) => id
    ? api.put(`/final-operations/nid-verifications/fields/${id}`, payload)
    : api.post('/final-operations/nid-verifications/fields', payload),
  deleteNidField: (id) => api.delete(`/final-operations/nid-verifications/fields/${id}`),
  smsSettings: () => api.get('/final-operations/sms/settings'),
  saveSmsSettings: (payload) => api.put('/final-operations/sms/settings', payload),
  smsTemplates: () => api.get('/final-operations/sms/templates'),
  saveSmsTemplate: (payload, id) => id
    ? api.put(`/final-operations/sms/templates/${id}`, payload)
    : api.post('/final-operations/sms/templates', payload),
  patchStatus: () => api.get('/patch-manager/status'),
  validatePatch: (file) => {
    const payload = new FormData();
    payload.append('patch', file);
    return api.post('/patch-manager/validate', payload, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  executePatch: (validationToken) => api.post('/patch-manager/execute', { validation_token: validationToken }),
  patchRuns: () => api.get('/patch-manager/runs'),
  rollbackPatch: (runId) => api.post(`/patch-manager/rollback/${runId}`),
};

export default finalOperationsService;
