import api from './api';

export const accountsPaymentService = {
  getDueCenter: async (params = {}) => {
    const response = await api.get('/accounts/due-center', { params });
    return response.data;
  },

  getCashbook: async (params = {}) => {
    const response = await api.get('/accounts/cashbook', { params });
    return response.data;
  },

  receiveCustomerDue: async (customerId, data) => {
    const response = await api.post(`/customers/${customerId}/receive-due`, data);
    return response.data;
  },

  paySupplierDue: async (supplierId, data) => {
    const payload = data instanceof FormData ? data : buildSupplierPaymentFormData(data);

    const response = await api.post(`/suppliers/${supplierId}/pay-due`, payload, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },
};

function buildSupplierPaymentFormData(data = {}) {
  const formData = new FormData();

  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      formData.append(key, value);
    }
  });

  return formData;
}

export default accountsPaymentService;
