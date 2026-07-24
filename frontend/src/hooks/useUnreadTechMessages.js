import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';

/**
 * Devolve nº mensagens não lidas para o técnico logado.
 * Faz polling a cada 30s.
 */
export function useUnreadTechMessages() {
  const [count, setCount] = useState(0);

  const fetch = useCallback(async () => {
    try {
      const { data } = await api.get('/tech/messages');
      const unread = (data || []).filter(m => m.from_role === 'admin' && !m.read_by_tech).length;
      setCount(unread);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => {
    fetch();
    const iv = setInterval(fetch, 30000);
    return () => clearInterval(iv);
  }, [fetch]);

  return count;
}
