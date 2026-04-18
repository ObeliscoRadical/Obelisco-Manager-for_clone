import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HardHat, TrendingUp, Clock, FileText, ClipboardList, CalendarDays, AlertTriangle, Package, Users, Timer, Euro, Percent, BarChart3, Shield } from 'lucide-react';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

const alertIcons = { danger: AlertTriangle, warning: AlertTriangle, info: Clock };
const alertColors = { danger: 'bg-red-500/10 border-red-500/30 text-red-400', warning: 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400', info: 'bg-blue-400/10 border-blue-400/30 text-blue-400' };

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [financial, setFinancial] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, finRes, alertsRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/dashboard/financial'),
        api.get('/alerts'),
      ]);
      setStats(statsRes.data);
      setFinancial(finRes.data);
      setAlerts(alertsRes.data);
    } catch (err) {
      console.error('Dashboard error:', err.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>;

  const totals = financial?.totals || {};
  const db = financial?.database || {};
  const settings = financial?.settings || {};

  const kpis = [
    { label: 'Total Obras', value: totals.obras || 0, icon: HardHat, color: 'text-yellow-400' },
    { label: 'Lucro Estimado', value: formatEuro(totals.estimated_profit), icon: TrendingUp, color: 'text-green-400' },
    { label: 'Em Andamento', value: stats?.obras_em_andamento || 0, icon: Clock, color: 'text-blue-400' },
    { label: 'Orçamentos', value: totals.orçamentos || 0, icon: FileText, color: 'text-orange-400' },
    { label: 'Propostas', value: totals.propostas || 0, icon: ClipboardList, color: 'text-purple-400' },
    { label: 'Agenda Hoje', value: stats?.appointments_today || 0, icon: CalendarDays, color: 'text-cyan-400' },
  ];

  return (
    <div data-testid="dashboard-page" className="space-y-8">
      <div>
        <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Dashboard</h1>
        <p className="text-zinc-400 mt-2 font-medium">Motor de orcamentacao profissional</p>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => {
            const Icon = alertIcons[a.type] || AlertTriangle;
            return (
              <div key={`alert-${a.type}-${i}`} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${alertColors[a.type]}`}>
                <Icon size={16} />
                <p className="text-sm">{a.msg}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="bg-zinc-900 border-zinc-800 rounded-3xl">
            <CardContent className="p-4">
              <div className={`h-10 w-10 rounded-xl bg-zinc-800 flex items-center justify-center ${kpi.color} mb-3`}>
                <kpi.icon size={20} />
              </div>
              <p className="text-xs uppercase tracking-[0.15em] text-zinc-500 font-medium">{kpi.label}</p>
              <p className={`text-2xl font-black mt-0.5 ${kpi.color}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-zinc-900 border-zinc-800 rounded-3xl lg:col-span-2">
          <CardContent className="p-6">
            <h3 className="text-xl font-black uppercase tracking-tight text-white mb-4 flex items-center gap-2">
              <BarChart3 size={20} className="text-yellow-400" /> Resumo Financeiro
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                <div className="flex items-center gap-2 mb-2"><Euro size={14} className="text-zinc-400" /><p className="text-xs text-zinc-500 uppercase">Receita Prevista</p></div>
                <p className="text-xl font-bold text-white">{formatEuro(totals.predicted_revenue)}</p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                <div className="flex items-center gap-2 mb-2"><Euro size={14} className="text-red-400" /><p className="text-xs text-zinc-500 uppercase">Custo Real</p></div>
                <p className="text-xl font-bold text-red-400">{formatEuro(totals.real_cost)}</p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                <div className="flex items-center gap-2 mb-2"><TrendingUp size={14} className="text-green-400" /><p className="text-xs text-zinc-500 uppercase">Lucro</p></div>
                <p className={`text-xl font-bold ${(totals.estimated_profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatEuro(totals.estimated_profit)}</p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                <div className="flex items-center gap-2 mb-2"><Percent size={14} className="text-yellow-400" /><p className="text-xs text-zinc-500 uppercase">Margem</p></div>
                <p className={`text-xl font-bold ${(totals.margin_pct || 0) >= (settings.min_margin || 15) ? 'text-green-400' : 'text-red-400'}`}>{totals.margin_pct || 0}%</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                <p className="text-xs text-zinc-500 uppercase mb-1">Valor em Orçamentos</p>
                <p className="text-lg font-bold text-yellow-400">{formatEuro(totals.total_budget_value)}</p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                <p className="text-xs text-zinc-500 uppercase mb-1">Valor em Propostas</p>
                <p className="text-lg font-bold text-purple-400">{formatEuro(totals.total_proposals_value)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Config Overview */}
        <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
          <CardContent className="p-6">
            <h3 className="text-xl font-black uppercase tracking-tight text-white mb-4 flex items-center gap-2">
              <Shield size={20} className="text-yellow-400" /> Configuração
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between p-3 rounded-xl bg-zinc-800/50">
                <span className="text-zinc-400 text-sm">IVA</span>
                <span className="text-white font-bold">{settings.iva_rate || 23}%</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-zinc-800/50">
                <span className="text-zinc-400 text-sm">Margem Alvo</span>
                <span className="text-yellow-400 font-bold">{settings.target_margin || 30}%</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-zinc-800/50">
                <span className="text-zinc-400 text-sm">Margem Minima</span>
                <span className="text-red-400 font-bold">{settings.min_margin || 15}%</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-zinc-800/50">
                <span className="text-zinc-400 text-sm">Indiretos Total</span>
                <span className="text-zinc-300 font-bold">{settings.indirect_costs ? Object.values(settings.indirect_costs).reduce((s, v) => s + v, 0).toFixed(1) : '20'}%</span>
              </div>
              <div className="pt-3 mt-3 border-t border-zinc-800 space-y-2">
                <div className="flex items-center gap-2 text-sm text-zinc-400"><Package size={14} /><span>{db.materials || 0} materiais</span></div>
                <div className="flex items-center gap-2 text-sm text-zinc-400"><Users size={14} /><span>{db.labor_types || 0} tipos mão de obra</span></div>
                <div className="flex items-center gap-2 text-sm text-zinc-400"><Timer size={14} /><span>{db.productivities || 0} produtividades</span></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
          <CardContent className="p-6">
            <h3 className="text-xl font-black uppercase tracking-tight text-white mb-4">Obras Recentes</h3>
            {stats?.recent_works?.length > 0 ? (
              <div className="space-y-3">
                {stats.recent_works.map((w) => (
                  <div key={w.id || w.title} className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/50 border border-zinc-800">
                    <div>
                      <p className="text-sm font-medium text-white">{w.title}</p>
                      <p className="text-xs text-zinc-500">{w.client_name}</p>
                    </div>
                    <Badge className={w.status === 'finalizado' ? 'bg-green-500/20 text-green-400' : w.status === 'em_execução' ? 'bg-yellow-400/20 text-yellow-400' : 'bg-zinc-700 text-zinc-300'}>
                      {w.status === 'em_execução' ? 'Em Execução' : w.status === 'finalizado' ? 'Finalizado' : 'Orçamento'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : <p className="text-zinc-500 text-sm">Nenhuma obra registada</p>}
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
          <CardContent className="p-6">
            <h3 className="text-xl font-black uppercase tracking-tight text-white mb-4">Orçamentos Recentes</h3>
            {stats?.recent_budgets?.length > 0 ? (
              <div className="space-y-3">
                {stats.recent_budgets.map((b) => (
                  <div key={b.id || b.title} className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/50 border border-zinc-800">
                    <div>
                      <p className="text-sm font-medium text-white">{b.title}</p>
                      <p className="text-xs text-zinc-500">{b.client_name}</p>
                    </div>
                    <p className="text-sm font-semibold text-yellow-400">{formatEuro(b.total_price)}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-zinc-500 text-sm">Nenhum orçamento criado</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
