import axios from 'axios';

const ACCESS_KEY = 'obelisco_access_token';
const REFRESH_KEY = 'obelisco_refresh_token';

export const tokenStore = {
  getAccess: () => {
    try { return localStorage.getItem(ACCESS_KEY); } catch (err) { console.debug('[tokenStore.getAccess]', err); return null; }
  },
  getRefresh: () => {
    try { return localStorage.getItem(REFRESH_KEY); } catch (err) { console.debug('[tokenStore.getRefresh]', err); return null; }
  },
  set: (access, refresh) => {
    try {
      if (access) localStorage.setItem(ACCESS_KEY, access);
      if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    } catch (err) { console.debug('[tokenStore.set]', err); }
  },
  clear: () => {
    try {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } catch (err) { console.debug('[tokenStore.clear]', err); }
  },
};

const api = axios.create({
  baseURL: `${process.env.REACT_APP_BACKEND_URL}/api`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach Bearer token from localStorage (works in iframes where cookies are blocked)
api.interceptors.request.use((config) => {
  const token = tokenStore.getAccess();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
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

    const isAuthEndpoint = original?.url?.includes('/auth/refresh') || original?.url?.includes('/auth/login') || original?.url?.includes('/auth/logout');
    // /auth/me e /tech/auth/me são probes de sessão — nunca devem accionar o refresh/clear/redirect
    const isSessionProbe = original?.url?.endsWith('/auth/me') || original?.url?.endsWith('/tech/auth/me');
    // Endpoints do portal técnico não usam refresh token — deixa a UI decidir
    const isTechEndpoint = original?.url?.includes('/tech/');

    if (status === 401 && !original._retry && !isAuthEndpoint && !isSessionProbe && !isTechEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve: () => resolve(api(original)), reject });
        });
      }

      original._retry = true;
      isRefreshing = true;
      try {
        const refreshToken = tokenStore.getRefresh();
        const body = refreshToken ? { refresh_token: refreshToken } : {};
        const { data } = await api.post('/auth/refresh', body);
        if (data.access_token) tokenStore.set(data.access_token, null);
        processQueue(null);
        return api(original);
      } catch (refreshErr) {
        tokenStore.clear();
        processQueue(refreshErr);
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/p/')) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
