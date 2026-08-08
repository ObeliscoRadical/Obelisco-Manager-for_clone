import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Send, X } from 'lucide-react';

export const GuideCreateDialog = ({ open, onOpenChange, createMode, setCreateMode, form, setForm, works, employees, materials, onSelectWork, addManualItem, setItemMaterial, updateItem, removeItem, creating, submitCreate }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="create-guide-dialog" className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black uppercase text-white">Nova Guia de Transporte</DialogTitle>
          <DialogDescription className="text-zinc-500">Define a obra/destino, atribui um técnico e adiciona os materiais.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          <div className="grid grid-cols-2 gap-2">
            <button data-testid="mode-work" onClick={() => setCreateMode('work')} className={`px-4 py-3 rounded-xl border text-left ${createMode === 'work' ? 'bg-yellow-400/10 border-yellow-400/40' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}><div className="font-bold text-white text-sm">A partir de Obra</div><div className="text-xs text-zinc-400 mt-0.5">Carrega materiais do orçamento</div></button>
            <button data-testid="mode-manual" onClick={() => setCreateMode('manual')} className={`px-4 py-3 rounded-xl border text-left ${createMode === 'manual' ? 'bg-yellow-400/10 border-yellow-400/40' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}><div className="font-bold text-white text-sm">Manual</div><div className="text-xs text-zinc-400 mt-0.5">Escolhe materiais do stock</div></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {createMode === 'work' && (
              <div>
                <Label className="text-zinc-300 text-xs">Obra</Label>
                <Select value={form.work_id} onValueChange={onSelectWork}>
                  <SelectTrigger data-testid="select-work" className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl"><SelectValue placeholder="Escolher obra…" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 max-h-72">{works.map(w => <SelectItem key={w.id} value={w.id} className="text-white">{w.title} · {w.client_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-zinc-300 text-xs">Técnico atribuído *</Label>
              <Select value={form.assigned_employee_id} onValueChange={(v) => setForm(f => ({ ...f, assigned_employee_id: v }))}>
                <SelectTrigger data-testid="select-employee" className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl"><SelectValue placeholder="Escolher…" /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 max-h-72">{employees.map(e => <SelectItem key={e.id} value={e.id} className="text-white">{e.name} {e.email ? `· ${e.email}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-zinc-300 text-xs">Origem</Label><Input value={form.origin} onChange={e => setForm(f => ({ ...f, origin: e.target.value }))} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
            <div><Label className="text-zinc-300 text-xs">Destino</Label><Input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
            <div><Label className="text-zinc-300 text-xs">Data prevista de entrega</Label><Input type="date" value={form.expected_delivery_date} onChange={e => setForm(f => ({ ...f, expected_delivery_date: e.target.value }))} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
            <div><Label className="text-zinc-300 text-xs">Observações</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="Notas internas…" /></div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-sm uppercase">Materiais ({form.items.filter(i => i._selected !== false).length})</h3>
              <Button onClick={addManualItem} size="sm" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-full"><Plus size={12} className="mr-1" /> Adicionar item</Button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {form.items.length === 0 && <p className="text-zinc-500 text-sm text-center py-6">{createMode === 'work' ? 'Escolhe primeiro a obra para carregar os materiais.' : 'Clica em "Adicionar item" para começar.'}</p>}
              {form.items.map((it, idx) => (
                <div key={it.material_id || it.name || idx} className={`grid grid-cols-12 gap-2 items-center p-2 rounded-xl ${it._selected === false ? 'opacity-40' : 'bg-zinc-950'}`}>
                  <input type="checkbox" checked={it._selected !== false} onChange={(e) => updateItem(idx, '_selected', e.target.checked)} className="col-span-1 h-4 w-4 accent-yellow-400" />
                  {createMode === 'manual' && !it.name ? (
                    <Select value={it.material_id || ''} onValueChange={(v) => setItemMaterial(idx, v)}>
                      <SelectTrigger className="col-span-5 bg-zinc-900 border-zinc-800 text-white rounded-lg h-9 text-xs"><SelectValue placeholder="Escolher material…" /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 max-h-72">{materials.map(m => <SelectItem key={m.id} value={m.id} className="text-white text-xs">{m.description || m.name}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Input value={it.name} onChange={(e) => updateItem(idx, 'name', e.target.value)} placeholder="Nome do material" className="col-span-5 bg-zinc-900 border-zinc-800 text-white rounded-lg h-9 text-xs" />
                  )}
                  <Input value={it.unit} onChange={(e) => updateItem(idx, 'unit', e.target.value)} placeholder="un" className="col-span-2 bg-zinc-900 border-zinc-800 text-white rounded-lg h-9 text-xs text-center" />
                  <Input type="number" step="0.01" value={it.qty_planned} onChange={(e) => updateItem(idx, 'qty_planned', e.target.value)} className="col-span-3 bg-zinc-900 border-zinc-800 text-white rounded-lg h-9 text-xs text-right" />
                  <button onClick={() => removeItem(idx)} className="col-span-1 text-zinc-500 hover:text-red-400"><X size={14} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-3 border-t border-zinc-800">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700 text-zinc-300">Cancelar</Button>
            <Button data-testid="save-draft-btn" disabled={creating} onClick={() => submitCreate(false)} variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-full">Guardar Rascunho</Button>
            <Button data-testid="save-emit-btn" disabled={creating} onClick={() => submitCreate(true)} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-bold rounded-full"><Send size={14} className="mr-2" /> Criar e Emitir</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};