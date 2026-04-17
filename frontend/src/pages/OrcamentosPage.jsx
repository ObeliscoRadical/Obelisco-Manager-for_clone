import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, FileText, Calculator } from 'lucide-react';
import { toast } from 'sonner';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

let itemIdCounter = 0;
const createItem = () => ({ _key: `item-${++itemIdCounter}`, category: '', name: '', quantity: 1, unit_cost: 0, margin: 0.6 });

const statusColors = {
  rascunho: 'bg-zinc-700 text-zinc-300',
  proposta_gerada: 'bg-yellow-400/20 text-yellow-400',
  aprovado: 'bg-green-500/20 text-green-400',
  rejeitado: 'bg-red-500/20 text-red-400',
};
const statusLabels = {
  rascunho: 'Rascunho',
  proposta_gerada: 'Proposta Gerada',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
};

export default function OrcamentosPage() {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [items, setItems] = useState([createItem()]);

  const fetchBudgets = useCallback(async () => {
    try {
      const { data } = await api.get('/budgets');
      setBudgets(data);
    } catch (err) {
      console.error('Budgets fetch error:', err.message);
      toast.error('Erro ao carregar orcamentos');
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBudgets(); }, [fetchBudgets]);

  const openNew = () => {
    setEditingBudget(null);
    setTitle(''); setClientName(''); setClientPhone('');
    setItems([{ ...defaultItem }]);
    setDialogOpen(true);
  };

  const openEdit = (budget) => {
    setEditingBudget(budget);
    setTitle(budget.title);
    setClientName(budget.client_name);
    setClientPhone(budget.client_phone || '');
    setItems(budget.items?.length > 0 ? budget.items.map(i => ({ ...i })) : [{ ...defaultItem }]);
    setDialogOpen(true);
  };

  const addItem = () => setItems([...items, createItem()]);
  const removeItem = (idx) => { if (items.length > 1) setItems(items.filter((_, i) => i !== idx)); };
  const updateItem = (idx, field, value) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: field === 'category' || field === 'name' ? value : (parseFloat(value) || 0) };
    setItems(next);
  };

  const totalCost = useMemo(() => items.reduce((sum, item) => sum + item.unit_cost * item.quantity, 0), [items]);
  const totalPrice = useMemo(() => items.reduce((sum, item) => sum + item.unit_cost * (1 + item.margin) * item.quantity, 0), [items]);

  const handleSave = async () => {
    if (!title || !clientName) { toast.error('Preencha o titulo e nome do cliente'); return; }
    try {
      const payload = { title, client_name: clientName, client_phone: clientPhone, items: items.map(({ _key, ...rest }) => rest) };
      if (editingBudget) {
        await api.put(`/budgets/${editingBudget.id}`, payload);
        toast.success('Orcamento atualizado');
      } else {
        await api.post('/budgets', payload);
        toast.success('Orcamento criado');
      }
      setDialogOpen(false);
      fetchBudgets();
    } catch (err) {
      console.error('Save budget error:', err.message);
      toast.error('Erro ao guardar orcamento');
    }
  };

  const handleGenerateProposals = async (budgetId) => {
    try {
      await api.post(`/budgets/${budgetId}/generate-proposals`);
      toast.success('3 propostas geradas com sucesso!');
      fetchBudgets();
    } catch { toast.error('Erro ao gerar propostas'); }
  };

  const handleDelete = async (budgetId) => {
    if (!window.confirm('Eliminar este orcamento?')) return;
    try {
      await api.delete(`/budgets/${budgetId}`);
      toast.success('Orcamento eliminado');
      fetchBudgets();
    } catch { toast.error('Erro ao eliminar'); }
  };

  return (
    <div data-testid="orcamentos-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Orcamentos</h1>
          <p className="text-zinc-400 mt-1 font-medium">Gere e calcule os seus orcamentos</p>
        </div>
        <Button data-testid="new-budget-btn" onClick={openNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={18} className="mr-2" /> Novo Orcamento
        </Button>
      </div>

      {loading && (
        <div className="flex justify-center py-16"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
      )}
      {!loading && budgets.length === 0 && (
        <div className="text-center py-16 text-zinc-500">
          <FileText size={48} className="mx-auto mb-4 text-zinc-700" />
          <p>Nenhum orcamento criado</p>
        </div>
      )}
      {!loading && budgets.length > 0 && (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Titulo</TableHead>
                <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Cliente</TableHead>
                <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Total</TableHead>
                <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Estado</TableHead>
                <TableHead className="text-zinc-400 text-xs uppercase tracking-wider text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgets.map(b => (
                <TableRow key={b.id} className="border-zinc-800/50 hover:bg-zinc-800/30">
                  <TableCell className="text-white font-medium">{b.title}</TableCell>
                  <TableCell className="text-zinc-300">{b.client_name}</TableCell>
                  <TableCell className="text-yellow-400 font-semibold">{formatEuro(b.total_price)}</TableCell>
                  <TableCell><Badge className={statusColors[b.status]}>{statusLabels[b.status] || b.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button data-testid={`edit-budget-${b.id}`} variant="ghost" size="sm" onClick={() => openEdit(b)} className="text-zinc-400 hover:text-white h-8 w-8 p-0"><Pencil size={15} /></Button>
                      <Button data-testid={`generate-proposals-${b.id}`} variant="ghost" size="sm" onClick={() => handleGenerateProposals(b.id)} className="text-yellow-400 hover:text-yellow-300 h-8 w-8 p-0"><Calculator size={15} /></Button>
                      <Button data-testid={`delete-budget-${b.id}`} variant="ghost" size="sm" onClick={() => handleDelete(b.id)} className="text-red-400 hover:text-red-300 h-8 w-8 p-0"><Trash2 size={15} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white">
              {editingBudget ? 'Editar Orcamento' : 'Novo Orcamento'}
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              {editingBudget ? 'Atualize os detalhes do orcamento' : 'Preencha os detalhes do novo orcamento'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-zinc-300 text-sm">Titulo</Label>
                <Input data-testid="budget-title-input" value={title} onChange={e => setTitle(e.target.value)} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="Ex: Instalacao eletrica" />
              </div>
              <div>
                <Label className="text-zinc-300 text-sm">Nome do Cliente</Label>
                <Input data-testid="budget-client-input" value={clientName} onChange={e => setClientName(e.target.value)} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="Ex: Joao Silva" />
              </div>
              <div>
                <Label className="text-zinc-300 text-sm">Telefone</Label>
                <Input data-testid="budget-phone-input" value={clientPhone} onChange={e => setClientPhone(e.target.value)} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="Ex: 911132401" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-zinc-300 text-base font-semibold">Itens do Orcamento</Label>
                <Button data-testid="add-item-btn" onClick={addItem} variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-full text-xs">
                  <Plus size={14} className="mr-1" /> Item
                </Button>
              </div>
              <div className="rounded-xl border border-zinc-800 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="text-zinc-500 text-xs">Categoria</TableHead>
                      <TableHead className="text-zinc-500 text-xs">Item</TableHead>
                      <TableHead className="text-zinc-500 text-xs w-20">Qtd</TableHead>
                      <TableHead className="text-zinc-500 text-xs w-28">Custo (EUR)</TableHead>
                      <TableHead className="text-zinc-500 text-xs w-20">Margem</TableHead>
                      <TableHead className="text-zinc-500 text-xs w-28">Preco (EUR)</TableHead>
                      <TableHead className="text-zinc-500 text-xs w-28">Total (EUR)</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => {
                      const salePrice = item.unit_cost * (1 + item.margin);
                      const total = salePrice * item.quantity;
                      return (
                        <TableRow key={item._key} className="border-zinc-800/50">
                          <TableCell className="p-1"><Input value={item.category} onChange={e => updateItem(idx, 'category', e.target.value)} className="bg-transparent border-zinc-800 text-white h-9 rounded-lg text-sm" placeholder="Cat." /></TableCell>
                          <TableCell className="p-1"><Input value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} className="bg-transparent border-zinc-800 text-white h-9 rounded-lg text-sm" placeholder="Nome" /></TableCell>
                          <TableCell className="p-1"><Input type="number" min="0" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="bg-transparent border-zinc-800 text-white h-9 rounded-lg text-sm w-16" /></TableCell>
                          <TableCell className="p-1"><Input type="number" min="0" step="0.01" value={item.unit_cost} onChange={e => updateItem(idx, 'unit_cost', e.target.value)} className="bg-transparent border-zinc-800 text-white h-9 rounded-lg text-sm w-24" /></TableCell>
                          <TableCell className="p-1"><Input type="number" min="0" step="0.01" value={item.margin} onChange={e => updateItem(idx, 'margin', e.target.value)} className="bg-transparent border-zinc-800 text-white h-9 rounded-lg text-sm w-16" /></TableCell>
                          <TableCell className="text-zinc-300 text-sm px-2">{salePrice.toFixed(2)}</TableCell>
                          <TableCell className="text-yellow-400 font-medium text-sm px-2">{total.toFixed(2)}</TableCell>
                          <TableCell className="p-1"><button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={14} /></button></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
              <div className="flex gap-8">
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Custo Total</p>
                  <p className="text-xl font-bold text-zinc-300">{formatEuro(totalCost)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Preco Total</p>
                  <p className="text-xl font-bold text-yellow-400">{formatEuro(totalPrice)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Margem</p>
                  <p className="text-xl font-bold text-green-400">
                    {totalCost > 0 ? (((totalPrice - totalCost) / totalCost) * 100).toFixed(1) : '0'}%
                  </p>
                </div>
              </div>
              <Button data-testid="save-budget-btn" onClick={handleSave} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
                Guardar Orcamento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
