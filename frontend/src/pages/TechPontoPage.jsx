import { useEffect, useState } from 'react';
import api from '../lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Play, Square, Coffee, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

const ACTION_LABEL = { in: 'Entrada', out: 'Saída', break_start: 'Início pausa', break_end: 'Fim pausa' };
const ACTION_ICON = { in: Play, out: Square, break_start: Coffee, break_end: Undo2 };

export default function TechPontoPage() {
  const [today, setToday] = useState(null);
  const [week, setWeek] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    try {
      const [t, w] = await Promise.all([
        api.get('/tech/timesheet/today'),
        api.get('/tech/timesheet/week'),
      ]);
      setToday(t.data);
      setWeek(w.data || []);
    } catch (err) {
      console.debug('[ponto]', err.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const punch = async (action) => {
    setSaving(true);
    try {
      const { data } = await api.post('/tech/timesheet/punch', { action });
      setToday(data);
      toast.success(`${ACTION_LABEL[action]} registada`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro');
    } finally { setSaving(false); }
  };

  const lastAction = today?.punches?.[today.punches.length - 1]?.action;
  const canIn = !lastAction || ['out', 'break_end'].includes(lastAction);
  const canOut = ['in', 'break_end'].includes(lastAction);
  const canBreakStart = lastAction === 'in';
  const canBreakEnd = lastAction === 'break_start';

  if (loading) return (
    <div className="flex items-center justify-center py-24"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
  );

  return (
    <div className="space-y-5" data-testid="tech-ponto-page">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
          <Clock className="h-6 w-6 text-yellow-400" /> Ponto
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Registe entradas, saídas e pausas.</p>
      </div>

      {/* Hoje */}
      <Card className="bg-gradient-to-br from-yellow-500/10 to-zinc-900 border-yellow-500/40">
        <CardContent className="p-4">
          <p className="text-xs text-zinc-400 uppercase tracking-widest">Hoje</p>
          <p className="text-4xl font-bold text-yellow-400 mt-1" data-testid="ponto-total-today">{today?.total_hours?.toFixed(2) || '0.00'}h</p>
          <p className="text-xs text-zinc-500 mt-1">{(today?.punches || []).length} marcações</p>
        </CardContent>
      </Card>

      {/* Botões grandes */}
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={() => punch('in')} disabled={saving || !canIn} data-testid="ponto-btn-in"
          className="h-16 bg-emerald-500 hover:bg-emerald-400 text-zinc-900 font-bold text-base disabled:opacity-40 disabled:hover:bg-emerald-500">
          <Play className="h-5 w-5 mr-2" /> Entrada
        </Button>
        <Button onClick={() => punch('out')} disabled={saving || !canOut} data-testid="ponto-btn-out"
          className="h-16 bg-red-500 hover:bg-red-400 text-white font-bold text-base disabled:opacity-40 disabled:hover:bg-red-500">
          <Square className="h-5 w-5 mr-2" /> Saída
        </Button>
        <Button onClick={() => punch('break_start')} disabled={saving || !canBreakStart} data-testid="ponto-btn-break-start"
          className="h-14 bg-orange-500 hover:bg-orange-400 text-white font-semibold disabled:opacity-40 disabled:hover:bg-orange-500">
          <Coffee className="h-4 w-4 mr-2" /> Início pausa
        </Button>
        <Button onClick={() => punch('break_end')} disabled={saving || !canBreakEnd} data-testid="ponto-btn-break-end"
          className="h-14 bg-blue-500 hover:bg-blue-400 text-white font-semibold disabled:opacity-40 disabled:hover:bg-blue-500">
          <Undo2 className="h-4 w-4 mr-2" /> Fim pausa
        </Button>
      </div>

      {/* Marcações de hoje */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <p className="text-xs uppercase tracking-widest text-zinc-500 font-semibold mb-2">Marcações de hoje</p>
          {(today?.punches || []).length === 0 && (
            <p className="text-sm text-zinc-500 italic py-3">Sem marcações. Comece com "Entrada".</p>
          )}
          <div className="space-y-1.5">
            {(today?.punches || []).map(p => {
              const Icon = ACTION_ICON[p.action];
              return (
                <div key={p.id} className="flex items-center justify-between text-sm p-2 rounded bg-zinc-950" data-testid={`punch-${p.id}`}>
                  <div className="flex items-center gap-2 text-zinc-200">
                    {Icon && <Icon className="h-3.5 w-3.5 text-yellow-400" />}
                    <span>{ACTION_LABEL[p.action]}</span>
                  </div>
                  <span className="font-mono text-xs text-zinc-400">
                    {new Date(p.at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Semana */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <p className="text-xs uppercase tracking-widest text-zinc-500 font-semibold mb-2">Últimos 7 dias</p>
          {week.length === 0 && <p className="text-sm text-zinc-500 italic py-2">Sem histórico.</p>}
          {week.map(d => (
            <div key={d.date} className="flex justify-between py-1.5 border-b border-zinc-800 last:border-0 text-sm">
              <span className="text-zinc-300">{new Date(d.date).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
              <span className="font-mono text-yellow-400">{d.total_hours?.toFixed(2) || '0.00'}h</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
