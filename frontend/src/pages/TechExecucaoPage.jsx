import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import TechLayout from '../components/TechLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { HardHat, CheckCircle2, Circle, Play, ArrowLeft, ListChecks } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_STYLE = {
  done: { badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', Icon: CheckCircle2, label: 'Concluído', color: 'bg-emerald-500' },
  in_progress: { badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40', Icon: Play, label: 'Em Curso', color: 'bg-yellow-400' },
  pending: { badge: 'bg-zinc-800 text-zinc-400 border-zinc-700', Icon: Circle, label: 'Pendente', color: 'bg-zinc-600' },
};

/** Lista de obras + progresso — o técnico clica para ver detalhe da execução. */
export default function TechExecucaoPage() {
  const { workId } = useParams();
  const nav = useNavigate();
  const [works, setWorks] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (workId) {
        const { data } = await api.get(`/tech/works/${workId}/execution`);
        setDetail(data);
      } else {
        const { data } = await api.get('/tech/works');
        setWorks(data || []);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro ao carregar');
    } finally { setLoading(false); }
  }, [workId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <TechLayout title="Execução">
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </TechLayout>
    );
  }

  // DETALHE de uma obra
  if (workId && detail) {
    const groupedByCategory = (detail.items || []).reduce((acc, it) => {
      const cat = it.category || 'Sem categoria';
      (acc[cat] ||= []).push(it);
      return acc;
    }, {});

    const totalItems = detail.items?.length || 0;
    const doneCount = detail.items?.filter(i => i.execution_status === 'done').length || 0;
    const inProgCount = detail.items?.filter(i => i.execution_status === 'in_progress').length || 0;
    const pctByCount = totalItems > 0 ? Math.round((doneCount / totalItems) * 100) : 0;

    return (
      <TechLayout title="Execução">
        <div className="space-y-4" data-testid="tech-exec-detail">
          <button
            data-testid="tech-exec-back"
            onClick={() => nav('/tech/execucao')}
            className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar às obras
          </button>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500">Obra</p>
                  <h1 className="text-xl md:text-2xl font-black text-white">{detail.title}</h1>
                  <p className="text-xs text-zinc-400">{detail.client_name || '—'}</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black text-white" data-testid="tech-exec-detail-pct">{pctByCount}<span className="text-sm text-zinc-500">%</span></p>
                  <p className="text-[10px] text-zinc-500 uppercase">Concluído</p>
                </div>
              </div>
              <Progress value={pctByCount} className="h-2 bg-zinc-800" />
              <div className="flex gap-3 mt-2 text-xs">
                <span className="text-emerald-400">● {doneCount} concluídos</span>
                <span className="text-yellow-400">● {inProgCount} em curso</span>
                <span className="text-zinc-500">● {totalItems - doneCount - inProgCount} pendentes</span>
              </div>
            </CardContent>
          </Card>

          {Object.entries(groupedByCategory).map(([cat, items]) => (
            <div key={cat} className="space-y-2">
              <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-bold">{cat}</p>
              {items.map(it => {
                const s = STATUS_STYLE[it.execution_status || 'pending'];
                const qty = Number(it.quantity || 0);
                const exec = Number(it.executed_quantity || 0);
                const pct = qty > 0 ? Math.min(100, Math.round((exec / qty) * 100)) : 0;
                return (
                  <div key={it.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3" data-testid={`tech-exec-item-${it.id}`}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm text-white font-medium min-w-0 flex-1">{it.name}</p>
                      <Badge className={`${s.badge} border text-[9px] uppercase font-bold shrink-0`}>
                        <s.Icon className="h-3 w-3 mr-1" /> {s.label}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      <span className="text-white font-mono">{exec}</span> / {qty} {it.unit || 'un'}
                      {pct > 0 && <span className="ml-2 text-yellow-400">({pct}%)</span>}
                    </p>
                    {pct > 0 && (
                      <div className="mt-1.5 h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div className={`h-full ${s.color}`} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {totalItems === 0 && (
            <p className="text-xs text-zinc-500 italic text-center py-8">Esta obra ainda não tem items.</p>
          )}
        </div>
      </TechLayout>
    );
  }

  // LISTA de obras
  const activeWorks = works.filter(w => !['finalizado', 'concluida', 'cancelada'].includes((w.status || '').toLowerCase()));
  return (
    <TechLayout title="Execução">
      <div className="space-y-3" data-testid="tech-exec-list">
        <div className="flex items-center gap-2 mb-2">
          <ListChecks className="h-5 w-5 text-yellow-400" />
          <h1 className="text-xl md:text-2xl font-black text-white">Execução por Obra</h1>
        </div>
        <p className="text-xs text-zinc-400 mb-3">Consulta o progresso de cada obra. A marcação de itens é feita pelo escritório.</p>

        {activeWorks.length === 0 && (
          <p className="text-xs text-zinc-500 italic text-center py-8">Sem obras activas no momento.</p>
        )}

        {activeWorks.map(w => (
          <button
            key={w.id}
            data-testid={`tech-exec-work-${w.id}`}
            onClick={() => nav(`/tech/execucao/${w.id}`)}
            className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-yellow-500/40 hover:bg-zinc-900/70 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <HardHat className="h-4 w-4 text-yellow-400 shrink-0" />
                  <p className="text-sm text-white font-medium truncate">{w.title}</p>
                </div>
                <p className="text-[11px] text-zinc-500">{w.client_name || '—'} · {w.status || 'em curso'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-black text-white">{w.execution_pct}<span className="text-xs text-zinc-500">%</span></p>
              </div>
            </div>
            <Progress value={w.execution_pct} className="h-1.5 bg-zinc-800" />
            <div className="flex gap-3 mt-2 text-[10px]">
              <span className="text-emerald-400">✓ {w.items_done}</span>
              <span className="text-yellow-400">▶ {w.items_in_progress}</span>
              <span className="text-zinc-500">○ {w.items_pending}</span>
              <span className="text-zinc-500 ml-auto">{w.items_total} items</span>
            </div>
          </button>
        ))}
      </div>
    </TechLayout>
  );
}
