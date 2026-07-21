import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { RefreshCw, Calculator, TrendingUp, Target, Calendar, PiggyBank, AlertTriangle, CheckCircle2, ListChecks, Percent, Euro } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(v || 0));
const fmt2 = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const num = (v) => Number(v) || 0;

// Custos típicos de uma empresa PME em Lisboa (electricidade/telecom)
const CUSTOS_TIPICOS_LISBOA = [
  { cat: 'Instalações', items: [
    { name: 'Renda escritório / armazém', range: '400 – 2 500 €/mês' },
    { name: 'Água', range: '30 – 120 €/mês' },
    { name: 'Electricidade', range: '80 – 400 €/mês' },
    { name: 'Gás (se aplicável)', range: '20 – 80 €/mês' },
    { name: 'Segurança / Alarme', range: '25 – 80 €/mês' },
    { name: 'IMI + condomínio', range: '20 – 150 €/mês' },
  ]},
  { cat: 'Comunicações & IT', items: [
    { name: 'Internet fibra (MEO/NOS/Voda)', range: '35 – 90 €/mês' },
    { name: 'Telemóveis empresa (por linha)', range: '15 – 35 €/linha' },
    { name: 'Software / SaaS (Office, ERP, cloud)', range: '30 – 200 €/mês' },
    { name: 'Website + domínio + email', range: '10 – 40 €/mês' },
  ]},
  { cat: 'Fiscal & Legal', items: [
    { name: 'Contabilidade (TOC)', range: '150 – 500 €/mês' },
    { name: 'Segurança Social patronal', range: '23.75 % do bruto' },
    { name: 'Seguro de Acidentes de Trabalho', range: '~1.5 % do bruto' },
    { name: 'Seguro Responsabilidade Civil', range: '30 – 150 €/mês' },
    { name: 'Advogado / jurídico (avença)', range: '0 – 200 €/mês' },
    { name: 'Certificações (CIVE, Alvará, IEP)', range: '10 – 50 €/mês (rateado)' },
  ]},
  { cat: 'Frota & Deslocação', items: [
    { name: 'Combustível', range: '150 – 800 €/mês/viatura' },
    { name: 'Manutenção viaturas', range: '40 – 150 €/mês/viatura' },
    { name: 'Seguro viaturas', range: '30 – 90 €/mês/viatura' },
    { name: 'Portagens (Via Verde)', range: '20 – 120 €/mês' },
    { name: 'IUC (rateado mensal)', range: '10 – 40 €/mês' },
    { name: 'Renting / leasing carrinha', range: '250 – 600 €/mês' },
  ]},
  { cat: 'Operacional', items: [
    { name: 'Ferramentas / consumíveis', range: '50 – 300 €/mês' },
    { name: 'EPI (Equip. Prot. Individual)', range: '20 – 80 €/mês/funcionário' },
    { name: 'Uniformes', range: '10 – 40 €/mês/funcionário' },
    { name: 'Formação profissional', range: '20 – 100 €/mês' },
    { name: 'Marketing (Google/Meta Ads)', range: '50 – 500 €/mês' },
    { name: 'Comissões bancárias + TPA', range: '20 – 80 €/mês' },
  ]},
];

export default function PontoEquilibrioPage() {
  const [loading, setLoading] = useState(true);
  const [prefill, setPrefill] = useState(null);

  // Custos base (editáveis)
  const [fixedCosts, setFixedCosts] = useState(0);
  const [payroll, setPayroll] = useState(0);
  const [variableExpenses, setVariableExpenses] = useState(0);
  const [extraFixed, setExtraFixed] = useState(0);

  // Custos variáveis por obra
  const [varMode, setVarMode] = useState('percent'); // 'percent' | 'fixed' | 'both'
  const [varPercent, setVarPercent] = useState(35);
  const [varFixed, setVarFixed] = useState(0);

  // Objectivo de lucro
  const [profitMode, setProfitMode] = useState('percent'); // 'percent' | 'value'
  const [profitPercent, setProfitPercent] = useState(20);
  const [profitValue, setProfitValue] = useState(3000);

  // Impostos
  const [includeVAT, setIncludeVAT] = useState(true);
  const [vatRate, setVatRate] = useState(23);
  const [includeIRC, setIncludeIRC] = useState(true);
  const [ircRate, setIrcRate] = useState(21);

  const fetchPrefill = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/finance/breakeven/prefill');
      setPrefill(data);
      setFixedCosts(data.fixed_costs_monthly);
      setPayroll(data.payroll_monthly_avg);
      setVariableExpenses(data.variable_expenses_monthly_avg);
    } catch (err) {
      console.debug('[breakeven] prefill failed:', err?.message);
      toast.error('Erro ao carregar dados históricos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPrefill(); }, [fetchPrefill]);

  // === CÁLCULOS ===
  const calc = useMemo(() => {
    const totalFixed = num(fixedCosts) + num(payroll) + num(extraFixed);
    // Componente fixa das despesas variáveis (média das variáveis + varFixed)
    const fixedishVar = num(variableExpenses) + (varMode !== 'percent' ? num(varFixed) : 0);
    const vPct = (varMode !== 'fixed' ? num(varPercent) : 0) / 100;

    // Custos totais fixos "reais"
    const F = totalFixed + fixedishVar;

    // Ponto de equilíbrio: Faturação × (1 - v%) = F  =>  BE = F / (1 - v%)
    const denom = 1 - vPct;
    const breakEven = denom > 0 ? F / denom : F;

    // Lucro desejado
    let target;
    if (profitMode === 'value') {
      target = denom > 0 ? (F + num(profitValue)) / denom : F + num(profitValue);
    } else {
      // Se lucro é % sobre faturação: Faturação × (1 - v% - lucro%) = F
      const totalMargin = 1 - vPct - num(profitPercent) / 100;
      target = totalMargin > 0 ? F / totalMargin : Infinity;
    }

    // Impostos aplicados sobre o alvo
    const vatLiquid = includeVAT ? target * (num(vatRate) / 100) : 0;
    const grossProfit = target - F - (target * vPct);
    const ircDue = includeIRC ? Math.max(0, grossProfit) * (num(ircRate) / 100) : 0;
    const netProfit = grossProfit - ircDue;

    // Repartições
    const wDays = prefill?.working_days_month || 22;
    const perDay = target / wDays;
    const perWeek = target / 4.33;
    const perHour = perDay / 8;

    // Progresso vs meta
    const revenue = num(prefill?.current_month_revenue);
    const progress = target > 0 && isFinite(target) ? Math.min(100, (revenue / target) * 100) : 0;
    const elapsed = prefill?.working_days_elapsed || 0;
    const expectedByNow = target * (elapsed / wDays);
    const pace = expectedByNow > 0 ? (revenue / expectedByNow) * 100 : 0;

    return {
      totalFixed: F, breakEven, target: isFinite(target) ? target : 0,
      vatLiquid, ircDue, grossProfit, netProfit,
      perDay, perWeek, perHour,
      progress, revenue, expectedByNow, pace,
      wDays, elapsed,
      warning: !isFinite(target) || target <= 0 ? 'A margem desejada é impossível com os custos variáveis actuais. Reduza a % variável ou o lucro desejado.' : null,
    };
  }, [fixedCosts, payroll, extraFixed, variableExpenses, varMode, varPercent, varFixed, profitMode, profitPercent, profitValue, includeVAT, vatRate, includeIRC, ircRate, prefill]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96" data-testid="breakeven-loading">
        <div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="ponto-equilibrio-page" translate="no">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white flex items-center gap-3">
            <Calculator className="h-8 w-8 text-yellow-400" />
            Ponto de Equilíbrio
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">
            Descubra quanto precisa de faturar por mês para cobrir custos e gerar lucro real.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPrefill} data-testid="refresh-prefill-btn"
          className="border-zinc-700 text-zinc-200 hover:bg-zinc-800">
          <RefreshCw className="h-4 w-4 mr-2" /> Recarregar médias
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ========== ESQUERDA: INPUTS ========== */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Euro className="h-4 w-4 text-yellow-400" /> Custos Mensais Fixos
              </CardTitle>
              <p className="text-xs text-zinc-500">Pré-preenchidos com média dos últimos 3 meses. Edite se quiser.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-zinc-400">Custos Fixos (renda, seguros, contabilidade…)</Label>
                <Input type="number" value={fixedCosts} onChange={(e) => setFixedCosts(e.target.value)}
                  data-testid="input-fixed-costs" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Salários + TSU patronal (23.75%)</Label>
                <Input type="number" value={payroll} onChange={(e) => setPayroll(e.target.value)}
                  data-testid="input-payroll" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Despesas variáveis (média mensal)</Label>
                <Input type="number" value={variableExpenses} onChange={(e) => setVariableExpenses(e.target.value)}
                  data-testid="input-variable-expenses" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Outros custos fixos (opcional)</Label>
                <Input type="number" value={extraFixed} onChange={(e) => setExtraFixed(e.target.value)}
                  data-testid="input-extra-fixed" placeholder="0" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Percent className="h-4 w-4 text-yellow-400" /> Custos Variáveis por Obra
              </CardTitle>
              <p className="text-xs text-zinc-500">Materiais + subcontratação. Escolha o modo mais realista.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Tabs value={varMode} onValueChange={setVarMode}>
                <TabsList className="bg-zinc-950 border border-zinc-800 grid grid-cols-3 w-full">
                  <TabsTrigger value="percent" data-testid="tab-var-percent" className="text-xs">% s/ vendas</TabsTrigger>
                  <TabsTrigger value="fixed" data-testid="tab-var-fixed" className="text-xs">€ fixo/mês</TabsTrigger>
                  <TabsTrigger value="both" data-testid="tab-var-both" className="text-xs">Ambos</TabsTrigger>
                </TabsList>
                <TabsContent value="percent" className="mt-3">
                  <Label className="text-xs text-zinc-400">% do faturado que vai para materiais/subs</Label>
                  <Input type="number" value={varPercent} onChange={(e) => setVarPercent(e.target.value)}
                    data-testid="input-var-percent" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
                  <p className="text-[11px] text-zinc-500 mt-1">Típico em electrotecnia: 30–50 %.</p>
                </TabsContent>
                <TabsContent value="fixed" className="mt-3">
                  <Label className="text-xs text-zinc-400">Custo variável estimado por mês (€)</Label>
                  <Input type="number" value={varFixed} onChange={(e) => setVarFixed(e.target.value)}
                    data-testid="input-var-fixed" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
                </TabsContent>
                <TabsContent value="both" className="mt-3 space-y-2">
                  <div>
                    <Label className="text-xs text-zinc-400">% variável sobre vendas</Label>
                    <Input type="number" value={varPercent} onChange={(e) => setVarPercent(e.target.value)}
                      data-testid="input-var-percent-both" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400">+ € fixo mensal adicional</Label>
                    <Input type="number" value={varFixed} onChange={(e) => setVarFixed(e.target.value)}
                      data-testid="input-var-fixed-both" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Target className="h-4 w-4 text-yellow-400" /> Objectivo de Lucro
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Tabs value={profitMode} onValueChange={setProfitMode}>
                <TabsList className="bg-zinc-950 border border-zinc-800 grid grid-cols-2 w-full">
                  <TabsTrigger value="percent" data-testid="tab-profit-percent" className="text-xs">% s/ vendas</TabsTrigger>
                  <TabsTrigger value="value" data-testid="tab-profit-value" className="text-xs">€ fixo/mês</TabsTrigger>
                </TabsList>
                <TabsContent value="percent" className="mt-3">
                  <Label className="text-xs text-zinc-400">% de lucro líquido pretendido</Label>
                  <Input type="number" value={profitPercent} onChange={(e) => setProfitPercent(e.target.value)}
                    data-testid="input-profit-percent" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
                </TabsContent>
                <TabsContent value="value" className="mt-3">
                  <Label className="text-xs text-zinc-400">Lucro €/mês desejado</Label>
                  <Input type="number" value={profitValue} onChange={(e) => setProfitValue(e.target.value)}
                    data-testid="input-profit-value" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white">Impostos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-zinc-300">IVA {vatRate}%</Label>
                <Switch checked={includeVAT} onCheckedChange={setIncludeVAT} data-testid="switch-vat" />
              </div>
              {includeVAT && (
                <Input type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)}
                  data-testid="input-vat-rate" className="bg-zinc-950 border-zinc-700 text-white h-8 text-sm" />
              )}
              <div className="flex items-center justify-between">
                <Label className="text-xs text-zinc-300">IRC {ircRate}%</Label>
                <Switch checked={includeIRC} onCheckedChange={setIncludeIRC} data-testid="switch-irc" />
              </div>
              {includeIRC && (
                <Input type="number" value={ircRate} onChange={(e) => setIrcRate(e.target.value)}
                  data-testid="input-irc-rate" className="bg-zinc-950 border-zinc-700 text-white h-8 text-sm" />
              )}
              <p className="text-[11px] text-zinc-500">17% até 25 000 € de lucro; 21% acima. Aqui usa taxa única simplificada.</p>
            </CardContent>
          </Card>
        </div>

        {/* ========== DIREITA: RESULTADOS ========== */}
        <div className="lg:col-span-3 space-y-4">
          {calc.warning && (
            <div className="p-4 rounded-lg bg-red-950/40 border border-red-800 flex items-start gap-3" data-testid="warning-msg">
              <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-200">{calc.warning}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-gradient-to-br from-zinc-900 to-zinc-900 border-zinc-700">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                  <TrendingUp className="h-3.5 w-3.5" /> PONTO DE EQUILÍBRIO
                </div>
                <div className="text-3xl font-bold text-white" data-testid="kpi-breakeven">{fmt(calc.breakEven)}</div>
                <p className="text-xs text-zinc-500 mt-1">Faturação mínima para não ter prejuízo.</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-yellow-500/10 to-zinc-900 border-yellow-500/40">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-yellow-400 text-xs mb-1">
                  <Target className="h-3.5 w-3.5" /> META COM LUCRO
                </div>
                <div className="text-3xl font-bold text-yellow-400" data-testid="kpi-target">{fmt(calc.target)}</div>
                <p className="text-xs text-zinc-400 mt-1">Faturação ideal para atingir o lucro pretendido.</p>
              </CardContent>
            </Card>
          </div>

          {/* Progresso vs meta */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-yellow-400" /> Progresso deste mês
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Faturado até agora</span>
                <span className="text-white font-semibold" data-testid="progress-revenue">{fmt2(calc.revenue)}</span>
              </div>
              <Progress value={calc.progress} className="h-3 bg-zinc-800" />
              <div className="flex justify-between text-xs text-zinc-500">
                <span>{calc.progress.toFixed(1)}% da meta</span>
                <span>Meta: {fmt(calc.target)}</span>
              </div>
              <div className="pt-2 border-t border-zinc-800 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-zinc-500">Esperado até agora</p>
                  <p className="text-white font-medium">{fmt2(calc.expectedByNow)}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Ritmo</p>
                  <p className={`font-medium flex items-center gap-1 ${calc.pace >= 100 ? 'text-emerald-400' : calc.pace >= 80 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {calc.pace >= 100 ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    {calc.pace.toFixed(0)}%
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-zinc-500">
                {calc.elapsed} de {calc.wDays} dias úteis passados.
              </p>
            </CardContent>
          </Card>

          {/* Repartição */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Calendar className="h-4 w-4 text-yellow-400" /> Quanto por período (com base na meta)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-zinc-500">Por semana</p>
                  <p className="text-xl font-bold text-white" data-testid="per-week">{fmt(calc.perWeek)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Por dia útil</p>
                  <p className="text-xl font-bold text-white" data-testid="per-day">{fmt(calc.perDay)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Por hora (8h)</p>
                  <p className="text-xl font-bold text-white" data-testid="per-hour">{fmt(calc.perHour)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Impostos */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <PiggyBank className="h-4 w-4 text-yellow-400" /> Impacto Fiscal (na meta)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-xs text-zinc-500">Meta bruta</p>
                  <p className="text-base font-bold text-white">{fmt(calc.target)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">IVA a entregar</p>
                  <p className="text-base font-bold text-orange-400" data-testid="tax-vat">{fmt(calc.vatLiquid)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">IRC devido</p>
                  <p className="text-base font-bold text-orange-400" data-testid="tax-irc">{fmt(calc.ircDue)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Lucro líquido</p>
                  <p className="text-base font-bold text-emerald-400" data-testid="net-profit">{fmt(calc.netProfit)}</p>
                </div>
              </div>
              <p className="text-[11px] text-zinc-500 mt-3">
                IVA é neutro (recuperável). IRC incide sobre o lucro contabilístico. Valores indicativos.
              </p>
            </CardContent>
          </Card>

          {/* Checklist de custos típicos em Lisboa */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-yellow-400" /> Checklist: custos típicos de PME em Lisboa
              </CardTitle>
              <p className="text-xs text-zinc-500">Consulte para se lembrar de custos que possa ter esquecido.</p>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {CUSTOS_TIPICOS_LISBOA.map((grp) => (
                  <AccordionItem key={grp.cat} value={grp.cat} className="border-zinc-800">
                    <AccordionTrigger className="text-sm text-zinc-200 hover:no-underline" data-testid={`accordion-${grp.cat}`}>
                      {grp.cat}
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="space-y-1.5 text-xs">
                        {grp.items.map((it) => (
                          <li key={it.name} className="flex items-center justify-between border-b border-zinc-800/60 py-1.5">
                            <span className="text-zinc-300">{it.name}</span>
                            <span className="text-zinc-500 font-mono">{it.range}</span>
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
