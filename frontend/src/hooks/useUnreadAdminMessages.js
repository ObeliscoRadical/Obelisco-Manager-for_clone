import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook admin: nº total de mensagens não-lidas de técnicos.
 * Só faz polling se o utilizador tiver permissão para 'funcionarios'.
 */
export function useUnreadAdminMessages() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const fetch = useCallback(async () => {
    try {
      const { data } = await api.get('/tech/admin/messages/threads');
      const total = (data || []).reduce((n, t) => n + (t.unread || 0), 0);
      setCount(total);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => {
    if (!user) return;
    const canSee = user.role === 'admin' || user.module_permissions?.funcionarios === true;
    if (!canSee) return;
    fetch();
    const iv = setInterval(fetch, 30000);
    return () => clearInterval(iv);
  }, [user, fetch]);

  return count;
}
