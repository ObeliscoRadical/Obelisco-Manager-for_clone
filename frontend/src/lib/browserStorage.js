const isBrowser = () => typeof window !== 'undefined';

const getSessionStorage = () => {
  if (!isBrowser()) return null;
  try {
    return window.sessionStorage;
  } catch (err) {
    return null;
  }
};

export const devLog = (...args) => {
  if (process.env.NODE_ENV === 'development') {
    console.debug(...args);
  }
};

export const safeSessionGetText = (key, fallback = null) => {
  try {
    const storage = getSessionStorage();
    if (!storage) return fallback;
    const value = storage.getItem(key);
    return value ?? fallback;
  } catch (err) {
    devLog('[safeSessionGetText]', key, err?.message || err);
    return fallback;
  }
};

export const safeSessionSetText = (key, value) => {
  try {
    const storage = getSessionStorage();
    if (!storage) return;
    storage.setItem(key, value);
  } catch (err) {
    devLog('[safeSessionSetText]', key, err?.message || err);
  }
};

export const safeSessionGetJson = (key, fallback) => {
  const raw = safeSessionGetText(key, null);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    devLog('[safeSessionGetJson]', key, err?.message || err);
    return fallback;
  }
};

export const safeSessionSetJson = (key, value) => {
  try {
    safeSessionSetText(key, JSON.stringify(value));
  } catch (err) {
    devLog('[safeSessionSetJson]', key, err?.message || err);
  }
};

export const safeSessionRemove = (key) => {
  try {
    const storage = getSessionStorage();
    if (!storage) return;
    storage.removeItem(key);
  } catch (err) {
    devLog('[safeSessionRemove]', key, err?.message || err);
  }
};