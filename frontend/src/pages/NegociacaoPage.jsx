import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingDown, TrendingUp, AlertTriangle, Calculator, Euro, Percent, Shield, Target } from 'lucide-react';
import { toast } from 'sonner';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

export default function NegociacaoPage() {
  const [budgets, setBudgets] = useState([]);
  const [selectedBudget, setSelectedBudget] = useState(null);
  const [discountType, setDiscountType] = useState('percentage');
  const [discountValue, setDiscountValue] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchBudgets = useCallback(async () => {
    try { const { data } = await api.get('/budgets'); setBudgets(data); }
    catch (err) { console.error(err.message); }
  }, []);

  useEffect(() => { fetchBudgets(); }, [fetchBudgets]);

  const simulate = async () => {
    if (!selectedBudget) { toast.error('Selecione um orçamento'); return; }
    setLoading(true);
    try {
      const items = (selectedBudget.items || []).map(i => ({
        category: i.category || '', name: i.name || '', quantity: i.quantity || 1,
        unit_cost: i.unit_cost || 0, margin: i.margin || 0, specialty: 'instalacoes_eletricas',
        labor_type: 'eletricista', labor_cost_hour: 0, productivity_min: 20,
        waste_pct: i.waste_pct || 5, supply_type: 'included',
      }));
      const { data } = await api.post('/simulate-negotiation', {
        budget_id: selectedBudget.id,
        original_price: selectedBudget.total_price,
        discount_type: discountType,
        discount_value: discountValue,
        items,
        risk_level: 'medio',
        global_margin: 0,
      });
      setResult(data);
    } catch (err) {
      console.error(err.message);
      toast.error('Erro na simulacao');
    } finally { setLoading(false); }
  };

  return (
    <div data-testid="negociação-page" className="space-y-6">
      <div>
        <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Negociação</h1>
        <p className="text-zinc-400 mt-1 font-medium">Simule descontos e analise o impacto na margem</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
        {/* Input Panel */}
        <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
          <CardContent className="p-6 space-y-5">
            <h3 className="text-lg font-bold text-white flex items-center gap-2"><Calculator size={18} className="text-yellow-400" /> Simulador</h3>

            <div>
              <Label className="text-zinc-300 text-sm">Orçamento</Label>
              <select
                data-testid="neg-budget-select"
                value={selectedBudget?.id || ''}
                onChange={e => setSelectedBudget(budgets.find(b => b.id === e.target.value) || null)}
                className="mt-1 w-full h-10 bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 text-sm"
              >
                <option value="">Selecionar orçamento...</option>
                {budgets.map(b => <option key={b.id} value={b.id}>{b.title} - {b.client_name} ({formatEuro(b.total_price)})</option>)}
              </select>
            </div>

            {selectedBudget && (
              <div className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700">
                <p className="text-xs text-zinc-500 uppercase">Preco Original</p>
                <p className="text-2xl font-black text-yellow-400">{formatEuro(selectedBudget.total_price)}</p>
              </div>
            )}

            <div>
              <Label className="text-zinc-300 text-sm">Tipo de Desconto</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button onClick={() => setDiscountType('percentage')} className={`py-2 rounded-xl text-sm font-medium transition ${discountType === 'percentage' ? 'bg-yellow-400 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                  <Percent size={14} className="inline mr-1" /> Percentagem
                </button>
                <button onClick={() => setDiscountType('value')} className={`py-2 rounded-xl text-sm font-medium transition ${discountType === 'value' ? 'bg-yellow-400 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                  <Euro size={14} className="inline mr-1" /> Valor
                </button>
              </div>
            </div>

            <div>
              <Label className="text-zinc-300 text-sm">Desconto {discountType === 'percentage' ? '(%)' : '(EUR)'}</Label>
              <Input
                data-testid="neg-discount-input"
                type="number" min="0" step="0.5"
                value={discountValue}
                onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                className="mt-1 bg-zinc-800 border-zinc-700 text-white rounded-xl text-lg font-bold"
              />
            </div>

            <Button data-testid="neg-simulate-btn" onClick={simulate} disabled={loading || !selectedBudget} className="w-full bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold h-12">
              {loading ? 'A calcular...' : 'Simular Negociação'}
            </Button>
          </CardContent>
        </Card>

        {/* Results Panel */}
        {result && (
          <div className="space-y-4">
            {/* Alerts */}
            {result.alerts?.length > 0 && (
              <div className="space-y-2">
                {result.alerts.map((a, i) => (
                  <div key={`neg-alert-${i}`} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${a.type === 'danger' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400'}`}>
                    <AlertTriangle size={16} />
                    <p className="text-sm font-medium">{a.msg}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Before vs After */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
                <CardContent className="p-5 text-center">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Preco Original</p>
                  <p className="text-3xl font-black text-white">{formatEuro(result.original_price)}</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
                <CardContent className="p-5 text-center">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Preco Com Desconto</p>
                  <p className={`text-3xl font-black ${result.final_margin_pct >= result.min_margin ? 'text-green-400' : 'text-red-400'}`}>{formatEuro(result.final_price)}</p>
                  <p className="text-sm text-zinc-400 mt-1">-{formatEuro(result.discount_amount)} ({result.discount_pct}%)</p>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Breakdown */}
            <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
              <CardContent className="p-6">
                <h3 className="text-lg font-bold text-white mb-4">Analise Detalhada</h3>
                <div className="space-y-3">
                  <div className="flex justify-between p-3 rounded-xl bg-zinc-800/50"><span className="text-zinc-400 text-sm">Custo direto (material + mao obra)</span><span className="text-white font-medium">{formatEuro(result.total_cost)}</span></div>
                  <div className="flex justify-between p-3 rounded-xl bg-zinc-800/50"><span className="text-zinc-400 text-sm">Custos indiretos</span><span className="text-zinc-300">{formatEuro(result.total_indirect)}</span></div>
                  <div className="flex justify-between p-3 rounded-xl bg-zinc-800/50"><span className="text-zinc-400 text-sm">Provisao de risco</span><span className="text-zinc-300">{formatEuro(result.total_risk)}</span></div>
                  <div className="flex justify-between p-3 rounded-xl bg-zinc-800/50 border border-zinc-700"><span className="text-zinc-300 text-sm font-semibold">Break-even (custo minimo)</span><span className="text-orange-400 font-bold">{formatEuro(result.break_even)}</span></div>
                  <div className="flex justify-between p-3 rounded-xl bg-zinc-800/50 border border-yellow-400/30"><span className="text-zinc-300 text-sm font-semibold">Preco minimo aceitavel (margem {result.min_margin}%)</span><span className="text-yellow-400 font-bold">{formatEuro(result.min_price)}</span></div>
                </div>
              </CardContent>
            </Card>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
                <CardContent className="p-4 text-center">
                  <TrendingUp size={20} className={`mx-auto mb-2 ${result.profit >= 0 ? 'text-green-400' : 'text-red-400'}`} />
                  <p className="text-xs text-zinc-500 uppercase">Lucro</p>
                  <p className={`text-xl font-bold ${result.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatEuro(result.profit)}</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
                <CardContent className="p-4 text-center">
                  <Percent size={20} className={`mx-auto mb-2 ${result.final_margin_pct >= result.min_margin ? 'text-green-400' : 'text-red-400'}`} />
                  <p className="text-xs text-zinc-500 uppercase">Margem Final</p>
                  <p className={`text-xl font-bold ${result.final_margin_pct >= result.min_margin ? 'text-green-400' : 'text-red-400'}`}>{result.final_margin_pct}%</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
                <CardContent className="p-4 text-center">
                  <TrendingDown size={20} className="mx-auto mb-2 text-yellow-400" />
                  <p className="text-xs text-zinc-500 uppercase">Desconto Maximo</p>
                  <p className="text-xl font-bold text-yellow-400">{formatEuro(result.max_discount)}</p>
                  <p className="text-xs text-zinc-500">{result.max_discount_pct}%</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
                <CardContent className="p-4 text-center">
                  <Target size={20} className="mx-auto mb-2 text-cyan-400" />
                  <p className="text-xs text-zinc-500 uppercase">Margem Minima</p>
                  <p className="text-xl font-bold text-cyan-400">{result.min_margin}%</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {!result && (
          <div className="flex items-center justify-center text-zinc-600">
            <div className="text-center">
              <Calculator size={64} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg">Selecione um orçamento e simule o desconto</p>
              <p className="text-sm text-zinc-700 mt-1">Responda: "quanto posso baixar sem perder margem?"</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
