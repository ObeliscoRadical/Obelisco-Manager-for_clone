import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Search, Package, ArrowDown, ArrowUp, AlertTriangle, ScanLine, Loader2, Upload, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

const emptyForm = { code: '', description: '', category: '', subcategory: '', brand: '', supplier: '', unit: 'unidade', purchase_price: 0, market_price: 0, waste_pct: 5, stock_current: 0, stock_min: 0, notes: '', active: true };

export default function MateriaisPage() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [stockDialog, setStockDialog] = useState({ open: false, material: null, type: 'entrada' });
  const [stockQty, setStockQty] = useState(0);
  const [stockReason, setStockReason] = useState('');

  // --- Importação de fatura via OCR ---
  const [importDialog, setImportDialog] = useState({ open: false, step: 'upload', file: null, preview: null, decisions: {}, applying: false });

  const onPickInvoice = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportDialog((d) => ({ ...d, file, step: 'extracting' }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/materials/import-invoice/extract', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      // Build decisions map from suggested_action
      const decisions = {};
      (data.lines || []).forEach((ln, idx) => {
        decisions[idx] = ln.suggested_action || (ln.match_status === 'new' ? 'create' : 'update_stock_only');
      });
      setImportDialog((d) => ({ ...d, step: 'review', preview: data, decisions }));
    } catch (err) {
      const detail = err?.response?.data?.detail || err.message;
      toast.error(`Erro a analisar fatura: ${detail}`);
      setImportDialog((d) => ({ ...d, step: 'upload' }));
    }
  };

  const setDecision = (idx, action) => {
    setImportDialog((d) => ({ ...d, decisions: { ...d.decisions, [idx]: action } }));
  };

  const bulkSetDecision = (statusFilter, action) => {
    setImportDialog((d) => {
      const next = { ...d.decisions };
      (d.preview.lines || []).forEach((ln, idx) => {
        if (statusFilter == null || ln.match_status === statusFilter) next[idx] = action;
      });
      return { ...d, decisions: next };
    });
  };

  const applyImport = async () => {
    if (!importDialog.preview) return;
    const linesPayload = importDialog.preview.lines.map((ln, idx) => ({
      action: importDialog.decisions[idx] || 'skip',
      description: ln.description,
      quantity: ln.quantity,
      unit_price: ln.unit_price,
      code: ln.code || '',
      brand: ln.brand || '',
      unit: ln.unit || 'un',
      category: ln.category || '',
      vat_rate: ln.vat_rate || 23,
      existing_material_id: ln.existing_material_id || null,
    }));
    setImportDialog((d) => ({ ...d, applying: true }));
    try {
      const { data } = await api.post('/materials/import-invoice/apply', {
        supplier: importDialog.preview.supplier,
        nif: importDialog.preview.nif,
        invoice_number: importDialog.preview.invoice_number,
        date: importDialog.preview.date,
        file_ref: importDialog.preview.file_ref,
        lines: linesPayload,
      });
      toast.success(`Stock atualizado: ${data.summary.created} criados · ${data.summary.updated_stock} atualizados`);
      setImportDialog({ open: false, step: 'upload', file: null, preview: null, decisions: {}, applying: false });
      fetchMaterials();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro a aplicar import');
      setImportDialog((d) => ({ ...d, applying: false }));
    }
  };

  const fetchMaterials = useCallback(async () => {
    try { const { data } = await api.get('/materials'); setMaterials(data); }
    catch (err) { console.error(err.message); toast.error('Erro ao carregar materiais'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  const categories = [...new Set(materials.map(m => m.category).filter(Boolean))].sort();

  const filtered = materials.filter(m => {
    if (filterCat && m.category !== filterCat) return false;
    if (search) {
      const s = search.toLowerCase();
      return m.description?.toLowerCase().includes(s) || m.code?.toLowerCase().includes(s) || m.brand?.toLowerCase().includes(s);
    }
    return true;
  });

  const openNew = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (m) => { setEditing(m); setForm({ ...emptyForm, ...m }); setDialogOpen(true); };

  const openStock = (material, type) => {
    setStockDialog({ open: true, material, type });
    setStockQty(0);
    setStockReason(type === 'entrada' ? 'Compra' : 'Consumo obra');
  };

  const handleStockMovement = async () => {
    if (!stockQty || stockQty <= 0) { toast.error('Quantidade inválida'); return; }
    try {
      await api.post('/stock/movement', {
        material_id: stockDialog.material.id,
        movement_type: stockDialog.type,
        quantity: stockQty,
        reason: stockReason,
      });
      toast.success(`${stockDialog.type === 'entrada' ? 'Entrada' : 'Saída'} registada`);
      setStockDialog({ open: false, material: null, type: 'entrada' });
      fetchMaterials();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro no movimento'); }
  };

  const handleSave = async () => {
    if (!form.description) { toast.error('Preencha a descrição'); return; }
    try {
      if (editing) { await api.put(`/materials/${editing.id}`, form); toast.success('Material atualizado'); }
      else { await api.post('/materials', form); toast.success('Material criado'); }
      setDialogOpen(false); fetchMaterials();
    } catch { toast.error('Erro ao guardar'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar este material?')) return;
    try { await api.delete(`/materials/${id}`); toast.success('Eliminado'); fetchMaterials(); }
    catch { toast.error('Erro'); }
  };

  return (
    <div data-testid="materiais-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Materiais</h1>
          <p className="text-zinc-400 mt-1 font-medium">{materials.length} materiais na base de dados</p>
        </div>
        <Button data-testid="new-material-btn" onClick={openNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={16} className="mr-2" /> Novo Material
        </Button>
        <Button data-testid="import-invoice-btn" onClick={() => setImportDialog({ open: true, step: 'upload', file: null, preview: null, decisions: {}, applying: false })} className="bg-zinc-100 text-zinc-950 hover:bg-white rounded-full font-semibold ml-2">
          <ScanLine size={16} className="mr-2" /> Importar Fatura
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input data-testid="material-search" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="Pesquisar material..." />
        </div>
        <select data-testid="material-filter-cat" value={filterCat} onChange={e => setFilterCat(e.target.value)} className="bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 text-sm">
          <option value="">Todas categorias</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400 text-xs uppercase">Codigo</TableHead>
                <TableHead className="text-zinc-400 text-xs uppercase">Descrição</TableHead>
                <TableHead className="text-zinc-400 text-xs uppercase">Categoria</TableHead>
                <TableHead className="text-zinc-400 text-xs uppercase">Unid.</TableHead>
                <TableHead className="text-zinc-400 text-xs uppercase">Preco Compra</TableHead>
                <TableHead className="text-zinc-400 text-xs uppercase text-center">Stock</TableHead>
                <TableHead className="text-zinc-400 text-xs uppercase">Desp. %</TableHead>
                <TableHead className="text-zinc-400 text-xs uppercase text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 100).map(m => {
                const stock = m.stock_current || 0;
                const min = m.stock_min || 0;
                const low = min > 0 && stock <= min;
                return (
                <TableRow key={m.id} className="border-zinc-800/50 hover:bg-zinc-800/30">
                  <TableCell className="text-zinc-500 text-xs font-mono">{m.code || '-'}</TableCell>
                  <TableCell className="text-white text-sm font-medium">{m.description}</TableCell>
                  <TableCell><Badge className="bg-zinc-800 text-zinc-300 text-xs">{m.category || '-'}</Badge></TableCell>
                  <TableCell className="text-zinc-400 text-sm">{m.unit}</TableCell>
                  <TableCell className={`text-sm font-medium ${m.purchase_price > 0 ? 'text-yellow-400' : 'text-red-400'}`}>{m.purchase_price > 0 ? formatEuro(m.purchase_price) : 'Sem preco'}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      {low && <AlertTriangle size={12} className="text-red-400" />}
                      <span className={`text-sm font-bold ${low ? 'text-red-400' : stock > 0 ? 'text-green-400' : 'text-zinc-500'}`}>{stock} {m.unit}</span>
                    </div>
                    {min > 0 && <p className="text-[10px] text-zinc-600">min: {min}</p>}
                  </TableCell>
                  <TableCell className="text-zinc-400 text-sm">{m.waste_pct}%</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <button onClick={() => openStock(m, 'entrada')} className="text-green-400 hover:text-green-300 p-1" title="Entrada de stock"><ArrowDown size={14} /></button>
                    <button onClick={() => openStock(m, 'saida')} className="text-orange-400 hover:text-orange-300 p-1" title="Saída de stock"><ArrowUp size={14} /></button>
                    <button onClick={() => openEdit(m)} className="text-zinc-500 hover:text-white p-1"><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(m.id)} className="text-zinc-500 hover:text-red-400 p-1 ml-1"><Trash2 size={14} /></button>
                  </TableCell>
                </TableRow>
              );})}
            </TableBody>
          </Table>
          {filtered.length > 100 && <p className="text-zinc-500 text-xs text-center py-2">A mostrar 100 de {filtered.length} materiais</p>}
          {filtered.length === 0 && <div className="text-center py-12 text-zinc-500"><Package size={36} className="mx-auto mb-2 text-zinc-700" /><p>Sem resultados</p></div>}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white">{editing ? 'Editar Material' : 'Novo Material'}</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">Dados do material e preco de compra</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-300 text-sm">Codigo interno</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
              <div><Label className="text-zinc-300 text-sm">Unidade</Label><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="un/m/pack" /></div>
            </div>
            <div><Label className="text-zinc-300 text-sm">Descrição *</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-300 text-sm">Categoria</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
              <div><Label className="text-zinc-300 text-sm">Subcategoria</Label><Input value={form.subcategory} onChange={e => setForm({ ...form, subcategory: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-300 text-sm">Marca</Label><Input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
              <div><Label className="text-zinc-300 text-sm">Fornecedor</Label><Input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label className="text-zinc-300 text-sm">Preco Compra (EUR)</Label><Input type="number" step="0.01" value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: parseFloat(e.target.value) || 0 })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
              <div><Label className="text-zinc-300 text-sm">Preco Mercado (EUR)</Label><Input type="number" step="0.01" value={form.market_price} onChange={e => setForm({ ...form, market_price: parseFloat(e.target.value) || 0 })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
              <div><Label className="text-zinc-300 text-sm">Desperdicio (%)</Label><Input type="number" step="0.5" value={form.waste_pct} onChange={e => setForm({ ...form, waste_pct: parseFloat(e.target.value) || 0 })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800">
              <div><Label className="text-zinc-300 text-sm">📦 Stock atual</Label><Input type="number" step="0.5" value={form.stock_current} onChange={e => setForm({ ...form, stock_current: parseFloat(e.target.value) || 0 })} className="mt-1 bg-zinc-900 border-zinc-700 text-white rounded-xl" /></div>
              <div><Label className="text-zinc-300 text-sm">Stock mínimo (alerta)</Label><Input type="number" step="0.5" value={form.stock_min} onChange={e => setForm({ ...form, stock_min: parseFloat(e.target.value) || 0 })} className="mt-1 bg-zinc-900 border-zinc-700 text-white rounded-xl" placeholder="0 = sem alerta" /></div>
            </div>
            <div><Label className="text-zinc-300 text-sm">Observações</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
            <Button onClick={handleSave} className="w-full bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold h-12">Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock Movement Dialog */}
      <Dialog open={stockDialog.open} onOpenChange={(o) => setStockDialog({ ...stockDialog, open: o })}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-white">
              {stockDialog.type === 'entrada' ? '⬇️ Entrada' : '⬆️ Saída'} de Stock
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-xs">
              {stockDialog.material?.description} | Stock atual: <span className="text-yellow-400 font-bold">{stockDialog.material?.stock_current || 0} {stockDialog.material?.unit}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 mt-2">
            <div>
              <Label className="text-zinc-400 text-xs">Quantidade</Label>
              <Input data-testid="stock-qty" type="number" step="0.5" value={stockQty} onChange={e => setStockQty(parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1 font-bold" autoFocus />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Motivo</Label>
              <select value={stockReason} onChange={e => setStockReason(e.target.value)} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
                {stockDialog.type === 'entrada' ? (
                  <>
                    <option>Compra</option>
                    <option>Devolução cliente</option>
                    <option>Ajuste inventário</option>
                    <option>Outros</option>
                  </>
                ) : (
                  <>
                    <option>Consumo obra</option>
                    <option>Devolução fornecedor</option>
                    <option>Perda/Quebra</option>
                    <option>Ajuste inventário</option>
                    <option>Outros</option>
                  </>
                )}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setStockDialog({ ...stockDialog, open: false })} className="border-zinc-700 text-zinc-300">Cancelar</Button>
            <Button data-testid="confirm-stock-btn" onClick={handleStockMovement} className={`${stockDialog.type === 'entrada' ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-500 hover:bg-orange-600'} text-white font-semibold`}>Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* IMPORT INVOICE Dialog */}
      <Dialog open={importDialog.open} onOpenChange={(o) => !o && setImportDialog({ open: false, step: 'upload', file: null, preview: null, decisions: {}, applying: false })}>
        <DialogContent data-testid="import-invoice-dialog" className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase text-white flex items-center gap-2"><ScanLine className="text-yellow-400" /> Importar Fatura por IA</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Tira foto ou faz upload de uma fatura — a IA identifica os items, faz match com a tua base e propõe atualizações de stock.
            </DialogDescription>
          </DialogHeader>

          {importDialog.step === 'upload' && (
            <div className="mt-6 space-y-4">
              <label data-testid="invoice-upload-label" className="block border-2 border-dashed border-zinc-700 rounded-2xl p-10 text-center cursor-pointer hover:border-yellow-400/50 transition">
                <input type="file" accept=".pdf,image/*" onChange={onPickInvoice} className="hidden" capture="environment" />
                <Upload size={32} className="mx-auto text-zinc-500 mb-3" />
                <div className="text-white font-bold">Tira foto ou escolhe ficheiro</div>
                <div className="text-zinc-500 text-xs mt-1">PDF, JPG, PNG, WEBP — até 10MB</div>
              </label>
              <div className="text-xs text-zinc-500 space-y-1">
                <p>• A IA usa <span className="text-yellow-400">Gemini 2.5 Pro</span> para extrair fornecedor, NIF e linhas da fatura.</p>
                <p>• Items são comparados com a tua base por NIF do fornecedor + nome (com tolerância a variações).</p>
                <p>• Tu vais rever cada linha antes de aplicar — nada é guardado sem a tua confirmação.</p>
              </div>
            </div>
          )}

          {importDialog.step === 'extracting' && (
            <div className="py-20 flex flex-col items-center justify-center text-zinc-400">
              <Loader2 className="animate-spin text-yellow-400 mb-4" size={32} />
              <p className="font-bold">A analisar a fatura…</p>
              <p className="text-xs text-zinc-500 mt-1">Pode demorar 10-30 segundos.</p>
            </div>
          )}

          {importDialog.step === 'review' && importDialog.preview && (
            <div className="space-y-4 mt-4">
              {/* Cabeçalho fatura */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <InfoItem label="Fornecedor" value={importDialog.preview.supplier || '—'} />
                <InfoItem label="NIF" value={importDialog.preview.nif || '—'} />
                <InfoItem label="Nº Fatura" value={importDialog.preview.invoice_number || '—'} />
                <InfoItem label="Data" value={importDialog.preview.date || '—'} />
              </div>

              {/* Resumo */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <SummaryCard label="Total Linhas" value={importDialog.preview.summary.total_lines} color="text-white" />
                <SummaryCard label="Existem ✓" value={importDialog.preview.summary.matched_same_cost} color="text-green-400" />
                <SummaryCard label="Preço Mudou" value={importDialog.preview.summary.matched_cost_changed} color="text-orange-300" />
                <SummaryCard label="Match Duvidoso" value={importDialog.preview.summary.fuzzy} color="text-blue-300" />
                <SummaryCard label="Novos" value={importDialog.preview.summary.new} color="text-yellow-400" />
              </div>

              {/* Acções massa */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-zinc-500 uppercase tracking-wide">Aplicar a todos os preços alterados:</span>
                <Button size="sm" data-testid="bulk-accept-prices" onClick={() => bulkSetDecision('matched_cost_changed', 'update_stock_and_price')} variant="outline" className="border-green-500/40 text-green-400 hover:bg-green-500/10 rounded-full">Aceitar todos os preços novos</Button>
                <Button size="sm" data-testid="bulk-reject-prices" onClick={() => bulkSetDecision('matched_cost_changed', 'update_stock_only')} variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-full">Manter preços antigos</Button>
                <Button size="sm" data-testid="bulk-skip-fuzzy" onClick={() => bulkSetDecision('fuzzy', 'skip')} variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-full">Ignorar duvidosos</Button>
              </div>

              {/* Tabela */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-950/80 text-zinc-500 uppercase text-xs">
                      <tr>
                        <th className="text-left px-3 py-2">Estado</th>
                        <th className="text-left px-3 py-2">Descrição da fatura</th>
                        <th className="text-center px-2 py-2">Qtd</th>
                        <th className="text-right px-2 py-2">Preço Fatura</th>
                        <th className="text-right px-2 py-2">Preço Atual</th>
                        <th className="text-right px-2 py-2">Δ %</th>
                        <th className="text-center px-3 py-2">Acção</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importDialog.preview.lines.map((ln, idx) => {
                        const decision = importDialog.decisions[idx] || 'skip';
                        const badge = MATCH_BADGES[ln.match_status] || MATCH_BADGES.new;
                        return (
                          <tr key={idx} data-testid={`import-line-${idx}`} className="border-t border-zinc-800 hover:bg-zinc-950/40">
                            <td className="px-3 py-2">
                              <Badge className={`${badge.color} text-[10px]`}>{badge.label}</Badge>
                              {ln.match_status === 'fuzzy' && <div className="text-[10px] text-zinc-500 mt-1">sim {Math.round(ln.match_score * 100)}%</div>}
                            </td>
                            <td className="px-3 py-2">
                              <div className="text-white truncate max-w-[300px]">{ln.description}</div>
                              {ln.existing_description && ln.existing_description !== ln.description && (
                                <div className="text-[10px] text-zinc-500 mt-0.5">↳ matches: {ln.existing_description}</div>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center text-zinc-300">{ln.quantity} {ln.unit}</td>
                            <td className="px-2 py-2 text-right text-white font-semibold">{formatEuro(ln.unit_price)}</td>
                            <td className="px-2 py-2 text-right text-zinc-400">{ln.existing_purchase_price != null ? formatEuro(ln.existing_purchase_price) : '—'}</td>
                            <td className={`px-2 py-2 text-right font-bold ${ln.price_diff_pct == null ? 'text-zinc-600' : ln.price_diff_pct > 0 ? 'text-red-400' : ln.price_diff_pct < 0 ? 'text-green-400' : 'text-zinc-500'}`}>
                              {ln.price_diff_pct == null ? '—' : `${ln.price_diff_pct > 0 ? '+' : ''}${ln.price_diff_pct}%`}
                            </td>
                            <td className="px-3 py-2">
                              <select
                                data-testid={`import-action-${idx}`}
                                value={decision}
                                onChange={(e) => setDecision(idx, e.target.value)}
                                className="bg-zinc-950 border border-zinc-700 text-white text-xs rounded-lg px-2 py-1 w-full"
                              >
                                {ln.match_status === 'new' && <option value="create">Criar novo material</option>}
                                {(ln.match_status === 'matched_same_cost' || ln.match_status === 'matched_cost_changed') && (
                                  <>
                                    <option value="update_stock_only">Somar ao stock (manter preço)</option>
                                    <option value="update_stock_and_price">Somar + atualizar preço</option>
                                  </>
                                )}
                                {ln.match_status === 'fuzzy' && (
                                  <>
                                    <option value="create">Criar como novo</option>
                                    <option value="update_stock_only">Usar match (manter preço)</option>
                                    <option value="update_stock_and_price">Usar match + atualizar preço</option>
                                  </>
                                )}
                                <option value="skip">Ignorar esta linha</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2 pt-3 border-t border-zinc-800">
                <Button variant="outline" onClick={() => setImportDialog({ open: false, step: 'upload', file: null, preview: null, decisions: {}, applying: false })} className="border-zinc-700 text-zinc-300">Cancelar</Button>
                <Button
                  data-testid="apply-import-btn"
                  onClick={applyImport}
                  disabled={importDialog.applying}
                  className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-bold rounded-full"
                >
                  {importDialog.applying ? <Loader2 className="animate-spin mr-2" size={16} /> : <CheckCircle2 size={16} className="mr-2" />}
                  {importDialog.applying ? 'A aplicar…' : 'Aplicar ao Stock'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const MATCH_BADGES = {
  matched_same_cost: { label: 'Existe ✓', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  matched_cost_changed: { label: 'Preço mudou', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  fuzzy: { label: 'Match duvidoso', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  new: { label: 'Novo', color: 'bg-yellow-400/20 text-yellow-300 border-yellow-400/30' },
};

function InfoItem({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-zinc-500 tracking-wide">{label}</div>
      <div className="text-sm text-white truncate">{value}</div>
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-2xl font-black ${color}`}>{value}</div>
    </div>
  );
}
