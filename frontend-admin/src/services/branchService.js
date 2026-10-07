import api from './api';

const branchService = {
  getBranches(params = {}) {
    return api.get('/branches', { params });
  },

  getAllBranches(params = {}) {
    return api.get('/branches/all', { params });
  },

  getBranch(id) {
    return api.get(`/branches/${id}`);
  },

  createBranch(data) {
    return api.post('/branches', data);
  },

  updateBranch(id, data) {
    return api.put(`/branches/${id}`, data);
  },

  deleteBranch(id) {
    return api.delete(`/branches/${id}`);
  },

  getBranchStock(branchId) {
    return api.get(`/branches/${branchId}/stock`);
  },

  getBranchProducts(branchId) {
    return api.get(`/branches/${branchId}/products`);
  },

  assignStock(branchId, data) {
    return api.post(`/branches/${branchId}/assign-stock`, data);
  },

  updateBranchStock(branchStockId, data) {
    return api.put(`/branch-stocks/${branchStockId}`, data);
  },

  removeBranchStock(branchStockId) {
    return api.delete(`/branch-stocks/${branchStockId}`);
  },
};

export { branchService };
export default branchService;