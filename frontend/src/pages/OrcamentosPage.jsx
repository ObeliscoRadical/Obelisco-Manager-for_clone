import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, FileText, Calculator, Search, Loader2, ChevronDown, Download, Upload, Copy, History } from 'lucide-react';
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
  const [categories, setCategories] = useState([]);
  const [searchingPrice, setSearchingPrice] = useState({});

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

  const fetchCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/categories');
      setCategories(data);
    } catch (err) {
      console.error('Categories fetch error:', err.message);
    }
  }, []);

  useEffect(() => { fetchBudgets(); fetchCategories(); }, [fetchBudgets, fetchCategories]);

  const openNew = () => {
    setEditingBudget(null);
    setTitle(''); setClientName(''); setClientPhone('');
    setItems([createItem()]);
    setDialogOpen(true);
  };

  const openEdit = (budget) => {
    setEditingBudget(budget);
    setTitle(budget.title);
    setClientName(budget.client_name);
    setClientPhone(budget.client_phone || '');
    setItems(budget.items?.length > 0 ? budget.items.map(i => ({ ...i, _key: `item-${++itemIdCounter}` })) : [createItem()]);
    setDialogOpen(true);
  };

  const addItem = () => setItems([...items, createItem()]);
  const removeItem = (idx) => { if (items.length > 1) setItems(items.filter((_, i) => i !== idx)); };

  const updateItem = (idx, field, value) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: field === 'category' || field === 'name' ? value : (parseFloat(value) || 0) };
    setItems(next);
  };

  const handleCategoryChange = (idx, categoryId) => {
    const next = [...items];
    const cat = categories.find(c => c.id === categoryId);
    next[idx] = { ...next[idx], category: cat ? cat.name : categoryId, name: '' };
    setItems(next);
  };

  const handleItemSelect = (idx, itemName) => {
    if (itemName === '__custom__') {
      const next = [...items];
      next[idx] = { ...next[idx], name: '', _customName: true };
      setItems(next);
      return;
    }
    const next = [...items];
    next[idx] = { ...next[idx], name: itemName, _customName: false };
    setItems(next);
    // Auto-search price when item is selected
    if (itemName) {
      searchPrice(idx, itemName);
    }
  };

  const searchPrice = async (idx, overrideName) => {
    const item = items[idx];
    const itemName = overrideName || item.name;
    if (!itemName) { toast.error('Insira o nome do item primeiro'); return; }
    const searchKey = item._key;
    setSearchingPrice(prev => ({ ...prev, [searchKey]: true }));
    try {
      const { data } = await api.post('/price-lookup', { item_name: itemName });
      if (data.price > 0) {
        setItems(prev => {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            name: overrideName || next[idx].name,
            unit_cost: data.price,
            margin: data.margin || 0.6,
          };
          return next;
        });
        const marginPct = ((data.margin || 0.6) * 100).toFixed(0);
        toast.success(
          `${itemName}: ${formatEuro(data.price)} | Margem sugerida: ${marginPct}% (inclui mao de obra ${formatEuro(data.install_cost)})`,
          { duration: 6000 }
        );
      } else {
        toast.error(`Nao foi possivel encontrar preco para: ${itemName}`);
      }
    } catch (err) {
      console.error('Price lookup error:', err.message);
      toast.error('Erro na pesquisa de preco');
    } finally {
      setSearchingPrice(prev => ({ ...prev, [searchKey]: false }));
    }
  };

  const getCategoryItems = (categoryName) => {
    const cat = categories.find(c => c.name === categoryName);
    return cat ? cat.items : [];
  };

  const totalCost = useMemo(() => items.reduce((sum, item) => sum + item.unit_cost * item.quantity, 0), [items]);
  const totalPrice = useMemo(() => items.reduce((sum, item) => sum + item.unit_cost * (1 + item.margin) * item.quantity, 0), [items]);

  const handleSave = async () => {
    if (!title || !clientName) { toast.error('Preencha o titulo e nome do cliente'); return; }
    try {
      const payload = { title, client_name: clientName, client_phone: clientPhone, items: items.map(({ _key, _customName, ...rest }) => rest) };
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

  const handleExportExcel = (budgetId) => {
    window.open(`${process.env.REACT_APP_BACKEND_URL}/api/budgets/${budgetId}/export-excel`, '_blank');
  };

  const handleDuplicate = async (budgetId) => {
    try {
      await api.post(`/budgets/${budgetId}/duplicate`);
      toast.success('Orcamento duplicado');
      fetchBudgets();
    } catch { toast.error('Erro ao duplicar'); }
  };

  const handleSaveVersion = async (budgetId) => {
    try {
      const { data } = await api.post(`/budgets/${budgetId}/save-version`);
      toast.success(`Versao ${data.version} guardada`);
    } catch { toast.error('Erro ao guardar versao'); }
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post('/budgets/import-excel', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Orcamento importado de Excel');
      fetchBudgets();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao importar');
    }
    e.target.value = '';
  };

  return (
    <div data-testid="orcamentos-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Orcamentos</h1>
          <p className="text-zinc-400 mt-1 font-medium">Gere e calcule os seus orcamentos</p>
        </div>
        <div className="flex gap-2">
          <label className="cursor-pointer">
            <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} className="hidden" />
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded-full font-medium text-sm transition">
              <Upload size={16} /> Importar Excel
            </span>
          </label>
          <Button data-testid="new-budget-btn" onClick={openNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
            <Plus size={18} className="mr-2" /> Novo Orcamento
          </Button>
        </div>
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
                      <Button data-testid={`edit-budget-${b.id}`} variant="ghost" size="sm" onClick={() => openEdit(b)} className="text-zinc-400 hover:text-white h-8 w-8 p-0" title="Editar"><Pencil size={15} /></Button>
                      <Button data-testid={`generate-proposals-${b.id}`} variant="ghost" size="sm" onClick={() => handleGenerateProposals(b.id)} className="text-yellow-400 hover:text-yellow-300 h-8 w-8 p-0" title="Gerar Propostas"><Calculator size={15} /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleExportExcel(b.id)} className="text-green-400 hover:text-green-300 h-8 w-8 p-0" title="Excel"><Download size={15} /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDuplicate(b.id)} className="text-blue-400 hover:text-blue-300 h-8 w-8 p-0" title="Duplicar"><Copy size={15} /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleSaveVersion(b.id)} className="text-purple-400 hover:text-purple-300 h-8 w-8 p-0" title="Guardar Versao"><History size={15} /></Button>
                      <Button data-testid={`delete-budget-${b.id}`} variant="ghost" size="sm" onClick={() => handleDelete(b.id)} className="text-red-400 hover:text-red-300 h-8 w-8 p-0" title="Eliminar"><Trash2 size={15} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white">
              {editingBudget ? 'Editar Orcamento' : 'Novo Orcamento'}
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              {editingBudget ? 'Atualize os detalhes do orcamento' : 'Preencha os detalhes do novo orcamento. Use as categorias pre-definidas e pesquise precos atualizados.'}
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
                <div>
                  <Label className="text-zinc-300 text-base font-semibold">Itens do Orcamento</Label>
                  <p className="text-xs text-zinc-500 mt-0.5">Selecione categoria e item, ou escreva livremente. Clique na lupa para pesquisar precos.</p>
                </div>
                <Button data-testid="add-item-btn" onClick={addItem} variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-full text-xs">
                  <Plus size={14} className="mr-1" /> Item
                </Button>
              </div>
              <div className="space-y-3">
                {items.map((item, idx) => {
                  const salePrice = item.unit_cost * (1 + item.margin);
                  const total = salePrice * item.quantity;
                  const catItems = getCategoryItems(item.category);
                  const isSearching = searchingPrice[item._key];
                  return (
                    <div key={item._key} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                      <div className="grid grid-cols-[1fr_1fr] gap-2 mb-2">
                        <div>
                          <label className="text-xs text-zinc-500 mb-1 block">Categoria</label>
                          <div className="relative">
                            <select
                              data-testid={`item-category-${idx}`}
                              value={categories.find(c => c.name === item.category)?.id || ''}
                              onChange={(e) => handleCategoryChange(idx, e.target.value)}
                              className="w-full h-9 bg-zinc-900 border border-zinc-700 text-white rounded-lg text-sm pl-3 pr-8 appearance-none cursor-pointer focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none"
                            >
                              <option value="" className="bg-zinc-900 text-zinc-500">Selecionar categoria...</option>
                              {categories.map(cat => (
                                <option key={cat.id} value={cat.id} className="bg-zinc-900 text-white">{cat.name}</option>
                              ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-zinc-500 mb-1 block">Item</label>
                          {catItems.length > 0 && !item._customName ? (
                            <div className="relative">
                              <select
                                data-testid={`item-name-${idx}`}
                                value={item.name || ''}
                                onChange={(e) => {
                                  if (e.target.value === '__custom__') {
                                    handleItemSelect(idx, '__custom__');
                                  } else {
                                    handleItemSelect(idx, e.target.value);
                                  }
                                }}
                                className="w-full h-9 bg-zinc-900 border border-zinc-700 text-white rounded-lg text-sm pl-3 pr-8 appearance-none cursor-pointer focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none"
                              >
                                <option value="" className="bg-zinc-900 text-zinc-500">Selecionar item...</option>
                                {catItems.map(ci => (
                                  <option key={ci.name} value={ci.name} className="bg-zinc-900 text-white">{ci.name}</option>
                                ))}
                                <option value="__custom__" className="bg-zinc-900 text-yellow-400">+ Escrever outro item...</option>
                              </select>
                              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                            </div>
                          ) : (
                            <Input
                              data-testid={`item-name-input-${idx}`}
                              value={item.name}
                              onChange={e => updateItem(idx, 'name', e.target.value)}
                              className="bg-zinc-900 border-zinc-700 text-white rounded-lg h-9 text-sm"
                              placeholder="Escreva o nome do item..."
                            />
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-[80px_1fr_80px_100px_100px_40px] gap-2 items-end">
                        <div>
                          <label className="text-xs text-zinc-500 mb-1 block">Qtd</label>
                          <Input type="number" min="0" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white rounded-lg h-9 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-zinc-500 mb-1 block">Custo Unitario (EUR)</label>
                          <div className="flex gap-1">
                            <Input type="number" min="0" step="0.01" value={item.unit_cost} onChange={e => updateItem(idx, 'unit_cost', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white rounded-lg h-9 text-sm flex-1" />
                            <Button
                              data-testid={`search-price-${idx}`}
                              onClick={() => searchPrice(idx, undefined)}
                              disabled={isSearching}
                              size="sm"
                              className="bg-yellow-400/20 text-yellow-400 hover:bg-yellow-400/30 rounded-lg h-9 w-9 p-0 shrink-0"
                              title="Pesquisar preco na internet"
                            >
                              {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                            </Button>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-zinc-500 mb-1 block">Margem</label>
                          <Input type="number" min="0" step="0.01" value={item.margin} onChange={e => updateItem(idx, 'margin', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white rounded-lg h-9 text-sm" />
                        </div>
                        <div className="text-center">
                          <label className="text-xs text-zinc-500 mb-1 block">Preco</label>
                          <p className="text-sm text-zinc-300 h-9 flex items-center justify-center">{formatEuro(salePrice)}</p>
                        </div>
                        <div className="text-center">
                          <label className="text-xs text-zinc-500 mb-1 block">Total</label>
                          <p className="text-sm text-yellow-400 font-semibold h-9 flex items-center justify-center">{formatEuro(total)}</p>
                        </div>
                        <div className="flex items-center justify-center h-9">
                          <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
