import { useState } from 'react';
import api from '../../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { Sparkles, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);

export const CfoSimulator = ({ dashboard }) => {
  const [form, setForm] = useState({ monthly_cost_cut: 0, urgent_collection_boost: 0, horizon_months: 6 });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const runSimulation = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/cfo-virtual/simulator', form);
      setResult(data);
      toast.success('Simulação atualizada');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao simular fôlego financeiro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid="cfo-simulator-section" className="rounded-[28px] border border-zinc-800 bg-zinc-900/60 p-5 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight text-white">Simulador de Fôlego Financeiro</h2>
          <p className="text-sm text-zinc-500 mt-1">Sem fórmulas mágicas: usa margens reais das obras, recebimentos e cortes exequíveis.</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-400">
          Caixa atual: <span data-testid="sim-current-cash" className="font-black text-white">{formatEuro(dashboard?.snapshot?.current_cash)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <Label className="text-xs uppercase tracking-wider text-zinc-500">Corte mensal imediato (€)</Label>
          <Input data-testid="sim-cut-input" type="number" min="0" step="0.01" value={form.monthly_cost_cut} onChange={(e) => setForm(prev => ({ ...prev, monthly_cost_cut: parseFloat(e.target.value) || 0 }))} className="mt-1 border-zinc-700 bg-zinc-950 text-white" />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-zinc-500">Cobrança extra no mês 1 (€)</Label>
          <Input data-testid="sim-collection-input" type="number" min="0" step="0.01" value={form.urgent_collection_boost} onChange={(e) => setForm(prev => ({ ...prev, urgent_collection_boost: parseFloat(e.target.value) || 0 }))} className="mt-1 border-zinc-700 bg-zinc-950 text-white" />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-zinc-500">Horizonte (meses)</Label>
          <Input data-testid="sim-horizon-input" type="number" min="3" max="12" value={form.horizon_months} onChange={(e) => setForm(prev => ({ ...prev, horizon_months: parseInt(e.target.value) || 6 }))} className="mt-1 border-zinc-700 bg-zinc-950 text-white" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="text-xs text-zinc-500 space-y-1">
          <p data-testid="sim-limit-cut">Corte exequível máximo: <span className="text-zinc-300 font-semibold">{formatEuro(result?.limits?.max_cut_feasible || 0)}</span></p>
          <p data-testid="sim-limit-collection">Cobrança urgente máxima: <span className="text-zinc-300 font-semibold">{formatEuro(result?.limits?.max_urgent_collection || dashboard?.snapshot?.urgent_receivables_total || 0)}</span></p>
        </div>
        <Button data-testid="run-simulator-button" onClick={runSimulation} disabled={loading} className="rounded-full bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold">
          <TrendingUp size={16} className="mr-2" /> {loading ? 'A calcular...' : 'Simular cenário'}
        </Button>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Card className="border-zinc-800 bg-zinc-950/60"><CardContent className="pt-5"><p className="text-xs text-zinc-500">Recebimentos base</p><p data-testid="sim-base-receipts" className="text-xl font-black text-emerald-400 mt-1">{formatEuro(result.assumptions?.base_receipts)}</p></CardContent></Card>
            <Card className="border-zinc-800 bg-zinc-950/60"><CardContent className="pt-5"><p className="text-xs text-zinc-500">Saída base</p><p data-testid="sim-base-outflow" className="text-xl font-black text-red-400 mt-1">{formatEuro(result.assumptions?.base_outflow)}</p></CardContent></Card>
            <Card className="border-zinc-800 bg-zinc-950/60"><CardContent className="pt-5"><p className="text-xs text-zinc-500">Margem realizável</p><p data-testid="sim-margin-support" className="text-xl font-black text-yellow-400 mt-1">{formatEuro(result.assumptions?.monthly_margin_realization)}</p></CardContent></Card>
            <Card className="border-zinc-800 bg-zinc-950/60"><CardContent className="pt-5"><p className="text-xs text-zinc-500">Recuperação</p><p data-testid="sim-recovery-window" className="text-xl font-black text-white mt-1">{result.recovery_month === 0 ? 'Já positivo' : result.recovery_month ? `M${result.recovery_month}` : 'Sem viragem'}</p></CardContent></Card>
          </div>

          <div data-testid="simulator-chart" className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={result.projection}>
                <defs>
                  <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#facc15" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#facc15" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#71717a" />
                <YAxis stroke="#71717a" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(value) => formatEuro(value)} contentStyle={{ background: '#09090b', border: '1px solid #27272a', borderRadius: 16 }} />
                <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="5 5" />
                <Area type="monotone" dataKey="ending_cash" stroke="#facc15" fill="url(#cashFill)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div data-testid="sim-commentary" className="rounded-2xl border border-yellow-400/20 bg-yellow-400/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-yellow-400 font-semibold"><Sparkles size={16} /> Leitura do CFO</div>
            <p className="text-white font-semibold">{result.commentary?.verdict}</p>
            <p className="text-sm text-zinc-300">{result.commentary?.recovery_window}</p>
            <ul className="space-y-2 text-sm text-zinc-300">
              {(result.commentary?.non_negotiables || []).map((item, idx) => (
                <li key={`${item}-${idx}`} className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">{item}</li>
              ))}
            </ul>
            <p className="text-xs text-red-300">{result.commentary?.warning}</p>
          </div>
        </div>
      )}
    </div>
  );
};