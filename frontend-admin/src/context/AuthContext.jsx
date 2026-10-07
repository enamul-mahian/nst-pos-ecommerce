import { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

function normalizeAuth(data) {
  return {
    user: data.user,
    roles: data.roles || [],
    permissions: data.permissions || [],
    access: data.access || data.user?.access || {},
    can_access_pos: data.can_access_pos ?? data.user?.can_access_pos,
    can_view_purchase_price: data.can_view_purchase_price ?? data.user?.can_view_purchase_price,
    session_timeout_minutes: data.session_timeout_minutes ?? data.user?.session_timeout_minutes ?? 20,
  };
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    const response = await api.get('/user');
    const normalized = normalizeAuth(response.data || {});
    setUser(normalized);
    return normalized;
  };

  useEffect(() => {
    const token = localStorage.getItem('nst_admin_token');
    if (!token) {
      setLoading(false);
      return;
    }

    refreshUser()
      .catch(() => {
        localStorage.removeItem('nst_admin_token');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password, twoFactorCode = '', captchaToken = '') => {
    const response = await api.post('/login', {
      email,
      password,
      two_factor_code: twoFactorCode || undefined,
      hcaptcha_token: captchaToken || undefined,
    });
    localStorage.setItem('nst_admin_token', response.data.token);
    setUser(normalizeAuth(response.data || {}));
    return response.data;
  };

  const logout = async () => {
    try {
      await api.post('/logout');
    } catch (error) {
      console.log(error);
    }

    const tokenKeys = [
      'nst_admin_token', 'token', 'authToken', 'access_token', 'admin_token',
      'pos_token', 'nst_token', 'nst_auth_token', 'auth_token',
    ];
    tokenKeys.forEach((key) => {
      try { localStorage.removeItem(key); } catch {}
      try { sessionStorage.removeItem(key); } catch {}
    });
    setUser(null);
  };

  useEffect(() => {
    if (!user) return undefined;
    const minutes = Number(user.session_timeout_minutes ?? 20);
    if (minutes === 0) return undefined;
    const key = 'nst_last_admin_activity';
    const mark = () => localStorage.setItem(key, String(Date.now()));
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((event) => window.addEventListener(event, mark, { passive: true }));
    if (!localStorage.getItem(key)) mark();
    const timer = window.setInterval(() => {
      const last = Number(localStorage.getItem(key) || Date.now());
      if (Date.now() - last >= minutes * 60 * 1000) {
        logout().finally(() => { window.location.href = '/login?reason=inactive'; });
      }
    }, 15000);
    return () => { window.clearInterval(timer); events.forEach((event) => window.removeEventListener(event, mark)); };
  }, [user?.session_timeout_minutes]);

  const updateUserProfile = (profile) => {
    setUser((previous) => previous ? {
      ...previous,
      user: { ...(previous.user || {}), ...(profile || {}) },
    } : previous);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, updateUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
