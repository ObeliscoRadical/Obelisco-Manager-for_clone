import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { generateGuidePDF } from '../lib/guidePdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Eye, Send, FileDown, Truck, Package, RefreshCw, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_LABEL = {
  rascunho: { label: 'Rascunho', color: 'bg-zinc-700 text-zinc-300' },
  emitida: { label: 'Emitida', color: 'bg-yellow-400/20 text-yellow-300' },
  em_transito: { label: 'Em Trânsito', color: 'bg-blue-500/20 text-blue-300' },
  recebida: { label: 'Recebida', color: 'bg-green-500/20 text-green-400' },
  recebida_com_diferencas: { label: 'Recebida c/ Diferenças', color: 'bg-orange-500/20 text-orange-300' },
};

export default function GuiasPage() {
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const [employees, setEmployees] = useState([]);
  const [works, setWorks] = useState([]);
  const [materials, setMaterials] = useState([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createMode, setCreateMode] = useState('work'); // work | manual
  const [form, setForm] = useState({
    work_id: '',
    origin: 'Armazém Obelisco',
    destination: '',
    notes: '',
    assigned_employee_id: '',
    expected_delivery_date: '',
    items: [],
  });

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailGuide, setDetailGuide] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [g, e, w, m] = await Promise.all([
        api.get('/transport-guides'),
        api.get('/payroll/employees'),
        api.get('/works'),
        api.get('/materials').catch(() => ({ data: [] })),
      ]);
      setGuides(g.data);
      setEmployees((e.data || []).filter(x => x.active !== false));
      setWorks(w.data || []);
      setMaterials(m.data || []);
    } catch (err) {
      console.error('Guias fetch error:', err);
      toast.error('Erro a carregar guias');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filteredGuides = useMemo(() => {
    if (filter === 'all') return guides;
    return guides.filter(g => g.status === filter);
  }, [guides, filter]);

  /* -------------- CREATE FLOW -------------- */
  const openCreate = () => {
    setCreateMode('work');
    setForm({
      work_id: '',
      origin: 'Armazém Obelisco',
      destination: '',
      notes: '',
      assigned_employee_id: '',
      expected_delivery_date: '',
      items: [],
    });
    setCreateOpen(true);
  };

  const onSelectWork = async (workId) => {
    const w = works.find(x => x.id === workId);
    if (!w) return;
    try {
      const { data } = await api.get(`/transport-guides/_helpers/work-materials/${workId}`);
      const items = (data.items || []).map(it => ({
        ...it,
        damaged_qty: 0,
        notes: '',
        _selected: true,
      }));
      setForm(f => ({
        ...f,
        work_id: workId,
        destination: w.title ? `Obra: ${w.title}` : f.destination,
        items,
      }));
    } catch (err) {
      console.error(err);
      toast.error('Erro a carregar materiais da obra');
    }
  };

  const addManualItem = () => {
    setForm(f => ({
      ...f,
      items: [...f.items, { name: '', unit: 'un', category: '', qty_planned: 1, material_id: null, _selected: true }],
    }));
  };

  const setItemMaterial = (idx, materialId) => {
    const m = materials.find(x => x.id === materialId);
    if (!m) return;
    setForm(f => {
      const items = [...f.items];
      items[idx] = {
        ...items[idx],
        material_id: materialId,
        name: m.description || m.name || items[idx].name,
        unit: m.unit || items[idx].unit || 'un',
        category: m.category || items[idx].category || '',
      };
      return { ...f, items };
    });
  };

  const updateItem = (idx, key, value) => {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [key]: value };
      return { ...f, items };
    });
  };

  const removeItem = (idx) => {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const submitCreate = async (emitNow = false) => {
    if (!form.assigned_employee_id) { toast.error('Atribui um técnico antes de criar a guia'); return; }
    const items = form.items.filter(it => it._selected !== false && it.name && it.qty_planned > 0)
      .map(it => ({
        material_id: it.material_id || null,
        name: it.name,
        unit: it.unit || 'un',
        category: it.category || '',
        qty_planned: parseFloat(it.qty_planned) || 0,
        damaged_qty: 0,
        notes: it.notes || '',
      }));
    if (items.length === 0) { toast.error('Adiciona pelo menos 1 item'); return; }
    setCreating(true);
    try {
      const payload = {
        work_id: form.work_id || null,
        origin: form.origin,
        destination: form.destination,
        notes: form.notes,
        assigned_employee_id: form.assigned_employee_id,
        expected_delivery_date: form.expected_delivery_date || null,
        items,
      };
      const { data } = await api.post('/transport-guides', payload);
      if (emitNow) {
        try {
          await api.post(`/transport-guides/${data.id}/emit`);
          toast.success(`Guia ${data.number} criada e emitida`);
        } catch (err) {
          toast.warning(`Guia ${data.number} criada mas falha ao emitir: ${err?.response?.data?.detail || ''}`);
        }
      } else {
        toast.success(`Guia ${data.number} criada como rascunho`);
      }
      setCreateOpen(false);
      fetchAll();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro a criar guia');
    } finally {
      setCreating(false);
    }
  };

  /* -------------- ROW ACTIONS -------------- */
  const handleEmit = async (g) => {
    if (!window.confirm(`Emitir guia ${g.number}? O stock dos materiais será decrementado.`)) return;
    try {
      await api.post(`/transport-guides/${g.id}/emit`);
      toast.success('Guia emitida e stock atualizado');
      fetchAll();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro a emitir');
    }
  };

  const handleDelete = async (g) => {
    if (!window.confirm(`Eliminar guia ${g.number}?`)) return;
    try {
      await api.delete(`/transport-guides/${g.id}`);
      toast.success('Eliminada');
      fetchAll();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro a eliminar');
    }
  };

  const handleViewDetail = async (g) => {
    try {
      const { data } = await api.get(`/transport-guides/${g.id}`);
      setDetailGuide(data);
      setDetailOpen(true);
    } catch {
      toast.error('Erro a carregar guia');
    }
  };

  const handleReturnToStock = async (guideId) => {
    if (!window.confirm('Devolver toda a sobra desta guia ao armazém? Os movimentos de stock serão criados.')) return;
    try {
      const { data } = await api.post(`/transport-guides/${guideId}/return-to-stock`, {});
      setDetailGuide(data);
      toast.success('Sobra devolvida ao armazém');
      fetchAll();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro a devolver sobra');
    }
  };

  const handleDownloadPDF = async (g) => {
    try {
      const { data: full } = await api.get(`/transport-guides/${g.id}`);
      const { data: settings } = await api.get('/proposal-settings').catch(() => ({ data: {} }));
      const logo = settings?.logo_base64 || settings?.logo || null;
      await generateGuidePDF(full, settings, logo);
      toast.success('PDF gerado');
    } catch (err) {
      console.error(err);
      toast.error('Erro a gerar PDF');
    }
  };

  return (
    <div data-testid="guias-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Guias de Transporte</h1>
          <p className="text-zinc-400 mt-1 font-medium">Saída de material para obra · confirmação pelo técnico</p>
        </div>
        <Button data-testid="new-guide-btn" onClick={openCreate} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold h-12 px-5">
          <Plus size={18} className="mr-2" /> Nova Guia
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { v: 'all', label: 'Todas' },
          { v: 'rascunho', label: 'Rascunho' },
          { v: 'emitida', label: 'Emitidas' },
          { v: 'recebida', label: 'Recebidas' },
          { v: 'recebida_com_diferencas', label: 'C/ Diferenças' },
        ].map(t => (
          <button
            key={t.v}
            data-testid={`filter-${t.v}`}
            onClick={() => setFilter(t.v)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase transition ${
              filter === t.v
                ? 'bg-yellow-400 text-zinc-950'
                : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
        <Button onClick={fetchAll} variant="ghost" className="text-zinc-400 hover:text-yellow-400 ml-auto">
          <RefreshCw size={14} className="mr-1" /> Atualizar
        </Button>
      </div>

      {loading && (
        <div className="flex justify-center py-16"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
      )}
      {!loading && filteredGuides.length === 0 && (
        <div className="text-center py-16 text-zinc-500">
          <Truck size={48} className="mx-auto mb-4 text-zinc-700" />
          <p>Sem guias para mostrar</p>
        </div>
      )}
      {!loading && filteredGuides.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGuides.map(g => {
            const st = STATUS_LABEL[g.status] || STATUS_LABEL.rascunho;
            const itemsCount = (g.items || []).length;
            const diffsCount = (g.items || []).filter(it => it.qty_received != null && it.qty_received < it.qty_planned).length;
            return (
              <div
                key={g.id}
                data-testid={`guide-card-${g.id}`}
                className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 hover:border-zinc-700 transition cursor-pointer"
                onClick={() => handleViewDetail(g)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500">Guia</div>
                    <div className="text-lg font-black text-yellow-400" translate="no">{g.number}</div>
                  </div>
                  <Badge className={`${st.color} text-[10px]`}>{st.label}</Badge>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="text-white font-semibold truncate">{g.obra_name || g.destination || '—'}</div>
                  {g.client_name && <div className="text-zinc-500 text-xs">{g.client_name}</div>}
                  <div className="flex items-center gap-1 text-zinc-400 text-xs mt-2">
                    <Package size={12} /> {itemsCount} item(s)
                    {g.status === 'recebida_com_diferencas' && diffsCount > 0 && (
                      <span className="text-orange-300 ml-2 flex items-center gap-1">
                        <AlertTriangle size={12} /> {diffsCount} diff.
                      </span>
                    )}
                  </div>
                  <div className="text-zinc-500 text-xs">Técnico: <span className="text-zinc-300">{g.assigned_employee_name || '—'}</span></div>
                  {g.expected_delivery_date && <div className="text-zinc-500 text-xs">Entrega: {g.expected_delivery_date}</div>}
                </div>
                <div className="flex gap-1 mt-4 pt-3 border-t border-zinc-800" onClick={(e) => e.stopPropagation()}>
                  <Button data-testid={`view-${g.id}`} size="sm" variant="ghost" onClick={() => handleViewDetail(g)} className="flex-1 h-8 text-xs text-zinc-300 hover:text-white">
                    <Eye size={12} className="mr-1" /> Detalhe
                  </Button>
                  <Button data-testid={`pdf-${g.id}`} size="sm" variant="ghost" onClick={() => handleDownloadPDF(g)} className="flex-1 h-8 text-xs text-zinc-300 hover:text-white">
                    <FileDown size={12} className="mr-1" /> PDF
                  </Button>
                  {g.status === 'rascunho' && (
                    <Button data-testid={`emit-${g.id}`} size="sm" onClick={() => handleEmit(g)} className="flex-1 h-8 text-xs bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-bold">
                      <Send size={12} className="mr-1" /> Emitir
                    </Button>
                  )}
                  {g.status === 'rascunho' && (
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(g)} className="h-8 px-2 text-xs text-zinc-400 hover:text-red-400">
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="create-guide-dialog" className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase text-white">Nova Guia de Transporte</DialogTitle>
            <DialogDescription className="text-zinc-500">Define a obra/destino, atribui um técnico e adiciona os materiais.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-4">
            {/* Modo */}
            <div className="grid grid-cols-2 gap-2">
              <button
                data-testid="mode-work"
                onClick={() => setCreateMode('work')}
                className={`px-4 py-3 rounded-xl border text-left ${createMode === 'work' ? 'bg-yellow-400/10 border-yellow-400/40' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}
              >
                <div className="font-bold text-white text-sm">A partir de Obra</div>
                <div className="text-xs text-zinc-400 mt-0.5">Carrega materiais do orçamento</div>
              </button>
              <button
                data-testid="mode-manual"
                onClick={() => setCreateMode('manual')}
                className={`px-4 py-3 rounded-xl border text-left ${createMode === 'manual' ? 'bg-yellow-400/10 border-yellow-400/40' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}
              >
                <div className="font-bold text-white text-sm">Manual</div>
                <div className="text-xs text-zinc-400 mt-0.5">Escolhe materiais do stock</div>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {createMode === 'work' && (
                <div>
                  <Label className="text-zinc-300 text-xs">Obra</Label>
                  <Select value={form.work_id} onValueChange={onSelectWork}>
                    <SelectTrigger data-testid="select-work" className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl">
                      <SelectValue placeholder="Escolher obra…" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 max-h-72">
                      {works.map(w => <SelectItem key={w.id} value={w.id} className="text-white">{w.title} · {w.client_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-zinc-300 text-xs">Técnico atribuído *</Label>
                <Select value={form.assigned_employee_id} onValueChange={(v) => setForm(f => ({ ...f, assigned_employee_id: v }))}>
                  <SelectTrigger data-testid="select-employee" className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl">
                    <SelectValue placeholder="Escolher…" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 max-h-72">
                    {employees.map(e => <SelectItem key={e.id} value={e.id} className="text-white">{e.name} {e.email ? `· ${e.email}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-zinc-300 text-xs">Origem</Label>
                <Input value={form.origin} onChange={e => setForm(f => ({ ...f, origin: e.target.value }))} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
              <div>
                <Label className="text-zinc-300 text-xs">Destino</Label>
                <Input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
              <div>
                <Label className="text-zinc-300 text-xs">Data prevista de entrega</Label>
                <Input type="date" value={form.expected_delivery_date} onChange={e => setForm(f => ({ ...f, expected_delivery_date: e.target.value }))} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
              <div>
                <Label className="text-zinc-300 text-xs">Observações</Label>
                <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="Notas internas…" />
              </div>
            </div>

            {/* Items */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-bold text-sm uppercase">Materiais ({form.items.filter(i => i._selected !== false).length})</h3>
                <Button onClick={addManualItem} size="sm" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-full">
                  <Plus size={12} className="mr-1" /> Adicionar item
                </Button>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {form.items.length === 0 && (
                  <p className="text-zinc-500 text-sm text-center py-6">
                    {createMode === 'work' ? 'Escolhe primeiro a obra para carregar os materiais.' : 'Clica em "Adicionar item" para começar.'}
                  </p>
                )}
                {form.items.map((it, idx) => (
                  <div key={it.material_id || it.name || idx} className={`grid grid-cols-12 gap-2 items-center p-2 rounded-xl ${it._selected === false ? 'opacity-40' : 'bg-zinc-950'}`}>
                    <input
                      type="checkbox"
                      checked={it._selected !== false}
                      onChange={(e) => updateItem(idx, '_selected', e.target.checked)}
                      className="col-span-1 h-4 w-4 accent-yellow-400"
                    />
                    {createMode === 'manual' && !it.name ? (
                      <Select value={it.material_id || ''} onValueChange={(v) => setItemMaterial(idx, v)}>
                        <SelectTrigger className="col-span-5 bg-zinc-900 border-zinc-800 text-white rounded-lg h-9 text-xs">
                          <SelectValue placeholder="Escolher material…" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 max-h-72">
                          {materials.map(m => <SelectItem key={m.id} value={m.id} className="text-white text-xs">{m.description || m.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={it.name}
                        onChange={(e) => updateItem(idx, 'name', e.target.value)}
                        placeholder="Nome do material"
                        className="col-span-5 bg-zinc-900 border-zinc-800 text-white rounded-lg h-9 text-xs"
                      />
                    )}
                    <Input
                      value={it.unit}
                      onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                      placeholder="un"
                      className="col-span-2 bg-zinc-900 border-zinc-800 text-white rounded-lg h-9 text-xs text-center"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={it.qty_planned}
                      onChange={(e) => updateItem(idx, 'qty_planned', e.target.value)}
                      className="col-span-3 bg-zinc-900 border-zinc-800 text-white rounded-lg h-9 text-xs text-right"
                    />
                    <button onClick={() => removeItem(idx)} className="col-span-1 text-zinc-500 hover:text-red-400">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-3 border-t border-zinc-800">
              <Button variant="outline" onClick={() => setCreateOpen(false)} className="border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button
                data-testid="save-draft-btn"
                disabled={creating}
                onClick={() => submitCreate(false)}
                variant="outline"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-full"
              >
                Guardar Rascunho
              </Button>
              <Button
                data-testid="save-emit-btn"
                disabled={creating}
                onClick={() => submitCreate(true)}
                className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-bold rounded-full"
              >
                <Send size={14} className="mr-2" /> Criar e Emitir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DETAIL Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent data-testid="detail-guide-dialog" className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-4xl max-h-[92vh] overflow-y-auto">
          {detailGuide && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <DialogTitle className="text-2xl font-black uppercase text-white" translate="no">{detailGuide.number}</DialogTitle>
                    <DialogDescription className="text-zinc-500">
                      {detailGuide.obra_name || detailGuide.destination || '—'} · Técnico: {detailGuide.assigned_employee_name || '—'}
                    </DialogDescription>
                  </div>
                  <Badge className={(STATUS_LABEL[detailGuide.status] || STATUS_LABEL.rascunho).color}>
                    {(STATUS_LABEL[detailGuide.status] || STATUS_LABEL.rascunho).label}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="space-y-5 mt-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <Info label="Origem" value={detailGuide.origin} />
                  <Info label="Destino" value={detailGuide.destination} />
                  <Info label="Prevista" value={detailGuide.expected_delivery_date || '—'} />
                  <Info label="Emitida em" value={detailGuide.emitted_at ? new Date(detailGuide.emitted_at).toLocaleString('pt-PT') : '—'} />
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-950/80 text-zinc-500 uppercase text-xs">
                      <tr>
                        <th className="text-left px-4 py-2 font-semibold">Material</th>
                        <th className="text-right px-2 py-2 font-semibold">Previsto</th>
                        <th className="text-right px-2 py-2 font-semibold">Recebido</th>
                        <th className="text-right px-2 py-2 font-semibold">Utilizado</th>
                        <th className="text-right px-2 py-2 font-semibold">Devolvido</th>
                        <th className="text-right px-2 py-2 font-semibold">Sobra Obra</th>
                        <th className="text-right px-2 py-2 font-semibold">Danificado</th>
                        <th className="text-left px-2 py-2 font-semibold">Nota</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detailGuide.items || []).map(it => {
                        const planned = Number(it.qty_planned || 0);
                        const received = it.qty_received == null ? null : Number(it.qty_received);
                        const used = Number(it.qty_used || 0);
                        const returned = Number(it.qty_returned || 0);
                        const surplus = received == null ? null : (received - used - returned);
                        const diff = received != null && received < planned;
                        return (
                          <tr key={it.id} className="border-t border-zinc-800">
                            <td className="px-4 py-2 text-white">{it.name} <span className="text-zinc-500 text-xs">({it.unit})</span></td>
                            <td className="px-2 py-2 text-right text-zinc-300">{planned}</td>
                            <td className={`px-2 py-2 text-right font-bold ${received == null ? 'text-zinc-600' : diff ? 'text-orange-300' : 'text-green-400'}`}>
                              {received == null ? '—' : received}
                            </td>
                            <td className="px-2 py-2 text-right text-blue-300 font-semibold">{used > 0 ? used : '—'}</td>
                            <td className="px-2 py-2 text-right text-zinc-400">{returned > 0 ? returned : '—'}</td>
                            <td className={`px-2 py-2 text-right font-bold ${surplus == null ? 'text-zinc-600' : surplus > 0 ? 'text-yellow-400' : 'text-zinc-500'}`}>
                              {surplus == null ? '—' : surplus.toFixed(2).replace(/\.00$/, '')}
                            </td>
                            <td className={`px-2 py-2 text-right ${it.damaged_qty > 0 ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>{it.damaged_qty || 0}</td>
                            <td className="px-2 py-2 text-zinc-400 text-xs">{it.notes || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Sobra na obra → botão devolver ao armazém */}
                {(() => {
                  const totalSurplus = (detailGuide.items || []).reduce((s, it) => {
                    const received = Number(it.qty_received || 0);
                    const used = Number(it.qty_used || 0);
                    const returned = Number(it.qty_returned || 0);
                    return s + Math.max(0, received - used - returned);
                  }, 0);
                  if (totalSurplus <= 0.0001) return null;
                  return (
                    <div data-testid="surplus-banner" className="bg-yellow-400/5 border border-yellow-400/30 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-yellow-300 font-bold text-sm">Material em sobra na obra</div>
                        <div className="text-zinc-400 text-xs mt-1">
                          Total: <span className="text-white font-bold">{totalSurplus.toFixed(2).replace(/\.00$/, '')}</span> unidade(s) entre vários items. Quando o técnico voltar ao armazém, clica em devolver.
                        </div>
                      </div>
                      <Button
                        data-testid="return-to-stock-btn"
                        onClick={() => handleReturnToStock(detailGuide.id)}
                        className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-bold rounded-full"
                      >
                        <Package size={14} className="mr-2" /> Devolver sobra ao armazém
                      </Button>
                    </div>
                  );
                })()}

                {detailGuide.reception && (
                  <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-4">
                    <div className="flex items-center gap-2 text-green-400 font-bold mb-2">
                      <CheckCircle2 size={16} /> Receção registada em {new Date(detailGuide.reception.received_at).toLocaleString('pt-PT')}
                    </div>
                    <div className="text-sm text-zinc-300">
                      Recebida por: <span className="text-white">{detailGuide.reception.received_by_name}</span>
                    </div>
                    {detailGuide.reception.notes && <p className="text-sm text-zinc-400 mt-1">{detailGuide.reception.notes}</p>}
                    {detailGuide.reception.signature_data && (
                      <div className="mt-3 inline-block bg-white p-2 rounded">
                        <img src={detailGuide.reception.signature_data} alt="Assinatura" className="h-20" />
                      </div>
                    )}
                    {detailGuide.reception.photos && detailGuide.reception.photos.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 md:grid-cols-6 gap-2">
                        {detailGuide.reception.photos.map((p, i) => (
                          <img key={p} src={p} alt={`Foto ${i + 1}`} className="rounded-lg w-full h-20 object-cover" />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(detailGuide.history || []).length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                    <h4 className="text-white font-bold text-sm uppercase mb-2">Histórico</h4>
                    <div className="space-y-1.5 text-xs">
                      {detailGuide.history.slice().reverse().map((h, i) => (
                        <div key={i} className="flex items-start gap-2 text-zinc-400">
                          <span className="text-zinc-600 shrink-0">{new Date(h.at).toLocaleString('pt-PT')}</span>
                          <span className="text-yellow-400 font-semibold">{h.action}</span>
                          <span className="text-zinc-500">· {h.by}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                  <Button onClick={() => handleDownloadPDF(detailGuide)} variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-full">
                    <FileDown size={14} className="mr-2" /> Descarregar PDF
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2">
      <div className="text-[10px] uppercase text-zinc-500 tracking-wide">{label}</div>
      <div className="text-sm text-white truncate">{value || '—'}</div>
    </div>
  );
}
