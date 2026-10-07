import api from './api';

const saleService = {
  getPosOptions() {
    return api.get('/sales/pos-options');
  },

  getBranchStock(branchId) {
    return api.get(`/branches/${branchId}/stock`);
  },

  searchProducts(params = {}) {
    return api.get('/sales/search-products', { params });
  },

  getBranchProducts(branchId) {
    return api.get(`/branches/${branchId}/products`);
  },

  getCustomerByPhone(phone) {
    return api.get('/sales/customer-by-phone', {
      params: { phone },
    });
  },

  getSales(params = {}) {
    return api.get('/sales', { params });
  },

  getSale(id) {
    return api.get(`/sales/${id}`);
  },

  createSale(data) {
    return api.post('/sales', data);
  },

  updateSale(id, data) {
    return api.put(`/sales/${id}`, data);
  },

  deleteSale(id) {
    return api.delete(`/sales/${id}`);
  },

  cancelSale(id, data = {}) {
    return api.post(`/sales/${id}/cancel`, data);
  },

  returnSale(id, data = {}) {
    return api.post(`/sales/${id}/return`, data);
  },

  getReadyItems(params = {}) {
    return api.get('/sales/ready-items', { params });
  },

  getAvailableDevices(params = {}) {
    return api.get('/sales/available-devices', { params });
  },
};

export default saleService;