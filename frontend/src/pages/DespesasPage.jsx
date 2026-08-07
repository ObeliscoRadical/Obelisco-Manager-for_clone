import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Upload, FileText, Loader2, Sparkles, Eye, Receipt, TrendingUp, Pencil, RefreshCw, AlertTriangle, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ReconcileExpensesButton } from '../components/ReconcileExpensesButton';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const monthName = (m) => ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][m] || '';

function ExpensesMonthTick({ x, y, payload, selectedMonthLabel }) {
  const isSelected = selectedMonthLabel === payload?.value;
  return (
    <text
      x={x}
      y={y + 12}
      textAnchor="middle"
      fontSize={10}
      fill={isSelected ? '#facc15' : '#71717a'}
      fontWeight={isSelected ? 700 : 400}
    >
      {payload?.value}
    </text>
  );
}

const TYPES = [
  { value: 'fixo', label: 'Custo Fixo', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'variavel', label: 'Custo Variável', color: 'bg-zinc-700 text-zinc-300' },
  { value: 'obra', label: 'Custo de Obra', color: 'bg-yellow-400/20 text-yellow-400' },
];

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  supplier: '', nif: '', invoice_number: '',
  category: 'Outros', type: 'variavel',
  obra_id: '', obra_name: '',
  value_net: 0, vat_rate: 23, vat_amount: 0, value_gross: 0,
  payment_method: '', notes: '', invoice_file: null,
};

export default function DespesasPage() {
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [obras, setObras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [extracting, setExtracting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState('');
  const fileInputRef = useRef(null);
  const [suggestions, setSuggestions] = useState(null);
  const [categorySource, setCategorySource] = useState(null);
  const [saveDuplicateConfirm, setSaveDuplicateConfirm] = useState(null);
  const [categorizing, setCategorizing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [expRes, sumRes, catRes, obraRes] = await Promise.all([
        api.get('/expenses', { params: { month, year, category: filterCategory || undefined, type: filterType || undefined } }),
        api.get('/expenses/summary', { params: { year, month } }),
        api.get('/expenses/categories'),
        api.get('/works'),
      ]);
      setExpenses(expRes.data);
      setSummary(sumRes.data);
      setCategories(catRes.data);
      setObras(obraRes.data);
    } catch (err) {
      toast.error('Erro ao carregar despesas');
    } finally { setLoading(false); }
  }, [month, year, filterCategory, filterType]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh quando a página volta a ficar visível
  useEffect(() => {
    const onFocus = () => fetchAll();
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchAll(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchAll]);

  const openNew = () => { setEditing(null); setForm(emptyForm); setDuplicateWarning(null); setSuggestions(null); setCategorySource(null); setSaveDuplicateConfirm(null); if (fileInputRef.current) fileInputRef.current.value = ''; setDialogOpen(true); };
  const openEdit = (e) => { setEditing(e); setForm({ ...emptyForm, ...e }); setDuplicateWarning(null); setSuggestions(null); setCategorySource(null); setSaveDuplicateConfirm(null); if (fileInputRef.current) fileInputRef.current.value = ''; setDialogOpen(true); };

  const setField = (k, v) => {
    setForm(prev => {
      const n = { ...prev, [k]: v };
      // auto-calc gross or net
      if (k === 'value_net' || k === 'vat_rate') {
        const gross = (parseFloat(n.value_net) || 0) * (1 + (parseFloat(n.vat_rate) || 0) / 100);
        n.value_gross = Math.round(gross * 100) / 100;
        n.vat_amount = Math.round((gross - parseFloat(n.value_net || 0)) * 100) / 100;
      } else if (k === 'value_gross') {
        const net = (parseFloat(v) || 0) / (1 + (parseFloat(n.vat_rate) || 0) / 100);
        n.value_net = Math.round(net * 100) / 100;
        n.vat_amount = Math.round((parseFloat(v || 0) - net) * 100) / 100;
      }
      return n;
    });
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setExtracting(true);
    setDuplicateWarning(null);
    setSuggestions(null);
    setCategorySource(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/expenses/extract', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const ext = data.extracted || {};
      if (ext.error) {
        toast.error(`IA falhou: ${ext.error}`);
        setForm(prev => ({ ...prev, invoice_file: data.file_name }));
      } else {
        setForm(prev => ({
          ...prev,
          supplier: ext.supplier || prev.supplier,
          nif: ext.nif || prev.nif,
          invoice_number: ext.invoice_number || prev.invoice_number,
          date: ext.date || prev.date,
          value_net: ext.value_net || prev.value_net,
          vat_rate: ext.vat_rate || prev.vat_rate,
          vat_amount: ext.vat_amount || prev.vat_amount,
          value_gross: ext.value_gross || prev.value_gross,
          category: ext.category || prev.category,
          type: ext.type || prev.type,
          notes: ext.description ? (prev.notes ? `${prev.notes} | ${ext.description}` : ext.description) : prev.notes,
          invoice_file: data.file_name,
        }));
        setCategorySource(ext.category_source || null);
        if (data.suggestions) setSuggestions(data.suggestions);
        if (data.duplicate) {
          setDuplicateWarning(data.duplicate);
          toast.warning('Possível fatura duplicada detetada — verifique antes de guardar.');
        } else {
          toast.success('Fatura lida por IA! Confira os dados antes de guardar.');
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao processar fatura');
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async (force = false) => {
    if (!form.date || !form.value_gross) { toast.error('Data e valor total são obrigatórios'); return; }
    try {
      const payload = { ...form };
      if (payload.obra_id) {
        const o = obras.find(o => o.id === payload.obra_id);
        if (o) payload.obra_name = o.client_name || o.title;
      }
      const url = editing ? `/expenses/${editing.id}` : '/expenses';
      const method = editing ? 'put' : 'post';
      const params = force ? { force: true } : {};
      await api[method](url, payload, { params });
      toast.success(editing ? 'Despesa atualizada' : 'Despesa guardada');
      setDialogOpen(false);
      setDuplicateWarning(null);
      setSaveDuplicateConfirm(null);
      fetchAll();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 409 && detail?.code === 'duplicate_invoice') {
        setSaveDuplicateConfirm(detail);
        return;
      }
      toast.error(typeof detail === 'string' ? detail : 'Erro ao guardar');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar esta despesa?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      toast.success('Eliminada');
      fetchAll();
    } catch { toast.error('Erro ao eliminar'); }
  };

  const viewInvoice = (filename) => {
    if (!filename) return;
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/expenses/file/${filename}`;
    window.open(url, '_blank');
  };

  const handleAICategorize = async () => {
    setCategorizing(true);
    try {
      const { data } = await api.post('/expenses/ai-categorize');
      if (data.updated_keywords + data.updated_ai > 0) {
        toast.success(data.message);
        fetchAll();
      } else {
        toast.info('Todas as despesas já estão categorizadas.');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro na categorização IA');
    } finally { setCategorizing(false); }
  };

  const topCats = summary ? Object.entries(summary.by_category || {}).sort((a, b) => b[1] - a[1]).slice(0, 5) : [];
  const monthlyChartData = summary ? Object.entries(summary.by_month || {}).map(([m, v]) => ({
    name: monthName(parseInt(m)),
    monthNum: parseInt(m),
    value: v || 0,
  })) : [];

  if (loading) return <div className="text-zinc-400 text-sm">A carregar...</div>;

  return (
    <div data-testid="despesas-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Despesas</h1>
          <p className="text-zinc-400 mt-1 font-medium">Controlo de custos mensais com extração IA de faturas</p>
        </div>
        <div className="flex items-center gap-2">
          <ReconcileExpensesButton
            month={month}
            year={year}
            category={filterCategory}
            type={filterType}
            onCompleted={() => fetchAll()}
            buttonClassName="h-10 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 text-xs font-semibold"
            testIdPrefix="expenses-reconcile"
          />
          <button
            data-testid="ai-categorize-btn"
            onClick={handleAICategorize}
            disabled={categorizing}
            className="h-10 px-4 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 hover:bg-purple-500/20 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
            title="Categorizar despesas com IA"
          >
            {categorizing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            {categorizing ? 'A categorizar...' : 'Categorizar com IA'}
          </button>
          <button
            data-testid="refresh-expenses"
            onClick={fetchAll}
            disabled={loading}
            className="h-10 px-4 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 hover:bg-yellow-400/20 text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
            title="Atualizar dados"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
          <Button data-testid="new-expense-btn" onClick={openNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
            <Plus size={18} className="mr-2" /> Nova Despesa
          </Button>
        </div>
      </div>

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
                  <XAxis
                    dataKey="name"
                    stroke="#71717a"
                    fontSize={10}
                    tick={<ExpensesMonthTick selectedMonthLabel={monthName(month)} />}
                  />
                  <YAxis stroke="#71717a" fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => formatEuro(v)}
                    cursor={{ fill: 'rgba(250, 204, 21, 0.05)' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {monthlyChartData.map((d, i) => (
                      <Cell key={i} fill={d.monthNum === month ? '#facc15' : '#3f3f46'} />
                    ))}
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
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="w-full mt-1 h-9 bg-zinc-900 border border-zinc-700 text-white rounded-md px-2 text-xs">
            {Array.from({ length: 12 }).map((_, i) => <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-zinc-400 text-xs">Ano</Label>
          <Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || year)} className="bg-zinc-900 border-zinc-700 text-white mt-1 h-9 text-xs" />
        </div>
        <div>
          <Label className="text-zinc-400 text-xs">Categoria</Label>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="w-full mt-1 h-9 bg-zinc-900 border border-zinc-700 text-white rounded-md px-2 text-xs">
            <option value="">Todas</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-zinc-400 text-xs">Tipo</Label>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full mt-1 h-9 bg-zinc-900 border border-zinc-700 text-white rounded-md px-2 text-xs">
            <option value="">Todos</option>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400 text-xs uppercase">Data</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase">Fornecedor</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase">Categoria</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase">Tipo</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase">Obra</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase text-right">Valor s/IVA</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase text-right">IVA</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase text-right">Total</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-zinc-500 py-8">Sem despesas para os filtros selecionados.</TableCell></TableRow>
            ) : expenses.map(e => {
              const tMeta = TYPES.find(t => t.value === e.type) || TYPES[1];
              return (
                <TableRow key={e.id} className="border-zinc-800/50 hover:bg-zinc-800/30">
                  <TableCell className="text-zinc-300 text-xs">{e.date}</TableCell>
                  <TableCell className="text-white font-medium text-sm">
                    {e.supplier || '-'}
                    {e.invoice_number && <p className="text-[10px] text-zinc-500">#{e.invoice_number}</p>}
                  </TableCell>
                  <TableCell className="text-zinc-300 text-xs">{e.category}</TableCell>
                  <TableCell><Badge className={`${tMeta.color} border-0 text-[10px]`}>{tMeta.label}</Badge></TableCell>
                  <TableCell className="text-zinc-400 text-xs">{e.obra_name || '-'}</TableCell>
                  <TableCell className="text-right text-zinc-300 text-sm">{formatEuro(e.value_net)}</TableCell>
                  <TableCell className="text-right text-zinc-400 text-xs">{formatEuro(e.vat_amount)}</TableCell>
                  <TableCell className="text-right text-yellow-400 font-semibold">{formatEuro(e.value_gross)}</TableCell>
                  <TableCell className="text-right">
                    {e.invoice_file && <button onClick={() => viewInvoice(e.invoice_file)} className="text-zinc-400 hover:text-yellow-400 p-1 mr-1" title="Ver fatura"><Eye size={14} /></button>}
                    <button onClick={() => openEdit(e)} className="text-zinc-400 hover:text-yellow-400 p-1 mr-1"><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(e.id)} className="text-zinc-400 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase text-white">{editing ? 'Editar' : 'Nova'} Despesa</DialogTitle>
            <DialogDescription className="text-zinc-500">Faça upload da fatura e a IA preenche tudo automaticamente.</DialogDescription>
          </DialogHeader>

          {!editing && (
            <div className="rounded-2xl border-2 border-dashed border-yellow-400/30 bg-yellow-400/5 p-6 text-center">
              <input
                ref={fileInputRef}
                key={dialogOpen ? 'file-input-open' : 'file-input-closed'}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
                className="hidden"
                data-testid="invoice-file-input"
              />
              {extracting ? (
                <div className="flex flex-col items-center gap-3 text-yellow-400">
                  <Loader2 className="animate-spin" size={32} />
                  <p className="font-medium">A ler fatura com IA...</p>
                  <p className="text-xs text-zinc-500">Isto pode demorar 10-20 segundos</p>
                </div>
              ) : form.invoice_file ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-green-400">
                    <FileText size={20} />
                    <span className="font-medium text-sm">Fatura carregada</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="border-zinc-700 text-zinc-300 rounded-full text-xs">
                    Carregar outra
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Sparkles className="text-yellow-400" size={32} />
                  <div>
                    <p className="text-white font-semibold">Upload de Fatura (PDF / Imagem)</p>
                    <p className="text-xs text-zinc-500 mt-1">A IA extrai NIF, fornecedor, valor, IVA, data e categoria automaticamente</p>
                  </div>
                  <Button data-testid="upload-invoice-btn" onClick={() => fileInputRef.current?.click()} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
                    <Upload size={16} className="mr-2" /> Escolher ficheiro
                  </Button>
                </div>
              )}
            </div>
          )}

          {duplicateWarning && (
            <div data-testid="duplicate-warning" className="rounded-xl border-2 border-orange-500/50 bg-orange-500/10 p-3 flex items-start gap-3">
              <AlertTriangle className="text-orange-400 shrink-0 mt-0.5" size={20} />
              <div className="flex-1 min-w-0">
                <p className="text-orange-400 font-bold text-sm">Possível Duplicado</p>
                <p className="text-xs text-zinc-300 mt-1">
                  {duplicateWarning.reason || 'Dados semelhantes encontrados'}:
                  {duplicateWarning.supplier && <> <span className="font-semibold text-white">{duplicateWarning.supplier}</span></>}
                  {duplicateWarning.date && <> em <span className="font-semibold text-white">{duplicateWarning.date}</span></>}
                  {duplicateWarning.value_gross != null && <> ({formatEuro(duplicateWarning.value_gross)})</>}
                  {duplicateWarning.invoice_number && <> — Fatura #{duplicateWarning.invoice_number}</>}
                </p>
                <p className="text-[10px] text-zinc-500 mt-1">Verifica se não estás a registar a mesma fatura duas vezes.</p>
              </div>
              <button onClick={() => setDuplicateWarning(null)} className="text-zinc-500 hover:text-white text-xs">✕</button>
            </div>
          )}

          {/* Suggestion banner */}
          {categorySource && !editing && (
            <div data-testid="suggestion-banner" className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-3">
              <Sparkles className="text-emerald-400 shrink-0" size={18} />
              <div className="flex-1 min-w-0">
                <p className="text-emerald-400 font-semibold text-xs">Categorização automática</p>
                <p className="text-[11px] text-zinc-300 mt-0.5">
                  Categoria <span className="font-semibold text-white">{form.category}</span>
                  {' '}e tipo <span className="font-semibold text-white">{TYPES.find(t => t.value === form.type)?.label || form.type}</span>
                  {' '}sugeridos por <span className="font-medium text-emerald-300">{categorySource === 'histórico' ? 'histórico de despesas' : categorySource === 'palavras-chave' ? 'palavras-chave do fornecedor' : 'leitura IA'}</span>
                  {suggestions?.confidence != null && <> ({suggestions.confidence}% confiança)</>}.
                  {' '}<span className="text-zinc-500">Pode alterar manualmente.</span>
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div><Label className="text-zinc-400 text-xs">Data *</Label><Input data-testid="exp-date" type="date" value={form.date} onChange={e => setField('date', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Fornecedor</Label><Input data-testid="exp-supplier" value={form.supplier} onChange={e => setField('supplier', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">NIF</Label><Input value={form.nif} onChange={e => setField('nif', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Nº Fatura</Label><Input value={form.invoice_number} onChange={e => setField('invoice_number', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div>
              <div className="flex items-center gap-2">
                <Label className="text-zinc-400 text-xs">Categoria</Label>
                {categorySource && !editing && (
                  <span data-testid="category-source-badge" className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                    {categorySource}
                  </span>
                )}
              </div>
              <select data-testid="exp-category" value={form.category} onChange={e => { setField('category', e.target.value); setCategorySource(null); }} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Label className="text-zinc-400 text-xs">Tipo</Label>
                {categorySource && !editing && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">auto</span>
                )}
              </div>
              <div className="flex gap-1 mt-1">
                {TYPES.map(t => (
                  <button key={t.value} type="button" onClick={() => setField('type', t.value)} className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium transition border ${form.type === t.value ? 'bg-yellow-400 text-zinc-950 border-yellow-400' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {form.type === 'obra' && (
              <div className="md:col-span-2">
                <Label className="text-zinc-400 text-xs">Obra Associada</Label>
                <select value={form.obra_id || ''} onChange={e => setField('obra_id', e.target.value)} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
                  <option value="">Selecione obra...</option>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.title} - {o.client_name}</option>)}
                </select>
              </div>
            )}
            <div><Label className="text-zinc-400 text-xs">Valor s/ IVA (€)</Label><Input type="number" step="0.01" value={form.value_net} onChange={e => setField('value_net', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Taxa IVA (%)</Label>
              <select value={form.vat_rate} onChange={e => setField('vat_rate', parseFloat(e.target.value))} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
                <option value={0}>0% (isento)</option>
                <option value={6}>6% (reduzida)</option>
                <option value={13}>13% (intermédia)</option>
                <option value={23}>23% (normal)</option>
              </select>
            </div>
            <div><Label className="text-zinc-400 text-xs">Valor IVA (€)</Label><Input type="number" step="0.01" value={form.vat_amount} onChange={e => setField('vat_amount', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Total c/ IVA (€) *</Label><Input data-testid="exp-gross" type="number" step="0.01" value={form.value_gross} onChange={e => setField('value_gross', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1 font-bold text-yellow-400" /></div>
            <div><Label className="text-zinc-400 text-xs">Forma Pagamento</Label><Input value={form.payment_method} onChange={e => setField('payment_method', e.target.value)} placeholder="Transferência, MB Way, etc." className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Notas</Label><Input value={form.notes} onChange={e => setField('notes', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          </div>

          {/* Save-time duplicate confirmation panel */}
          {saveDuplicateConfirm && (
            <div data-testid="save-duplicate-confirm" className="rounded-xl border-2 border-red-500/50 bg-red-500/10 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={22} />
                <div>
                  <p className="text-red-400 font-bold text-sm">Fatura Duplicada Detetada</p>
                  <p className="text-xs text-zinc-300 mt-1">{saveDuplicateConfirm.message}</p>
                </div>
              </div>
              {saveDuplicateConfirm.existing && (
                <div className="bg-zinc-900/80 rounded-lg p-3 text-xs space-y-1 border border-zinc-800">
                  <p className="text-zinc-500 uppercase tracking-wider font-semibold text-[10px]">Despesa existente</p>
                  <div className="flex gap-4 text-zinc-300">
                    <span>Fornecedor: <span className="text-white font-medium">{saveDuplicateConfirm.existing.supplier || '—'}</span></span>
                    <span>Data: <span className="text-white font-medium">{saveDuplicateConfirm.existing.date || '—'}</span></span>
                    <span>Valor: <span className="text-yellow-400 font-semibold">{formatEuro(saveDuplicateConfirm.existing.value_gross)}</span></span>
                  </div>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button data-testid="cancel-duplicate-btn" variant="outline" size="sm" onClick={() => setSaveDuplicateConfirm(null)} className="border-zinc-700 text-zinc-300 rounded-full text-xs">
                  Cancelar
                </Button>
                <Button data-testid="force-save-btn" size="sm" onClick={() => { setSaveDuplicateConfirm(null); handleSave(true); }} className="bg-red-500 text-white hover:bg-red-600 rounded-full text-xs font-semibold">
                  Criar Mesmo Assim
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700 text-zinc-300">Cancelar</Button>
            <Button data-testid="save-expense-btn" onClick={() => handleSave(false)} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-semibold">Guardar Despesa</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
