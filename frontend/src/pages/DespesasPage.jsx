import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { ExpensesToolbar } from '../components/expenses/ExpensesToolbar';
import { ExpensesOverview } from '../components/expenses/ExpensesOverview';
import { ExpensesTable } from '../components/expenses/ExpensesTable';
import { ExpenseAuditReports } from '../components/expenses/ExpenseAuditReports';
import { ExpenseFormDialog } from '../components/expenses/ExpenseFormDialog';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const monthName = (m) => ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][m] || '';

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
  const [auditReports, setAuditReports] = useState([]);
  const [downloadingReportId, setDownloadingReportId] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [expRes, sumRes, catRes, obraRes, reportsRes] = await Promise.all([
        api.get('/expenses', { params: { month, year, category: filterCategory || undefined, type: filterType || undefined } }),
        api.get('/expenses/summary', { params: { year, month } }),
        api.get('/expenses/categories'),
        api.get('/works'),
        api.get('/expenses/reconcile-reports', { params: { limit: 10 } }).catch(() => ({ data: [] })),
      ]);
      setExpenses(expRes.data);
      setSummary(sumRes.data);
      setCategories(catRes.data);
      setObras(obraRes.data);
      setAuditReports(reportsRes.data || []);
    } catch (err) {
      toast.error('Erro ao carregar despesas');
    } finally {
      setLoading(false);
    }
  }, [month, year, filterCategory, filterType]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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

  const resetDialogState = () => {
    setDuplicateWarning(null);
    setSuggestions(null);
    setCategorySource(null);
    setSaveDuplicateConfirm(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    resetDialogState();
    setDialogOpen(true);
  };

  const openEdit = (expense) => {
    setEditing(expense);
    setForm({ ...emptyForm, ...expense });
    resetDialogState();
    setDialogOpen(true);
  };

  const setField = (key, value) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'value_net' || key === 'vat_rate') {
        const gross = (parseFloat(next.value_net) || 0) * (1 + (parseFloat(next.vat_rate) || 0) / 100);
        next.value_gross = Math.round(gross * 100) / 100;
        next.vat_amount = Math.round((gross - parseFloat(next.value_net || 0)) * 100) / 100;
      } else if (key === 'value_gross') {
        const net = (parseFloat(value) || 0) / (1 + (parseFloat(next.vat_rate) || 0) / 100);
        next.value_net = Math.round(net * 100) / 100;
        next.vat_amount = Math.round((parseFloat(value || 0) - net) * 100) / 100;
      }
      return next;
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
      const { data } = await api.post('/expenses/extract', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const extracted = data.extracted || {};
      if (extracted.error) {
        toast.error(`IA falhou: ${extracted.error}`);
        setForm(prev => ({ ...prev, invoice_file: data.file_name }));
      } else {
        setForm(prev => ({
          ...prev,
          supplier: extracted.supplier || prev.supplier,
          nif: extracted.nif || prev.nif,
          invoice_number: extracted.invoice_number || prev.invoice_number,
          date: extracted.date || prev.date,
          value_net: extracted.value_net || prev.value_net,
          vat_rate: extracted.vat_rate || prev.vat_rate,
          vat_amount: extracted.vat_amount || prev.vat_amount,
          value_gross: extracted.value_gross || prev.value_gross,
          category: extracted.category || prev.category,
          type: extracted.type || prev.type,
          notes: extracted.description ? (prev.notes ? `${prev.notes} | ${extracted.description}` : extracted.description) : prev.notes,
          invoice_file: data.file_name,
        }));
        setCategorySource(extracted.category_source || null);
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
    if (!form.date || !form.value_gross) {
      toast.error('Data e valor total são obrigatórios');
      return;
    }
    try {
      const payload = { ...form };
      if (payload.obra_id) {
        const obra = obras.find(item => item.id === payload.obra_id);
        if (obra) payload.obra_name = obra.client_name || obra.title;
      }
      const url = editing ? `/expenses/${editing.id}` : '/expenses';
      const method = editing ? 'put' : 'post';
      await api[method](url, payload, { params: force ? { force: true } : {} });
      toast.success(editing ? 'Despesa atualizada' : 'Despesa guardada');
      setDialogOpen(false);
      resetDialogState();
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
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao eliminar');
    }
  };

  const viewInvoice = (filename) => {
    if (!filename) return;
    window.open(`${process.env.REACT_APP_BACKEND_URL}/api/expenses/file/${filename}`, '_blank');
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
    } finally {
      setCategorizing(false);
    }
  };

  const handleDownloadAuditReport = async (report) => {
    setDownloadingReportId(report.id);
    try {
      const response = await api.get(`/expenses/reconcile-reports/${report.id}/download`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = report.file_name || `reconciliacao-${report.id}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Erro ao descarregar relatório');
    } finally {
      setDownloadingReportId(null);
    }
  };

  const topCats = summary ? Object.entries(summary.by_category || {}).sort((a, b) => b[1] - a[1]).slice(0, 5) : [];
  const monthlyChartData = summary ? Object.entries(summary.by_month || {}).map(([m, v]) => ({ name: monthName(parseInt(m)), monthNum: parseInt(m), value: v || 0 })) : [];

  if (loading) return <div className="text-zinc-400 text-sm">A carregar...</div>;

  return (
    <div data-testid="despesas-page" className="space-y-6">
      <ExpensesToolbar
        month={month}
        year={year}
        category={filterCategory}
        type={filterType}
        onRefresh={fetchAll}
        loading={loading}
        onNew={openNew}
        onCategorize={handleAICategorize}
        categorizing={categorizing}
      />

      <ExpensesOverview
        summary={summary}
        month={month}
        year={year}
        monthName={monthName}
        formatEuro={formatEuro}
        topCats={topCats}
        monthlyChartData={monthlyChartData}
        categories={categories}
        types={TYPES}
        filterCategory={filterCategory}
        filterType={filterType}
        onMonthChange={setMonth}
        onYearChange={setYear}
        onCategoryChange={setFilterCategory}
        onTypeChange={setFilterType}
      />

      <ExpensesTable expenses={expenses} types={TYPES} formatEuro={formatEuro} onViewInvoice={viewInvoice} onEdit={openEdit} onDelete={handleDelete} />

      <ExpenseAuditReports auditReports={auditReports} monthName={monthName} downloadingReportId={downloadingReportId} onDownload={handleDownloadAuditReport} />

      <ExpenseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        form={form}
        setField={setField}
        categories={categories}
        types={TYPES}
        obras={obras}
        extracting={extracting}
        fileInputRef={fileInputRef}
        onUpload={handleUpload}
        duplicateWarning={duplicateWarning}
        setDuplicateWarning={setDuplicateWarning}
        categorySource={categorySource}
        suggestions={suggestions}
        saveDuplicateConfirm={saveDuplicateConfirm}
        setSaveDuplicateConfirm={setSaveDuplicateConfirm}
        onSave={handleSave}
        formatEuro={formatEuro}
      />
    </div>
  );
}