import { useState, useMemo, useRef, useEffect } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { BrainCircuit, UserPlus, ArrowLeftRight, Users, TrendingUp, Scale, Building2, Send, Sparkles, Info, MessageSquare, RefreshCw, HandCoins } from 'lucide-react';
import { toast } from 'sonner';
import {
  simulaContratacao, brutoParaLiquido, liquidoParaBruto, clteVsIndependente,
  calcIRC, calcIndemnizacao, calcAumento,
} from '../lib/ptTax';

const fmt = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(v || 0));
const fmt2 = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const pct = (v) => `${((v || 0) * 100).toFixed(1)}%`;

// ---- Row helper ----
const Row = ({ label, value, hint, highlight, danger, success }) => (
  <div className={`flex items-center justify-between py-2 border-b border-zinc-800/50 ${highlight ? 'bg-yellow-500/10 px-2 rounded' : ''}`}>
    <div>
      <p className={`text-sm ${highlight ? 'text-yellow-300 font-medium' : 'text-zinc-300'}`}>{label}</p>
      {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
    </div>
    <p className={`text-sm font-mono font-semibold ${danger ? 'text-red-400' : success ? 'text-emerald-400' : highlight ? 'text-yellow-300' : 'text-white'}`}>
      {value}
    </p>
  </div>
);

// =====================================================
// TAB 1 — Simulador de Contratação
// =====================================================
function SimuladorContratacao() {
  const [bruto, setBruto] = useState(1200);
  const [subAlim, setSubAlim] = useState(6);
  const [subAlimCartao, setSubAlimCartao] = useState(true);
  const [premios, setPremios] = useState(0);
  const [seguroAT, setSeguroAT] = useState(1.75);

  const sim = useMemo(() => simulaContratacao({
    salarioBrutoMensal: bruto,
    subsidioAlimentacaoDia: subAlim,
    subAlimCartao,
    premiosMensais: premios,
    seguroATPct: (Number(seguroAT) || 0) / 100,
  }), [bruto, subAlim, subAlimCartao, premios, seguroAT]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Inputs */}
      <Card className="lg:col-span-2 bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-base text-white flex items-center gap-2"><UserPlus className="h-4 w-4 text-yellow-400" /> Dados da Contratação</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-zinc-400">Salário Bruto Mensal (€)</Label>
            <Input type="number" value={bruto} onChange={(e) => setBruto(e.target.value)}
              data-testid="hire-bruto" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Sub. Alimentação / dia (€)</Label>
            <Input type="number" value={subAlim} onChange={(e) => setSubAlim(e.target.value)}
              data-testid="hire-subalim" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-zinc-300">Sub. Alim em cartão? (isento até 6€/dia)</Label>
            <Switch checked={subAlimCartao} onCheckedChange={setSubAlimCartao} data-testid="hire-subalim-cartao" />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Prémios mensais estimados (€)</Label>
            <Input type="number" value={premios} onChange={(e) => setPremios(e.target.value)}
              data-testid="hire-premios" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Taxa Seguro Acidentes Trabalho (%)</Label>
            <Input type="number" step="0.1" value={seguroAT} onChange={(e) => setSeguroAT(e.target.value)}
              data-testid="hire-seguro-at" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
            <p className="text-[11px] text-zinc-500 mt-1">Típico: 1.5–2.5% (electrotecnia)</p>
          </div>
        </CardContent>
      </Card>

      {/* Resultado principal */}
      <div className="lg:col-span-3 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="bg-gradient-to-br from-zinc-900 to-zinc-900 border-zinc-700">
            <CardContent className="pt-6">
              <p className="text-xs text-zinc-500">Trabalhador recebe (líquido/mês)</p>
              <p className="text-2xl font-bold text-emerald-400" data-testid="hire-liquido">{fmt(sim.liquidoMensalTotal)}</p>
              <p className="text-[11px] text-zinc-500 mt-1">Já com sub. alim.</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-zinc-900 to-zinc-900 border-zinc-700">
            <CardContent className="pt-6">
              <p className="text-xs text-zinc-500">Salário Bruto (na folha)</p>
              <p className="text-2xl font-bold text-white">{fmt(sim.salarioBrutoMensal)}</p>
              <p className="text-[11px] text-zinc-500 mt-1">Contrato mostra este valor.</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-yellow-500/10 to-zinc-900 border-yellow-500/40">
            <CardContent className="pt-6">
              <p className="text-xs text-yellow-400">CUSTO REAL EMPRESA (média/mês)</p>
              <p className="text-2xl font-bold text-yellow-400" data-testid="hire-custo">{fmt(sim.custoMensalMedio)}</p>
              <p className="text-[11px] text-zinc-400 mt-1">= {sim.ratioBrutoCusto.toFixed(2)}× o bruto</p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-white">Detalhe Anual (14 salários + benefícios)</CardTitle></CardHeader>
          <CardContent className="space-y-0">
            <Row label="Salário anual base (× 12)" value={fmt2(sim.salarioAnualBase)} />
            <Row label="Sub. Natal + Sub. Férias (× 2)" value={fmt2(sim.subsidios)} />
            {sim.premios > 0 && <Row label="Prémios anuais" value={fmt2(sim.premios)} />}
            <Row label="Salário anual bruto TOTAL" value={fmt2(sim.salarioAnualBruto)} highlight />
            <Row label="TSU Patronal (23.75%)" value={fmt2(sim.tsuPatronalAnual)} danger hint="Segurança Social a cargo da empresa" />
            <Row label={`Seguro Acidentes Trabalho (${seguroAT}%)`} value={fmt2(sim.seguroATAnual)} danger />
            <Row label="FCT + FGCT (1%)" value={fmt2(sim.fctFgctAnual)} danger hint="Fundo de Compensação" />
            <Row label="Sub. Alimentação anual" value={fmt2(sim.subAlimAnual)} hint="Líquido, entregue ao trabalhador" />
            {sim.tsuSubAlimExcesso > 0 && <Row label="TSU s/ excesso sub. alim." value={fmt2(sim.tsuSubAlimExcesso)} danger />}
            <Row label="Medicina do Trabalho (rateio)" value={fmt2(sim.medicinaAnual)} danger />
            <Row label="CUSTO TOTAL ANUAL EMPRESA" value={fmt2(sim.custoTotalAnual)} highlight />
            <div className="pt-3 mt-2 border-t border-zinc-700 grid grid-cols-2 gap-3 text-center">
              <div>
                <p className="text-[11px] text-zinc-500">Custo por hora efectiva</p>
                <p className="text-lg font-bold text-yellow-400">{fmt2(sim.custoHora)}</p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Ratio Custo/Líquido</p>
                <p className="text-lg font-bold text-yellow-400">{sim.ratioLiquidoCusto.toFixed(2)}×</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-white">Detalhe do Trabalhador</CardTitle></CardHeader>
          <CardContent>
            <Row label="Bruto anual (com subsídios)" value={fmt2(sim.salarioAnualBase + sim.subsidios + sim.premios)} />
            <Row label="TSU Trabalhador (11%)" value={fmt2(sim.tsuTrabAnual)} danger />
            <Row label="IRS anual (retido)" value={fmt2(sim.irsAnual)} danger />
            <Row label="Líquido ANUAL (sem sub. alim.)" value={fmt2(sim.liquidoAnual)} success />
            <Row label="Líquido MENSAL (÷ 14)" value={fmt2(sim.liquidoMensal)} success />
            <Row label="+ Sub. Alimentação/mês" value={fmt2(subAlim * 22)} success />
            <Row label="LÍQUIDO TOTAL MENSAL" value={fmt2(sim.liquidoMensalTotal)} highlight />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =====================================================
// TAB 2 — Líquido ↔ Bruto
// =====================================================
function LiquidoBruto() {
  const [mode, setMode] = useState('bruto2liq'); // 'bruto2liq' | 'liq2bruto'
  const [valor, setValor] = useState(1000);
  const [dep, setDep] = useState(0);

  const res = useMemo(() => {
    if (mode === 'bruto2liq') return brutoParaLiquido(valor, dep);
    return liquidoParaBruto(valor, dep);
  }, [mode, valor, dep]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl mx-auto">
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-base text-white flex items-center gap-2"><ArrowLeftRight className="h-4 w-4 text-yellow-400" /> Conversor Bruto ↔ Líquido</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="bg-zinc-950 border border-zinc-800 grid grid-cols-2 w-full">
              <TabsTrigger value="bruto2liq" data-testid="tab-bruto2liq" className="text-xs">Bruto → Líquido</TabsTrigger>
              <TabsTrigger value="liq2bruto" data-testid="tab-liq2bruto" className="text-xs">Líquido → Bruto</TabsTrigger>
            </TabsList>
          </Tabs>
          <div>
            <Label className="text-xs text-zinc-400">
              {mode === 'bruto2liq' ? 'Bruto mensal (€)' : 'Líquido mensal desejado (€)'}
            </Label>
            <Input type="number" value={valor} onChange={(e) => setValor(e.target.value)}
              data-testid="lb-valor" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Nº Dependentes</Label>
            <Input type="number" value={dep} onChange={(e) => setDep(e.target.value)}
              data-testid="lb-dep" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
          </div>
          <p className="text-[11px] text-zinc-500 flex gap-1 items-start">
            <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
            Escalões IRS 2026 Continente; 14 salários/ano; sem sub. alimentação.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-base text-white">Resultado</CardTitle></CardHeader>
        <CardContent>
          <Row label="Bruto mensal" value={fmt(res.brutoMensal)} highlight={mode === 'liq2bruto'} />
          <Row label="Bruto anual (× 14)" value={fmt(res.brutoAnual)} />
          <Row label="TSU Trabalhador (11%)" value={fmt(res.tsuTrabalhadorAnual)} danger />
          <Row label="IRS anual" value={fmt(res.irsAnual)} danger />
          <Row label="Líquido anual" value={fmt(res.liquidoAnual)} success />
          <Row label="Líquido MENSAL" value={fmt(res.liquidoMensal)} highlight={mode === 'bruto2liq'} success />
          <Row label="Taxa efectiva total" value={pct(res.taxaEfetiva)} hint="IRS + TSU trabalhador" />
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================
// TAB 3 — CLT vs Recibo Verde
// =====================================================
function CltVsRV() {
  const [custo, setCusto] = useState(2000);
  const res = useMemo(() => clteVsIndependente({ custoMensalEmpresa: custo }), [custo]);

  return (
    <div className="space-y-4">
      <Card className="bg-zinc-900 border-zinc-800 max-w-2xl mx-auto">
        <CardContent className="pt-6 space-y-3">
          <Label className="text-sm text-zinc-300">Quanto quer gastar por mês (custo total empresa)?</Label>
          <Input type="number" value={custo} onChange={(e) => setCusto(e.target.value)}
            data-testid="rv-custo" className="bg-zinc-950 border-zinc-700 text-white text-lg" />
          <p className="text-[11px] text-zinc-500">Vamos calcular quanto líquido a pessoa recebe em cada cenário.</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-zinc-900 border-blue-500/40">
          <CardHeader><CardTitle className="text-base text-blue-400 flex items-center gap-2"><Users className="h-4 w-4" /> Contrato de Trabalho (CLT)</CardTitle></CardHeader>
          <CardContent>
            <Row label="Bruto mensal necessário" value={fmt(res.clt.brutoMensal)} />
            <Row label="Custo anual empresa" value={fmt(res.clt.custoAnualEmpresa)} />
            <Row label="Líquido mensal ao trabalhador" value={fmt(res.clt.liquidoMensal)} success highlight />
            <Row label="Líquido anual" value={fmt(res.clt.liquidoAnual)} />
            <p className="text-[11px] text-zinc-500 mt-3">✅ Segurança Social + Sub. Férias + Sub. Natal + Sub. Alim.</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-purple-500/40">
          <CardHeader><CardTitle className="text-base text-purple-400 flex items-center gap-2"><Building2 className="h-4 w-4" /> Recibo Verde (Independente)</CardTitle></CardHeader>
          <CardContent>
            <Row label="Fee mensal a pagar" value={fmt(res.rv.feeMensal)} />
            <Row label="Fee anual" value={fmt(res.rv.feeAnual)} />
            <Row label="IRS retido (25%)" value={fmt(res.rv.irsRetido)} danger hint="Empresa retém e entrega ao Estado" />
            <Row label="IRS real anual (regime simpl. 75%)" value={fmt(res.rv.irsRealAnual)} danger />
            <Row label="TSU Independente (21.4%)" value={fmt(res.rv.tsuIndep)} danger hint="Pago pelo trabalhador" />
            <Row label="Líquido mensal recebido" value={fmt(res.rv.liquidoMensal)} success highlight />
            <p className="text-[11px] text-zinc-500 mt-3">⚠️ Sem segurança social, sem férias pagas, sem sub. Natal.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-yellow-500/5 border-yellow-500/30 max-w-3xl mx-auto">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Scale className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-yellow-400">Recomendação</p>
              <p className="text-xs text-zinc-300 mt-1">{res.recomendacao}</p>
              <p className="text-[11px] text-zinc-500 mt-2">
                Diferença de líquido: <span className={res.diferencaLiquidoMensal > 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {res.diferencaLiquidoMensal > 0 ? '+' : ''}{fmt(res.diferencaLiquidoMensal)}/mês
                </span> a favor do Recibo Verde.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================
// TAB 4 — Extras (IRC, Aumento, Indemnização)
// =====================================================
function Extras() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <IRCCalc />
      <AumentoCalc />
      <IndemnizacaoCalc />
    </div>
  );
}

function IRCCalc() {
  const [lucro, setLucro] = useState(30000);
  const [derrama, setDerrama] = useState(1.5);
  const res = useMemo(() => calcIRC(lucro, (Number(derrama) || 0) / 100), [lucro, derrama]);
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader><CardTitle className="text-sm text-white flex items-center gap-2"><Building2 className="h-4 w-4 text-yellow-400" /> IRC Empresa</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs text-zinc-400">Lucro tributável anual (€)</Label>
          <Input type="number" value={lucro} onChange={(e) => setLucro(e.target.value)}
            data-testid="irc-lucro" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
        </div>
        <div>
          <Label className="text-xs text-zinc-400">Derrama Municipal (%)</Label>
          <Input type="number" step="0.1" value={derrama} onChange={(e) => setDerrama(e.target.value)}
            data-testid="irc-derrama" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
          <p className="text-[11px] text-zinc-500 mt-1">Lisboa: 1.5%</p>
        </div>
        <div className="pt-2 border-t border-zinc-800">
          <Row label="IRC base (17% até 25k / 21% acima)" value={fmt(res.ircBase)} danger />
          <Row label="Derrama municipal" value={fmt(res.derrama)} danger />
          <Row label="TOTAL a pagar" value={fmt(res.total)} highlight />
          <Row label="Taxa efectiva" value={pct(res.taxaEfetiva)} />
          <Row label="Lucro após imposto" value={fmt(res.lucroAposImposto)} success />
        </div>
      </CardContent>
    </Card>
  );
}

function AumentoCalc() {
  const [antes, setAntes] = useState(1000);
  const [depois, setDepois] = useState(1200);
  const res = useMemo(() => calcAumento({ brutoActual: antes, brutoNovo: depois }), [antes, depois]);
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader><CardTitle className="text-sm text-white flex items-center gap-2"><TrendingUp className="h-4 w-4 text-yellow-400" /> Simulador de Aumento</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs text-zinc-400">Bruto actual (€)</Label>
          <Input type="number" value={antes} onChange={(e) => setAntes(e.target.value)}
            data-testid="aum-antes" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
        </div>
        <div>
          <Label className="text-xs text-zinc-400">Bruto novo (€)</Label>
          <Input type="number" value={depois} onChange={(e) => setDepois(e.target.value)}
            data-testid="aum-depois" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
        </div>
        <div className="pt-2 border-t border-zinc-800">
          <Row label="Aumento bruto/ano" value={fmt(res.aumentoBrutoAnual)} />
          <Row label="Custo extra empresa/ano" value={fmt(res.aumentoCustoAnualEmpresa)} danger />
          <Row label="Líquido extra trabalhador/ano" value={fmt(res.aumentoLiquidoAnual)} success />
          <Row label="Custo empresa / € líquido" value={`${res.custoEmpresaPorEuroLiquido.toFixed(2)}×`} highlight
            hint="Quanto paga por cada € extra líquido que ele recebe" />
        </div>
      </CardContent>
    </Card>
  );
}

function IndemnizacaoCalc() {
  const [sal, setSal] = useState(1200);
  const [anos, setAnos] = useState(3);
  const res = useMemo(() => calcIndemnizacao({ salarioBrutoMensal: sal, anosAntiguidade: anos }), [sal, anos]);
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader><CardTitle className="text-sm text-white flex items-center gap-2"><HandCoins className="h-4 w-4 text-yellow-400" /> Indemnização</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs text-zinc-400">Salário bruto mensal (€)</Label>
          <Input type="number" value={sal} onChange={(e) => setSal(e.target.value)}
            data-testid="ind-sal" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
        </div>
        <div>
          <Label className="text-xs text-zinc-400">Anos de antiguidade</Label>
          <Input type="number" value={anos} onChange={(e) => setAnos(e.target.value)}
            data-testid="ind-anos" className="bg-zinc-950 border-zinc-700 text-white mt-1" />
        </div>
        <div className="pt-2 border-t border-zinc-800">
          <Row label="Indemnização base" value={fmt(res.indemnizacaoBase)} />
          <Row label="Teto (12 salários)" value={fmt(res.teto12sal)} />
          <Row label="A PAGAR" value={fmt(res.indemnizacao)} highlight />
          <p className="text-[11px] text-zinc-500 mt-2">
            Art.º 366 CT — 14 dias/ano de antiguidade (contratos após Out/2013).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================
// TAB 5 — Chat IA Contabilista
// =====================================================
function ChatContabilista() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Olá! Sou o seu Contabilista IA. Posso responder a dúvidas sobre IRS, IRC, IVA, contratação, deduções, TSU, indemnizações e outras questões fiscais portuguesas. Pergunte-me o que precisar.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setInput('');
    setLoading(true);
    try {
      const { data } = await api.post('/contabilista/chat', {
        session_id: sessionId,
        message: q,
        history: messages.slice(-6),
      });
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || 'Erro desconhecido';
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${msg}` }]);
      toast.error('Falha no chat IA');
    } finally { setLoading(false); }
  };

  const suggestions = [
    "Como funciona o IRC para PME em 2026?",
    "Posso deduzir combustível e portagens?",
    "IVA reverse charge em obras de construção?",
    "Como calcular sub. férias de trabalhador com 6 meses?",
    "Diferença entre despedimento coletivo e justa causa?",
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-3">
      <Card className="bg-zinc-900 border-zinc-800 h-[550px] flex flex-col">
        <CardHeader className="pb-2 border-b border-zinc-800">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-yellow-400" /> Chat com o Contabilista IA
            <Badge variant="outline" className="ml-auto border-yellow-500/40 text-yellow-400 text-[10px]">Gemini 3.1</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto py-4 space-y-3" data-testid="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-yellow-500 text-zinc-900 rounded-br-sm'
                  : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-zinc-800 rounded-2xl px-4 py-2.5">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </CardContent>
        <div className="border-t border-zinc-800 p-3 space-y-2">
          <div className="flex flex-wrap gap-1">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => setInput(s)} data-testid={`suggestion-${i}`}
                className="text-[10px] px-2 py-1 rounded-full border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-yellow-400 transition-colors">
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
              placeholder="Faça uma pergunta ao contabilista IA..."
              data-testid="chat-input"
              disabled={loading}
              className="bg-zinc-950 border-zinc-700 text-white flex-1"
            />
            <Button onClick={send} disabled={loading || !input.trim()} data-testid="chat-send"
              className="bg-yellow-500 hover:bg-yellow-400 text-zinc-900">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// =====================================================
// PÁGINA PRINCIPAL
// =====================================================
export default function ContabilistaPage() {
  const [tab, setTab] = useState('contratacao');

  return (
    <div className="space-y-5" data-testid="contabilista-page" translate="no">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white flex items-center gap-3">
            <BrainCircuit className="h-8 w-8 text-yellow-400" />
            Contabilista IA
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">
            Simuladores fiscais PT 2026 + assistente de IA especializado em contabilidade portuguesa.
          </p>
        </div>
        <Badge variant="outline" className="border-yellow-500/40 text-yellow-400 gap-1">
          <Sparkles className="h-3 w-3" /> Ano fiscal 2026
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800 grid grid-cols-2 md:grid-cols-5 w-full h-auto p-1">
          <TabsTrigger value="contratacao" data-testid="tab-contratacao" className="text-xs data-[state=active]:bg-yellow-500 data-[state=active]:text-zinc-900">
            <UserPlus className="h-3.5 w-3.5 mr-1" /> Contratação
          </TabsTrigger>
          <TabsTrigger value="liquidobruto" data-testid="tab-liquidobruto" className="text-xs data-[state=active]:bg-yellow-500 data-[state=active]:text-zinc-900">
            <ArrowLeftRight className="h-3.5 w-3.5 mr-1" /> Bruto ↔ Líquido
          </TabsTrigger>
          <TabsTrigger value="cltrv" data-testid="tab-cltrv" className="text-xs data-[state=active]:bg-yellow-500 data-[state=active]:text-zinc-900">
            <Scale className="h-3.5 w-3.5 mr-1" /> CLT vs RV
          </TabsTrigger>
          <TabsTrigger value="extras" data-testid="tab-extras" className="text-xs data-[state=active]:bg-yellow-500 data-[state=active]:text-zinc-900">
            <TrendingUp className="h-3.5 w-3.5 mr-1" /> IRC / Aumento / Ind.
          </TabsTrigger>
          <TabsTrigger value="chat" data-testid="tab-chat" className="text-xs data-[state=active]:bg-yellow-500 data-[state=active]:text-zinc-900">
            <MessageSquare className="h-3.5 w-3.5 mr-1" /> Chat IA
          </TabsTrigger>
        </TabsList>

        <div className="mt-5">
          <TabsContent value="contratacao"><SimuladorContratacao /></TabsContent>
          <TabsContent value="liquidobruto"><LiquidoBruto /></TabsContent>
          <TabsContent value="cltrv"><CltVsRV /></TabsContent>
          <TabsContent value="extras"><Extras /></TabsContent>
          <TabsContent value="chat"><ChatContabilista /></TabsContent>
        </div>
      </Tabs>

      <div className="pt-4 border-t border-zinc-800 text-[11px] text-zinc-500 flex items-start gap-2">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
        <p>
          Valores calculados com base em legislação portuguesa 2026 (Continente). Escalões IRS, IRC, TSU e demais parâmetros são aproximações oficiais.
          Sempre confirme com o seu TOC/Contabilista Certificado antes de decidir. Este simulador não substitui aconselhamento profissional.
        </p>
      </div>
    </div>
  );
}
