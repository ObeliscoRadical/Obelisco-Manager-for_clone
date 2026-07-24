import { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Send, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

export default function TechChatPage() {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get('/tech/messages');
      setMessages(data || []);
    } catch (err) {
      console.debug('[chat]', err.message);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000); // polling
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const { data } = await api.post('/tech/messages', { text: text.trim() });
      setMessages(prev => [...prev, data]);
      setText('');
    } catch (err) {
      toast.error('Erro ao enviar');
    } finally { setSending(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-180px)]" data-testid="tech-chat-page">
      <div className="mb-3">
        <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-yellow-400" /> Chat com o escritório
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Comunicação directa com o gestor.</p>
      </div>

      <Card className="bg-zinc-900 border-zinc-800 flex-1 flex flex-col overflow-hidden">
        <CardContent className="flex-1 overflow-y-auto p-3 space-y-2" data-testid="chat-list">
          {messages.length === 0 && (
            <p className="text-sm text-zinc-500 italic text-center py-8">Envie a primeira mensagem para começar a conversa.</p>
          )}
          {messages.map(m => {
            const mine = m.from_role === 'tech';
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? 'bg-yellow-500 text-zinc-900 rounded-br-sm' : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                }`} data-testid={`msg-${m.id}`}>
                  {!mine && <p className="text-[10px] font-semibold opacity-70 mb-0.5">{m.admin_name || 'Escritório'}</p>}
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  <p className={`text-[10px] mt-1 ${mine ? 'text-zinc-800/70' : 'text-zinc-400'}`}>
                    {new Date(m.created_at).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
            placeholder="Escreva a sua mensagem…"
            data-testid="chat-tech-input"
            disabled={sending}
            className="bg-zinc-950 border-zinc-700 flex-1"
          />
          <Button onClick={send} disabled={sending || !text.trim()} data-testid="chat-tech-send"
            className="bg-yellow-500 hover:bg-yellow-400 text-zinc-900">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
