import axios from 'axios';
import { devLog, safeSessionGetText, safeSessionRemove, safeSessionSetText } from './browserStorage';

const ACCESS_KEY = 'obelisco_access_token_session';
const REFRESH_KEY = 'obelisco_refresh_token_session';
const ACTIVE_COMPANY_KEY = 'obelisco_active_company_id_session';
const USER_KIND_KEY = 'obelisco_user_kind_session';
const inMemoryTokens = { access: null, refresh: null };
let inMemoryCompanyId = null;

export const tokenStore = {
  getAccess: () => {
    if (inMemoryTokens.access) return inMemoryTokens.access;
    const access = safeSessionGetText(ACCESS_KEY, null);
    inMemoryTokens.access = access;
    return access;
  },
  getRefresh: () => {
    if (inMemoryTokens.refresh) return inMemoryTokens.refresh;
    const refresh = safeSessionGetText(REFRESH_KEY, null);
    inMemoryTokens.refresh = refresh;
    return refresh;
  },
  set: (access, refresh) => {
    if (access) {
      inMemoryTokens.access = access;
      safeSessionSetText(ACCESS_KEY, access);
    }
    if (refresh) {
      inMemoryTokens.refresh = refresh;
      safeSessionSetText(REFRESH_KEY, refresh);
    }
  },
  clear: () => {
    inMemoryTokens.access = null;
    inMemoryTokens.refresh = null;
    safeSessionRemove(ACCESS_KEY);
    safeSessionRemove(REFRESH_KEY);
  },
};

export const companySessionStore = {
  get: () => {
    if (inMemoryCompanyId) return inMemoryCompanyId;
    const companyId = safeSessionGetText(ACTIVE_COMPANY_KEY, null);
    inMemoryCompanyId = companyId;
    return companyId;
  },
  set: (companyId) => {
    if (!companyId) return;
    inMemoryCompanyId = companyId;
    safeSessionSetText(ACTIVE_COMPANY_KEY, companyId);
  },
  clear: () => {
    inMemoryCompanyId = null;
    safeSessionRemove(ACTIVE_COMPANY_KEY);
  },
};

const api = axios.create({
  baseURL: `${process.env.REACT_APP_BACKEND_URL}/api`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach Bearer token from session-scoped fallback storage (works in iframes where cookies are blocked)
api.interceptors.request.use((config) => {
  const token = tokenStore.getAccess();
  const activeCompanyId = companySessionStore.get();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (activeCompanyId) {
    config.headers = config.headers || {};
    config.headers['X-Company-Id'] = activeCompanyId;
  }
  return config;
});

// Auto-refresh access token on 401 and retry the original request once.
let isRefreshing = false;
let pendingQueue = [];

const processQueue = (error) => {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve();
  });
  pendingQueue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const refreshToken = tokenStore.getRefresh();
    const currentUserKind = safeSessionGetText(USER_KIND_KEY, null);

    const isAuthEndpoint = original?.url?.includes('/auth/refresh') || original?.url?.includes('/auth/login') || original?.url?.includes('/auth/logout');
    // /auth/me e /tech/auth/me são probes de sessão — nunca devem accionar o refresh/clear/redirect
    const isSessionProbe = original?.url?.endsWith('/auth/me') || original?.url?.endsWith('/tech/auth/me');
    const isTechEndpoint = original?.url?.includes('/tech/');
    const shouldSkipRefreshForTechEndpoint = isTechEndpoint && (currentUserKind === 'tech' || !refreshToken);

    if (status === 401 && !original._retry && !isAuthEndpoint && !isSessionProbe && !shouldSkipRefreshForTechEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve: () => resolve(api(original)), reject });
        });
      }

      original._retry = true;
      isRefreshing = true;
      try {
        const body = refreshToken ? { refresh_token: refreshToken } : {};
        const { data } = await api.post('/auth/refresh', body);
        if (data.access_token) tokenStore.set(data.access_token, null);
        processQueue(null);
        return api(original);
      } catch (refreshErr) {
        tokenStore.clear();
        companySessionStore.clear();
        processQueue(refreshErr);
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/p/')) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    if (status === 401) {
      devLog('[api] 401 without refresh', original?.url);
    }
    return Promise.reject(error);
  }
);

export default api;
