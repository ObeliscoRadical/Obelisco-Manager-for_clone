import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { GitBranch, RefreshCw, AlertTriangle, TrendingUp, Wallet, CheckCircle2, Circle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);
const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-PT'); } catch { return iso; }
};

const PHASES = [
  { key: 'orcamento', label: 'Orçamento', color: 'bg-zinc-700 text-zinc-300', bar: 'bg-zinc-500' },
  { key: 'proposta_enviada', label: 'Proposta Enviada', color: 'bg-blue-500/20 text-blue-300', bar: 'bg-blue-500' },
  { key: 'aceite', label: 'Aceite', color: 'bg-indigo-500/20 text-indigo-300', bar: 'bg-indigo-500' },
  { key: 'em_execucao', label: 'Em Execução', color: 'bg-yellow-400/20 text-yellow-300', bar: 'bg-yellow-400' },
  { key: 'guias_emitidas', label: 'Guias Emitidas', color: 'bg-orange-500/20 text-orange-300', bar: 'bg-orange-500' },
  { key: 'faturada', label: 'Faturada', color: 'bg-purple-500/20 text-purple-300', bar: 'bg-purple-500' },
  { key: 'paga', label: 'Paga', color: 'bg-green-500/20 text-green-400', bar: 'bg-green-500' },
  { key: 'concluida', label: 'Concluída', color: 'bg-emerald-500/20 text-emerald-400', bar: 'bg-emerald-500' },
];

export default function PipelinePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchPipeline = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/pipeline');
      setData(data);
    } catch {
      toast.error('Erro a carregar pipeline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  const kpis = data?.kpis;
  const byPhase = data?.by_phase || {};

  const openDetail = (item) => {
    setSelected(item);
    setDetailOpen(true);
  };

  return (
    <div data-testid="pipeline-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Pipeline de Obras</h1>
          <p className="text-zinc-400 mt-1 font-medium">Progresso do orçamento até à conclusão · visão consolidada</p>
        </div>
        <Button onClick={fetchPipeline} variant="outline" className="rounded-full border-zinc-700 text-zinc-300 hover:bg-zinc-800">
          <RefreshCw size={14} className="mr-2" /> Atualizar
        </Button>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Obras Ativas"
            value={kpis.total_items}
            sub={`${kpis.overdue_count} atrasada(s)`}
            icon={GitBranch}
            accent="text-white"
            data-testid="kpi-total"
          />
          <KpiCard
            label="Valor Total (Vendas)"
            value={formatEuro(kpis.total_sale_value)}
            sub="Somatório de propostas"
            icon={TrendingUp}
            accent="text-yellow-400"
            data-testid="kpi-vendas"
          />
          <KpiCard
            label="A Receber"
            value={formatEuro(kpis.total_pending_value)}
            sub="Faturas em aberto"
            icon={Wallet}
            accent="text-orange-300"
            data-testid="kpi-pending"
          />
          <KpiCard
            label="Recebido"
            value={formatEuro(kpis.total_received_value)}
            sub="Pagamentos consolidados"
            icon={CheckCircle2}
            accent="text-green-400"
            data-testid="kpi-received"
          />
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-16"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
      )}

      {!loading && data && (
        <>
          {/* Kanban horizontal */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-8 gap-3">
              {PHASES.map(ph => {
                const items = byPhase[ph.key] || [];
                return (
                  <div key={ph.key} data-testid={`col-${ph.key}`} className="min-w-0">
                    <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${ph.color} mb-2`}>
                      <span className="text-xs font-black uppercase truncate">{ph.label}</span>
                      <span className="text-xs font-bold ml-1">{items.length}</span>
                    </div>
                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                      {items.length === 0 && (
                        <div className="text-center text-zinc-700 text-[10px] py-6">—</div>
                      )}
                      {items.map(it => (
                        <button
                          key={it.id}
                          data-testid={`card-${it.id}`}
                          onClick={() => openDetail(it)}
                          className="w-full text-left bg-zinc-950 border border-zinc-800 hover:border-yellow-400/50 rounded-xl p-3 transition"
                        >
                          <div className="text-white font-bold text-xs truncate">{it.title}</div>
                          <div className="text-zinc-500 text-[10px] truncate">{it.client_name || '—'}</div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className="text-[10px] text-zinc-400">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${ph.bar}`}></span>
                              {it.completed_count}/{it.total_count}
                            </div>
                            {it.sale_value > 0 && (
                              <div className="text-[10px] text-yellow-400 font-bold">{formatEuro(it.sale_value)}</div>
                            )}
                          </div>
                          {/* Mini progress bar */}
                          <div className="mt-1.5 h-1 bg-zinc-800 rounded-full overflow-hidden">
                            <div className={`h-full ${ph.bar}`} style={{ width: `${(it.completed_count / it.total_count) * 100}%` }} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {kpis?.overdue_count > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3">
              <AlertTriangle className="text-red-300" size={20} />
              <div>
                <div className="text-red-300 font-bold text-sm">{kpis.overdue_count} obra(s) em execução há mais de 60 dias sem fatura emitida</div>
                <div className="text-zinc-400 text-xs mt-0.5">Filtra por &quot;Em Execução&quot; ou &quot;Guias Emitidas&quot; para investigar.</div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail dialog with timeline */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent data-testid="pipeline-detail-dialog" className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-3xl max-h-[92vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl font-black uppercase text-white">{selected.title}</DialogTitle>
                <DialogDescription className="text-zinc-500">
                  {selected.client_name || '—'} · Fase actual: <span className="text-yellow-400 font-bold">{PHASES.find(p => p.key === selected.phase)?.label || selected.phase}</span>
                </DialogDescription>
              </DialogHeader>

              {/* Progress summary */}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <MiniStat label="Progresso" value={`${Math.round((selected.completed_count / selected.total_count) * 100)}%`} accent="text-white" />
                <MiniStat label="Venda" value={formatEuro(selected.sale_value)} accent="text-yellow-400" />
                <MiniStat label="Faturado" value={formatEuro(selected.invoiced_value)} accent="text-purple-300" />
                <MiniStat label="Recebido" value={formatEuro(selected.received_value)} accent="text-green-400" />
              </div>

              {/* Timeline */}
              <div className="mt-6 space-y-3">
                <h3 className="text-white font-bold uppercase text-xs tracking-wide">Marcos</h3>
                <div className="relative">
                  <div className="absolute left-3 top-3 bottom-3 w-[2px] bg-zinc-800" />
                  {selected.milestones.map((m) => (
                    <div key={m.key} className="relative flex items-start gap-3 pl-0 mb-4">
                      <div className={`relative z-10 h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${m.done ? 'bg-yellow-400 text-zinc-950' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'}`}>
                        {m.done ? <CheckCircle2 size={14} /> : <Circle size={12} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-bold text-sm ${m.done ? 'text-white' : 'text-zinc-500'}`}>{m.label}</div>
                        <div className="flex items-center gap-3 text-xs mt-0.5">
                          {m.at && <span className="text-zinc-500">{fmtDate(m.at)}</span>}
                          {m.meta && <span className="text-zinc-400">· {m.meta}</span>}
                          {!m.done && <span className="text-zinc-600 italic">pendente</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick links */}
              <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-wrap gap-2">
                {selected.budget_id && (
                  <a href={`/orcamentos?id=${selected.budget_id}`} className="text-xs px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-300 hover:bg-zinc-800 flex items-center gap-1">
                    <ExternalLink size={11} /> Ver Orçamento
                  </a>
                )}
                {selected.proposal_id && (
                  <a href={`/propostas?id=${selected.proposal_id}`} className="text-xs px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-300 hover:bg-zinc-800 flex items-center gap-1">
                    <ExternalLink size={11} /> Ver Proposta
                  </a>
                )}
                {selected.kind === 'work' && (
                  <a href={`/obras?id=${selected.id}`} className="text-xs px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-300 hover:bg-zinc-800 flex items-center gap-1">
                    <ExternalLink size={11} /> Ver Obra
                  </a>
                )}
                {selected.guides_count > 0 && (
                  <a href={`/guias?work_id=${selected.id}`} className="text-xs px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-300 hover:bg-zinc-800 flex items-center gap-1">
                    <ExternalLink size={11} /> {selected.guides_count} Guia(s)
                  </a>
                )}
                {selected.invoices_count > 0 && (
                  <a href={`/faturas?client=${encodeURIComponent(selected.client_name)}`} className="text-xs px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-300 hover:bg-zinc-800 flex items-center gap-1">
                    <ExternalLink size={11} /> {selected.invoices_count} Fatura(s)
                  </a>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">{label}</div>
        {Icon && <Icon size={16} className="text-zinc-600" />}
      </div>
      <div className={`text-2xl font-black mt-2 ${accent}`}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value, accent }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2">
      <div className="text-[10px] uppercase text-zinc-500 tracking-wide">{label}</div>
      <div className={`text-base font-black ${accent}`}>{value}</div>
    </div>
  );
}
