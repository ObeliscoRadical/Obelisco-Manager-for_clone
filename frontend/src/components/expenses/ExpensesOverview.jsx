import { Label } from '@/components/ui/label';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp } from 'lucide-react';

function ExpensesMonthTick({ x, y, payload, selectedMonthLabel }) {
  const isSelected = selectedMonthLabel === payload?.value;
  return (
    <text x={x} y={y + 12} textAnchor="middle" fontSize={10} fill={isSelected ? '#facc15' : '#71717a'} fontWeight={isSelected ? 700 : 400}>
      {payload?.value}
    </text>
  );
}

export const ExpensesOverview = ({
  summary,
  month,
  year,
  monthName,
  formatEuro,
  topCats,
  monthlyChartData,
  categories,
  types,
  filterCategory,
  filterType,
  onMonthChange,
  onYearChange,
  onCategoryChange,
  onTypeChange,
}) => {
  return (
    <>
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div data-testid="kpi-total-year" className="p-4 rounded-2xl bg-gradient-to-br from-yellow-400/10 to-yellow-400/5 border border-yellow-400/30">
            <p className="text-xs uppercase tracking-wider text-yellow-400/80 font-medium">Total {summary.year}</p>
            <p className="text-2xl font-black text-yellow-400 mt-1">{formatEuro(summary.total_year)}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">{summary.count_year ?? summary.count} despesas no ano</p>
          </div>
          <div data-testid="kpi-month-total" className="p-4 rounded-2xl bg-gradient-to-br from-yellow-400/5 to-zinc-900 border border-yellow-400/20">
            <p className="text-xs uppercase tracking-wider text-yellow-400/80 font-medium">{monthName(month)} {summary.year}</p>
            <p className="text-2xl font-black text-white mt-1">{formatEuro(summary.month_total ?? summary.current_month_total)}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Total de gastos no mês</p>
          </div>
          <div data-testid="kpi-month-iva" className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
            <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium">IVA pago em {monthName(month)}</p>
            <p className="text-2xl font-black text-orange-400 mt-1">{formatEuro(summary.month_iva ?? 0)}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Ano: {formatEuro(summary.total_iva)}</p>
          </div>
          <div data-testid="kpi-month-count" className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
            <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium">Faturas em {monthName(month)}</p>
            <p className="text-2xl font-black text-white mt-1">{summary.month_count ?? 0}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Ano: {summary.count_year ?? summary.count} despesas</p>
          </div>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_350px] gap-4">
          <div data-testid="monthly-chart" className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
            <h3 className="text-sm uppercase tracking-wider text-zinc-400 font-semibold mb-4 flex items-center gap-2">
              <TrendingUp size={14} /> Gastos Mensais {summary.year}
              <span className="ml-auto text-[10px] text-yellow-400 normal-case tracking-normal">Mês selecionado: {monthName(month)}</span>
            </h3>
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer>
                <BarChart data={monthlyChartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#71717a" fontSize={10} tick={<ExpensesMonthTick selectedMonthLabel={monthName(month)} />} />
                  <YAxis stroke="#71717a" fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }} formatter={(v) => formatEuro(v)} cursor={{ fill: 'rgba(250, 204, 21, 0.05)' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {monthlyChartData.map((d) => <Cell key={d.name || d.monthNum} fill={d.monthNum === month ? '#facc15' : '#3f3f46'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
            <h3 className="text-sm uppercase tracking-wider text-zinc-400 font-semibold mb-4">Top Categorias</h3>
            <div className="space-y-2">
              {topCats.length === 0 && <p className="text-zinc-500 text-xs">Sem dados</p>}
              {topCats.map(([cat, val]) => {
                const pct = (val / summary.total_year) * 100 || 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-300">{cat}</span>
                      <span className="text-yellow-400 font-semibold">{formatEuro(val)}</span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800">
        <div>
          <Label className="text-zinc-400 text-xs">Mês</Label>
          <select value={month} onChange={e => onMonthChange(parseInt(e.target.value))} className="w-full mt-1 h-9 bg-zinc-900 border border-zinc-700 text-white rounded-md px-2 text-xs">
            {Array.from({ length: 12 }).map((_, i) => <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-zinc-400 text-xs">Ano</Label>
          <input type="number" value={year} onChange={e => onYearChange(parseInt(e.target.value) || year)} className="w-full bg-zinc-900 border border-zinc-700 text-white mt-1 h-9 text-xs rounded-md px-3" />
        </div>
        <div>
          <Label className="text-zinc-400 text-xs">Categoria</Label>
          <select value={filterCategory} onChange={e => onCategoryChange(e.target.value)} className="w-full mt-1 h-9 bg-zinc-900 border border-zinc-700 text-white rounded-md px-2 text-xs">
            <option value="">Todas</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-zinc-400 text-xs">Tipo</Label>
          <select value={filterType} onChange={e => onTypeChange(e.target.value)} className="w-full mt-1 h-9 bg-zinc-900 border border-zinc-700 text-white rounded-md px-2 text-xs">
            <option value="">Todos</option>
            {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
    </>
  );
};