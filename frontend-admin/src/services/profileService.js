import api from './api';

const profileService = {
  get() {
    return api.get('/profile');
  },

  update(payload) {
    return api.post('/profile', payload, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  twoFactorStatus() {
    return api.get('/two-factor/status');
  },

  setupTwoFactor() {
    return api.post('/two-factor/setup');
  },

  confirmTwoFactor(code) {
    return api.post('/two-factor/confirm', { code });
  },

  disableTwoFactor(password, code) {
    return api.post('/two-factor/disable', { password, code });
  },

  regenerateRecoveryCodes(password, code) {
    return api.post('/two-factor/recovery-codes', { password, code });
  },
};

export default profileService;
