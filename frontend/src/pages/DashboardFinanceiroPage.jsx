import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { TrendingUp, TrendingDown, Euro, AlertTriangle, Calendar, PieChart as PieIcon, ArrowDownRight, ArrowUpRight, Wallet, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const PIE_COLORS = ['#facc15', '#f97316', '#ef4444', '#8b5cf6', '#06b6d4', '#10b981', '#f472b6'];

export default function DashboardFinanceiroPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/dashboard/cashflow', { params: { year } });
      setData(data);
    } catch {
      toast.error('Erro ao carregar dashboard financeiro');
    } finally { setLoading(false); }
  }, [year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading || !data) {
    return <div className="flex items-center justify-center h-64"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const t = data.totals;
  const cm = data.current_month;
  const f = data.forecast_30d;
  const col = data.collection;

  const chartData = data.monthly.map(m => ({
    name: MONTHS[m.month - 1],
    Entradas: m.entries,
    Saídas: m.exits,
    Resultado: m.net,
  }));

  const pieData = data.top_categories.map((c, i) => ({ name: c.category, value: c.value, color: PIE_COLORS[i % PIE_COLORS.length] }));

  const marginColor = t.net >= 0 ? 'text-green-400' : 'text-red-400';
  const cmColor = cm.net >= 0 ? 'text-green-400' : 'text-red-400';
  const forecastColor = f.projected_net >= 0 ? 'text-green-400' : 'text-red-400';

  return (
    <div data-testid="dashboard-financeiro" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Dashboard Financeiro</h1>
          <p className="text-zinc-400 mt-1 font-medium">Entradas vs Saídas · Margem mensal · Previsão 30 dias</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500 uppercase tracking-wider">Ano</label>
          <select
            data-testid="year-select"
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm"
          >
            {[year + 1, year, year - 1, year - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div data-testid="kpi-entries" className="p-4 rounded-2xl bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/30">
          <p className="text-xs uppercase tracking-wider text-green-400/80 font-medium flex items-center gap-1"><ArrowUpRight size={12} /> Entradas (ano)</p>
          <p className="text-2xl font-black text-green-400 mt-1">{formatEuro(t.entries)}</p>
          <p className="text-xs text-zinc-500 mt-0.5">Recebido de faturas</p>
        </div>
        <div data-testid="kpi-exits" className="p-4 rounded-2xl bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/30">
          <p className="text-xs uppercase tracking-wider text-red-400/80 font-medium flex items-center gap-1"><ArrowDownRight size={12} /> Saídas (ano)</p>
          <p className="text-2xl font-black text-red-400 mt-1">{formatEuro(t.exits)}</p>
          <p className="text-xs text-zinc-500 mt-0.5">Despesas {formatEuro(t.exits_expenses)} · Salários {formatEuro(t.exits_payroll)}</p>
        </div>
        <div data-testid="kpi-net" className={`p-4 rounded-2xl bg-gradient-to-br ${t.net >= 0 ? 'from-yellow-400/10 to-yellow-400/5 border-yellow-400/30' : 'from-red-500/10 to-red-500/5 border-red-500/30'} border`}>
          <p className="text-xs uppercase tracking-wider text-zinc-400 font-medium flex items-center gap-1"><Wallet size={12} /> Resultado líquido</p>
          <p className={`text-2xl font-black mt-1 ${marginColor}`}>{formatEuro(t.net)}</p>
          <p className="text-xs text-zinc-500 mt-0.5">Margem: <span className={marginColor}>{t.margin_pct}%</span></p>
        </div>
        <div data-testid="kpi-collection" className="p-4 rounded-2xl bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-500/30">
          <p className="text-xs uppercase tracking-wider text-orange-400/80 font-medium flex items-center gap-1"><AlertTriangle size={12} /> A receber</p>
          <p className="text-2xl font-black text-orange-400 mt-1">{formatEuro(col.pending)}</p>
          <p className="text-xs text-zinc-500 mt-0.5">Vencido: <span className="text-red-400">{formatEuro(col.overdue)}</span></p>
        </div>
      </div>

      {/* Current month + Forecast */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-testid="current-month-card" className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium flex items-center gap-1"><Calendar size={12} /> Mês Actual ({MONTHS[cm.month - 1]})</p>
            <span className={`text-xs font-bold ${cmColor}`}>{cm.net >= 0 ? <TrendingUp size={14} className="inline" /> : <TrendingDown size={14} className="inline" />}</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-zinc-400">Entradas</span><span className="text-green-400 font-semibold">{formatEuro(cm.entries)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-zinc-400">Despesas</span><span className="text-red-400">-{formatEuro(cm.expenses)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-zinc-400">Salários</span><span className="text-red-400">-{formatEuro(cm.payroll)}</span></div>
            <div className="border-t border-zinc-800 pt-2 mt-2 flex justify-between">
              <span className="text-zinc-300 font-semibold">Resultado</span>
              <span className={`font-black text-lg ${cmColor}`}>{formatEuro(cm.net)}</span>
            </div>
          </div>
        </div>

        <div data-testid="forecast-card" className="p-5 rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/30">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wider text-purple-400/80 font-medium flex items-center gap-1"><TrendingUp size={12} /> Previsão 30 dias</p>
            <span className="text-[10px] text-zinc-500">Baseada em média dos últimos 3 meses</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-zinc-400">Entradas previstas</span><span className="text-green-400 font-semibold">{formatEuro(f.projected_entries)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-zinc-400">Saídas previstas</span><span className="text-red-400">-{formatEuro(f.projected_exits)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-zinc-400">A receber (vence ≤30d)</span><span className="text-yellow-400 font-semibold">{formatEuro(f.upcoming_due_total)}</span></div>
            <div className="border-t border-purple-500/30 pt-2 mt-2 flex justify-between">
              <span className="text-zinc-300 font-semibold">Resultado previsto</span>
              <span className={`font-black text-lg ${forecastColor}`}>{formatEuro(f.projected_net)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly bar chart */}
      <div data-testid="monthly-chart" className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
        <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-4 flex items-center gap-1"><Receipt size={12} /> Cashflow mensal · {data.year}</p>
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <XAxis dataKey="name" stroke="#71717a" fontSize={11} />
              <YAxis stroke="#71717a" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                formatter={(v) => formatEuro(v)}
                cursor={{ fill: 'rgba(250, 204, 21, 0.05)' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Entradas" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Saídas" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Resultado" fill="#facc15" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Categories + Upcoming due */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-testid="categories-card" className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-3 flex items-center gap-1"><PieIcon size={12} /> Top categorias de despesa</p>
          {pieData.length === 0 ? (
            <p className="text-sm text-zinc-500 py-8 text-center">Sem despesas registadas.</p>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => formatEuro(v)}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div data-testid="upcoming-due-card" className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-3 flex items-center gap-1"><Euro size={12} /> A receber nos próximos 30 dias ({f.upcoming_due_count})</p>
          {f.upcoming_due.length === 0 ? (
            <p className="text-sm text-zinc-500 py-8 text-center">Sem faturas a vencer no horizonte.</p>
          ) : (
            <ul className="divide-y divide-zinc-800 max-h-[260px] overflow-y-auto">
              {f.upcoming_due.map(inv => (
                <li key={inv.id} className="py-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white font-semibold">{inv.number}</p>
                    <p className="text-xs text-zinc-400">{inv.client_name} · vence {inv.due_date}</p>
                  </div>
                  <span className="text-yellow-400 font-bold text-sm">{formatEuro(inv.balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
