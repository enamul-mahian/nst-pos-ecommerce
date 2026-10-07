import { create } from 'zustand';
import { apiClient, handleApiError } from '../../api/client';
import { User } from '../../types';

// ==========================================
// 1. Auth Store Interface Definitions
// ==========================================
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (phone: string, password: string, captchaToken?: string) => Promise<User>;
  register: (name: string, phone: string, password: string, email?: string, captchaToken?: string) => Promise<User>;
  logout: () => Promise<void>;
  fetchProfile: () => Promise<User>;
  clearError: () => void;
  initialize: () => void;
}

// ==========================================
// 2. Zustand Store Implementation
// ==========================================
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  /**
   * Initialize and restore customer session from LocalStorage securely
   */
  initialize: () => {
    try {
      const savedToken = localStorage.getItem('nst_customer_token');
      const savedUser = localStorage.getItem('nst_customer_user');

      if (savedToken && savedUser) {
        set({
          token: savedToken,
          user: JSON.parse(savedUser),
          isAuthenticated: true,
          error: null,
        });
      }
    } catch (err) {
      // If parsing fails, clear bad data cleanly
      localStorage.removeItem('nst_customer_token');
      localStorage.removeItem('nst_customer_user');
      set({ token: null, user: null, isAuthenticated: false });
    }
  },

  /**
   * Secure credential-based login using the dedicated API endpoint
   */
  login: async (phone: string, password: string, captchaToken?: string): Promise<User> => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.post('/public/customer-login', {
        phone,
        password,
        hcaptcha_token: captchaToken || undefined,
      });

      const data = response.data;
      if (!data.status || !data.token || !data.user) {
        throw new Error(data.message || 'Login failed. Invalid response from server.');
      }

      const userPayload: User = data.user;
      const tokenPayload: string = data.token;

      // Secure persistence in client storage
      localStorage.setItem('nst_customer_token', tokenPayload);
      localStorage.setItem('nst_customer_user', JSON.stringify(userPayload));

      set({
        user: userPayload,
        token: tokenPayload,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      return userPayload;
    } catch (err: any) {
      const parsedError = handleApiError(err);
      set({ isLoading: false, error: parsedError.message });
      throw parsedError;
    }
  },

  /**
   * Customer Registration handler submitting fields directly to POS API
   */
  register: async (name: string, phone: string, password: string, email?: string, captchaToken?: string): Promise<User> => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.post('/public/customer-register', {
        name,
        phone,
        password,
        email: email || undefined,
        hcaptcha_token: captchaToken || undefined,
      });

      const data = response.data;
      if (!data.status || !data.token || !data.user) {
        throw new Error(data.message || 'Registration failed. Invalid response from server.');
      }

      const userPayload: User = data.user;
      const tokenPayload: string = data.token;

      // Secure persistence in client storage
      localStorage.setItem('nst_customer_token', tokenPayload);
      localStorage.setItem('nst_customer_user', JSON.stringify(userPayload));

      set({
        user: userPayload,
        token: tokenPayload,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      return userPayload;
    } catch (err: any) {
      const parsedError = handleApiError(err);
      set({ isLoading: false, error: parsedError.message });
      throw parsedError;
    }
  },

  /**
   * Authorized Customer Logout submitting request and clearing localStorage
   */
  logout: async (): Promise<void> => {
    set({ isLoading: true });
    try {
      // Call the secure portal logout endpoint
      await apiClient.post('/portal/logout');
    } catch (err) {
      // Even if the token is already invalidated on backend, clean up the UI gracefully
    } finally {
      localStorage.removeItem('nst_customer_token');
      localStorage.removeItem('nst_customer_user');

      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  },

  /**
   * Sync and fetch the latest customer profile status from Portal API
   */
  fetchProfile: async (): Promise<User> => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get('/portal/profile');
      const data = response.data;

      // Ensure response matches standard profile model structure
      const userPayload: User = data.data || data.user;

      if (!userPayload) {
        throw new Error('Profile data not found in server response.');
      }

      localStorage.setItem('nst_customer_user', JSON.stringify(userPayload));
      set({ user: userPayload, isAuthenticated: true, isLoading: false, error: null });

      return userPayload;
    } catch (err: any) {
      const parsedError = handleApiError(err);
      set({ isLoading: false, error: parsedError.message });
      throw parsedError;
    }
  },

  /**
   * Reset store errors for cleaner UI retry flows
   */
  clearError: () => set({ error: null }),
}));

// Auto-register session expiration event listener on window load
if (typeof window !== 'undefined') {
  window.addEventListener('nst-customer-session-expired', () => {
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      error: 'Your session has expired. Please login again.',
    });
  });
}
// Restore the saved session synchronously so protected routes don't bounce a
// refreshed/deep-linked /portal/* page to /login before the first effect runs.
if (typeof window !== 'undefined') {
  useAuthStore.getState().initialize();
}
