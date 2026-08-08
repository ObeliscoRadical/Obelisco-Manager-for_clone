import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { generateWorkReportPDF } from '../lib/workReportPdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Pencil, Trash2, HardHat, BarChart3, RefreshCw, AlertTriangle, FileDown, History, Receipt, Sparkles, X, ListChecks } from 'lucide-react';
import WorkExecutionPanel from '../components/WorkExecutionPanel';
import { toast } from 'sonner';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const formatPct = (v) => `${(v ?? 0).toFixed(1).replace('.', ',')}%`;

const statusOptions = [
  { value: 'orçamento', label: 'Orçamento' },
  { value: 'em_execução', label: 'Em Execução' },
  { value: 'finalizado', label: 'Finalizado' },
];
const statusColors = {
  orcamento: 'bg-zinc-700 text-zinc-300',
  em_execucao: 'bg-yellow-400/20 text-yellow-400',
  finalizado: 'bg-green-500/20 text-green-400',
};

const emptyWork = { title: '', client_name: '', client_phone: '', status: 'orçamento', predicted_cost: 0, real_cost: 0, notes: '', start_date: '', end_date: '' };

export default function ObrasPage() {
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWork, setEditingWork] = useState(null);
  const [form, setForm] = useState({ ...emptyWork });
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisWorkId, setAnalysisWorkId] = useState(null);

  const fetchWorks = useCallback(async () => {
    try { const { data } = await api.get('/works'); setWorks(data); }
    catch (err) {
      console.error('Works fetch error:', err.message);
      toast.error('Erro ao carregar obras');
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchWorks(); }, [fetchWorks]);

  const openNew = () => { setEditingWork(null); setForm({ ...emptyWork }); setDialogOpen(true); };
  const openEdit = (w) => {
    setEditingWork(w);
    setForm({ title: w.title, client_name: w.client_name, client_phone: w.client_phone || '', status: w.status, predicted_cost: w.predicted_cost || 0, real_cost: w.real_cost || 0, notes: w.notes || '', start_date: w.start_date || '', end_date: w.end_date || '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.client_name) { toast.error('Preencha titulo e cliente'); return; }
    try {
      if (editingWork) {
        await api.put(`/works/${editingWork.id}`, form);
        toast.success('Obra atualizada');
      } else {
        await api.post('/works', form);
        toast.success('Obra criada');
      }
      setDialogOpen(false); fetchWorks();
    } catch { toast.error('Erro ao guardar obra'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar esta obra?')) return;
    try { await api.delete(`/works/${id}`); toast.success('Obra eliminada'); fetchWorks(); }
    catch { toast.error('Erro ao eliminar'); }
  };

  const openAnalysis = (w) => {
    setAnalysisWorkId(w.id);
    setAnalysisOpen(true);
  };

  return (
    <div data-testid="obras-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Obras</h1>
          <p className="text-zinc-400 mt-1 font-medium">Gestao e acompanhamento de obras</p>
        </div>
        <Button data-testid="new-work-btn" onClick={openNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={18} className="mr-2" /> Nova Obra
        </Button>
      </div>

      {loading && (
        <div className="flex justify-center py-16"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
      )}
      {!loading && works.length === 0 && (
        <div className="text-center py-16 text-zinc-500">
          <HardHat size={48} className="mx-auto mb-4 text-zinc-700" />
          <p>Nenhuma obra registada</p>
        </div>
      )}
      {!loading && works.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {works.map(w => {
            const margin = w.predicted_cost > 0 ? ((w.predicted_cost - w.real_cost) / w.predicted_cost * 100) : 0;
            return (
              <Card
                key={w.id}
                onClick={() => openAnalysis(w)}
                data-testid={`work-card-${w.id}`}
                className="bg-zinc-900 border-zinc-800 rounded-3xl hover:shadow-[0_0_15px_rgba(250,204,21,0.15)] transition-all duration-300 cursor-pointer"
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <Badge className={statusColors[w.status]}>{statusOptions.find(s => s.value === w.status)?.label || w.status}</Badge>
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      <button data-testid={`analyze-work-${w.id}`} onClick={() => openAnalysis(w)} className="text-yellow-400 hover:text-yellow-300 p-1 transition" title="Análise Previsto vs Real">
                        <BarChart3 size={15} />
                      </button>
                      <button data-testid={`edit-work-${w.id}`} onClick={() => openEdit(w)} className="text-zinc-500 hover:text-white p-1 transition"><Pencil size={15} /></button>
                      <button data-testid={`delete-work-${w.id}`} onClick={() => handleDelete(w.id)} className="text-zinc-500 hover:text-red-400 p-1 transition"><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1 truncate">{w.title}</h3>
                  <p className="text-sm text-zinc-400 mb-4">{w.client_name}</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">Custo Previsto</span>
                      <span className="text-zinc-300 font-medium">{formatEuro(w.predicted_cost)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">Custo Real</span>
                      <span className="text-white font-medium">{formatEuro(w.real_cost)}</span>
                    </div>
                    <div className="pt-2 border-t border-zinc-800 flex justify-between text-sm">
                      <span className="text-zinc-500 font-semibold">Margem Real</span>
                      <span className={`font-bold ${margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>{margin.toFixed(1)}%</span>
                    </div>
                  </div>
                  {w.notes && <p className="text-xs text-zinc-600 mt-3 truncate">{w.notes}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Diálogo: Editar/Nova Obra */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white">
              {editingWork ? 'Editar Obra' : 'Nova Obra'}
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              {editingWork ? 'Atualize os detalhes da obra' : 'Preencha os detalhes da nova obra'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-zinc-300 text-sm">Titulo</Label>
              <Input data-testid="work-title-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-zinc-300 text-sm">Cliente</Label>
                <Input data-testid="work-client-input" value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
              <div>
                <Label className="text-zinc-300 text-sm">Telefone</Label>
                <Input value={form.client_phone} onChange={e => setForm({ ...form, client_phone: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
            </div>
            <div>
              <Label className="text-zinc-300 text-sm">Estado</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger data-testid="work-status-select" className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {statusOptions.map(s => (
                    <SelectItem key={s.value} value={s.value} className="text-white hover:bg-zinc-800">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-zinc-300 text-sm">Custo Previsto (EUR)</Label>
                <Input data-testid="work-predicted-cost" type="number" min="0" step="0.01" value={form.predicted_cost} onChange={e => setForm({ ...form, predicted_cost: parseFloat(e.target.value) || 0 })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
              <div>
                <Label className="text-zinc-300 text-sm">Custo Real (EUR)</Label>
                <Input data-testid="work-real-cost" type="number" min="0" step="0.01" value={form.real_cost} onChange={e => setForm({ ...form, real_cost: parseFloat(e.target.value) || 0 })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-zinc-300 text-sm">Data Início</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
              <div>
                <Label className="text-zinc-300 text-sm">Data Fim</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
            </div>
            <div>
              <Label className="text-zinc-300 text-sm">Notas</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="Observações..." />
            </div>
            <Button data-testid="save-work-btn" onClick={handleSave} className="w-full bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold h-12">
              {editingWork ? 'Atualizar Obra' : 'Criar Obra'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo: Análise Custos (Previsto vs Real) */}
      <WorkAnalysisDialog
        open={analysisOpen}
        workId={analysisWorkId}
        onOpenChange={(v) => { setAnalysisOpen(v); if (!v) fetchWorks(); }}
      />
    </div>
  );
}

/* ============================================================
   COMPONENTE: WorkAnalysisDialog
   ============================================================ */

function WorkAnalysisDialog({ open, workId, onOpenChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [editValues, setEditValues] = useState({}); // {itemId: {real_unit_cost, real_quantity, real_notes}}
  const [showAddExtra, setShowAddExtra] = useState(false);
  const [extraForm, setExtraForm] = useState({ name: '', category: 'Extra', unit: 'un', quantity: 1, predicted_unit_cost: 0, real_unit_cost: 0, notes: '' });
  const [showHistory, setShowHistory] = useState(false);
  const [filter, setFilter] = useState(''); // search
  const [tab, setTab] = useState('execucao');  // 'execucao' | 'custos'

  const load = useCallback(async () => {
    if (!workId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/works/${workId}/full`);
      setData(data);
      const ev = {};
      (data.items || []).forEach((it) => {
        ev[it.id] = {
          real_unit_cost: it.real_unit_cost ?? 0,
          real_quantity: it.real_quantity ?? '',
          real_notes: it.real_notes ?? '',
        };
      });
      setEditValues(ev);
    } catch (err) {
      console.error('Load work analysis:', err.message);
      toast.error('Erro ao carregar análise');
    } finally {
      setLoading(false);
    }
  }, [workId]);

  useEffect(() => { if (open && workId) load(); }, [open, workId, load]);

  useEffect(() => {
    if (!open) {
      setData(null);
      setEditValues({});
      setShowAddExtra(false);
      setShowHistory(false);
      setFilter('');
    }
  }, [open]);

  const syncFromBudget = async () => {
    if (!data?.work?.budget_id) { toast.error('Esta obra não tem orçamento associado'); return; }
    if (!window.confirm('Recarregar items do orçamento? Os custos reais já preenchidos serão preservados.')) return;
    setLoading(true);
    try {
      await api.post(`/works/${workId}/sync-budget`);
      toast.success('Items sincronizados');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro a sincronizar');
    } finally { setLoading(false); }
  };

  const saveItem = async (itemId) => {
    const v = editValues[itemId];
    if (!v) return;
    setSavingId(itemId);
    try {
      const payload = {
        real_unit_cost: parseFloat(v.real_unit_cost) || 0,
        real_quantity: v.real_quantity === '' || v.real_quantity == null ? null : parseFloat(v.real_quantity),
        real_notes: v.real_notes || '',
      };
      const { data: fresh } = await api.put(`/works/${workId}/items/${itemId}`, payload);
      setData(fresh);
      toast.success('Custo real atualizado');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro ao guardar');
    } finally { setSavingId(null); }
  };

  const deleteItem = async (itemId) => {
    if (!window.confirm('Eliminar este item da obra?')) return;
    try {
      const { data: fresh } = await api.delete(`/works/${workId}/items/${itemId}`);
      setData(fresh);
      toast.success('Item eliminado');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro a eliminar');
    }
  };

  const addExtra = async () => {
    if (!extraForm.name.trim()) { toast.error('Nome é obrigatório'); return; }
    try {
      const { data: fresh } = await api.post(`/works/${workId}/items`, {
        name: extraForm.name,
        category: extraForm.category || 'Extra',
        unit: extraForm.unit || 'un',
        quantity: parseFloat(extraForm.quantity) || 1,
        predicted_unit_cost: parseFloat(extraForm.predicted_unit_cost) || 0,
        real_unit_cost: parseFloat(extraForm.real_unit_cost) || 0,
        notes: extraForm.notes || '',
      });
      setData(fresh);
      const ev = {};
      (fresh.items || []).forEach((it) => {
        ev[it.id] = {
          real_unit_cost: it.real_unit_cost ?? 0,
          real_quantity: it.real_quantity ?? '',
          real_notes: it.real_notes ?? '',
        };
      });
      setEditValues(ev);
      setExtraForm({ name: '', category: 'Extra', unit: 'un', quantity: 1, predicted_unit_cost: 0, real_unit_cost: 0, notes: '' });
      setShowAddExtra(false);
      toast.success('Item extra adicionado');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro a adicionar');
    }
  };

  const exportPDF = async () => {
    if (!data) return;
    try {
      const { data: settings } = await api.get('/proposal-settings').catch(() => ({ data: {} }));
      const logo = settings?.logo_base64 || settings?.logo || null;
      await generateWorkReportPDF(data, settings, logo);
      toast.success('PDF gerado');
    } catch (e) {
      console.error(e);
      toast.error('Erro a gerar PDF');
    }
  };

  const items = data?.items || [];
  const kpis = data?.kpis || {};
  const expenses = data?.expenses || [];
  const filteredItems = useMemo(() => {
    if (!filter.trim()) return items;
    const f = filter.toLowerCase();
    return items.filter((it) => (it.name || '').toLowerCase().includes(f) || (it.category || '').toLowerCase().includes(f));
  }, [items, filter]);

  const allHistory = useMemo(() => {
    const out = [];
    items.forEach((it) => { (it.history || []).forEach((h) => out.push({ item: it.name, ...h })); });
    out.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    return out;
  }, [items]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="work-analysis-dialog"
        className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-[1200px] max-h-[92vh] overflow-y-auto p-0"
      >
        {/* Header sticky */}
        <div className="sticky top-0 z-20 bg-zinc-950 border-b border-zinc-800 px-6 pt-6 pb-4">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white">
                  Análise de Custo · {data?.work?.title || '—'}
                </DialogTitle>
                <DialogDescription className="text-zinc-500 text-sm mt-1">
                  Cliente: {data?.work?.client_name || '—'} · Comparação detalhada entre o previsto no orçamento e o real executado.
                </DialogDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                {data?.work?.budget_id && (
                  <Button
                    data-testid="sync-budget-btn"
                    onClick={syncFromBudget}
                    variant="outline"
                    className="rounded-full border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  >
                    <RefreshCw size={14} className="mr-2" /> Sincronizar do Orçamento
                  </Button>
                )}
                <Button
                  data-testid="export-pdf-btn"
                  onClick={exportPDF}
                  disabled={!data}
                  className="rounded-full bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-semibold"
                >
                  <FileDown size={14} className="mr-2" /> Relatório PDF
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* KPI strip */}
          {data && (
            <div className="mt-4">
              {kpis.is_overrun && (
                <div data-testid="overrun-alert" className="mb-3 flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-2xl px-4 py-2 text-sm">
                  <AlertTriangle size={16} />
                  <span className="font-semibold">Obra ACIMA DO ORÇAMENTO</span>
                  <span className="text-red-200">(+{formatPct(kpis.overrun_pct)})</span>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Venda Total" value={formatEuro(kpis.sale_total)} accent="text-white" />
                <KpiCard label="Custo Previsto" value={formatEuro(kpis.predicted_total)} accent="text-zinc-300" />
                <KpiCard label="Custo Real" value={formatEuro(kpis.real_total)} accent={kpis.is_overrun ? 'text-red-400' : 'text-white'} sub={`Items ${formatEuro(kpis.real_total_items)} + Despesas ${formatEuro(kpis.expenses_total)}`} />
                <KpiCard label="Lucro Real" value={formatEuro(kpis.real_profit)} accent={kpis.real_profit < 0 ? 'text-red-400' : 'text-green-400'} sub={`Margem real ${formatPct(kpis.margin_real_pct)}`} />
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6">
          {loading && (
            <div className="flex justify-center py-10">
              <div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && data && (
            <>
              {/* TABS */}
              <div className="flex gap-2 border-b border-zinc-800 -mx-6 px-6" data-testid="work-tabs">
                <button
                  data-testid="tab-execucao"
                  onClick={() => setTab('execucao')}
                  className={`px-4 py-2.5 text-sm font-semibold transition-colors flex items-center gap-2 border-b-2 -mb-px ${
                    tab === 'execucao'
                      ? 'text-yellow-400 border-yellow-400'
                      : 'text-zinc-500 border-transparent hover:text-white'
                  }`}
                >
                  <ListChecks size={16} /> Execução
                </button>
                <button
                  data-testid="tab-custos"
                  onClick={() => setTab('custos')}
                  className={`px-4 py-2.5 text-sm font-semibold transition-colors flex items-center gap-2 border-b-2 -mb-px ${
                    tab === 'custos'
                      ? 'text-yellow-400 border-yellow-400'
                      : 'text-zinc-500 border-transparent hover:text-white'
                  }`}
                >
                  <Receipt size={16} /> Custos Reais
                </button>
              </div>

              {tab === 'execucao' && (
                <WorkExecutionPanel
                  workId={workId}
                  items={data.items || []}
                  onUpdated={load}
                />
              )}

              {tab === 'custos' && (<>
              {/* Toolbar */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <Input
                    data-testid="items-filter"
                    placeholder="Filtrar items por nome ou categoria…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-white rounded-xl"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    data-testid="toggle-history-btn"
                    onClick={() => setShowHistory((v) => !v)}
                    variant="outline"
                    className="rounded-full border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  >
                    <History size={14} className="mr-2" /> Histórico ({allHistory.length})
                  </Button>
                  <Button
                    data-testid="add-extra-btn"
                    onClick={() => setShowAddExtra((v) => !v)}
                    className="rounded-full bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20 border border-yellow-400/30 font-semibold"
                  >
                    <Plus size={14} className="mr-2" /> Item Imprevisto
                  </Button>
                </div>
              </div>

              {/* Add Extra Form */}
              {showAddExtra && (
                <div data-testid="extra-form" className="bg-zinc-900 border border-yellow-400/30 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-bold flex items-center gap-2"><Sparkles size={16} className="text-yellow-400" /> Novo item imprevisto</h3>
                    <button onClick={() => setShowAddExtra(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-5">
                      <Label className="text-zinc-400 text-xs">Descrição *</Label>
                      <Input data-testid="extra-name" value={extraForm.name} onChange={(e) => setExtraForm({ ...extraForm, name: e.target.value })} className="mt-1 bg-zinc-950 border-zinc-800 text-white rounded-xl" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-zinc-400 text-xs">Categoria</Label>
                      <Input value={extraForm.category} onChange={(e) => setExtraForm({ ...extraForm, category: e.target.value })} className="mt-1 bg-zinc-950 border-zinc-800 text-white rounded-xl" />
                    </div>
                    <div className="md:col-span-1">
                      <Label className="text-zinc-400 text-xs">Un.</Label>
                      <Input value={extraForm.unit} onChange={(e) => setExtraForm({ ...extraForm, unit: e.target.value })} className="mt-1 bg-zinc-950 border-zinc-800 text-white rounded-xl" />
                    </div>
                    <div className="md:col-span-1">
                      <Label className="text-zinc-400 text-xs">Qtd</Label>
                      <Input type="number" step="0.01" value={extraForm.quantity} onChange={(e) => setExtraForm({ ...extraForm, quantity: e.target.value })} className="mt-1 bg-zinc-950 border-zinc-800 text-white rounded-xl" />
                    </div>
                    <div className="md:col-span-1">
                      <Label className="text-zinc-400 text-xs">C.U. Prev.</Label>
                      <Input type="number" step="0.01" value={extraForm.predicted_unit_cost} onChange={(e) => setExtraForm({ ...extraForm, predicted_unit_cost: e.target.value })} className="mt-1 bg-zinc-950 border-zinc-800 text-white rounded-xl" />
                    </div>
                    <div className="md:col-span-1">
                      <Label className="text-zinc-400 text-xs">C.U. Real</Label>
                      <Input type="number" step="0.01" value={extraForm.real_unit_cost} onChange={(e) => setExtraForm({ ...extraForm, real_unit_cost: e.target.value })} className="mt-1 bg-zinc-950 border-zinc-800 text-white rounded-xl" />
                    </div>
                    <div className="md:col-span-1 flex items-end">
                      <Button data-testid="save-extra-btn" onClick={addExtra} className="w-full rounded-xl bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-bold">Adicionar</Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Items table */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-950/80 text-zinc-400 uppercase text-xs">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold">Descrição</th>
                        <th className="text-right px-2 py-3 font-semibold w-16">Qtd</th>
                        <th className="text-right px-2 py-3 font-semibold w-24">Prev. €/u</th>
                        <th className="text-right px-2 py-3 font-semibold w-28">Total Prev.</th>
                        <th className="text-right px-2 py-3 font-semibold w-28">Real €/u</th>
                        <th className="text-right px-2 py-3 font-semibold w-20">Qtd Real</th>
                        <th className="text-right px-2 py-3 font-semibold w-28">Total Real</th>
                        <th className="text-right px-2 py-3 font-semibold w-28">Desvio</th>
                        <th className="text-center px-2 py-3 font-semibold w-24">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.length === 0 && (
                        <tr>
                          <td colSpan={9} className="text-center py-10 text-zinc-500">
                            {items.length === 0
                              ? (data?.work?.budget_id
                                ? 'Sem items. Clica "Sincronizar do Orçamento" para carregar.'
                                : 'Obra sem orçamento associado. Adiciona items imprevistos abaixo.')
                              : 'Nenhum item corresponde ao filtro.'}
                          </td>
                        </tr>
                      )}
                      {filteredItems.map((it) => {
                        const ev = editValues[it.id] || {};
                        const qty = Number(it.quantity || 0);
                        const predUC = Number(it.predicted_unit_cost || 0);
                        const realUC = Number(ev.real_unit_cost || 0);
                        const realQty = ev.real_quantity === '' || ev.real_quantity == null ? qty : Number(ev.real_quantity);
                        const totalReal = realUC > 0 ? realUC * realQty : 0;
                        const totalPrev = predUC * qty;
                        const delta = realUC > 0 ? (totalReal - totalPrev) : 0;
                        const isDirty =
                          (Number(it.real_unit_cost || 0) !== realUC) ||
                          (String(it.real_quantity ?? '') !== String(ev.real_quantity ?? '')) ||
                          ((it.real_notes || '') !== (ev.real_notes || ''));
                        return (
                          <tr key={it.id} className="border-t border-zinc-800 hover:bg-zinc-950/40" data-testid={`work-item-row-${it.id}`}>
                            <td className="px-4 py-3 align-top">
                              <div className="flex items-start gap-2">
                                {it.is_extra && (
                                  <Badge className="bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 shrink-0">Extra</Badge>
                                )}
                                <div className="min-w-0">
                                  <div className="text-white font-medium">{it.name}</div>
                                  <div className="text-xs text-zinc-500 mt-0.5">
                                    {it.category || '—'} · {it.unit || 'un'}
                                    {(it.history || []).length > 0 && (
                                      <span className="ml-2 text-yellow-400/70">· {it.history.length} alteraç{it.history.length === 1 ? 'ão' : 'ões'}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-3 text-right text-zinc-300 align-top">{qty.toString().replace('.', ',')}</td>
                            <td className="px-2 py-3 text-right text-zinc-400 align-top">{formatEuro(predUC)}</td>
                            <td className="px-2 py-3 text-right text-zinc-300 align-top">{formatEuro(totalPrev)}</td>
                            <td className="px-1 py-2 align-top">
                              <Input
                                data-testid={`real-uc-${it.id}`}
                                type="number" step="0.01" min="0"
                                value={ev.real_unit_cost ?? 0}
                                onChange={(e) => setEditValues({ ...editValues, [it.id]: { ...ev, real_unit_cost: e.target.value } })}
                                className="h-8 bg-zinc-950 border-zinc-800 text-white text-right rounded-lg text-xs"
                              />
                            </td>
                            <td className="px-1 py-2 align-top">
                              <Input
                                data-testid={`real-qty-${it.id}`}
                                type="number" step="0.01"
                                placeholder={qty.toString()}
                                value={ev.real_quantity ?? ''}
                                onChange={(e) => setEditValues({ ...editValues, [it.id]: { ...ev, real_quantity: e.target.value } })}
                                className="h-8 bg-zinc-950 border-zinc-800 text-white text-right rounded-lg text-xs"
                              />
                            </td>
                            <td className={`px-2 py-3 text-right font-semibold align-top ${realUC > 0 ? 'text-white' : 'text-zinc-600'}`}>
                              {realUC > 0 ? formatEuro(totalReal) : '—'}
                            </td>
                            <td className={`px-2 py-3 text-right font-bold align-top ${realUC <= 0 ? 'text-zinc-600' : delta > 0 ? 'text-red-400' : 'text-green-400'}`}>
                              {realUC > 0 ? `${delta > 0 ? '+' : ''}${formatEuro(delta)}` : '—'}
                            </td>
                            <td className="px-2 py-3 text-center align-top">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  data-testid={`save-item-${it.id}`}
                                  onClick={() => saveItem(it.id)}
                                  disabled={!isDirty || savingId === it.id}
                                  size="sm"
                                  className={`h-7 px-3 rounded-lg text-xs font-semibold ${isDirty ? 'bg-yellow-400 text-zinc-950 hover:bg-yellow-500' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
                                >
                                  {savingId === it.id ? '…' : 'Guardar'}
                                </Button>
                                {it.is_extra && (
                                  <button
                                    data-testid={`delete-extra-${it.id}`}
                                    onClick={() => deleteItem(it.id)}
                                    className="text-zinc-500 hover:text-red-400 p-1"
                                    title="Eliminar item extra"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Histórico */}
              {showHistory && (
                <div data-testid="history-panel" className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-bold flex items-center gap-2"><History size={16} className="text-yellow-400" /> Histórico de alterações</h3>
                    <Badge className="bg-zinc-800 text-zinc-300">{allHistory.length}</Badge>
                  </div>
                  {allHistory.length === 0 && (
                    <p className="text-zinc-500 text-sm">Ainda sem alterações registadas. As mudanças no custo real são automaticamente registadas aqui.</p>
                  )}
                  {allHistory.length > 0 && (
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {allHistory.map((h, i) => (
                        <div key={`${h.at}-${h.item}-${h.by || 'user'}-${i}`} className="flex items-center justify-between text-sm border-l-2 border-yellow-400/40 pl-3 py-1">
                          <div>
                            <div className="text-white">{h.item}</div>
                            <div className="text-xs text-zinc-500">
                              {new Date(h.at).toLocaleString('pt-PT')} · {h.by || 'utilizador'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-zinc-500">{formatEuro(h.from)} →</div>
                            <div className="text-yellow-400 font-bold">{formatEuro(h.to)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Despesas vinculadas */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-bold flex items-center gap-2"><Receipt size={16} className="text-yellow-400" /> Despesas vinculadas a esta obra</h3>
                  <Badge className="bg-zinc-800 text-zinc-300" data-testid="expenses-count">{expenses.length} · {formatEuro(kpis.expenses_total)}</Badge>
                </div>
                {expenses.length === 0 && (
                  <p className="text-zinc-500 text-sm">
                    Nenhuma despesa registada. Em <span className="text-yellow-400">Despesas</span>, escolhe tipo <span className="text-yellow-400">Obra</span> e seleciona esta obra como centro de custo para que apareça aqui.
                  </p>
                )}
                {expenses.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-zinc-500 uppercase text-xs">
                        <tr>
                          <th className="text-left py-2 font-semibold">Data</th>
                          <th className="text-left py-2 font-semibold">Fornecedor</th>
                          <th className="text-left py-2 font-semibold">Categoria</th>
                          <th className="text-left py-2 font-semibold">Nº Fatura</th>
                          <th className="text-right py-2 font-semibold">Valor c/IVA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((e) => (
                          <tr key={e.id} className="border-t border-zinc-800">
                            <td className="py-2 text-zinc-400">{e.date || '—'}</td>
                            <td className="py-2 text-white">{e.supplier || '—'}</td>
                            <td className="py-2 text-zinc-300">{e.category || '—'}</td>
                            <td className="py-2 text-zinc-500">{e.invoice_number || '—'}</td>
                            <td className="py-2 text-right text-white font-medium">{formatEuro(e.value_gross)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              </>)}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KpiCard({ label, value, accent, sub }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">{label}</div>
      <div className={`text-xl font-black mt-1 ${accent}`}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-1 truncate">{sub}</div>}
    </div>
  );
}
