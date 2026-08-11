import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BrandLogo } from '@/components/branding/BrandLogo';
import { useBranding } from '../contexts/BrandingContext';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, AlertTriangle, TrendingUp, TrendingDown,
  FileText, ClipboardList, HardHat, Package, Truck, HandCoins, PiggyBank,
  ChevronRight, RefreshCw, CircleDot, CheckCircle2, Sparkles, Landmark, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { TreasurySummaryStrip } from '../components/TreasuryInsightsPanel';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

const fmtEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);
const fmtEuroFull = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-PT'); } catch { return iso; }
};

const monthName = (m) => ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][m - 1];

export default function DashboardPage() {
  const { branding } = useBranding();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [taxAlerts, setTaxAlerts] = useState(null);
  const [treasury, setTreasury] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data }, meRes, taxRes, treasuryRes] = await Promise.all([
        api.get('/dashboard/overview'),
        api.get('/auth/me').catch(() => ({ data: {} })),
        api.get('/bank-analysis/tax-alerts/upcoming').catch(() => ({ data: null })),
        api.get('/bank-analysis/treasury/insights').catch(() => ({ data: null })),
      ]);
      setData(data);
      setUserName(meRes.data?.name || meRes.data?.email?.split('@')[0] || '');
      setTaxAlerts(taxRes.data);
      setTreasury(treasuryRes.data);
    } catch (err) {
      console.error(err);
      toast.error('Erro a carregar dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  if (loading || !data) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 rounded-full animate-spin" style={{ border: '2px solid var(--brand-primary)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const { highlights, commercial, operational, stock, hr, recent_activity, period } = data;
  const isPositive = highlights.cash_month.amount >= 0;
  const greeting = getGreeting(userName);
  const miniRevenueVsExpenses = (data.monthly_revenue_vs_expenses || []).map(item => ({
    label: item.label,
    Receitas: item.revenue,
    Despesas: item.expenses,
  }));
  const brandSwatches = [
    branding?.branding?.palette?.primary,
    branding?.branding?.palette?.secondary,
    branding?.branding?.palette?.accent,
  ].filter(Boolean);

  return (
    <div data-testid="dashboard-page" className="space-y-8">
      <div className="grid gap-4 xl:grid-cols-[1.15fr,0.85fr] items-start">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-2">
              {greeting} <Sparkles size={24} style={{ color: 'var(--brand-primary)' }} />
            </h1>
            <p className="text-zinc-400 mt-1 text-sm">
              Aqui tens um resumo do teu negócio em {monthName(period.month)} {period.year}.
            </p>
          </div>
          <Button data-testid="refresh-dashboard" onClick={fetch} variant="outline" className="rounded-full brand-outline-button">
            <RefreshCw size={14} className="mr-2" /> Atualizar
          </Button>
        </div>

        <div data-testid="dashboard-brand-card" className="rounded-[2rem] p-5 brand-soft-panel">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <BrandLogo
              branding={branding}
              size="md"
              showText
              logoTestId="dashboard-brand-logo"
              titleTestId="dashboard-brand-title"
              subtitleTestId="dashboard-brand-subtitle"
              title={branding?.company_info?.name || userName || 'Empresa ativa'}
              subtitle={branding?.company_info?.subtitle || 'White Label ativo'}
            />

            <div className="text-left xl:text-right">
              <p className="text-[11px] uppercase tracking-[0.24em]" style={{ color: 'var(--brand-primary)' }}>
                Identidade aplicada
              </p>
              <p className="mt-2 text-sm text-zinc-200 max-w-xs">
                Login, dashboard e PDFs seguem esta paleta automaticamente para a empresa ativa.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3" data-testid="dashboard-brand-swatches">
            {brandSwatches.map((color, index) => (
              <div key={`${color}-${index}`} className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-950/45 px-3 py-2 text-xs text-zinc-300">
                <span className="h-3.5 w-3.5 rounded-full border border-white/15" style={{ background: color }} />
                {color}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs principais — 4 em destaque */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Caixa do Mês */}
        <div data-testid="kpi-caixa" className={`rounded-3xl p-6 border ${isPositive ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2 rounded-xl ${isPositive ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
              <Wallet size={20} className={isPositive ? 'text-green-400' : 'text-red-400'} />
            </div>
            {isPositive ? <TrendingUp size={16} className="text-green-400" /> : <TrendingDown size={16} className="text-red-400" />}
          </div>
          <div className="text-xs uppercase tracking-wide text-zinc-400 font-bold">Caixa do Mês</div>
          <div className={`text-3xl font-black mt-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`} translate="no">
            {isPositive ? '+' : ''}{fmtEuroFull(highlights.cash_month.amount)}
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            {isPositive
              ? `Este mês estás a ganhar dinheiro 🎉`
              : `Cuidado: estás a gastar mais do que a receber.`}
          </p>
          <div className="mt-3 pt-3 border-t border-zinc-800/50 space-y-1 text-xs">
            <div className="flex justify-between text-zinc-400"><span>Recebido</span><span className="text-green-400 font-bold">{fmtEuro(highlights.cash_month.received)}</span></div>
            <div className="flex justify-between text-zinc-400"><span>Despesas</span><span className="text-red-400 font-bold">−{fmtEuro(highlights.cash_month.expenses)}</span></div>
            <div className="flex justify-between text-zinc-400"><span>Salários</span><span className="text-red-400 font-bold">−{fmtEuro(highlights.cash_month.payroll)}</span></div>
          </div>
        </div>

        {/* A Receber */}
        <div data-testid="kpi-receber" className="rounded-3xl p-6 bg-zinc-900 border border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-xl bg-blue-500/20"><ArrowDownCircle size={20} className="text-blue-400" /></div>
            <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">{highlights.to_receive.count} fatura(s)</Badge>
          </div>
          <div className="text-xs uppercase tracking-wide text-zinc-400 font-bold">A Receber</div>
          <div className="text-3xl font-black mt-1 text-white" translate="no">{fmtEuroFull(highlights.to_receive.amount)}</div>
          <p className="text-xs text-zinc-500 mt-2">Faturas emitidas que ainda não recebeste.</p>
          {highlights.to_receive.overdue_count > 0 && (
            <div className="mt-3 pt-3 border-t border-red-500/20 bg-red-500/5 -mx-6 -mb-6 px-6 pb-4 rounded-b-3xl">
              <div className="flex items-center gap-2 text-red-300 text-xs font-bold">
                <AlertTriangle size={12} /> {highlights.to_receive.overdue_count} vencida(s) — {fmtEuro(highlights.to_receive.overdue_amount)}
              </div>
              <Link to="/faturas" className="text-xs text-yellow-400 hover:underline mt-1 inline-block">Ir cobrar →</Link>
            </div>
          )}
        </div>

        {/* A Pagar */}
        <div data-testid="kpi-pagar" className="rounded-3xl p-6 bg-zinc-900 border border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-xl bg-orange-500/20"><ArrowUpCircle size={20} className="text-orange-400" /></div>
            <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30">{highlights.to_pay.expenses_count} despesa(s)</Badge>
          </div>
          <div className="text-xs uppercase tracking-wide text-zinc-400 font-bold">A Pagar</div>
          <div className="text-3xl font-black mt-1 text-white" translate="no">{fmtEuroFull(highlights.to_pay.amount)}</div>
          <p className="text-xs text-zinc-500 mt-2">Despesas dos últimos 90 dias por regularizar.</p>
          {highlights.to_pay.fixed_costs > 0 && (
            <div className="mt-2 text-xs text-zinc-500">Inclui {fmtEuro(highlights.to_pay.fixed_costs)} de custos fixos do mês.</div>
          )}
        </div>

        {/* Alertas */}
        <div data-testid="kpi-alertas" className={`rounded-3xl p-6 border ${highlights.alerts.length > 0 ? 'bg-yellow-400/5 border-yellow-400/30' : 'bg-zinc-900 border-zinc-800'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2 rounded-xl ${highlights.alerts.length > 0 ? 'bg-yellow-400/20' : 'bg-zinc-800'}`}>
              <AlertTriangle size={20} className={highlights.alerts.length > 0 ? 'text-yellow-400' : 'text-zinc-500'} />
            </div>
            <Badge className={highlights.alerts.length > 0 ? 'bg-yellow-400/20 text-yellow-300' : 'bg-zinc-800 text-zinc-500'}>{highlights.alerts.length}</Badge>
          </div>
          <div className="text-xs uppercase tracking-wide text-zinc-400 font-bold">Alertas</div>
          {highlights.alerts.length === 0 ? (
            <>
              <div className="text-2xl font-black mt-1 text-green-400 flex items-center gap-2"><CheckCircle2 size={22} /> Tudo em ordem</div>
              <p className="text-xs text-zinc-500 mt-2">Sem urgências no momento. Continua o bom trabalho!</p>
            </>
          ) : (
            <div className="space-y-2 mt-2">
              {highlights.alerts.slice(0, 3).map((a) => (
                <div key={`${a.level}-${a.text}`} className={`text-xs flex items-start gap-2 ${a.level === 'danger' ? 'text-red-300' : a.level === 'warning' ? 'text-yellow-300' : 'text-blue-300'}`}>
                  <CircleDot size={10} className="mt-1 shrink-0" />
                  <span>{a.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Painel Fiscal */}
      {taxAlerts && (taxAlerts.alerts?.length > 0 || taxAlerts.estimates?.total_tax_burden > 0) && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5" data-testid="fiscal-panel">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Landmark size={16} className="text-yellow-400" />
              <h2 className="text-white font-black uppercase tracking-wide text-sm">Resumo Fiscal</h2>
            </div>
            <Link to="/analise-bancaria" className="text-xs text-zinc-400 hover:text-yellow-400 flex items-center gap-1">
              Ver análise completa <ChevronRight size={12} />
            </Link>
          </div>

          {/* Fiscal KPIs */}
          {taxAlerts.estimates?.total_tax_burden > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="rounded-xl px-3 py-2 bg-zinc-950 border border-zinc-800">
                <div className="text-[10px] uppercase text-zinc-500 tracking-wide">IRC Estimado</div>
                <div className="text-lg font-black text-orange-400 mt-0.5" translate="no">{fmtEuroFull(taxAlerts.estimates.irc_estimate)}</div>
                <div className="text-[10px] text-zinc-600">Taxa efetiva: {(taxAlerts.estimates.irc_rate_effective || 0).toFixed(1)}%</div>
              </div>
              <div className="rounded-xl px-3 py-2 bg-zinc-950 border border-zinc-800">
                <div className="text-[10px] uppercase text-zinc-500 tracking-wide">IVA Trimestral</div>
                <div className="text-lg font-black text-orange-400 mt-0.5" translate="no">{fmtEuroFull(taxAlerts.estimates.iva_quarterly_estimate)}</div>
              </div>
              <div className="rounded-xl px-3 py-2 bg-zinc-950 border border-zinc-800">
                <div className="text-[10px] uppercase text-zinc-500 tracking-wide">TSU Patronal</div>
                <div className="text-lg font-black text-purple-400 mt-0.5" translate="no">{fmtEuroFull(taxAlerts.estimates.tsu_estimate)}</div>
              </div>
              <div className="rounded-xl px-3 py-2 bg-yellow-400/5 border border-yellow-400/20">
                <div className="text-[10px] uppercase text-zinc-500 tracking-wide">Carga Total</div>
                <div className="text-lg font-black text-yellow-400 mt-0.5" translate="no">{fmtEuroFull(taxAlerts.estimates.total_tax_burden)}</div>
                <div className="text-[10px] text-zinc-600">{(taxAlerts.estimates.tax_rate_effective || 0).toFixed(1)}% da receita</div>
              </div>
            </div>
          )}

          {/* Próximos prazos */}
          {taxAlerts.alerts?.length > 0 && (
            <div>
              <div className="text-xs uppercase text-zinc-500 font-bold mb-2 flex items-center gap-1">
                <Calendar size={11} /> Próximos Prazos Fiscais
              </div>
              <div className="space-y-1.5">
                {taxAlerts.alerts.slice(0, 5).map((a, i) => {
                  const colors = {
                    overdue: 'bg-red-500/10 border-red-500/20 text-red-300',
                    urgent: 'bg-orange-500/10 border-orange-500/20 text-orange-300',
                    soon: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300',
                    upcoming: 'bg-zinc-950 border-zinc-800 text-zinc-300',
                  };
                  const cls = colors[a.status] || colors.upcoming;
                  const emoji = { 'IVA': '📋', 'IRC-PPC': '🏛', 'IRC-MOD22': '📄', 'TSU': '👥', 'IRS-RET': '💼' }[a.type] || '📅';
                  return (
                    <div key={a.date + a.type + i} className={`flex items-center justify-between text-xs border rounded-xl px-3 py-2.5 ${cls}`}>
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span>{emoji}</span>
                        <div className="min-w-0">
                          <div className="font-bold truncate">{a.label}</div>
                          <div className="text-[10px] opacity-60 truncate">{a.desc}</div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <div className="font-mono font-bold">{new Date(a.date).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}</div>
                        <div className="text-[10px]">
                          {a.days_until < 0 ? <span className="text-red-400">{Math.abs(a.days_until)}d atraso</span>
                            : a.days_until === 0 ? <span className="text-red-400 font-bold">HOJE</span>
                            : <span>{a.days_until}d</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!taxAlerts.estimates?.total_tax_burden && !taxAlerts.alerts?.length && (
            <p className="text-xs text-zinc-500 text-center py-2">Carregue um extrato bancário na <Link to="/analise-bancaria" className="text-yellow-400 hover:underline">Análise Bancária</Link> para ver estimativas fiscais.</p>
          )}
        </div>
      )}

      <TreasurySummaryStrip
        insights={treasury}
        loading={loading}
        title="Radar de tesouraria"
        linkTo="/analise-bancaria"
      />

      {miniRevenueVsExpenses.length > 0 && (
        <div data-testid="dashboard-mini-revenue-expenses" className="rounded-[28px] border border-zinc-800 bg-zinc-900/70 p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div>
              <h2 className="text-white font-black uppercase tracking-wide text-sm">Receitas vs despesas</h2>
              <p className="text-xs text-zinc-500 mt-1">Mini leitura mensal dos últimos 6 meses.</p>
            </div>
            <div className="text-xs text-zinc-500 rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1">Base real: pagamentos + despesas + salários</div>
          </div>
          <div className="min-w-0 h-56" data-testid="dashboard-mini-revenue-expenses-chart">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={miniRevenueVsExpenses} barGap={8}>
                <XAxis dataKey="label" stroke="#71717a" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis stroke="#71717a" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} width={42} />
                <Tooltip formatter={(value) => fmtEuroFull(value)} contentStyle={{ background: '#09090b', border: '1px solid #27272a', borderRadius: 16 }} />
                <Bar dataKey="Receitas" radius={[8, 8, 0, 0]} fill="#22c55e" />
                <Bar dataKey="Despesas" radius={[8, 8, 0, 0]} fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {treasury && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="dashboard-treasury-detail-grid">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5" data-testid="dashboard-treasury-anomalies-card">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-orange-400" />
              <h2 className="text-white font-black uppercase tracking-wide text-sm">Anomalias em custos recorrentes</h2>
            </div>
            {treasury.anomalies?.items?.length ? (
              <div className="space-y-2">
                {treasury.anomalies.items.slice(0, 3).map(item => (
                  <div key={`${item.desc_key}-${item.last_date}`} className="rounded-2xl border border-orange-500/20 bg-orange-500/5 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{item.description}</div>
                        <div className="text-[11px] text-zinc-500">{item.payment_type} · média {fmtEuro(item.baseline_avg)}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-black text-orange-400">+{item.increase_pct}%</div>
                        <div className="text-[11px] text-zinc-500">{fmtEuro(item.last_amount)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 py-8 text-center">Sem desvios acima do limiar nas últimas leituras.</p>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5" data-testid="dashboard-treasury-critical-days-card">
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={16} className="text-yellow-400" />
              <h2 className="text-white font-black uppercase tracking-wide text-sm">Dias de maior pressão</h2>
            </div>
            {treasury.pressure_map?.critical_dates?.length ? (
              <div className="space-y-2">
                {treasury.pressure_map.critical_dates.slice(0, 4).map(day => (
                  <div key={day.date} className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{fmtDate(day.date)}</div>
                      <div className="text-[11px] text-zinc-500">{day.items_count} saída(s) concentradas neste dia</div>
                    </div>
                    <div className="text-sm font-black text-red-400">{fmtEuro(day.total_outflow)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 py-8 text-center">Não há concentração crítica de saídas no horizonte atual.</p>
            )}
          </div>
        </div>
      )}

      {/* Comercial + Operacional lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Comercial" icon={FileText} link="/orcamentos" linkLabel="Ver orçamentos">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MiniStat label="Orçamentos" value={commercial.budgets_count} />
            <MiniStat label="Propostas" value={commercial.proposals_count} />
            <MiniStat label="Pendentes" value={commercial.pending_proposals_count} highlight />
          </div>
          {commercial.pending_proposals_value > 0 && (
            <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-xl p-3 mb-4">
              <div className="text-xs text-zinc-400">Propostas à espera de resposta</div>
              <div className="text-xl font-black text-yellow-400" translate="no">{fmtEuroFull(commercial.pending_proposals_value)}</div>
            </div>
          )}
          <div className="space-y-2">
            <div className="text-xs uppercase text-zinc-500 font-bold">Últimas propostas</div>
            {commercial.recent_proposals.slice(0, 4).map(p => (
              <Link key={p.id} to="/propostas" className="flex items-center justify-between text-sm hover:bg-zinc-950 -mx-2 px-2 py-1.5 rounded">
                <div className="min-w-0 flex-1">
                  <div className="text-white text-xs truncate">{p.title || 'Sem título'}</div>
                  <div className="text-zinc-500 text-[10px]">{p.client_name || '—'} · {p.status || 'draft'}</div>
                </div>
                <div className="text-yellow-400 font-bold text-xs ml-2 shrink-0" translate="no">{fmtEuro(p.final_value)}</div>
              </Link>
            ))}
            {commercial.recent_proposals.length === 0 && (
              <p className="text-xs text-zinc-600 py-2">Ainda não criaste propostas.</p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Operacional" icon={HardHat} link="/obras" linkLabel="Ver obras">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MiniStat label="Obras Ativas" value={operational.active_works_count} highlight />
            <MiniStat label="Guias" value={operational.pending_guides_count} />
            <MiniStat label="Total" value={operational.works_count} />
          </div>
          {operational.active_works_value > 0 && (
            <div className="bg-blue-400/5 border border-blue-400/20 rounded-xl p-3 mb-4">
              <div className="text-xs text-zinc-400">Valor em obras a decorrer</div>
              <div className="text-xl font-black text-blue-300" translate="no">{fmtEuroFull(operational.active_works_value)}</div>
            </div>
          )}
          {operational.late_works.length > 0 && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 mb-3">
              <div className="text-xs text-red-300 font-bold mb-1 flex items-center gap-1"><AlertTriangle size={11} /> Obras atrasadas ({operational.late_works.length})</div>
              {operational.late_works.slice(0, 3).map(w => (
                <div key={w.id} className="text-[11px] text-zinc-400 flex justify-between">
                  <span className="truncate">{w.title}</span>
                  <span className="text-red-300 ml-2 shrink-0">{w.days}d</span>
                </div>
              ))}
            </div>
          )}
          {operational.pending_guides.length > 0 && (
            <div>
              <div className="text-xs uppercase text-zinc-500 font-bold mb-2">Guias por confirmar</div>
              {operational.pending_guides.map(g => (
                <Link key={g.id} to="/guias" className="flex items-center justify-between text-xs hover:bg-zinc-950 -mx-2 px-2 py-1.5 rounded">
                  <div>
                    <span className="text-yellow-400 font-bold" translate="no">{g.number}</span>
                    <span className="text-zinc-500 ml-2">{g.obra_name || '—'}</span>
                  </div>
                  <span className="text-zinc-400 text-[10px]">{g.assigned_employee_name || '—'}</span>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Stock + Recursos Humanos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Stock" icon={Package} link="/materiais" linkLabel="Ver stock">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <MiniStat label="Materiais Ativos" value={stock.materials_count} />
            <MiniStat label="Stock Crítico" value={stock.low_stock_count} danger={stock.low_stock_count > 0} />
          </div>
          {stock.low_stock.length > 0 ? (
            <div>
              <div className="text-xs uppercase text-red-300 font-bold mb-2 flex items-center gap-1"><AlertTriangle size={11} /> Materiais em falta</div>
              <div className="space-y-1.5">
                {stock.low_stock.slice(0, 5).map(m => (
                  <div key={m.id} className="flex items-center justify-between text-xs bg-red-500/5 border border-red-500/10 rounded px-2 py-1.5">
                    <span className="text-white truncate flex-1">{m.description}</span>
                    <span className="text-red-300 font-bold ml-2 shrink-0" translate="no">{m.stock_current}/{m.stock_min} {m.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-500 flex items-center gap-1"><CheckCircle2 size={12} className="text-green-400" /> Todos os materiais com stock suficiente.</p>
          )}
        </SectionCard>

        <SectionCard title="Recursos Humanos" icon={HandCoins} link="/salarios" linkLabel="Ver salários">
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Custo Salários (mês)" value={fmtEuro(highlights.cash_month.payroll)} />
            <MiniStat label="Créditos Ativos" value={hr.active_loans_count} />
          </div>
          {hr.loans_outstanding > 0 && (
            <div className="mt-4 bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-400">Empréstimos por receber</div>
                <div className="text-lg font-black text-purple-300" translate="no">{fmtEuroFull(hr.loans_outstanding)}</div>
              </div>
              <PiggyBank size={24} className="text-purple-400 opacity-60" />
            </div>
          )}
        </SectionCard>
      </div>

      {/* Última atividade */}
      {recent_activity.length > 0 && (
        <SectionCard title="Última atividade" icon={ClipboardList} link="/financeiro" linkLabel="Ver financeiro">
          <div className="space-y-2">
            {recent_activity.map((a) => (
              <div key={`${a.type}-${a.when}-${a.title}`} className="flex items-center justify-between text-sm border-b border-zinc-800 pb-2 last:border-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <ActivityIcon type={a.type} />
                  <div className="min-w-0 flex-1">
                    <div className="text-white text-xs truncate">{a.title}</div>
                    <div className="text-zinc-500 text-[10px]">{fmtDate(a.when)}</div>
                  </div>
                </div>
                {a.amount !== null && (
                  <div className={`font-bold text-xs ml-2 ${a.amount > 0 ? 'text-green-400' : 'text-red-400'}`} translate="no">
                    {a.amount > 0 ? '+' : ''}{fmtEuro(a.amount)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function SectionCard({ title, icon: Icon, link, linkLabel, children }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-yellow-400" />
          <h2 className="text-white font-black uppercase tracking-wide text-sm">{title}</h2>
        </div>
        {link && (
          <Link to={link} className="text-xs text-zinc-400 hover:text-yellow-400 flex items-center gap-1">
            {linkLabel} <ChevronRight size={12} />
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function MiniStat({ label, value, highlight, danger }) {
  return (
    <div className={`rounded-xl px-3 py-2 border ${danger ? 'bg-red-500/5 border-red-500/20' : highlight ? 'bg-yellow-400/5 border-yellow-400/20' : 'bg-zinc-950 border-zinc-800'}`}>
      <div className="text-[10px] uppercase text-zinc-500 tracking-wide">{label}</div>
      <div className={`text-lg font-black mt-0.5 ${danger ? 'text-red-300' : highlight ? 'text-yellow-400' : 'text-white'}`} translate="no">
        {value}
      </div>
    </div>
  );
}

function ActivityIcon({ type }) {
  const map = {
    invoice: { icon: FileText, color: 'text-green-400 bg-green-500/10' },
    expense: { icon: ArrowUpCircle, color: 'text-red-400 bg-red-500/10' },
    guide: { icon: Truck, color: 'text-yellow-400 bg-yellow-500/10' },
  };
  const cfg = map[type] || map.expense;
  const Icon = cfg.icon;
  return <div className={`p-1.5 rounded-lg ${cfg.color}`}><Icon size={12} /></div>;
}

function getGreeting(name) {
  const hour = new Date().getHours();
  const first = name?.split(' ')[0] || '';
  const label = hour < 12 ? 'Bom dia' : hour < 19 ? 'Boa tarde' : 'Boa noite';
  return first ? `${label}, ${first}!` : `${label}!`;
}
