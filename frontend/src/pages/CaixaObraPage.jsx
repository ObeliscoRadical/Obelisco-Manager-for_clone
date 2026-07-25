import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, ArrowLeft, HardHat, Receipt, FileCheck, Clock, DollarSign, PiggyBank, Target, Calendar } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const fmt0 = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(v || 0));
const pct = (v) => `${(v || 0).toFixed(1)}%`;

const KPI = ({ label, value, icon: Icon, color = 'text-white', hint, testid }) => (
  <Card className="bg-zinc-900 border-zinc-800" data-testid={testid}>
    <CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-zinc-500 uppercase tracking-widest mb-1">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-zinc-500 mt-1">{hint}</p>}
    </CardContent>
  </Card>
);

export default function CaixaObraPage() {
  const nav = useNavigate();
  const [works, setWorks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [caixa, setCaixa] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/works');
      setWorks(data || []);
      if (!selectedId && data?.length) setSelectedId(data[0].id);
    } catch { toast.error('Erro ao carregar obras'); }
    finally { setLoading(false); }
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      try {
        const { data } = await api.get(`/works/${selectedId}/caixa`);
        setCaixa(data);
      } catch { toast.error('Erro ao carregar caixa'); }
    })();
  }, [selectedId]);

  if (loading) return <div className="flex items-center justify-center py-24"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>;

  const marginColor = caixa?.resumo?.margin_real_pct >= caixa?.resumo?.margin_predicted_pct * 0.85 ? 'text-emerald-400' : 'text-red-400';
  const cashColor = (caixa?.caixa?.cash_balance || 0) >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="space-y-5" data-testid="caixa-obra-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            <Wallet className="h-8 w-8 text-yellow-400" /> Caixa da Obra
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Cash-flow por obra: recebido, a receber, pago, a pagar, margem prevista vs real.</p>
        </div>
        <select value={selectedId || ''} onChange={e => setSelectedId(e.target.value)}
          data-testid="work-selector"
          className="bg-zinc-900 border border-zinc-800 rounded-xl h-11 px-4 text-white text-sm min-w-[280px]">
          <option value="">Escolha uma obra…</option>
          {works.map(w => <option key={w.id} value={w.id}>{w.title} — {w.client_name || ''} ({w.status})</option>)}
        </select>
      </div>

      {!caixa && selectedId && <p className="text-zinc-500 text-center py-12">A carregar caixa…</p>}
      {!selectedId && (
        <Card className="bg-zinc-900 border-zinc-800"><CardContent className="py-16 text-center">
          <HardHat className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400">Escolha uma obra para ver o balanço.</p>
        </CardContent></Card>
      )}

      {caixa && (
        <>
          {/* KPI principais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI testid="kpi-sale-total" label="Valor de Venda" value={fmt0(caixa.resumo.sale_total)} icon={Target} color="text-white" hint="do orçamento" />
            <KPI testid="kpi-received" label="Já Recebido" value={fmt0(caixa.receitas.total_received)} icon={CheckCircle2} color="text-emerald-400" hint={`de ${fmt0(caixa.receitas.total_invoiced)} facturado`} />
            <KPI testid="kpi-to-receive" label="A Receber" value={fmt0(caixa.receitas.to_receive)} icon={Clock} color="text-yellow-400" hint={`+ ${fmt0(caixa.receitas.to_invoice)} por facturar`} />
            <KPI testid="kpi-cash-balance" label="Caixa Efectiva" value={fmt0(caixa.caixa.cash_balance)} icon={PiggyBank} color={cashColor} hint="recebido − pago" />
          </div>

          {/* Barras de progresso */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3"><CardTitle className="text-sm text-white">Progresso Financeiro</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400">Cobrança do valor de venda</span>
                  <span className="text-emerald-400 font-mono">{pct(caixa.caixa.receipts_progress_pct)}</span>
                </div>
                <Progress value={caixa.caixa.receipts_progress_pct} className="h-3 bg-zinc-800" />
                <p className="text-[10px] text-zinc-500 mt-1">{fmt0(caixa.receitas.total_received)} de {fmt0(caixa.resumo.sale_total)}</p>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400">Custo real vs previsto</span>
                  <span className={caixa.caixa.cost_progress_pct > 100 ? 'text-red-400 font-mono' : 'text-yellow-400 font-mono'}>{pct(caixa.caixa.cost_progress_pct)}</span>
                </div>
                <Progress value={Math.min(caixa.caixa.cost_progress_pct, 150)} className="h-3 bg-zinc-800" />
                <p className="text-[10px] text-zinc-500 mt-1">{fmt0(caixa.resumo.real_total_cost)} de {fmt0(caixa.resumo.predicted_total)} previsto</p>
              </div>
            </CardContent>
          </Card>

          {/* Margens */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <KPI testid="kpi-margin-predicted" label="Margem Prevista" value={pct(caixa.resumo.margin_predicted_pct)} icon={TrendingUp} color="text-blue-400" hint={fmt0(caixa.resumo.predicted_profit)} />
            <KPI testid="kpi-margin-real" label="Margem Real (actual)" value={pct(caixa.resumo.margin_real_pct)} icon={caixa.resumo.margin_real_pct >= caixa.resumo.margin_predicted_pct ? TrendingUp : TrendingDown} color={marginColor} hint={fmt0(caixa.resumo.real_profit)} />
            <KPI testid="kpi-projected-cash" label="Caixa Projectada Final" value={fmt0(caixa.caixa.projected_cash_balance)} icon={PiggyBank} color={caixa.caixa.projected_cash_balance >= 0 ? 'text-emerald-400' : 'text-red-400'} hint="se tudo cobrado e pago" />
          </div>

          {caixa.resumo.margin_real_pct < caixa.resumo.margin_predicted_pct * 0.7 && caixa.resumo.margin_predicted_pct > 0 && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-800 flex items-start gap-2" data-testid="warning-margem">
              <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-200">
                <strong>Atenção:</strong> a margem real está a {pct(caixa.resumo.margin_real_pct)} vs {pct(caixa.resumo.margin_predicted_pct)} prevista — {pct(caixa.resumo.margin_predicted_pct - caixa.resumo.margin_real_pct)} abaixo do orçamentado.
              </p>
            </div>
          )}

          {/* Facturas + Despesas em 2 colunas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-sm text-white flex items-center gap-2"><FileCheck className="h-4 w-4 text-emerald-400" /> Facturas ({caixa.receitas.invoices_count})</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => nav('/faturas')} className="text-xs text-yellow-400 h-7">Ver todas →</Button>
              </CardHeader>
              <CardContent className="pt-0">
                {caixa.receitas.invoices.length === 0 && <p className="text-xs text-zinc-500 italic py-3 text-center">Sem facturas ainda.</p>}
                {caixa.receitas.invoices.map(i => {
                  const outstanding = (i.value_total || 0) - (i.paid_total || 0);
                  return (
                    <div key={i.id} className="py-2 border-b border-zinc-800/60 last:border-0 text-sm" data-testid={`inv-${i.id}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-white font-mono text-xs">{i.number || 'sem número'}</p>
                          <p className="text-[10px] text-zinc-500">Emitida: {i.issue_date} · Vence: {i.due_date}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-mono">{fmt(i.value_total)}</p>
                          {outstanding > 0 ? (
                            <p className="text-[10px] text-yellow-400">Falta {fmt(outstanding)}</p>
                          ) : (
                            <Badge className="bg-emerald-500/20 text-emerald-300 text-[9px]">PAGA</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-sm text-white flex items-center gap-2"><Receipt className="h-4 w-4 text-red-400" /> Despesas ({caixa.despesas.count})</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => nav('/despesas')} className="text-xs text-yellow-400 h-7">Ver todas →</Button>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-xs mb-2 flex gap-3">
                  <span className="text-emerald-400">Pago: {fmt0(caixa.despesas.expenses_paid)}</span>
                  <span className="text-yellow-400">A pagar: {fmt0(caixa.despesas.expenses_to_pay)}</span>
                </div>
                {caixa.despesas.expenses.length === 0 && <p className="text-xs text-zinc-500 italic py-3 text-center">Sem despesas registadas.</p>}
                {caixa.despesas.expenses.slice(0, 10).map(e => (
                  <div key={e.id} className="py-2 border-b border-zinc-800/60 last:border-0 text-sm" data-testid={`exp-${e.id}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs truncate">{e.description || e.supplier || 'Despesa'}</p>
                        <p className="text-[10px] text-zinc-500">{e.date} · {e.category || ''}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white font-mono text-xs">{fmt(e.value_gross)}</p>
                        {e.paid ? <Badge className="bg-emerald-500/20 text-emerald-300 text-[9px]">PAGA</Badge> : <Badge className="bg-yellow-500/20 text-yellow-300 text-[9px]">POR PAGAR</Badge>}
                      </div>
                    </div>
                  </div>
                ))}
                {caixa.despesas.expenses.length > 10 && (
                  <p className="text-[10px] text-zinc-500 text-center pt-2">+ {caixa.despesas.expenses.length - 10} despesa(s)…</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
