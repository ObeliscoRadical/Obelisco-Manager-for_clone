import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

export default function MaoDeObraPage() {
  const [labor, setLabor] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ type: '', description: '', cost_hour: 0, sell_hour: 0, charges: '', notes: '' });

  const fetchLabor = useCallback(async () => {
    try { const { data } = await api.get('/labor'); setLabor(data); }
    catch (err) { console.error(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLabor(); }, [fetchLabor]);

  const openNew = () => { setEditing(null); setForm({ type: '', description: '', cost_hour: 0, sell_hour: 0, charges: '', notes: '' }); setDialogOpen(true); };
  const openEdit = (l) => { setEditing(l); setForm({ type: l.type, description: l.description, cost_hour: l.cost_hour, sell_hour: l.sell_hour, charges: l.charges || '', notes: l.notes || '' }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.type || !form.description) { toast.error('Preencha tipo e descricao'); return; }
    try {
      if (editing) { await api.put(`/labor/${editing.id}`, form); toast.success('Atualizado'); }
      else { await api.post('/labor', form); toast.success('Criado'); }
      setDialogOpen(false); fetchLabor();
    } catch { toast.error('Erro ao guardar'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar?')) return;
    try { await api.delete(`/labor/${id}`); toast.success('Eliminado'); fetchLabor(); }
    catch { toast.error('Erro'); }
  };

  return (
    <div data-testid="mao-de-obra-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Mao de Obra</h1>
          <p className="text-zinc-400 mt-1 font-medium">Tipos de recurso e custos por hora</p>
        </div>
        <Button data-testid="new-labor-btn" onClick={openNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={16} className="mr-2" /> Novo Tipo
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : labor.length === 0 ? (
        <div className="text-center py-16 text-zinc-500"><Users size={48} className="mx-auto mb-4 text-zinc-700" /><p>Sem tipos de mao de obra</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {labor.map(l => {
            const marginPct = l.cost_hour > 0 ? (((l.sell_hour - l.cost_hour) / l.cost_hour) * 100).toFixed(0) : 0;
            return (
              <Card key={l.id} className="bg-zinc-900 border-zinc-800 rounded-3xl hover:shadow-[0_0_15px_rgba(250,204,21,0.15)] transition-all duration-300">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs uppercase tracking-wider bg-zinc-800 text-zinc-400 px-2 py-1 rounded-lg font-medium">{l.type}</span>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(l)} className="text-zinc-500 hover:text-white p-1"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(l.id)} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <p className="text-white font-semibold mb-3">{l.description}</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-zinc-500">Custo/hora</span><span className="text-zinc-300 font-medium">{formatEuro(l.cost_hour)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-zinc-500">Venda/hora</span><span className="text-yellow-400 font-bold">{formatEuro(l.sell_hour)}</span></div>
                    <div className="flex justify-between text-sm pt-2 border-t border-zinc-800"><span className="text-zinc-500">Margem</span><span className="text-green-400 font-bold">{marginPct}%</span></div>
                  </div>
                  {l.charges && <p className="text-xs text-zinc-600 mt-2">Encargos: {l.charges}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white">{editing ? 'Editar' : 'Novo'} Tipo</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">Defina custo real e preco de venda por hora</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label className="text-zinc-300 text-sm">Tipo</Label><Input value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="Ex: eletricista" /></div>
            <div><Label className="text-zinc-300 text-sm">Descricao</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="Ex: Eletricista certificado" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-300 text-sm">Custo/hora (EUR)</Label><Input type="number" step="0.5" value={form.cost_hour} onChange={e => setForm({ ...form, cost_hour: parseFloat(e.target.value) || 0 })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
              <div><Label className="text-zinc-300 text-sm">Venda/hora (EUR)</Label><Input type="number" step="0.5" value={form.sell_hour} onChange={e => setForm({ ...form, sell_hour: parseFloat(e.target.value) || 0 })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
            </div>
            <div><Label className="text-zinc-300 text-sm">Encargos incluidos</Label><Input value={form.charges} onChange={e => setForm({ ...form, charges: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="SS+seguro+..." /></div>
            <div><Label className="text-zinc-300 text-sm">Observacoes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
            <Button onClick={handleSave} className="w-full bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold h-12">Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
