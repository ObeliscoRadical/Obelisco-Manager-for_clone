import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function usePushNotifications(token) {
  const [permission, setPermission] = useState(Notification.permission);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    navigator.serviceWorker.getRegistration('/sw-push.js').then(reg => {
      if (reg) {
        reg.pushManager.getSubscription().then(sub => {
          setIsSubscribed(!!sub);
        });
      }
    });
  }, [token]);

  const subscribe = useCallback(async () => {
    if (!token) return false;
    setLoading(true);
    try {
      // Get VAPID key
      const { data: vapid } = await axios.get(`${API}/api/push/vapid-key`);
      if (!vapid.publicKey) throw new Error('VAPID key not configured');

      // Register service worker
      const reg = await navigator.serviceWorker.register('/sw-push.js', { scope: '/' });
      await navigator.serviceWorker.ready;

      // Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return false;

      // Subscribe
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
      });

      // Send subscription to backend
      const subJSON = sub.toJSON();
      await axios.post(`${API}/api/push/subscribe`, {
        endpoint: subJSON.endpoint,
        keys: subJSON.keys,
      }, { headers: { Authorization: `Bearer ${token}` } });

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('Push subscribe error:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const unsubscribe = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw-push.js');
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const subJSON = sub.toJSON();
          await axios.post(`${API}/api/push/unsubscribe`, {
            endpoint: subJSON.endpoint,
            keys: subJSON.keys,
          }, { headers: { Authorization: `Bearer ${token}` } });
          await sub.unsubscribe();
        }
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe error:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const testPush = useCallback(async () => {
    if (!token) return;
    try {
      await axios.post(`${API}/api/push/test`, {}, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) {
      console.error('Test push error:', err);
    }
  }, [token]);

  const supported = 'serviceWorker' in navigator && 'PushManager' in window;

  return { permission, isSubscribed, loading, subscribe, unsubscribe, testPush, supported };
}
