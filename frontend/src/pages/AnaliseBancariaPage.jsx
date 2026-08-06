import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import {
  Upload, Loader2, TrendingUp, TrendingDown, Receipt, RefreshCw, Trash2,
  ChevronRight, BarChart3, Calendar, Repeat, Calculator, FileText, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Building, Zap, Fuel, Landmark, Wallet, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, Legend, Area, AreaChart } from 'recharts';

const API = process.env.REACT_APP_BACKEND_URL;

const fmt = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const fmtPct = (v) => `${(v || 0).toFixed(1)}%`;

const CAT_LABELS = {
  fixo: { label: 'Custo Fixo', color: '#3B82F6', icon: Building },
  variavel: { label: 'Custo Variável', color: '#F59E0B', icon: Fuel },
  obra: { label: 'Custo de Obra', color: '#FACC15', icon: Zap },
  receita: { label: 'Receita', color: '#22C55E', icon: ArrowUpRight },
  imposto: { label: 'Imposto', color: '#EF4444', icon: Landmark },
  salario: { label: 'Salário', color: '#8B5CF6', icon: Wallet },
  financeiro: { label: 'Financeiro', color: '#64748B', icon: Receipt },
  outro: { label: 'Outro', color: '#71717A', icon: FileText },
};

export default function AnaliseBancariaPage() {
  const [analyses, setAnalyses] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState('list'); // list | detail
  const fileRef = useRef(null);

  useEffect(() => {
    fetchList();
  }, []);

  const fetchList = async () => {
    try {
      const { data } = await api.get('/bank-analysis');
      setAnalyses(data);
    } catch { } finally { setLoading(false); }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/bank-analysis/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      toast.success(`${data.transaction_count} transações analisadas!`);
      setCurrent(data);
      setView('detail');
      fetchList();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao processar extrato');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const openAnalysis = async (id) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/bank-analysis/${id}`);
      setCurrent(data);
      setView('detail');
    } catch { toast.error('Erro'); } finally { setLoading(false); }
  };

  const deleteAnalysis = async (id) => {
    if (!window.confirm('Eliminar esta análise?')) return;
    try {
      await api.delete(`/bank-analysis/${id}`);
      toast.success('Eliminada');
      fetchList();
      if (current?.id === id) { setCurrent(null); setView('list'); }
    } catch { toast.error('Erro'); }
  };

  if (view === 'detail' && current) {
    return <AnalysisDetail analysis={current} onBack={() => { setView('list'); setCurrent(null); }} />;
  }

  return (
    <div className="space-y-6" data-testid="analise-bancaria-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Análise Bancária</h1>
          <p className="text-sm text-zinc-500 mt-1">Extratos bancários, categorização IA, projeções e impostos</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.ofx,.qfx,.txt" onChange={e => handleUpload(e.target.files?.[0])} className="hidden" />
          <button
            data-testid="upload-statement-btn"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-zinc-950 font-semibold rounded-lg hover:bg-yellow-300 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            {uploading ? 'A analisar...' : 'Carregar Extrato'}
          </button>
        </div>
      </div>

      {uploading && (
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-6 text-center">
          <Loader2 className="w-10 h-10 text-yellow-400 animate-spin mx-auto mb-3" />
          <p className="text-yellow-400 font-semibold">A processar extrato com IA...</p>
          <p className="text-xs text-zinc-500 mt-1">Leitura, categorização, detecção de recorrentes e cálculo de impostos. Pode demorar 30-60 segundos.</p>
        </div>
      )}

      {/* List of analyses */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-yellow-400 animate-spin" /></div>
      ) : analyses.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <BarChart3 className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-500 mb-2">Nenhuma análise ainda</p>
          <p className="text-xs text-zinc-600">Carregue um extrato bancário (CSV, Excel ou OFX) para começar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {analyses.map(a => (
            <div key={a.id} onClick={() => openAnalysis(a.id)} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 cursor-pointer hover:border-yellow-400/30 transition-all" data-testid={`analysis-${a.id}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-medium">{a.filename}</h3>
                  <p className="text-xs text-zinc-500">{a.date_from} → {a.date_to} · {a.transaction_count} transações</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm text-green-400">{fmt(a.taxes?.total_income)}</p>
                    <p className="text-xs text-red-400">{fmt(a.taxes?.total_expenses)}</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteAnalysis(a.id); }} className="text-zinc-600 hover:text-red-400 p-1"><Trash2 size={16} /></button>
                  <ChevronRight size={16} className="text-zinc-600" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Analysis Detail ───────────────────────────────────────────── */
function AnalysisDetail({ analysis, onBack }) {
  const [tab, setTab] = useState('overview');
  const { taxes, recurring, cashflow, by_category, by_month, transactions } = analysis;

  const catData = Object.entries(by_category || {})
    .filter(([k]) => k !== 'receita')
    .map(([k, v]) => ({ name: CAT_LABELS[k]?.label || k, value: Math.abs(v.total), count: v.count, color: CAT_LABELS[k]?.color || '#71717A' }))
    .sort((a, b) => b.value - a.value);

  const monthData = Object.entries(by_month || {}).map(([m, v]) => ({
    name: m.slice(5),
    income: v.income,
    expenses: v.expenses,
    balance: v.income - v.expenses,
  }));

  return (
    <div className="space-y-6" data-testid="analysis-detail">
      <button onClick={onBack} className="text-zinc-500 hover:text-white flex items-center gap-2 transition-colors">
        <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{analysis.filename}</h1>
          <p className="text-sm text-zinc-500">{analysis.date_from} → {analysis.date_to} · {analysis.transaction_count} transações</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { id: 'overview', label: 'Visão Geral', icon: BarChart3 },
          { id: 'taxes', label: 'Impostos', icon: Calculator },
          { id: 'recurring', label: 'Recorrentes', icon: Repeat },
          { id: 'cashflow', label: 'Fluxo de Caixa', icon: TrendingUp },
          { id: 'transactions', label: 'Transações', icon: Receipt },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-yellow-400 text-zinc-950 font-bold' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
            }`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab taxes={taxes} catData={catData} monthData={monthData} recurring={recurring} />}
      {tab === 'taxes' && <TaxesTab taxes={taxes} />}
      {tab === 'recurring' && <RecurringTab recurring={recurring} />}
      {tab === 'cashflow' && <CashflowTab cashflow={cashflow} />}
      {tab === 'transactions' && <TransactionsTab transactions={transactions} analysisId={analysis.id} />}
    </div>
  );
}

/* ─── Overview Tab ──────────────────────────────────────────────── */
function OverviewTab({ taxes, catData, monthData, recurring }) {
  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Receitas" value={fmt(taxes?.total_income)} icon={ArrowUpRight} color="text-green-400" testid="kpi-income" />
        <KPI label="Despesas" value={fmt(taxes?.total_expenses)} icon={ArrowDownRight} color="text-red-400" testid="kpi-expenses" />
        <KPI label="Resultado" value={fmt(taxes?.taxable_income)} icon={TrendingUp} color={taxes?.taxable_income >= 0 ? 'text-green-400' : 'text-red-400'} testid="kpi-result" />
        <KPI label="Carga Fiscal" value={fmt(taxes?.total_tax_burden)} icon={Landmark} color="text-orange-400" sub={fmtPct(taxes?.tax_rate_effective)} testid="kpi-tax" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm text-zinc-400 uppercase tracking-wider font-semibold mb-3">Despesas por Categoria</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={catData} layout="vertical" margin={{ left: 80, right: 10 }}>
                <XAxis type="number" stroke="#52525b" fontSize={10} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" stroke="#52525b" fontSize={11} width={80} />
                <Tooltip formatter={v => fmt(v)} contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#fff' }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {catData.map((c, i) => <Cell key={c.name} fill={c.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm text-zinc-400 uppercase tracking-wider font-semibold mb-3">Receitas vs Despesas Mensais</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={monthData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#52525b" fontSize={10} />
                <YAxis stroke="#52525b" fontSize={10} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmt(v)} contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#fff' }} />
                <Bar dataKey="income" fill="#22C55E" radius={[4, 4, 0, 0]} name="Receitas" />
                <Bar dataKey="expenses" fill="#EF4444" radius={[4, 4, 0, 0]} name="Despesas" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top recurring */}
      {recurring?.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm text-zinc-400 uppercase tracking-wider font-semibold mb-3">Top Pagamentos Recorrentes</h3>
          <div className="space-y-2">
            {recurring.slice(0, 5).map((r, i) => (
              <div key={r.description} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                <div>
                  <p className="text-sm text-white">{r.description.slice(0, 50)}</p>
                  <p className="text-xs text-zinc-500">{r.frequency} · {r.occurrences} ocorrências</p>
                </div>
                <span className="text-sm text-red-400 font-mono">{fmt(r.avg_amount)}/mês</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Taxes Tab ─────────────────────────────────────────────────── */
function TaxesTab({ taxes }) {
  if (!taxes) return null;
  const items = [
    { label: 'Receita Total', value: taxes.total_income, color: 'text-green-400' },
    { label: 'Despesa Total', value: taxes.total_expenses, color: 'text-red-400' },
    { label: 'Matéria Coletável', value: taxes.taxable_income, color: 'text-white', bold: true },
    { label: `IRC Estimado (${fmtPct(taxes.irc_rate_effective)})`, value: taxes.irc_estimate, color: 'text-orange-400' },
    { label: 'Derrama Municipal (1.5%)', value: taxes.derrama_municipal, color: 'text-orange-400' },
    { label: 'IVA Trimestral Estimado', value: taxes.iva_quarterly_estimate, color: 'text-orange-400' },
    { label: 'IVA Anual Estimado', value: taxes.iva_annual_estimate, color: 'text-orange-400' },
    { label: 'TSU Patronal (23.75%)', value: taxes.tsu_estimate, color: 'text-purple-400' },
    { label: 'Pagamento por Conta (cada)', value: taxes.ppc_installment, color: 'text-blue-400' },
  ];

  return (
    <div className="space-y-4" data-testid="taxes-tab">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm text-zinc-400 uppercase tracking-wider font-semibold mb-4">Estimativa Fiscal {taxes.year} — Regime IRC</h3>
        <div className="space-y-3">
          {items.map(it => (
            <div key={it.label} className={`flex justify-between py-2 border-b border-zinc-800/50 last:border-0 ${it.bold ? 'bg-zinc-800/30 rounded-lg px-3 -mx-3' : ''}`}>
              <span className="text-sm text-zinc-300">{it.label}</span>
              <span className={`text-sm font-mono font-semibold ${it.color}`}>{fmt(it.value)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 p-4 bg-yellow-400/10 border border-yellow-400/30 rounded-xl">
          <div className="flex justify-between items-center">
            <span className="text-yellow-400 font-bold">Carga Fiscal Total Estimada</span>
            <span className="text-2xl font-bold text-yellow-400">{fmt(taxes.total_tax_burden)}</span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">Taxa efetiva sobre a receita: {fmtPct(taxes.tax_rate_effective)}</p>
        </div>
      </div>
      <p className="text-xs text-zinc-600 text-center">Estimativas baseadas na legislação fiscal portuguesa 2026. Consulte o seu contabilista para valores exactos.</p>
    </div>
  );
}

/* ─── Recurring Tab ─────────────────────────────────────────────── */
function RecurringTab({ recurring }) {
  const total = recurring?.reduce((s, r) => s + r.avg_amount, 0) || 0;
  return (
    <div className="space-y-4" data-testid="recurring-tab">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm text-zinc-400 uppercase tracking-wider font-semibold">Pagamentos Recorrentes Detectados</h3>
          <span className="text-yellow-400 font-bold">{fmt(total)}/mês</span>
        </div>
        {!recurring?.length ? (
          <p className="text-zinc-500 text-center py-4">Nenhum pagamento recorrente detectado</p>
        ) : (
          <div className="space-y-2">
            {recurring.map((r, i) => {
              const cat = CAT_LABELS[r.category] || CAT_LABELS.outro;
              return (
                <div key={r.description + i} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-8 rounded" style={{ backgroundColor: cat.color }} />
                    <div>
                      <p className="text-sm text-white">{r.description.slice(0, 60)}</p>
                      <p className="text-xs text-zinc-500">{cat.label} · {r.frequency} · {r.occurrences}x · Último: {r.last_date}</p>
                    </div>
                  </div>
                  <span className="text-sm text-red-400 font-mono font-semibold">{fmt(r.avg_amount)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Cashflow Tab ──────────────────────────────────────────────── */
function CashflowTab({ cashflow }) {
  return (
    <div className="space-y-4" data-testid="cashflow-tab">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm text-zinc-400 uppercase tracking-wider font-semibold mb-3">Projeção de Fluxo de Caixa (6 meses)</h3>
        <div className="h-80">
          <ResponsiveContainer>
            <AreaChart data={cashflow} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="month" stroke="#52525b" fontSize={10} tickFormatter={v => v?.slice(5) || v} />
              <YAxis stroke="#52525b" fontSize={10} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#fff' }}
                labelFormatter={l => { const item = cashflow?.find(c => c.month === l); return `${l}${item?.projected ? ' (projeção)' : ''}`; }} />
              <Legend />
              <Area type="monotone" dataKey="income" stroke="#22C55E" fill="url(#incomeGrad)" name="Receitas" strokeWidth={2} />
              <Area type="monotone" dataKey="expenses" stroke="#EF4444" fill="url(#expGrad)" name="Despesas" strokeWidth={2} />
              <Line type="monotone" dataKey="balance" stroke="#FACC15" strokeWidth={2} strokeDasharray="5 5" name="Saldo" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-zinc-500 inline-block" /> Histórico</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-zinc-500 inline-block border-dashed border-b" /> Projeção</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Transactions Tab ──────────────────────────────────────────── */
function TransactionsTab({ transactions, analysisId }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = (transactions || []).filter(t => {
    if (filter !== 'all' && t.category !== filter) return false;
    if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const updateCategory = async (txnId, newCat) => {
    try {
      await api.patch(`/bank-analysis/${analysisId}/transactions/${txnId}?category=${newCat}`);
      toast.success('Categoria atualizada');
    } catch { toast.error('Erro'); }
  };

  return (
    <div className="space-y-4" data-testid="transactions-tab">
      <div className="flex flex-col md:flex-row gap-3">
        <input type="text" placeholder="Pesquisar..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50" />
        <div className="flex gap-1 flex-wrap">
          {[{ v: 'all', l: 'Todos' }, ...Object.entries(CAT_LABELS).map(([k, v]) => ({ v: k, l: v.label }))].map(f => (
            <button key={f.v} onClick={() => setFilter(f.v)}
              className={`px-3 py-1.5 text-xs rounded-lg ${filter === f.v ? 'bg-yellow-400 text-zinc-950 font-bold' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}>
              {f.l}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-zinc-900 z-10">
              <tr className="border-b border-zinc-800">
                <th className="text-left py-2 px-3 text-zinc-400 text-xs uppercase">Data</th>
                <th className="text-left py-2 px-3 text-zinc-400 text-xs uppercase">Descrição</th>
                <th className="text-left py-2 px-3 text-zinc-400 text-xs uppercase">Categoria</th>
                <th className="text-right py-2 px-3 text-zinc-400 text-xs uppercase">Valor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map(t => {
                const cat = CAT_LABELS[t.category] || CAT_LABELS.outro;
                return (
                  <tr key={t.id} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                    <td className="py-2 px-3 text-zinc-400 text-xs font-mono">{t.date}</td>
                    <td className="py-2 px-3 text-white text-sm max-w-xs truncate">{t.description}</td>
                    <td className="py-2 px-3">
                      <select value={t.category} onChange={e => updateCategory(t.id, e.target.value)}
                        className="bg-zinc-800 text-xs rounded px-2 py-1 border-0" style={{ color: cat.color }}>
                        {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </td>
                    <td className={`py-2 px-3 text-right text-sm font-mono ${t.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {fmt(t.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 200 && <p className="text-xs text-zinc-500 text-center py-2">A mostrar 200 de {filtered.length} transações</p>}
      </div>
    </div>
  );
}

function KPI({ label, value, icon: Icon, color, sub, testid }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4" data-testid={testid}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-zinc-500" />
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}
