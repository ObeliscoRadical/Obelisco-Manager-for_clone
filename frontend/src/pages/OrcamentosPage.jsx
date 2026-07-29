import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, FileText, Calculator, Search, Loader2, ChevronDown, Download, Upload, Copy, History, ClipboardCheck, Printer, Truck } from 'lucide-react';
import { generateChecklistPDF } from '../lib/checklistPdf';
import SupplierRequestDialog from '../components/SupplierRequestDialog';
import { toast } from 'sonner';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

let itemIdCounter = 0;
const createItem = () => ({ _key: `item-${++itemIdCounter}`, category: '', name: '', quantity: 1, unit_cost: 0, margin: 0.6, discount_type: 'percentage', discount_value: 0 });

const PAYMENT_METHODS_OPTIONS = ['Transferência Bancaria', 'MB Way', 'Multibanco', 'Cartão de Crédito/Débito', 'Numerario', 'Cheque'];
const PAYMENT_SPLIT_OPTIONS = [
  '50% no início dos trabalhos, 50% na conclusao',
  '30% no início, 40% a meio, 30% na conclusao',
  '100% adiantado',
  '100% na conclusao',
  '40% no início, 60% na entrega',
];

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
  const [globalMultiplier, setGlobalMultiplier] = useState(1.8);   // Multiplicador global — actualiza margens dos items em tempo real
  const [categories, setCategories] = useState([]);
  const [searchingPrice, setSearchingPrice] = useState({});
  // Global discount
  const [discountType, setDiscountType] = useState('percentage');
  const [discountValue, setDiscountValue] = useState(0);
  // Payment
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentSplit, setPaymentSplit] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  const fetchBudgets = useCallback(async () => {
    try {
      const { data } = await api.get('/budgets');
      setBudgets(data);
    } catch (err) {
      console.error('Budgets fetch error:', err.message);
      toast.error('Erro ao carregar orçamentos');
    }
    finally { setLoading(false); }
  }, []);

  const [materials, setMaterials] = useState([]);
  const [settings, setSettings] = useState(null);
  const [logoBase64, setLogoBase64] = useState(null);
  const [supplierBudget, setSupplierBudget] = useState(null);   // orçamento em modo "pedido fornecedor"

  const fetchSettings = useCallback(async () => {
    try {
      const [sRes, lRes] = await Promise.all([
        api.get('/proposal-settings').catch(() => ({ data: null })),
        api.get('/logo').catch(() => ({ data: null })),
      ]);
      if (sRes.data) setSettings(sRes.data);
      if (lRes.data?.logo) setLogoBase64(lRes.data.logo);
    } catch (err) { console.debug('[settings/logo]', err?.message); }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/categories');
      setCategories(data);
    } catch (err) {
      console.error('Categories fetch error:', err.message);
    }
  }, []);

  const fetchMaterials = useCallback(async () => {
    try {
      const { data } = await api.get('/materials');
      setMaterials(data);
    } catch (err) {
      console.error('Materials fetch error:', err.message);
    }
  }, []);

  useEffect(() => { fetchBudgets(); fetchCategories(); fetchMaterials(); fetchSettings(); }, [fetchBudgets, fetchCategories, fetchMaterials, fetchSettings]);

  // Helper: find stock for an item name (match by description or name)
  const getStockForItem = (itemName) => {
    if (!itemName) return null;
    const match = materials.find(m => (m.description || '').toLowerCase().trim() === itemName.toLowerCase().trim());
    if (!match) return null;
    return {
      current: match.stock_current || 0,
      min: match.stock_min || 0,
      unit: match.unit || 'un',
    };
  };

  const openNew = () => {
    setEditingBudget(null);
    setTitle(''); setClientName(''); setClientPhone('');
    setItems([createItem()]);
    setDiscountType('percentage'); setDiscountValue(0);
    setPaymentMethods([]); setPaymentSplit(''); setPaymentNotes('');
    setDialogOpen(true);
  };

  const openEdit = (budget) => {
    setEditingBudget(budget);
    setTitle(budget.title);
    setClientName(budget.client_name);
    setClientPhone(budget.client_phone || '');
    setItems(budget.items?.length > 0 ? budget.items.map(i => ({ discount_type: 'percentage', discount_value: 0, ...i, _key: `item-${++itemIdCounter}` })) : [createItem()]);
    // Sincronizar multiplicador com as margens dos itens (se forem uniformes)
    if (budget.items?.length > 0) {
      const margins = budget.items.map(i => Number(i.margin || 0));
      const first = margins[0];
      const uniform = margins.every(m => Math.abs(m - first) < 0.001);
      setGlobalMultiplier(uniform ? Math.round((1 + first) * 100) / 100 : 1.8);
    } else {
      setGlobalMultiplier(1.8);
    }
    setDiscountType(budget.discount_type || 'percentage');
    setDiscountValue(budget.discount_value || 0);
    setPaymentMethods(budget.payment_methods || []);
    setPaymentSplit(budget.payment_split || '');
    setPaymentNotes(budget.payment_notes || '');
    setDialogOpen(true);
  };

  const addItem = () => setItems([...items, createItem()]);
  const removeItem = (idx) => { if (items.length > 1) setItems(items.filter((_, i) => i !== idx)); };

  const updateItem = (idx, field, value) => {
    const next = [...items];
    const stringFields = ['category', 'name', 'discount_type', 'unit'];
    next[idx] = { ...next[idx], [field]: stringFields.includes(field) ? value : (parseFloat(value) || 0) };
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

  const [searchingAll, setSearchingAll] = useState(false);

  const searchAllPrices = async () => {
    const itemsWithoutPrice = items.filter(i => i.name && i.unit_cost === 0);
    if (itemsWithoutPrice.length === 0) {
      toast.info('Todos os itens ja tem preco definido');
      return;
    }
    setSearchingAll(true);
    toast.info(`A pesquisar precos para ${itemsWithoutPrice.length} itens. Aguarde...`, { duration: 5000 });

    // Collect all results FIRST, then batch update once
    const priceResults = {};
    let found = 0;

    for (const item of items) {
      if (!item.name || item.unit_cost > 0) continue;
      try {
        const { data } = await api.post('/price-lookup', { item_name: item.name });
        if (data.price > 0) {
          priceResults[item._key] = { unit_cost: data.price, margin: data.margin || 0.6 };
          found++;
        }
      } catch (err) {
        console.error(`Price lookup failed for ${item.name}:`, err.message);
      }
    }

    // Single batch state update - avoids React DOM conflicts
    if (found > 0) {
      setItems(prev => prev.map(item => {
        const result = priceResults[item._key];
        return result ? { ...item, ...result } : item;
      }));
    }

    setSearchingAll(false);
    const total = itemsWithoutPrice.length;
    if (found > 0) {
      toast.success(`${found} de ${total} preco(s) encontrado(s)!`, { duration: 5000 });
    } else {
      toast.error('Nenhum preco encontrado');
    }
  };

  const totalCost = useMemo(() => items.reduce((sum, item) => sum + item.unit_cost * item.quantity, 0), [items]);

  const subtotalAfterItemDiscounts = useMemo(() => items.reduce((sum, item) => {
    let line = item.unit_cost * (1 + (item.margin || 0)) * item.quantity;
    const dv = item.discount_value || 0;
    if (dv > 0) {
      if (item.discount_type === 'value') line = Math.max(0, line - dv);
      else line = line * (1 - dv / 100);
    }
    return sum + line;
  }, 0), [items]);

  const totalPrice = useMemo(() => {
    let t = subtotalAfterItemDiscounts;
    if (discountValue > 0) {
      if (discountType === 'value') t = Math.max(0, t - discountValue);
      else t = t * (1 - discountValue / 100);
    }
    return t;
  }, [subtotalAfterItemDiscounts, discountType, discountValue]);

  const handleSave = async () => {
    if (!title || !clientName) { toast.error('Preencha o titulo e nome do cliente'); return; }
    if (!paymentMethods.length) { toast.error('Selecione pelo menos uma forma de pagamento'); return; }
    if (!paymentSplit) { toast.error('Selecione as condições de pagamento'); return; }
    try {
      const payload = {
        title,
        client_name: clientName,
        client_phone: clientPhone,
        items: items.map(({ _key, _customName, ...rest }) => rest),
        discount_type: discountType,
        discount_value: discountValue || 0,
        payment_methods: paymentMethods,
        payment_split: paymentSplit,
        payment_notes: paymentNotes,
      };
      if (editingBudget) {
        await api.put(`/budgets/${editingBudget.id}`, payload);
        toast.success('Orçamento atualizado');
      } else {
        await api.post('/budgets', payload);
        toast.success('Orçamento criado');
      }

      // Auto-save custom items to categories for future use
      for (const item of items) {
        if (item.name && item.category && item.unit_cost > 0) {
          const catItems = getCategoryItems(item.category);
          const alreadyExists = catItems.some(ci => ci.name === item.name);
          if (!alreadyExists) {
            try {
              await api.post('/categories/save-item', { category: item.category, name: item.name, unit_cost: item.unit_cost, unit: 'unidade' });
            } catch (err) { console.debug('[categories/save-item] skipped:', err?.message); }
          }
        }
      }

      setDialogOpen(false);
      fetchBudgets();
      fetchCategories(); // Refresh categories to include new items
    } catch (err) {
      console.error('Save budget error:', err.message);
      toast.error('Erro ao guardar orçamento');
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
    if (!window.confirm('Eliminar este orçamento?')) return;
    try {
      await api.delete(`/budgets/${budgetId}`);
      toast.success('Orçamento eliminado');
      fetchBudgets();
    } catch { toast.error('Erro ao eliminar'); }
  };

  const handleExportExcel = (budgetId) => {
    window.open(`${process.env.REACT_APP_BACKEND_URL}/api/budgets/${budgetId}/export-excel`, '_blank');
  };

  const handleDuplicate = async (budgetId) => {
    try {
      await api.post(`/budgets/${budgetId}/duplicate`);
      toast.success('Orçamento duplicado');
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
      toast.success('Orçamento importado de Excel');
      fetchBudgets();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao importar');
    }
    e.target.value = '';
  };

  return (
    <div data-testid="orçamentos-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Orçamentos</h1>
          <p className="text-zinc-400 mt-1 font-medium">Gere e calcule os seus orçamentos</p>
        </div>
        <div className="flex gap-2">
          <label className="cursor-pointer">
            <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} className="hidden" />
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded-full font-medium text-sm transition">
              <Upload size={16} /> Importar Excel
            </span>
          </label>
          <Button data-testid="new-budget-btn" onClick={openNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
            <Plus size={18} className="mr-2" /> Novo Orçamento
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-16"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
      )}
      {!loading && budgets.length === 0 && (
        <div className="text-center py-16 text-zinc-500">
          <FileText size={48} className="mx-auto mb-4 text-zinc-700" />
          <p>Nenhum orçamento criado</p>
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
                <TableHead className="text-zinc-400 text-xs uppercase tracking-wider text-right">Ações</TableHead>
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
                      <Button data-testid={`checklist-pdf-${b.id}`} variant="ghost" size="sm" onClick={() => generateChecklistPDF(b, settings, logoBase64).catch(() => toast.error('Erro a gerar checklist'))} className="text-orange-400 hover:text-orange-300 h-8 w-8 p-0" title="Checklist de Separação (PDF)"><ClipboardCheck size={15} /></Button>
                      <Button data-testid={`checklist-print-${b.id}`} variant="ghost" size="sm" onClick={() => generateChecklistPDF(b, settings, logoBase64, { autoPrint: true }).catch(() => toast.error('Erro a imprimir'))} className="text-orange-300 hover:text-orange-200 h-8 w-8 p-0" title="Imprimir Checklist directamente"><Printer size={15} /></Button>
                      <Button data-testid={`supplier-request-${b.id}`} variant="ghost" size="sm" onClick={() => setSupplierBudget(b)} className="text-teal-400 hover:text-teal-300 h-8 w-8 p-0" title="Pedido de Orçamento a Fornecedor"><Truck size={15} /></Button>
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
              {editingBudget ? 'Editar Orçamento' : 'Novo Orçamento'}
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              {editingBudget ? 'Atualize os detalhes do orçamento' : 'Preencha os detalhes do novo orçamento. Use as categorias pre-definidas e pesquise precos atualizados.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-zinc-300 text-sm">Titulo</Label>
                <Input data-testid="budget-title-input" value={title} onChange={e => setTitle(e.target.value)} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="Ex: Instalação eletrica" />
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
                  <Label className="text-zinc-300 text-base font-semibold">Itens do Orçamento</Label>
                  <p className="text-xs text-zinc-500 mt-0.5">Selecione categoria e item, ou escreva livremente. Clique na lupa para pesquisar precos.</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    data-testid="search-all-prices-btn"
                    onClick={searchAllPrices}
                    disabled={searchingAll}
                    variant="outline"
                    size="sm"
                    className="border-yellow-400/50 text-yellow-400 hover:bg-yellow-400/10 rounded-full text-xs"
                  >
                    {searchingAll ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Search size={14} className="mr-1" />}
                    {searchingAll ? 'A pesquisar...' : 'Pesquisar Todos'}
                  </Button>
                  <Button data-testid="add-item-btn" onClick={addItem} variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-full text-xs">
                    <Plus size={14} className="mr-1" /> Item
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                {items.map((item, idx) => {
                  const salePrice = item.unit_cost * (1 + item.margin);
                  const lineGross = salePrice * item.quantity;
                  const dv = item.discount_value || 0;
                  let lineTotalWithDiscount = lineGross;
                  if (dv > 0) {
                    if (item.discount_type === 'value') lineTotalWithDiscount = Math.max(0, lineGross - dv);
                    else lineTotalWithDiscount = lineGross * (1 - dv / 100);
                  }
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
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-zinc-500 block">Item</label>
                            {(() => {
                              const stock = getStockForItem(item.name);
                              if (!stock) return null;
                              const insufficient = item.quantity > stock.current;
                              const low = stock.min > 0 && stock.current <= stock.min;
                              return (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  insufficient ? 'bg-red-500/20 text-red-400' : low ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'
                                }`} title={insufficient ? `Stock insuficiente (${stock.current} ${stock.unit})` : `Stock: ${stock.current} ${stock.unit}`}>
                                  📦 {stock.current} {stock.unit}{insufficient ? ' ⚠' : ''}
                                </span>
                              );
                            })()}
                          </div>
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
                            <div className="flex gap-1">
                              <Input
                                data-testid={`item-name-input-${idx}`}
                                value={item.name}
                                onChange={e => updateItem(idx, 'name', e.target.value)}
                                className="bg-zinc-900 border-zinc-700 text-white rounded-lg h-9 text-sm flex-1"
                                placeholder="Escreva o nome do item..."
                              />
                              {catItems.length > 0 && (
                                <button
                                  onClick={() => { const next = [...items]; next[idx] = { ...next[idx], _customName: false, name: '' }; setItems(next); }}
                                  className="h-9 w-9 shrink-0 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-yellow-400 flex items-center justify-center"
                                  title="Voltar a lista"
                                >
                                  <ChevronDown size={14} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-[70px_1fr_70px_90px_90px_100px_30px] gap-2 items-end">
                        <div>
                          <label className="text-xs text-zinc-500 mb-1 block">Qtd</label>
                          <Input data-testid={`item-qty-${idx}`} type="number" min="0" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white rounded-lg h-9 text-sm" />
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
                        <div>
                          <label className="text-xs text-zinc-500 mb-1 block">Desconto</label>
                          <div className="flex gap-1">
                            <Input data-testid={`item-discount-val-${idx}`} type="number" min="0" step="0.01" value={item.discount_value || 0} onChange={e => updateItem(idx, 'discount_value', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white rounded-lg h-9 text-sm flex-1 px-2" />
                            <button
                              type="button"
                              data-testid={`item-discount-type-${idx}`}
                              onClick={() => updateItem(idx, 'discount_type', item.discount_type === 'value' ? 'percentage' : 'value')}
                              className="h-9 w-7 shrink-0 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-yellow-400 font-semibold hover:bg-zinc-700"
                              title="Alternar entre % e EUR"
                            >
                              {item.discount_type === 'value' ? '€' : '%'}
                            </button>
                          </div>
                        </div>
                        <div className="text-center">
                          <label className="text-xs text-zinc-500 mb-1 block">Preco</label>
                          <p className="text-sm text-zinc-300 h-9 flex items-center justify-center">{formatEuro(salePrice)}</p>
                        </div>
                        <div className="text-center">
                          <label className="text-xs text-zinc-500 mb-1 block">Total</label>
                          <p className="text-sm text-yellow-400 font-semibold h-9 flex items-center justify-center">{formatEuro(lineTotalWithDiscount)}</p>
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

            {/* Global Discount + Payment Methods/Conditions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800">
              <div className="space-y-3">
                <div>
                  <Label className="text-zinc-300 text-sm font-semibold">Desconto Global <span className="text-zinc-500 font-normal">(aplicado sobre o subtotal)</span></Label>
                  <div className="flex gap-2 mt-2">
                    <div className="flex rounded-lg overflow-hidden border border-zinc-700">
                      <button
                        type="button"
                        data-testid="global-discount-type-pct"
                        onClick={() => setDiscountType('percentage')}
                        className={`px-3 py-2 text-sm font-medium transition ${discountType === 'percentage' ? 'bg-yellow-400 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                      >%</button>
                      <button
                        type="button"
                        data-testid="global-discount-type-val"
                        onClick={() => setDiscountType('value')}
                        className={`px-3 py-2 text-sm font-medium transition ${discountType === 'value' ? 'bg-yellow-400 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                      >EUR</button>
                    </div>
                    <Input
                      data-testid="global-discount-value"
                      type="number"
                      min="0"
                      step="0.01"
                      value={discountValue}
                      onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                      className="bg-zinc-900 border-zinc-700 text-white rounded-lg h-10 text-sm flex-1"
                      placeholder={discountType === 'percentage' ? 'Ex: 10 (para 10%)' : 'Ex: 150 (para -150€)'}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-zinc-300 text-sm font-semibold">Observações sobre Pagamento <span className="text-zinc-500 font-normal">(opcional)</span></Label>
                  <textarea
                    data-testid="payment-notes"
                    value={paymentNotes}
                    onChange={e => setPaymentNotes(e.target.value)}
                    rows={3}
                    placeholder="Ex: Prazo de pagamento a 30 dias apos fatura; IVA não incluído..."
                    className="w-full mt-2 bg-zinc-900 border border-zinc-700 text-white rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-zinc-300 text-sm font-semibold">Formas de Pagamento <span className="text-red-400">*</span></Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {PAYMENT_METHODS_OPTIONS.map(method => {
                      const active = paymentMethods.includes(method);
                      return (
                        <button
                          key={method}
                          type="button"
                          data-testid={`pay-method-${method.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                          onClick={() => {
                            if (active) setPaymentMethods(paymentMethods.filter(m => m !== method));
                            else setPaymentMethods([...paymentMethods, method]);
                          }}
                          className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition border ${active ? 'bg-yellow-400 text-zinc-950 border-yellow-400' : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500'}`}
                        >
                          {method}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label className="text-zinc-300 text-sm font-semibold">Condições de Pagamento <span className="text-red-400">*</span></Label>
                  <div className="space-y-1.5 mt-2">
                    {PAYMENT_SPLIT_OPTIONS.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        data-testid={`pay-split-${opt.slice(0, 12).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}
                        onClick={() => setPaymentSplit(opt)}
                        className={`w-full px-3 py-2 rounded-lg text-xs font-medium text-left transition border ${paymentSplit === opt ? 'bg-yellow-400 text-zinc-950 border-yellow-400' : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500'}`}
                      >
                        {opt}
                      </button>
                    ))}
                    <Input
                      value={PAYMENT_SPLIT_OPTIONS.includes(paymentSplit) ? '' : paymentSplit}
                      onChange={e => setPaymentSplit(e.target.value)}
                      placeholder="Ou escreva condições personalizadas..."
                      className="bg-zinc-900 border-zinc-700 text-white rounded-lg h-9 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
              <div className="flex gap-6 flex-wrap items-center">
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Custo Total</p>
                  <p className="text-xl font-bold text-zinc-300">{formatEuro(totalCost)}</p>
                </div>
                <div className="flex items-center gap-2 bg-yellow-500/5 border border-yellow-500/30 rounded-xl px-3 py-2" data-testid="multiplier-inline">
                  <span className="text-xs text-yellow-400 font-bold">×</span>
                  <Input
                    data-testid="multiplier-input"
                    type="number" step="0.1" min="1" max="10"
                    value={globalMultiplier}
                    onChange={e => {
                      const v = Math.max(1, parseFloat(e.target.value) || 1);
                      setGlobalMultiplier(v);
                      const newMargin = v - 1;
                      setItems(prev => prev.map(it => ({ ...it, margin: newMargin })));
                    }}
                    className="h-8 w-16 bg-zinc-950 border-yellow-500/40 text-yellow-300 text-lg font-bold font-mono rounded-lg text-center px-1"
                  />
                  <span className="text-[10px] text-zinc-500 leading-tight max-w-[110px]">
                    multiplicador<br/>margem&nbsp;{((globalMultiplier - 1) * 100).toFixed(0)}%
                  </span>
                </div>
                {discountValue > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Subtotal</p>
                    <p className="text-xl font-bold text-zinc-400 line-through">{formatEuro(subtotalAfterItemDiscounts)}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Preço Final</p>
                  <p className="text-xl font-bold text-yellow-400">{formatEuro(totalPrice)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Margem</p>
                  <p className="text-xl font-bold text-green-400">
                    {totalCost > 0 ? (((totalPrice - totalCost) / totalCost) * 100).toFixed(1) : '0'}%
                  </p>
                </div>
              </div>
              {editingBudget && (
                <Button
                  data-testid="checklist-from-dialog"
                  variant="outline"
                  onClick={() => generateChecklistPDF(editingBudget, settings, logoBase64).catch(() => toast.error('Erro a gerar checklist'))}
                  className="border-orange-400 text-orange-400 hover:bg-orange-400/10 rounded-full font-semibold"
                  title="Gera folha A4 de separação de material para imprimir"
                >
                  <ClipboardCheck size={16} className="mr-2" /> Gerar Checklist
                </Button>
              )}
              <Button data-testid="save-budget-btn" onClick={handleSave} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
                Guardar Orçamento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SupplierRequestDialog
        budget={supplierBudget}
        settings={settings}
        logoBase64={logoBase64}
        open={!!supplierBudget}
        onClose={() => setSupplierBudget(null)}
      />
    </div>
  );
}
