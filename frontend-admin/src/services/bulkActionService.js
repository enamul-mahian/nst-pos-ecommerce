import api from './api';

const bulkActionService = {
  delete(type, ids) {
    return api.delete(`/bulk-delete/${type}`, {
      data: {
        ids,
      },
    });
  },
};

export default bulkActionService;