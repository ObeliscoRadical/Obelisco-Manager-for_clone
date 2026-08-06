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
  const [processingId, setProcessingId] = useState(null);
  const [view, setView] = useState('list'); // list | detail
  const [taxAlerts, setTaxAlerts] = useState(null);
  const fileRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    fetchList();
    fetchAlerts();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const fetchList = async () => {
    try {
      const { data } = await api.get('/bank-analysis');
      setAnalyses(data);
    } catch { } finally { setLoading(false); }
  };

  const fetchAlerts = async () => {
    try {
      const { data } = await api.get('/bank-analysis/tax-alerts/upcoming');
      setTaxAlerts(data);
    } catch { }
  };

  const startPolling = (analysisId) => {
    setProcessingId(analysisId);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/bank-analysis/${analysisId}/status`);
        if (data.status === 'completed') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setProcessingId(null);
          setUploading(false);
          const syncInfo = data.transaction_count ? `${data.transaction_count} transações analisadas` : 'Análise concluída';
          toast.success(syncInfo + '!');
          const full = await api.get(`/bank-analysis/${analysisId}`);
          const fullData = full.data;
          if (fullData.sync_preview?.pending_count > 0) {
            toast.info(`${fullData.sync_preview.pending_count} despesas pendentes de aprovação`);
          }
          if (fullData.auto_calendar?.created > 0) {
            toast.success(`${fullData.auto_calendar.created} contas previstas adicionadas ao calendário!`);
          }
          setCurrent(fullData);
          setView('detail');
          fetchList();
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setProcessingId(null);
          setUploading(false);
          toast.error(data.error || 'Erro ao processar PDF');
          fetchList();
        }
      } catch {
        // Ignore transient polling errors
      }
    }, 5000);
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
      if (data.status === 'processing') {
        toast.info('PDF recebido! A IA está a extrair as transações... Pode demorar 2-4 minutos.');
        startPolling(data.id);
        fetchList();
      } else {
        toast.success(`${data.transaction_count} transações analisadas!`);
        if (data.sync_preview?.pending_count > 0) {
          toast.info(`${data.sync_preview.pending_count} despesas pendentes de aprovação`);
        }
        if (data.auto_calendar?.created > 0) {
          toast.success(`${data.auto_calendar.created} contas previstas adicionadas ao calendário!`);
        }
        setCurrent(data);
        setView('detail');
        setUploading(false);
        fetchList();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao processar extrato');
      setUploading(false);
    } finally {
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
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.ofx,.qfx,.txt,.pdf" onChange={e => handleUpload(e.target.files?.[0])} className="hidden" />
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
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-6 text-center" data-testid="upload-processing-banner">
          <Loader2 className="w-10 h-10 text-yellow-400 animate-spin mx-auto mb-3" />
          <p className="text-yellow-400 font-semibold">
            {processingId ? 'A extrair transações do PDF com IA...' : 'A processar extrato com IA...'}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {processingId
              ? 'O PDF está a ser analisado pelo Gemini. Isto pode demorar 2-4 minutos. Pode navegar e voltar — o processamento continua em segundo plano.'
              : 'Leitura, categorização, detecção de recorrentes e cálculo de impostos. Pode demorar 30-60 segundos.'}
          </p>
          {processingId && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
              </div>
              <span className="text-xs text-zinc-600">A verificar progresso a cada 5s</span>
            </div>
          )}
        </div>
      )}

      {/* Tax Alerts */}
      {taxAlerts?.alerts?.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4" data-testid="tax-alerts-panel">
          <h3 className="text-sm text-zinc-400 uppercase tracking-wider font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-400" /> Alertas Fiscais
          </h3>
          <div className="space-y-2">
            {taxAlerts.alerts.slice(0, 6).map((a, i) => {
              const statusColors = {
                overdue: 'bg-red-500/10 border-red-500/30 text-red-400',
                urgent: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
                soon: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
                upcoming: 'bg-zinc-800/50 border-zinc-700 text-zinc-400',
              };
              const cls = statusColors[a.status] || statusColors.upcoming;
              return (
                <div key={a.date + a.type + i} className={`flex items-center justify-between p-3 border rounded-lg ${cls}`}>
                  <div>
                    <p className="text-sm font-medium">{a.label}</p>
                    <p className="text-xs opacity-70">{a.desc}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="text-sm font-mono font-bold">{new Date(a.date).toLocaleDateString('pt-PT')}</p>
                    <p className="text-xs">{a.days_until < 0 ? `${Math.abs(a.days_until)}d em atraso` : a.days_until === 0 ? 'HOJE' : `em ${a.days_until} dias`}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List of analyses */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-yellow-400 animate-spin" /></div>
      ) : analyses.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <BarChart3 className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-500 mb-2">Nenhuma análise ainda</p>
          <p className="text-xs text-zinc-600">Carregue um extrato bancário (CSV, Excel, OFX ou PDF) para começar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {analyses.map(a => (
            <div key={a.id} onClick={() => a.status !== 'processing' && a.status !== 'failed' && openAnalysis(a.id)} className={`bg-zinc-900 border rounded-xl p-4 transition-all ${a.status === 'processing' ? 'border-yellow-400/30 opacity-70' : a.status === 'failed' ? 'border-red-500/30 opacity-70' : 'border-zinc-800 cursor-pointer hover:border-yellow-400/30'}`} data-testid={`analysis-${a.id}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-medium flex items-center gap-2">
                    {a.filename}
                    {a.status === 'processing' && <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> A processar...</span>}
                    {a.status === 'failed' && <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">Erro</span>}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {a.status === 'processing' ? 'A extrair transações do PDF...' : a.status === 'failed' ? (a.error || 'Erro no processamento') : `${a.date_from} → ${a.date_to} · ${a.transaction_count} transações`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {a.status !== 'processing' && a.status !== 'failed' && (
                    <div className="text-right">
                      <p className="text-sm text-green-400">{fmt(a.taxes?.total_income)}</p>
                      <p className="text-xs text-red-400">{fmt(a.taxes?.total_expenses)}</p>
                    </div>
                  )}
                  <button onClick={e => { e.stopPropagation(); deleteAnalysis(a.id); }} className="text-zinc-600 hover:text-red-400 p-1"><Trash2 size={16} /></button>
                  {a.status !== 'processing' && a.status !== 'failed' && <ChevronRight size={16} className="text-zinc-600" />}
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
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [pendingItems, setPendingItems] = useState(analysis.sync_preview?.pending || []);
  const [selectedIds, setSelectedIds] = useState(new Set((analysis.sync_preview?.pending || []).map(p => p.id)));
  const { taxes, recurring, cashflow, by_category, by_month, transactions } = analysis;
  const syncPreview = analysis.sync_preview;
  const autoCalendar = analysis.auto_calendar;
  const syncApproved = analysis.sync_approved;

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

  const toggleItem = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selectedIds.size === pendingItems.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(pendingItems.map(p => p.id)));
  };

  const handleApproveSync = async () => {
    if (selectedIds.size === 0) { toast.error('Selecione pelo menos uma transação'); return; }
    setSyncing(true);
    try {
      const { data } = await api.post(`/bank-analysis/${analysis.id}/approve-sync`, {
        approved_ids: [...selectedIds],
      });
      setSyncResult(data);
      if (data.created > 0) toast.success(`${data.created} despesas importadas!`);
      // Remove approved from pending list
      setPendingItems(prev => prev.filter(p => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
    finally { setSyncing(false); }
  };

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
        {autoCalendar?.created > 0 && (
          <span className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full">
            {autoCalendar.created} contas previstas no calendário
          </span>
        )}
      </div>

      {/* Sync Approval Panel */}
      {pendingItems.length > 0 && (
        <div className="p-4 rounded-xl border border-yellow-400/30 bg-yellow-400/5" data-testid="sync-approval-panel">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm text-yellow-400 font-semibold flex items-center gap-2">
              <Receipt size={14} /> {pendingItems.length} despesas para importar
            </h4>
            <div className="flex items-center gap-2">
              <button onClick={toggleAll} className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded border border-zinc-700 hover:border-zinc-500">
                {selectedIds.size === pendingItems.length ? 'Desmarcar tudo' : 'Selecionar tudo'}
              </button>
              <button
                data-testid="approve-sync-btn"
                onClick={handleApproveSync}
                disabled={syncing || selectedIds.size === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-sm font-medium hover:bg-green-500/30 disabled:opacity-50"
              >
                {syncing ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
                Aprovar {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
              </button>
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {pendingItems.map(p => {
              const cat = CAT_LABELS[p.category] || CAT_LABELS.outro;
              return (
                <label key={p.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${selectedIds.has(p.id) ? 'bg-green-500/10' : 'bg-zinc-800/30 hover:bg-zinc-800/50'}`}>
                  <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleItem(p.id)}
                    className="w-4 h-4 rounded border-zinc-600 text-yellow-400 focus:ring-yellow-400 bg-zinc-800" />
                  <span className="text-xs text-zinc-400 font-mono w-20 flex-shrink-0">{p.date}</span>
                  <span className="text-sm text-white flex-1 truncate">{p.description}</span>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ color: cat.color, background: cat.color + '15' }}>{cat.label}</span>
                  <span className="text-sm text-red-400 font-mono flex-shrink-0 w-24 text-right">{fmt(p.amount)}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Fuzzy Duplicates Panel (shown independently from pending) */}
      {syncPreview?.duplicates?.length > 0 && (
        <div className="p-4 rounded-xl border border-orange-500/20 bg-orange-500/5" data-testid="duplicates-panel">
          <h5 className="text-sm text-orange-400 font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle size={14} /> {syncPreview.duplicates.length} possíveis duplicados detetados
          </h5>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {syncPreview.duplicates.map((d, i) => (
              <div key={d.id || i} className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/15">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">Extrato: {d.description?.slice(0, 70)}</p>
                    {d.expense_supplier && (
                      <p className="text-xs text-orange-400 truncate mt-1">
                        Despesa existente: <span className="font-semibold">{d.expense_supplier}</span>
                        {d.expense_date ? ` (${d.expense_date})` : ''}
                        {d.expense_value ? ` — ${fmt(d.expense_value)}` : ''}
                      </p>
                    )}
                    <p className="text-[10px] text-zinc-500 mt-0.5">{d.reason}</p>
                  </div>
                  <span className="text-sm text-red-400 font-mono font-semibold flex-shrink-0 ml-3">{fmt(d.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Previously approved */}
      {syncApproved?.created > 0 && pendingItems.length === 0 && (
        <div className="p-3 rounded-xl border border-green-500/20 bg-green-500/5 text-sm text-green-400 flex items-center gap-2">
          <Receipt size={14} /> {syncApproved.created} despesas já importadas
        </div>
      )}

      {/* Manual sync result */}
      {syncResult && (
        <div className={`p-4 rounded-xl border text-sm ${syncResult.created > 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-zinc-800 border-zinc-700'}`}>
          <div className="flex items-center justify-between">
            <span className="text-white font-medium">Importação concluída:</span>
            <span className="text-green-400 text-xs">{syncResult.created} despesas criadas</span>
          </div>
        </div>
      )}

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
      {tab === 'recurring' && <RecurringTab recurring={recurring} analysisId={analysis.id} />}
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
          <div className="h-64" style={{ minHeight: '256px', minWidth: '100px' }}>
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
          <div className="h-64" style={{ minHeight: '256px', minWidth: '100px' }}>
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
function RecurringTab({ recurring, analysisId }) {
  const total = recurring?.reduce((s, r) => s + r.avg_amount, 0) || 0;
  const [feeding, setFeeding] = useState(false);
  const [feedResult, setFeedResult] = useState(null);

  const feedCalendar = async () => {
    setFeeding(true);
    try {
      const { data } = await api.post(`/bank-analysis/${analysisId}/feed-calendar?months_ahead=6`);
      setFeedResult(data);
      if (data.created > 0) toast.success(`${data.created} contas previstas adicionadas ao calendário!`);
      else toast.info('Calendário já actualizado. Nenhuma nova conta adicionada.');
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
    finally { setFeeding(false); }
  };

  return (
    <div className="space-y-4" data-testid="recurring-tab">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm text-zinc-400 uppercase tracking-wider font-semibold">Pagamentos Recorrentes Detectados</h3>
            <p className="text-xs text-zinc-600 mt-1">Padrões detectados por IA com inteligência de datas</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-yellow-400 font-bold">{fmt(total)}/mês</span>
            <button
              data-testid="feed-calendar-btn"
              onClick={feedCalendar}
              disabled={feeding || !recurring?.length}
              className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-medium hover:bg-blue-500/30 disabled:opacity-50"
            >
              {feeding ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
              Alimentar Calendário
            </button>
          </div>
        </div>

        {feedResult && (
          <div className={`mb-4 p-3 rounded-lg border text-sm ${feedResult.created > 0 ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>
            {feedResult.message}
            {feedResult.appointments?.length > 0 && (
              <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                {feedResult.appointments.map((a, i) => (
                  <p key={a.date + i} className="text-xs opacity-70">{a.date} · {a.title} · {fmt(a.amount)}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {!recurring?.length ? (
          <p className="text-zinc-500 text-center py-4">Nenhum pagamento recorrente detectado</p>
        ) : (
          <div className="space-y-2">
            {recurring.map((r, i) => {
              const cat = CAT_LABELS[r.category] || CAT_LABELS.outro;
              return (
                <div key={r.description + i} className="p-3 bg-zinc-800/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-10 rounded" style={{ backgroundColor: cat.color }} />
                      <div>
                        <p className="text-sm text-white">{r.description.slice(0, 60)}</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          <span className="text-xs text-zinc-500">{cat.label}</span>
                          <span className="text-xs text-zinc-500">·</span>
                          <span className="text-xs text-yellow-400 font-medium">{r.frequency}</span>
                          <span className="text-xs text-zinc-500">·</span>
                          <span className="text-xs text-zinc-500">{r.occurrences}x</span>
                          {r.typical_day && (
                            <>
                              <span className="text-xs text-zinc-500">·</span>
                              <span className="text-xs text-blue-400">Dia {r.typical_day} ({r.day_consistency}% consistência)</span>
                            </>
                          )}
                        </div>
                        {r.next_expected && (
                          <p className="text-xs text-green-400 mt-0.5">Próximo previsto: {new Date(r.next_expected).toLocaleDateString('pt-PT')}</p>
                        )}
                      </div>
                    </div>
                    <span className="text-sm text-red-400 font-mono font-semibold flex-shrink-0 ml-4">{fmt(r.avg_amount)}</span>
                  </div>
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
        <div className="h-80" style={{ minHeight: '320px', minWidth: '100px' }}>
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
      const { data } = await api.patch(`/bank-analysis/${analysisId}/transactions/${txnId}?category=${newCat}`);
      if (data.learned) {
        toast.success('Categoria atualizada — o sistema aprendeu esta correção para futuros extratos');
      } else {
        toast.success('Categoria atualizada');
      }
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
