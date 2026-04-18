import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Search, Timer } from 'lucide-react';
import { toast } from 'sonner';

const diffColors = { baixa: 'bg-green-500/20 text-green-400', media: 'bg-yellow-400/20 text-yellow-400', alta: 'bg-orange-500/20 text-orange-400', muito_alta: 'bg-red-500/20 text-red-400' };

export default function ProdutividadesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ item: '', unit: 'un', time_min: 0, difficulty: 'media', technician: 'eletricista', loss_pct: 5, notes: '' });

  const fetchItems = useCallback(async () => {
    try { const { data } = await api.get('/productivity'); setItems(data); }
    catch (err) { console.error(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const filtered = search ? items.filter(i => i.item?.toLowerCase().includes(search.toLowerCase()) || i.technician?.toLowerCase().includes(search.toLowerCase())) : items;

  const openNew = () => { setEditing(null); setForm({ item: '', unit: 'un', time_min: 0, difficulty: 'media', technician: 'eletricista', loss_pct: 5, notes: '' }); setDialogOpen(true); };
  const openEdit = (p) => { setEditing(p); setForm({ item: p.item, unit: p.unit || 'un', time_min: p.time_min || 0, difficulty: p.difficulty || 'media', technician: p.technician || 'eletricista', loss_pct: p.loss_pct || 5, notes: p.notes || '' }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.item) { toast.error('Preencha o nome do item'); return; }
    try {
      if (editing) { await api.put(`/productivity/${editing.id}`, form); toast.success('Atualizado'); }
      else { await api.post('/productivity', form); toast.success('Criado'); }
      setDialogOpen(false); fetchItems();
    } catch { toast.error('Erro ao guardar'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar?')) return;
    try { await api.delete(`/productivity/${id}`); toast.success('Eliminado'); fetchItems(); }
    catch { toast.error('Erro'); }
  };

  const formatTime = (min) => {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  };

  return (
    <div data-testid="produtividades-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Produtividades</h1>
          <p className="text-zinc-400 mt-1 font-medium">{items.length} itens com tempo de execucao definido</p>
        </div>
        <Button data-testid="new-prod-btn" onClick={openNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={16} className="mr-2" /> Nova Produtividade
        </Button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <Input value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="Pesquisar por item ou tecnico..." />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-500"><Timer size={48} className="mx-auto mb-4 text-zinc-700" /><p>Sem produtividades</p></div>
      ) : (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400 text-xs uppercase">Item / Servico</TableHead>
                <TableHead className="text-zinc-400 text-xs uppercase">Unid.</TableHead>
                <TableHead className="text-zinc-400 text-xs uppercase">Tempo/Un</TableHead>
                <TableHead className="text-zinc-400 text-xs uppercase">Dificuldade</TableHead>
                <TableHead className="text-zinc-400 text-xs uppercase">Tecnico</TableHead>
                <TableHead className="text-zinc-400 text-xs uppercase">Perda %</TableHead>
                <TableHead className="text-zinc-400 text-xs uppercase text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => (
                <TableRow key={p.id} className="border-zinc-800/50 hover:bg-zinc-800/30">
                  <TableCell className="text-white text-sm font-medium">{p.item}</TableCell>
                  <TableCell className="text-zinc-400 text-sm">{p.unit}</TableCell>
                  <TableCell className="text-yellow-400 font-semibold text-sm">{formatTime(p.time_min)}</TableCell>
                  <TableCell><Badge className={diffColors[p.difficulty] || 'bg-zinc-700 text-zinc-300'}>{p.difficulty}</Badge></TableCell>
                  <TableCell className="text-zinc-300 text-sm capitalize">{p.technician?.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="text-zinc-400 text-sm">{p.loss_pct}%</TableCell>
                  <TableCell className="text-right">
                    <button onClick={() => openEdit(p)} className="text-zinc-500 hover:text-white p-1"><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(p.id)} className="text-zinc-500 hover:text-red-400 p-1 ml-1"><Trash2 size={14} /></button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white">{editing ? 'Editar' : 'Nova'} Produtividade</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">Tempo medio de execucao por unidade</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label className="text-zinc-300 text-sm">Item / Tipo de servico *</Label><Input value={form.item} onChange={e => setForm({ ...form, item: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="Ex: Tomada simples encastrar" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-300 text-sm">Unidade</Label><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="un/m" /></div>
              <div><Label className="text-zinc-300 text-sm">Tempo por unidade (min)</Label><Input type="number" value={form.time_min} onChange={e => setForm({ ...form, time_min: parseFloat(e.target.value) || 0 })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-300 text-sm">Dificuldade</Label>
                <select value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })} className="mt-1 w-full h-10 bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 text-sm">
                  <option value="baixa">Baixa</option><option value="media">Media</option><option value="alta">Alta</option><option value="muito_alta">Muito Alta</option>
                </select>
              </div>
              <div><Label className="text-zinc-300 text-sm">Tecnico necessario</Label>
                <select value={form.technician} onChange={e => setForm({ ...form, technician: e.target.value })} className="mt-1 w-full h-10 bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 text-sm">
                  <option value="eletricista">Eletricista</option><option value="ajudante">Ajudante</option><option value="tecnico_ited">Tecnico ITED</option><option value="tecnico_cctv">Tecnico CCTV</option><option value="tecnico_intrusao">Tecnico Intrusao</option><option value="encarregado">Encarregado</option><option value="engenheiro">Engenheiro</option>
                </select>
              </div>
            </div>
            <div><Label className="text-zinc-300 text-sm">Perda de produtividade (%)</Label><Input type="number" value={form.loss_pct} onChange={e => setForm({ ...form, loss_pct: parseFloat(e.target.value) || 0 })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
            <div><Label className="text-zinc-300 text-sm">Observacoes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
            <Button onClick={handleSave} className="w-full bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold h-12">Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
