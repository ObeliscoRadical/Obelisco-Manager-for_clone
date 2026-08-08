import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BrainCircuit, ShieldAlert, Wallet, Siren, BanknoteArrowUp, RefreshCw, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { CfoDebtsTable } from '../components/cfo/CfoDebtsTable';
import { CfoSimulator } from '../components/cfo/CfoSimulator';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);

function SnapshotCard({ testId, label, value, hint, color = 'text-white' }) {
  return (
    <div data-testid={testId} className="rounded-[24px] border border-zinc-800 bg-zinc-900/70 p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-black ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

export default function CfoVirtualPage() {
  const [dashboard, setDashboard] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/cfo-virtual/dashboard');
      setDashboard(data);
      setAnalysis(data.latest_report || null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao carregar o Gabinete do CFO');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const runDiagnosis = async () => {
    setAnalyzing(true);
    try {
      const { data } = await api.post('/cfo-virtual/analyze', {});
      setAnalysis(data);
      toast.success('Diagnóstico do CFO gerado com dados reais.');
      fetchDashboard();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao gerar diagnóstico');
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading && !dashboard) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" /></div>;
  }

  const snapshot = dashboard?.snapshot || {};
  const validation = dashboard?.context_validation || {};
  const aiAnalysis = analysis?.analysis || null;

  return (
    <div data-testid="cfo-virtual-page" className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-zinc-800 bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.18),_transparent_35%),linear-gradient(135deg,_rgba(24,24,27,0.95),_rgba(9,9,11,0.98))] p-6 md:p-8">
        <div className="absolute -right-20 top-0 h-56 w-56 rounded-full bg-red-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-yellow-400"><BrainCircuit size={14} /> Gabinete do CFO</div>
            <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl lg:text-6xl">Recuperação e Reestruturação de Crédito</h1>
            <p className="mt-4 max-w-2xl text-sm text-zinc-300 md:text-base">Este módulo cruza saldo do último extrato, custos fixos, dívida ativa, recebimentos urgentes e margens das obras antes de abrir a boca. Nada de conselhos bonitos sem caixa.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button data-testid="refresh-cfo-dashboard" onClick={fetchDashboard} variant="outline" className="rounded-full border-zinc-700 bg-zinc-950/40 text-zinc-200 hover:bg-zinc-800">
              <RefreshCw size={16} className="mr-2" /> Atualizar
            </Button>
            <Button data-testid="run-cfo-analysis" onClick={runDiagnosis} disabled={analyzing} className="rounded-full bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold">
              <ShieldAlert size={16} className="mr-2" /> {analyzing ? 'A analisar realidade...' : 'Gerar ordens do dia'}
            </Button>
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div data-testid="validation-bank" className="rounded-2xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-300">Banco real: <span className="font-semibold text-white">{validation.bank_statement_loaded ? 'validado' : 'em falta'}</span></div>
          <div data-testid="validation-costs" className="rounded-2xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-300">Custos fixos: <span className="font-semibold text-white">{validation.fixed_costs_ready ? 'prontos' : 'incompletos'}</span></div>
          <div data-testid="validation-debts" className="rounded-2xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-300">Coleção de dívidas: <span className="font-semibold text-white">{validation.debt_collection_ready ? 'ativa' : 'em falta'}</span></div>
          <div data-testid="validation-bank-source" className="rounded-2xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-300">Fonte: <span className="font-semibold text-white">{validation.latest_bank_source?.filename || 'sem extrato'}</span></div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SnapshotCard testId="cfo-kpi-cash" label="Saldo caixa atual" value={formatEuro(snapshot.current_cash)} hint="Referência: saldo líquido do último extrato" color={snapshot.current_cash >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        <SnapshotCard testId="cfo-kpi-free-cash" label="Caixa livre para decidir" value={formatEuro(snapshot.allocatable_cash_now)} hint={`Reserva 14d: ${formatEuro(snapshot.reserve_floor_14d)}`} color={snapshot.allocatable_cash_now > 0 ? 'text-yellow-400' : 'text-red-400'} />
        <SnapshotCard testId="cfo-kpi-fixed-burn" label="Custos fixos / mês" value={formatEuro(snapshot.monthly_fixed_costs)} hint="Base recorrente validada" color="text-orange-400" />
        <SnapshotCard testId="cfo-kpi-overdue-debt" label="Dívida vencida" value={formatEuro(snapshot.overdue_debt_total)} hint={`Passivo total ${formatEuro(snapshot.active_debt_total)}`} color="text-red-400" />
        <SnapshotCard testId="cfo-kpi-urgent-receivables" label="Recebimentos urgentes" value={formatEuro(snapshot.urgent_receivables_total)} hint={snapshot.runway_days ? `Fôlego estimado ${snapshot.runway_days} dias` : 'Sem base suficiente para runway'} color="text-emerald-400" />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <div data-testid="cfo-analysis-panel" className="rounded-[28px] border border-zinc-800 bg-zinc-900/60 p-5 space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-white">Ordens do Dia / Recomendações Táticas</h2>
              <p className="text-sm text-zinc-500 mt-1">Saída rigorosa baseada na fotografia real da tesouraria.</p>
            </div>
            <Badge data-testid="cfo-crisis-level" className={`border-0 px-3 py-1 ${snapshot.crisis_level === 'critical' ? 'bg-red-500/20 text-red-300' : snapshot.crisis_level === 'pressure' ? 'bg-orange-500/20 text-orange-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
              {snapshot.crisis_level || 'controlled'}
            </Badge>
          </div>

          {aiAnalysis ? (
            <>
              <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/5 p-5">
                <p className="text-xs uppercase tracking-[0.25em] text-yellow-400">Diagnóstico executivo</p>
                <h3 data-testid="cfo-headline" className="mt-2 text-2xl font-black text-white">{aiAnalysis.executive_diagnosis?.headline}</h3>
                <p data-testid="cfo-financial-truth" className="mt-3 text-sm text-zinc-300">{aiAnalysis.executive_diagnosis?.financial_truth}</p>
                <p className="mt-3 text-sm text-red-200">{aiAnalysis.executive_diagnosis?.survival_focus}</p>
              </div>

              <div>
                <p className="mb-3 text-xs uppercase tracking-[0.25em] text-zinc-500">Cirurgia de custos</p>
                <div className="space-y-3">
                  {(aiAnalysis.cost_surgery_actions || []).map((item, idx) => (
                    <div key={idx} data-testid={`cost-surgery-item-${idx}`} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-bold text-white">{item.title}</p>
                          <p className="mt-1 text-sm text-zinc-400">{item.why_now}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-wider text-zinc-500">Alívio</p>
                          <p className="text-lg font-black text-yellow-400">{formatEuro(item.estimated_monthly_relief)}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-zinc-500">{item.execution}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-3 text-xs uppercase tracking-[0.25em] text-zinc-500">Plano de tesouraria tático</p>
                <div className="space-y-3">
                  {(aiAnalysis.tactical_treasury_plan || []).map((item, idx) => (
                    <div key={idx} data-testid={`treasury-plan-item-${idx}`} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                          <p className="text-sm font-bold text-white">{item.title}</p>
                          <p className="mt-1 text-sm text-zinc-400">{item.target}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-emerald-400">{formatEuro(item.amount_target)}</p>
                          <p className="text-[11px] text-zinc-500">{item.deadline}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-zinc-500">{item.why}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-3 text-xs uppercase tracking-[0.25em] text-zinc-500">Ordens do dia</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {(aiAnalysis.orders_of_day || []).map((item, idx) => (
                    <div key={idx} data-testid={`order-of-day-${idx}`} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-300">{item}</div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-950/50 p-8 text-center text-zinc-500">
              Ainda não há diagnóstico guardado. Clique em <b className="text-white">Gerar ordens do dia</b> para obrigar a IA a cruzar caixa, dívidas, extrato e recebimentos reais.
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div data-testid="cfo-cash-allocation-panel" className="rounded-[28px] border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
            <div className="flex items-center gap-2 text-white font-black uppercase tracking-tight"><Wallet size={18} /> Alocação exata de caixa disponível</div>
            {(analysis?.cash_allocation || dashboard?.cash_allocation || []).length ? (
              <div className="space-y-3">
                {(analysis?.cash_allocation || dashboard?.cash_allocation || []).map((item, idx) => (
                  <div key={idx} data-testid={`cash-allocation-item-${idx}`} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">{item.creditor}</p>
                        <p className="text-xs text-zinc-500">{item.tipo_divida} · {item.status}</p>
                      </div>
                      <p className="text-xl font-black text-yellow-400">{formatEuro(item.amount)}</p>
                    </div>
                    <p className="mt-3 text-xs text-zinc-400">{item.notes}</p>
                    <p className="mt-1 text-xs text-red-200">Se ignorar: {item.risk_if_ignored}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">Sem caixa livre para pagamentos. O foco obrigatório é sobrevivência, cobrança urgente e negociação defensiva.</div>
            )}
          </div>

          <div data-testid="cfo-receivables-panel" className="rounded-[28px] border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
            <div className="flex items-center gap-2 text-white font-black uppercase tracking-tight"><BanknoteArrowUp size={18} /> Recebimentos urgentes</div>
            {(dashboard?.urgent_receivables || []).length ? dashboard.urgent_receivables.slice(0, 5).map(item => (
              <div key={item.id} data-testid={`receivable-${item.id}`} className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{item.client_name}</p>
                  <p className="text-xs text-zinc-500">{item.number} · vence {item.due_date}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-emerald-400">{formatEuro(item.balance)}</p>
                  <p className="text-[11px] text-zinc-500">{item.days_overdue > 0 ? `${item.days_overdue}d atraso` : 'a vencer'}</p>
                </div>
              </div>
            )) : <div className="text-sm text-zinc-500">Sem recebimentos urgentes registados.</div>}
          </div>

          <div data-testid="cfo-work-opportunities-panel" className="rounded-[28px] border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
            <div className="flex items-center gap-2 text-white font-black uppercase tracking-tight"><ArrowRight size={18} /> Obras com margem / cobrança</div>
            {(dashboard?.work_margin_opportunities || []).length ? dashboard.work_margin_opportunities.slice(0, 4).map(item => (
              <div key={item.work_id} data-testid={`work-opportunity-${item.work_id}`} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-zinc-500">{item.client_name} · {item.status}</p>
                  </div>
                  <p className={`text-sm font-black ${item.projected_cash_balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{item.margin_pct}%</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                  <div>A receber: <span className="font-semibold text-white">{formatEuro(item.to_receive)}</span></div>
                  <div>Por faturar: <span className="font-semibold text-white">{formatEuro(item.to_invoice)}</span></div>
                </div>
              </div>
            )) : <div className="text-sm text-zinc-500">Sem obras activas com margem/cobrança relevante.</div>}
          </div>
        </div>
      </section>

      <CfoDebtsTable debts={dashboard?.debts || []} onChanged={fetchDashboard} />
      <CfoSimulator dashboard={dashboard} />

      <section data-testid="cfo-transactions-panel" className="rounded-[28px] border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
        <div className="flex items-center gap-2 text-white font-black uppercase tracking-tight"><Siren size={18} /> Últimos movimentos do extrato usados no diagnóstico</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(dashboard?.recent_transactions || []).map((item, idx) => (
            <div key={`${item.date}-${idx}`} data-testid={`recent-transaction-${idx}`} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white truncate">{item.description}</p>
                <p className={`text-sm font-black ${item.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatEuro(item.amount)}</p>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                <span>{item.date}</span>
                <span>{item.category}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}