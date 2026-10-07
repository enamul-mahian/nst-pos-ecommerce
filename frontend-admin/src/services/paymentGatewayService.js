import api from './api';

export const paymentGatewayService = {
  list: () => api.get('/payment-gateways'),
  update: (provider, payload) => api.put(`/payment-gateways/${provider}`, payload),
  transactions: (params = {}) => api.get('/payment-gateways/transactions', { params }),
  webhookLogs: (params = {}) => api.get('/payment-gateways/webhook-logs', { params }),
  refund: (id) => api.post(`/payment-gateways/transactions/${id}/refund`),
};

export default paymentGatewayService;
