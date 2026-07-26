import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Truck, Search, CheckSquare, Square, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { generateSupplierRequestPDF } from '../lib/supplierRequestPdf';

// Categorias que são consideradas MATERIAL (excluir Mão de obra, Serviços, Extras)
const NON_MATERIAL_KEYWORDS = ['mão de obra', 'mao de obra', 'servico', 'serviço', 'trabalho', 'hora'];

// Unidades comuns em material de eletricidade/telecom
const UNIT_OPTIONS = ['un', 'm', 'm²', 'm³', 'kg', 'rolo', 'cx', 'par', 'jogo', 'lote', 'kit'];

function isMaterial(item) {
  const cat = (item.category || '').toLowerCase().trim();
  const name = (item.name || '').toLowerCase();
  if (!cat && !name) return false;
  return !NON_MATERIAL_KEYWORDS.some(k => cat.includes(k) || name === k);
}

/**
 * Diálogo para seleccionar itens de material e gerar pedido de orçamento em PDF.
 * Props:
 *  - budget: orçamento fonte
 *  - settings, logoBase64: passados ao gerador PDF
 *  - open, onClose
 */
export default function SupplierRequestDialog({ budget, settings, logoBase64, open, onClose }) {
  const materials = useMemo(() => (budget?.items || []).filter(isMaterial), [budget]);
  const [selected, setSelected] = useState({});     // {index: true}
  const [overrides, setOverrides] = useState({});   // {index: {unit, quantity}} — apenas para o PDF
  const [search, setSearch] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    // Reset quando abrir
    if (open) {
      setSelected({});
      setOverrides({});
      setSearch('');
      setSupplierName('');
      setDeliveryDate('');
      setNotes('');
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(it =>
      (it.name || '').toLowerCase().includes(q) ||
      (it.category || '').toLowerCase().includes(q) ||
      (it.brand || '').toLowerCase().includes(q)
    );
  }, [materials, search]);

  const filteredIndexes = filtered.map(m => materials.indexOf(m));
  const allFilteredSelected = filteredIndexes.length > 0 && filteredIndexes.every(i => selected[i]);
  const someSelected = Object.values(selected).some(Boolean);
  const selectedCount = Object.values(selected).filter(Boolean).length;

  const toggle = (idx) => setSelected(prev => ({ ...prev, [idx]: !prev[idx] }));
  const toggleAllFiltered = () => {
    const next = { ...selected };
    if (allFilteredSelected) {
      filteredIndexes.forEach(i => { delete next[i]; });
    } else {
      filteredIndexes.forEach(i => { next[i] = true; });
    }
    setSelected(next);
  };

  const generate = async () => {
    if (!someSelected) { toast.error('Seleccione pelo menos um item.'); return; }
    const items = materials
      .map((it, i) => {
        if (!selected[i]) return null;
        const ov = overrides[i] || {};
        return {
          ...it,
          unit: ov.unit !== undefined && ov.unit !== '' ? ov.unit : (it.unit || 'un'),
          quantity: ov.quantity !== undefined && ov.quantity !== '' ? Number(ov.quantity) : it.quantity,
        };
      })
      .filter(Boolean);
    try {
      await generateSupplierRequestPDF(
        budget,
        items,
        { supplier_name: supplierName, delivery_date: deliveryDate, notes },
        settings,
        logoBase64,
        {}
      );
      toast.success(`Pedido de orçamento gerado (${items.length} item${items.length === 1 ? '' : 's'}).`);
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar PDF.');
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        data-testid="supplier-request-dialog"
        className="bg-zinc-950 border-zinc-800 text-white max-w-3xl max-h-[92vh] flex flex-col"
      >
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Truck className="h-5 w-5 text-yellow-400" /> Pedido de Orçamento a Fornecedor
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            Escolha os materiais que quer enviar ao fornecedor. Pode gerar vários pedidos separados para fornecedores distintos
            (ex.: cabos para um, tomadas/interruptores para outro).
            {materials.length === 0 && ' ⚠️ Este orçamento não tem itens classificados como material.'}
          </DialogDescription>
        </DialogHeader>

        {/* Cabeçalho do fornecedor */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-zinc-400">Nome do fornecedor</Label>
            <Input
              data-testid="supplier-name-input"
              value={supplierName} onChange={e => setSupplierName(e.target.value)}
              placeholder="ex.: Rexel, EFAPEL, Solectric…"
              className="bg-zinc-900 border-zinc-800 text-white"
            />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Entrega pretendida</Label>
            <Input
              data-testid="supplier-delivery-input"
              value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
              placeholder="ex.: 05/03/2026 ou 3 dias úteis"
              className="bg-zinc-900 border-zinc-800 text-white"
            />
          </div>
        </div>

        {/* Filtro + selecionar todos */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              data-testid="supplier-search-input"
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Filtrar por descrição, categoria ou marca…"
              className="pl-9 bg-zinc-900 border-zinc-800 text-white"
            />
          </div>
          <Button
            variant="outline" size="sm"
            data-testid="supplier-toggle-all"
            onClick={toggleAllFiltered}
            disabled={filteredIndexes.length === 0}
            className="h-10 whitespace-nowrap bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
          >
            {allFilteredSelected ? 'Desmarcar visíveis' : 'Seleccionar visíveis'}
          </Button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto border border-zinc-800 rounded-lg divide-y divide-zinc-800/60" data-testid="supplier-items-list">
          {filtered.length === 0 && (
            <p className="text-xs text-zinc-500 italic text-center py-10">
              {materials.length === 0 ? 'Sem materiais neste orçamento.' : 'Sem resultados para o filtro.'}
            </p>
          )}
          {filtered.map((it) => {
            const idx = materials.indexOf(it);
            const checked = !!selected[idx];
            const ov = overrides[idx] || {};
            const currentUnit = ov.unit !== undefined ? ov.unit : (it.unit || 'un');
            const currentQty = ov.quantity !== undefined ? ov.quantity : String(it.quantity ?? '');
            const unitChanged = ov.unit !== undefined && ov.unit !== (it.unit || 'un');
            const qtyChanged = ov.quantity !== undefined && Number(ov.quantity) !== Number(it.quantity);
            return (
              <div
                key={idx}
                data-testid={`supplier-item-${idx}`}
                className={`w-full px-3 py-2.5 flex items-center gap-3 transition-colors ${checked ? 'bg-yellow-500/5' : 'hover:bg-zinc-900/60'}`}
              >
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  className="shrink-0"
                  aria-label="toggle"
                  data-testid={`supplier-item-toggle-${idx}`}
                >
                  {checked
                    ? <CheckSquare className="h-4 w-4 text-yellow-400" />
                    : <Square className="h-4 w-4 text-zinc-600" />}
                </button>
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm text-white truncate">{it.name || 'Item sem descrição'}</p>
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {it.category && <Badge className="bg-zinc-800 border-zinc-700 text-zinc-400 text-[9px]">{it.category}</Badge>}
                    {it.brand && <Badge className="bg-zinc-800 border-zinc-700 text-zinc-400 text-[9px]">{it.brand}</Badge>}
                    {(unitChanged || qtyChanged) && (
                      <Badge className="bg-yellow-500/15 text-yellow-300 border-yellow-500/40 text-[9px]">alterado</Badge>
                    )}
                  </div>
                </button>
                <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                  <Input
                    data-testid={`supplier-item-qty-${idx}`}
                    type="number" min="0" step="0.01"
                    value={currentQty}
                    onChange={(e) => setOverrides({ ...overrides, [idx]: { ...ov, quantity: e.target.value } })}
                    className="h-8 w-20 bg-zinc-950 border-zinc-800 text-white text-right text-xs rounded-lg"
                  />
                  <select
                    data-testid={`supplier-item-unit-${idx}`}
                    value={UNIT_OPTIONS.includes(currentUnit) ? currentUnit : '__custom__'}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') return;
                      setOverrides({ ...overrides, [idx]: { ...ov, unit: e.target.value } });
                    }}
                    className="h-8 bg-zinc-950 border border-zinc-800 rounded-lg text-white text-xs px-1.5"
                  >
                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                    {!UNIT_OPTIONS.includes(currentUnit) && <option value="__custom__">{currentUnit}</option>}
                  </select>
                </div>
              </div>
            );
          })}
        </div>

        {/* Observações */}
        <div>
          <Label className="text-xs text-zinc-400">Observações para o fornecedor (opcional)</Label>
          <textarea
            data-testid="supplier-notes-input"
            value={notes} onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="ex.: preferência por marca X, exigências de certificação, condições especiais…"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-2 text-sm text-white"
          />
        </div>

        <DialogFooter className="items-center gap-2">
          <p className="text-xs text-zinc-500 mr-auto">
            {selectedCount > 0 ? `${selectedCount} item${selectedCount === 1 ? '' : 's'} seleccionado${selectedCount === 1 ? '' : 's'}` : 'Nenhum item seleccionado'}
          </p>
          <Button variant="ghost" onClick={onClose} data-testid="supplier-cancel">Cancelar</Button>
          <Button
            data-testid="supplier-generate"
            onClick={generate}
            disabled={!someSelected}
            className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold disabled:opacity-50"
          >
            <FileDown className="h-4 w-4 mr-2" /> Gerar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
