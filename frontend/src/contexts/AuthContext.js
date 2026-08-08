import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import api, { tokenStore } from '../lib/api';
import { devLog, safeSessionGetText, safeSessionRemove, safeSessionSetText } from '../lib/browserStorage';

const AuthContext = createContext(null);
const USER_KIND_KEY = 'obelisco_user_kind_session';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    const lastKind = safeSessionGetText(USER_KIND_KEY, null);

    const tryTech = async () => {
      const { data } = await api.get('/tech/auth/me');
      setUser({ ...data, __kind: 'tech' });
      safeSessionSetText(USER_KIND_KEY, 'tech');
    };
    const tryAdmin = async () => {
      const { data } = await api.get('/auth/me');
      setUser({ ...data, __kind: 'admin' });
      safeSessionSetText(USER_KIND_KEY, 'admin');
    };

    try {
      if (lastKind === 'tech') {
        try { await tryTech(); } catch (e) { await tryAdmin(); }
      } else {
        try { await tryAdmin(); } catch (e) { await tryTech(); }
      }
    } catch (err) {
      devLog('Auth check failed:', err?.response?.status || err.message);
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(async (email, password) => {
    // 1) Tentar admin primeiro
    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (data.access_token || data.refresh_token) {
        tokenStore.set(data.access_token, data.refresh_token);
      }
      const u = { ...data, __kind: 'admin' };
      safeSessionSetText(USER_KIND_KEY, 'admin');
      setUser(u);
      return u;
    } catch (adminErr) {
      const status = adminErr?.response?.status;
      // Se credenciais inválidas, tenta como técnico
      if (status === 401 || status === 404 || status === 400) {
        try {
          const { data } = await api.post('/tech/auth/login', { email, password });
          if (data.access_token) tokenStore.set(data.access_token, null);
          const u = { ...(data.employee || {}), __kind: 'tech' };
          safeSessionSetText(USER_KIND_KEY, 'tech');
          setUser(u);
          return u;
        } catch (techErr) {
          // Se ambos falham, lança o erro do admin (mais informativo geralmente)
          throw techErr?.response?.status === 401 ? techErr : adminErr;
        }
      }
      throw adminErr;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // Só chama logout admin se for admin — tech não tem endpoint logout
      if (user && user.__kind !== 'tech') {
        await api.post('/auth/logout');
      }
    } catch (err) {
      devLog('Logout error:', err?.message || err);
    }
    tokenStore.clear();
    safeSessionRemove(USER_KIND_KEY);
    setUser(false);
  }, [user]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
