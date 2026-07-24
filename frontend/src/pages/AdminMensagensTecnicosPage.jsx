import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Send, User, Clock } from 'lucide-react';
import { toast } from 'sonner';

const fmtDateTime = (s) => s ? new Date(s).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

export default function AdminMensagensTecnicosPage() {
  const [threads, setThreads] = useState([]);
  const [selectedEmpId, setSelectedEmpId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef(null);

  const fetchThreads = useCallback(async () => {
    try {
      const { data } = await api.get('/tech/admin/messages/threads');
      setThreads(data || []);
    } catch (err) { console.debug('[threads]', err.message); }
    finally { setLoading(false); }
  }, []);

  const fetchMessages = useCallback(async (empId) => {
    if (!empId) return;
    try {
      const { data } = await api.get(`/tech/admin/messages/${empId}`);
      setMessages(data || []);
    } catch (err) { toast.error('Erro ao carregar conversa'); }
  }, []);

  useEffect(() => {
    fetchThreads();
    const iv = setInterval(fetchThreads, 20000);
    return () => clearInterval(iv);
  }, [fetchThreads]);

  useEffect(() => {
    if (selectedEmpId) {
      fetchMessages(selectedEmpId);
      const iv = setInterval(() => fetchMessages(selectedEmpId), 10000);
      return () => clearInterval(iv);
    }
  }, [selectedEmpId, fetchMessages]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = async () => {
    if (!text.trim() || !selectedEmpId || sending) return;
    setSending(true);
    try {
      const { data } = await api.post(`/tech/admin/messages/${selectedEmpId}`, { text: text.trim() });
      setMessages(prev => [...prev, data]);
      setText('');
      fetchThreads();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao enviar');
    } finally { setSending(false); }
  };

  const totalUnread = threads.reduce((n, t) => n + (t.unread || 0), 0);

  if (loading) return (
    <div className="flex items-center justify-center py-24"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
  );

  return (
    <div data-testid="admin-tech-messages-page" className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-white">Mensagens Técnicos</h1>
          <p className="text-zinc-400 mt-1 text-sm">
            Comunicação com a equipa em campo.
            {totalUnread > 0 && <span className="ml-2 text-yellow-400 font-semibold">{totalUnread} não lida{totalUnread !== 1 ? 's' : ''}</span>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-220px)]">
        {/* Lista de threads */}
        <Card className="bg-zinc-900 border-zinc-800 md:col-span-1 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-yellow-400" />
            <p className="text-sm font-semibold text-white">Conversas ({threads.length})</p>
          </div>
          <CardContent className="flex-1 overflow-y-auto p-0">
            {threads.length === 0 && (
              <p className="text-sm text-zinc-500 italic p-4 text-center">Nenhum técnico enviou mensagens ainda.</p>
            )}
            {threads.map(t => (
              <button
                key={t.employee_id}
                onClick={() => setSelectedEmpId(t.employee_id)}
                data-testid={`thread-${t.employee_id}`}
                className={`w-full text-left p-3 border-b border-zinc-800/60 hover:bg-zinc-800/50 transition ${
                  selectedEmpId === t.employee_id ? 'bg-zinc-800' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="h-6 w-6 rounded-full bg-yellow-500 text-zinc-900 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {t.employee_name?.[0]?.toUpperCase() || 'T'}
                      </div>
                      <p className="text-sm font-semibold text-white truncate">{t.employee_name || 'Sem nome'}</p>
                    </div>
                    <p className="text-xs text-zinc-400 line-clamp-1">{t.last_message}</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">{fmtDateTime(t.last_at)}</p>
                  </div>
                  {t.unread > 0 && (
                    <Badge className="bg-red-500 text-white text-[10px] h-5 min-w-[20px] flex items-center justify-center rounded-full">
                      {t.unread}
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Conversa */}
        <Card className="bg-zinc-900 border-zinc-800 md:col-span-2 flex flex-col overflow-hidden">
          {!selectedEmpId ? (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <MessageSquare className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-500 text-sm">Selecione uma conversa à esquerda para começar.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
                <User className="h-4 w-4 text-yellow-400" />
                <p className="text-sm font-semibold text-white">
                  {threads.find(t => t.employee_id === selectedEmpId)?.employee_name || 'Técnico'}
                </p>
              </div>
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-2" data-testid="conversation-list">
                {messages.length === 0 && (
                  <p className="text-sm text-zinc-500 italic text-center py-8">Sem mensagens ainda.</p>
                )}
                {messages.map(m => {
                  const mine = m.from_role === 'admin';
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                        mine ? 'bg-yellow-500 text-zinc-900 rounded-br-sm' : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                      }`} data-testid={`admin-msg-${m.id}`}>
                        {!mine && <p className="text-[10px] font-semibold opacity-70 mb-0.5">{m.employee_name}</p>}
                        {mine && m.admin_name && <p className="text-[10px] font-semibold opacity-70 mb-0.5">{m.admin_name}</p>}
                        <p className="whitespace-pre-wrap">{m.text}</p>
                        <p className={`text-[10px] mt-1 ${mine ? 'text-zinc-800/70' : 'text-zinc-400'}`}>
                          {fmtDateTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </CardContent>
              <div className="border-t border-zinc-800 p-3 flex gap-2">
                <Input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
                  placeholder="Responder ao técnico…"
                  data-testid="admin-chat-input"
                  disabled={sending}
                  className="bg-zinc-950 border-zinc-700 flex-1"
                />
                <Button onClick={send} disabled={sending || !text.trim()} data-testid="admin-chat-send"
                  className="bg-yellow-500 hover:bg-yellow-400 text-zinc-900">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
