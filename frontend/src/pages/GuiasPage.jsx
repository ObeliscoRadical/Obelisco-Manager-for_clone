import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { generateGuidePDF } from '../lib/guidePdf';
import { toast } from 'sonner';
import { GuidesToolbar } from '../components/guides/GuidesToolbar';
import { GuidesGrid } from '../components/guides/GuidesGrid';
import { GuideCreateDialog } from '../components/guides/GuideCreateDialog';
import { GuideDetailDialog } from '../components/guides/GuideDetailDialog';
import { devLog } from '../lib/browserStorage';

const STATUS_LABEL = {
  rascunho: { label: 'Rascunho', color: 'bg-zinc-700 text-zinc-300' },
  emitida: { label: 'Emitida', color: 'bg-yellow-400/20 text-yellow-300' },
  em_transito: { label: 'Em Trânsito', color: 'bg-blue-500/20 text-blue-300' },
  recebida: { label: 'Recebida', color: 'bg-green-500/20 text-green-400' },
  recebida_com_diferencas: { label: 'Recebida c/ Diferenças', color: 'bg-orange-500/20 text-orange-300' },
};

const emptyForm = {
  work_id: '',
  origin: 'Armazém Obelisco',
  destination: '',
  notes: '',
  assigned_employee_id: '',
  expected_delivery_date: '',
  items: [],
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
  const [createMode, setCreateMode] = useState('work');
  const [form, setForm] = useState(emptyForm);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailGuide, setDetailGuide] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [guideRes, employeeRes, workRes, materialRes] = await Promise.all([
        api.get('/transport-guides'),
        api.get('/payroll/employees'),
        api.get('/works'),
        api.get('/materials').catch(() => ({ data: [] })),
      ]);
      setGuides(guideRes.data);
      setEmployees((employeeRes.data || []).filter(x => x.active !== false));
      setWorks(workRes.data || []);
      setMaterials(materialRes.data || []);
    } catch (err) {
      devLog('Guias fetch error:', err?.message || err);
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

  const openCreate = () => {
    setCreateMode('work');
    setForm(emptyForm);
    setCreateOpen(true);
  };

  const onSelectWork = async (workId) => {
    const work = works.find(item => item.id === workId);
    if (!work) return;
    try {
      const { data } = await api.get(`/transport-guides/_helpers/work-materials/${workId}`);
      const items = (data.items || []).map(it => ({ ...it, damaged_qty: 0, notes: '', _selected: true }));
      setForm(prev => ({ ...prev, work_id: workId, destination: work.title ? `Obra: ${work.title}` : prev.destination, items }));
    } catch (err) {
      toast.error('Erro a carregar materiais da obra');
    }
  };

  const addManualItem = () => setForm(prev => ({ ...prev, items: [...prev.items, { name: '', unit: 'un', category: '', qty_planned: 1, material_id: null, _selected: true }] }));

  const setItemMaterial = (idx, materialId) => {
    const material = materials.find(item => item.id === materialId);
    if (!material) return;
    setForm(prev => {
      const items = [...prev.items];
      items[idx] = {
        ...items[idx],
        material_id: materialId,
        name: material.description || material.name || items[idx].name,
        unit: material.unit || items[idx].unit || 'un',
        category: material.category || items[idx].category || '',
      };
      return { ...prev, items };
    });
  };

  const updateItem = (idx, key, value) => {
    setForm(prev => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], [key]: value };
      return { ...prev, items };
    });
  };

  const removeItem = (idx) => setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const submitCreate = async (emitNow = false) => {
    if (!form.assigned_employee_id) return toast.error('Atribui um técnico antes de criar a guia');
    const items = form.items.filter(it => it._selected !== false && it.name && it.qty_planned > 0).map(it => ({
      material_id: it.material_id || null,
      name: it.name,
      unit: it.unit || 'un',
      category: it.category || '',
      qty_planned: parseFloat(it.qty_planned) || 0,
      damaged_qty: 0,
      notes: it.notes || '',
    }));
    if (items.length === 0) return toast.error('Adiciona pelo menos 1 item');

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

  const handleEmit = async (guide) => {
    if (!window.confirm(`Emitir guia ${guide.number}? O stock dos materiais será decrementado.`)) return;
    try {
      await api.post(`/transport-guides/${guide.id}/emit`);
      toast.success('Guia emitida e stock atualizado');
      fetchAll();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro a emitir');
    }
  };

  const handleDelete = async (guide) => {
    if (!window.confirm(`Eliminar guia ${guide.number}?`)) return;
    try {
      await api.delete(`/transport-guides/${guide.id}`);
      toast.success('Eliminada');
      fetchAll();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro a eliminar');
    }
  };

  const handleViewDetail = async (guide) => {
    try {
      const { data } = await api.get(`/transport-guides/${guide.id}`);
      setDetailGuide(data);
      setDetailOpen(true);
    } catch (err) {
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

  const handleDownloadPDF = async (guide) => {
    try {
      const { data: full } = await api.get(`/transport-guides/${guide.id}`);
      const { data: settings } = await api.get('/proposal-settings').catch(() => ({ data: {} }));
      await generateGuidePDF(full, settings, settings?.logo_base64 || settings?.logo || null);
      toast.success('PDF gerado');
    } catch (err) {
      devLog('[guide/pdf]', err?.message || err);
      toast.error('Erro a gerar PDF');
    }
  };

  return (
    <div data-testid="guias-page" className="space-y-6">
      <GuidesToolbar filter={filter} onFilterChange={setFilter} onRefresh={fetchAll} onNew={openCreate} />

      <GuidesGrid loading={loading} guides={filteredGuides} statusLabel={STATUS_LABEL} onViewDetail={handleViewDetail} onDownloadPDF={handleDownloadPDF} onEmit={handleEmit} onDelete={handleDelete} />

      <GuideCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        createMode={createMode}
        setCreateMode={setCreateMode}
        form={form}
        setForm={setForm}
        works={works}
        employees={employees}
        materials={materials}
        onSelectWork={onSelectWork}
        addManualItem={addManualItem}
        setItemMaterial={setItemMaterial}
        updateItem={updateItem}
        removeItem={removeItem}
        creating={creating}
        submitCreate={submitCreate}
      />

      <GuideDetailDialog open={detailOpen} onOpenChange={setDetailOpen} detailGuide={detailGuide} statusLabel={STATUS_LABEL} onReturnToStock={handleReturnToStock} onDownloadPDF={handleDownloadPDF} />
    </div>
  );
}