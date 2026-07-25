import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { toast } from 'sonner';

/**
 * Hook global de notificações in-app.
 * @param {boolean} isTech  Se true usa o endpoint /api/tech/notifications, senão /api/notifications
 * @param {number}  pollMs  Intervalo de polling (default 30s)
 */
export function useNotifications({ isTech = false, pollMs = 30000, enabled = true } = {}) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const lastIdsRef = useRef(new Set());
  const firstLoadRef = useRef(true);

  const endpoint = isTech ? '/tech/notifications' : '/notifications';

  const fetchOnce = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      const { data } = await api.get(`${endpoint}?limit=30`);
      const newItems = data.items || [];
      setItems(newItems);
      setUnread(data.unread_count || 0);

      // Toast para notificações novas (após o primeiro carregamento)
      if (!firstLoadRef.current) {
        const knownIds = lastIdsRef.current;
        const trulyNew = newItems.filter(n => !knownIds.has(n.id) && !n.read);
        for (const n of trulyNew.slice(0, 3)) {
          toast(n.title, { description: n.message });
        }
      }
      lastIdsRef.current = new Set(newItems.map(n => n.id));
      firstLoadRef.current = false;
    } catch {
      // silencioso — polling pode falhar durante deploy/refresh
    } finally {
      setLoading(false);
    }
  }, [enabled, endpoint]);

  useEffect(() => {
    if (!enabled) return;
    fetchOnce();
    const t = setInterval(fetchOnce, pollMs);
    return () => clearInterval(t);
  }, [enabled, pollMs, fetchOnce]);

  const markRead = useCallback(async (id) => {
    try {
      await api.post(`${endpoint}/${id}/read`);
      setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnread(u => Math.max(0, u - 1));
    } catch { /* noop */ }
  }, [endpoint]);

  const markAllRead = useCallback(async () => {
    try {
      await api.post(`${endpoint}/read-all`);
      setItems(prev => prev.map(n => ({ ...n, read: true })));
      setUnread(0);
    } catch { /* noop */ }
  }, [endpoint]);

  const removeOne = useCallback(async (id) => {
    if (isTech) return;   // tech endpoints não têm DELETE
    try {
      await api.delete(`${endpoint}/${id}`);
      setItems(prev => prev.filter(n => n.id !== id));
      setUnread(u => Math.max(0, u - (items.find(n => n.id === id && !n.read) ? 1 : 0)));
    } catch { /* noop */ }
  }, [endpoint, isTech, items]);

  return { items, unread, loading, refresh: fetchOnce, markRead, markAllRead, removeOne };
}
