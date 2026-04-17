import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Pencil, Trash2, HardHat } from 'lucide-react';
import { toast } from 'sonner';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

const statusOptions = [
  { value: 'orcamento', label: 'Orcamento' },
  { value: 'em_execucao', label: 'Em Execucao' },
  { value: 'finalizado', label: 'Finalizado' },
];
const statusColors = {
  orcamento: 'bg-zinc-700 text-zinc-300',
  em_execucao: 'bg-yellow-400/20 text-yellow-400',
  finalizado: 'bg-green-500/20 text-green-400',
};

const emptyWork = { title: '', client_name: '', client_phone: '', status: 'orcamento', predicted_cost: 0, real_cost: 0, notes: '', start_date: '', end_date: '' };

export default function ObrasPage() {
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWork, setEditingWork] = useState(null);
  const [form, setForm] = useState({ ...emptyWork });

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
              <Card key={w.id} className="bg-zinc-900 border-zinc-800 rounded-3xl hover:shadow-[0_0_15px_rgba(250,204,21,0.15)] transition-all duration-300">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <Badge className={statusColors[w.status]}>{statusOptions.find(s => s.value === w.status)?.label || w.status}</Badge>
                    <div className="flex gap-1">
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
                <Label className="text-zinc-300 text-sm">Data Inicio</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
              <div>
                <Label className="text-zinc-300 text-sm">Data Fim</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
            </div>
            <div>
              <Label className="text-zinc-300 text-sm">Notas</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="Observacoes..." />
            </div>
            <Button data-testid="save-work-btn" onClick={handleSave} className="w-full bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold h-12">
              {editingWork ? 'Atualizar Obra' : 'Criar Obra'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
