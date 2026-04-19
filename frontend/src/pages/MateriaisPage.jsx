import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Search, Package, ArrowDown, ArrowUp, AlertTriangle } from 'lucide-react';
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
    </div>
  );
}
