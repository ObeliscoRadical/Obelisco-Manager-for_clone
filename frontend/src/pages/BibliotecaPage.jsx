import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, FileText, Star, Copy } from 'lucide-react';
import { toast } from 'sonner';

const catColors = { proposta: 'bg-yellow-400/20 text-yellow-400', exclusoes: 'bg-red-500/20 text-red-400', prazo: 'bg-blue-400/20 text-blue-400', garantia: 'bg-green-500/20 text-green-400', tecnico: 'bg-purple-400/20 text-purple-400', geral: 'bg-zinc-700 text-zinc-300' };

export default function BibliotecaPage() {
  const [templates, setTemplates] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', category: 'geral', content: '' });

  const fetchAll = useCallback(async () => {
    try {
      const [tRes, fRes] = await Promise.all([api.get('/text-templates'), api.get('/favorites')]);
      setTemplates(tRes.data);
      setFavorites(fRes.data);
    } catch (err) { console.error(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openNew = () => { setEditing(null); setForm({ name: '', category: 'geral', content: '' }); setDialogOpen(true); };
  const openEdit = (t) => { setEditing(t); setForm({ name: t.name, category: t.category, content: t.content }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name || !form.content) { toast.error('Preencha nome e conteudo'); return; }
    try {
      if (editing) { await api.put(`/text-templates/${editing.id}`, form); toast.success('Template atualizado'); }
      else { await api.post('/text-templates', form); toast.success('Template criado'); }
      setDialogOpen(false); fetchAll();
    } catch { toast.error('Erro ao guardar'); }
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Eliminar?')) return;
    try { await api.delete(`/text-templates/${id}`); toast.success('Eliminado'); fetchAll(); }
    catch { toast.error('Erro'); }
  };

  const handleDeleteFavorite = async (id) => {
    try { await api.delete(`/favorites/${id}`); toast.success('Favorito removido'); fetchAll(); }
    catch { toast.error('Erro'); }
  };

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Texto copiado!');
  };

  const categories = [...new Set(templates.map(t => t.category))];

  return (
    <div data-testid="biblioteca-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Biblioteca</h1>
          <p className="text-zinc-400 mt-1 font-medium">Textos padrao e itens favoritos</p>
        </div>
        <Button data-testid="new-template-btn" onClick={openNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={16} className="mr-2" /> Novo Texto
        </Button>
      </div>

      <Tabs defaultValue="textos">
        <TabsList className="bg-zinc-900 border border-zinc-800 rounded-full p-1">
          <TabsTrigger value="textos" className="rounded-full data-[state=active]:bg-yellow-400 data-[state=active]:text-zinc-950 text-zinc-400 text-sm"><FileText size={14} className="mr-1" /> Textos ({templates.length})</TabsTrigger>
          <TabsTrigger value="favoritos" className="rounded-full data-[state=active]:bg-yellow-400 data-[state=active]:text-zinc-950 text-zinc-400 text-sm"><Star size={14} className="mr-1" /> Favoritos ({favorites.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="textos" className="mt-6">
          {loading ? (
            <div className="flex justify-center py-16"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="space-y-6">
              {categories.map(cat => (
                <div key={cat}>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-3 capitalize">{cat}</h3>
                  <div className="space-y-2">
                    {templates.filter(t => t.category === cat).map(t => (
                      <Card key={t.id} className="bg-zinc-900 border-zinc-800 rounded-2xl">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge className={catColors[t.category] || catColors.geral}>{t.category}</Badge>
                                <p className="text-white font-semibold text-sm truncate">{t.name}</p>
                              </div>
                              <p className="text-zinc-400 text-sm leading-relaxed">{t.content}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => copyText(t.content)} className="text-zinc-500 hover:text-yellow-400 p-1" title="Copiar"><Copy size={14} /></button>
                              <button onClick={() => openEdit(t)} className="text-zinc-500 hover:text-white p-1"><Pencil size={14} /></button>
                              <button onClick={() => handleDeleteTemplate(t.id)} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="favoritos" className="mt-6">
          {favorites.length === 0 ? (
            <div className="text-center py-16 text-zinc-500"><Star size={48} className="mx-auto mb-4 text-zinc-700" /><p>Sem itens favoritos</p><p className="text-sm mt-1">Adicione itens ao criar orçamentos</p></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {favorites.map(f => (
                <Card key={f.id} className="bg-zinc-900 border-zinc-800 rounded-2xl">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge className="bg-zinc-800 text-zinc-300 text-xs">{f.category || 'Sem cat.'}</Badge>
                      <button onClick={() => handleDeleteFavorite(f.id)} className="text-zinc-600 hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                    <p className="text-white font-medium text-sm">{f.name}</p>
                    <div className="flex justify-between text-xs text-zinc-500 mt-2">
                      <span>Qtd: {f.quantity}</span>
                      <span>Custo: {f.unit_cost} EUR</span>
                      <span>Margem: {(f.margin * 100).toFixed(0)}%</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white">{editing ? 'Editar' : 'Novo'} Texto</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">Template de texto para propostas</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label className="text-zinc-300 text-sm">Nome *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
            <div>
              <Label className="text-zinc-300 text-sm">Categoria</Label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="mt-1 w-full h-10 bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 text-sm">
                <option value="proposta">Proposta</option><option value="exclusoes">Exclusoes</option><option value="prazo">Prazo</option><option value="garantia">Garantia</option><option value="tecnico">Tecnico</option><option value="geral">Geral</option>
              </select>
            </div>
            <div>
              <Label className="text-zinc-300 text-sm">Conteudo *</Label>
              <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} className="mt-1 w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2 text-sm min-h-[120px] resize-y focus:ring-2 focus:ring-yellow-400 outline-none" />
            </div>
            <Button onClick={handleSave} className="w-full bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold h-12">Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
