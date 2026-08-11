import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import api, { companySessionStore, tokenStore } from '../lib/api';
import { devLog, safeSessionGetText, safeSessionRemove, safeSessionSetText } from '../lib/browserStorage';

const AuthContext = createContext(null);
const USER_KIND_KEY = 'obelisco_user_kind_session';

const persistCompanySession = (companyId) => {
  if (companyId) companySessionStore.set(companyId);
  else companySessionStore.clear();
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const token = tokenStore.getAccess();

  const checkAuth = useCallback(async () => {
    const lastKind = safeSessionGetText(USER_KIND_KEY, null);

    const tryTech = async () => {
      const { data } = await api.get('/tech/auth/me');
      persistCompanySession(data?.company_id);
      setUser({ ...data, __kind: 'tech' });
      safeSessionSetText(USER_KIND_KEY, 'tech');
    };
    const tryAdmin = async () => {
      const { data } = await api.get('/auth/me');
      persistCompanySession(data?.company_id);
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
      companySessionStore.clear();
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
      persistCompanySession(data?.company_id);
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
          persistCompanySession(data?.employee?.company_id);
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

  const register = useCallback(async ({ name, email, password, companyName }) => {
    const { data } = await api.post('/auth/register', {
      name,
      email,
      password,
      company_name: companyName,
    });
    if (data.access_token || data.refresh_token) {
      tokenStore.set(data.access_token, data.refresh_token);
    }
    persistCompanySession(data?.company_id);
    const nextUser = { ...data, __kind: 'admin' };
    safeSessionSetText(USER_KIND_KEY, 'admin');
    setUser(nextUser);
    return nextUser;
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
    companySessionStore.clear();
    safeSessionRemove(USER_KIND_KEY);
    setUser(false);
  }, [user]);

  const refreshAuth = useCallback(async () => {
    setLoading(true);
    await checkAuth();
  }, [checkAuth]);

  const switchCompany = useCallback(async (companyId) => {
    const { data } = await api.post('/companies/select', { company_id: companyId });
    persistCompanySession(data?.company_id);
    setUser((prev) => prev ? ({ ...prev, ...data }) : prev);
    return data;
  }, []);

  const value = useMemo(() => ({ user, loading, token, login, register, logout, refreshAuth, switchCompany }), [user, loading, token, login, register, logout, refreshAuth, switchCompany]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
