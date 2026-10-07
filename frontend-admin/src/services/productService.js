import api from './api';

export const productService = {
  getProducts: async (params = {}) => {
    const response = await api.get('/products', { params });
    return response.data;
  },

  getProduct: async (id) => {
    const response = await api.get(`/products/${id}`);
    return response.data;
  },

  createProduct: async (formData) => {
    const response = await api.post('/products', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },

  updateProduct: async (id, formData) => {
    formData.append('_method', 'PUT');

    const response = await api.post(`/products/${id}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },

  deleteProduct: async (id) => {
    const response = await api.delete(`/products/${id}`);
    return response.data;
  },

  getProductVariantOptions: async (id) => {
    const response = await api.get(`/products/${id}/variants/options`);
    return response.data;
  },

  createVariant: async (data) => {
    const response = await api.post('/product-variants', data);
    return response.data;
  },

  updateVariant: async (id, data) => {
    const response = await api.put(`/product-variants/${id}`, data);
    return response.data;
  },

  deleteVariant: async (id) => {
    const response = await api.delete(`/product-variants/${id}`);
    return response.data;
  },

  getMediaLibraryImages: async (params = {}) => {
    const response = await api.get('/media-library/images', { params });
    return response.data;
  },

  deleteMediaLibraryImage: async (payload) => {
    const response = await api.delete('/media-library/images/delete', { data: payload });
    return response.data;
  },

  getVariantImageMatrix: async (productId) => {
    const response = await api.get(`/products/${productId}/variant-image-matrix`);
    return response.data;
  },

  getVariantImages: async (variantId) => {
    const response = await api.get(`/product-variants/${variantId}/images`);
    return response.data;
  },

  linkImagesToVariant: async (variantId, imageIds) => {
    const response = await api.post(`/product-variants/${variantId}/images/link`, { image_ids: imageIds });
    return response.data;
  },

  uploadVariantImages: async (variantId, formData) => {
    const response = await api.post(`/product-variants/${variantId}/images/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  unlinkVariantImages: async (variantId, imageIds) => {
    const response = await api.delete(`/product-variants/${variantId}/images/unlink`, {
      data: { image_ids: imageIds },
    });
    return response.data;
  },

  bulkLinkImagesToVariants: async (variantIds, imageIds) => {
    const response = await api.post('/product-variants/bulk/images/link', {
      variant_ids: variantIds,
      image_ids: imageIds,
    });
    return response.data;
  },

};