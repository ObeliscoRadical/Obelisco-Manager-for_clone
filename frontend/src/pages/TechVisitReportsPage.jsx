import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Camera, Eye, FilePlus2, FileText, Loader2, Minus, Plus, Save, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { optimizeImageToDataUrl } from '../lib/mobileImage';
import { buildEmptyVisitCircuit, getVisitServiceMeta, VISIT_CIRCUIT_TYPES, VISIT_USAGE_POINTS } from '../lib/visitReportCatalog';
import { VisitServicePicker } from '../components/tech/VisitServicePicker';
import { VisitReportPreview } from '../components/tech/VisitReportPreview';
import { VisitReportList } from '../components/tech/VisitReportList';
import { generateVisitReportPDF } from '../lib/visitReportPdf';

const buildVisitReference = () => {
  const today = new Date();
  const stamp = `${today.getDate().toString().padStart(2, '0')}${(today.getMonth() + 1).toString().padStart(2, '0')}`;
  const suffix = Math.floor(Math.random() * 90 + 10);
  return `RV-${stamp}-${suffix}`;
};

const createEmptyReport = () => ({
  id: null,
  status: 'rascunho',
  header: {
    visit_date: new Date().toISOString().slice(0, 10),
    client_name: '',
    client_phone: '',
    work_reference: buildVisitReference(),
    work_id: '',
  },
  scope: {
    title: 'IMPLEMENTAÇÃO DE CIRCUITOS',
    description: '',
  },
  circuits: [buildEmptyVisitCircuit()],
  distribution_board: {
    photo_data_url: '',
    modules: '',
    dimensions: '',
    installation_type: '',
    purpose: '',
  },
});

const normalizeReport = (report) => ({
  ...createEmptyReport(),
  ...report,
  header: { ...createEmptyReport().header, ...(report?.header || {}) },
  scope: { ...createEmptyReport().scope, ...(report?.scope || {}) },
  distribution_board: { ...createEmptyReport().distribution_board, ...(report?.distribution_board || {}) },
  circuits: report?.circuits?.length ? report.circuits : [buildEmptyVisitCircuit()],
});

const applyWorkToReport = (report, worksList, workId) => {
  const selected = worksList.find((work) => work.id === workId);
  if (!selected) return report;
  return {
    ...report,
    header: {
      ...report.header,
      work_id: selected.id,
      client_name: selected.title || selected.client_name || report.header.client_name,
      client_phone: selected.client_phone || report.header.client_phone,
    },
  };
};

export default function TechVisitReportsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [reports, setReports] = useState([]);
  const [works, setWorks] = useState([]);
  const [settings, setSettings] = useState({});
  const [form, setForm] = useState(createEmptyReport());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('form');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const workIdFromUrl = searchParams.get('workId');
  const selectedWork = useMemo(() => works.find((work) => work.id === form.header.work_id), [form.header.work_id, works]);
  const companyName = settings?.company_info?.name || user?.company_name || 'Obelisco Radical';

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const settingsRequest = user?.__kind === 'tech'
        ? Promise.resolve({ data: { company_info: { name: user?.company_name || 'Obelisco Radical' } } })
        : api.get('/system-settings').catch(() => ({ data: {} }));
      const [reportsResponse, worksResponse, settingsResponse] = await Promise.all([
        api.get('/tech/visit-reports'),
        api.get('/tech/visit-reports/helpers/works'),
        settingsRequest,
      ]);
      const loadedReports = reportsResponse.data || [];
      const loadedWorks = worksResponse.data || [];
      setReports(loadedReports);
      setWorks(loadedWorks);
      setSettings(settingsResponse.data || {});

      if (loadedReports.length) {
        setForm((current) => (current.id ? current : normalizeReport(loadedReports[0])));
      }
      if (!loadedReports.length && workIdFromUrl) {
        setForm((current) => applyWorkToReport(current, loadedWorks, workIdFromUrl));
      }
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao carregar relações de visita');
    } finally {
      setLoading(false);
    }
  }, [user?.__kind, user?.company_name, workIdFromUrl]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!workIdFromUrl || !works.length) return;
    setForm((current) => current.header.work_id ? current : applyWorkToReport(current, works, workIdFromUrl));
  }, [workIdFromUrl, works]);

  const updateHeader = (field, value) => setForm((current) => ({ ...current, header: { ...current.header, [field]: value } }));
  const updateScope = (field, value) => setForm((current) => ({ ...current, scope: { ...current.scope, [field]: value } }));
  const updateBoard = (field, value) => setForm((current) => ({ ...current, distribution_board: { ...current.distribution_board, [field]: value } }));

  const updateCircuit = (circuitId, patch) => {
    setForm((current) => ({
      ...current,
      circuits: current.circuits.map((circuit) => circuit.id === circuitId ? { ...circuit, ...patch } : circuit),
    }));
  };

  const addCircuit = () => setForm((current) => ({ ...current, circuits: [...current.circuits, buildEmptyVisitCircuit()] }));
  const removeCircuit = (circuitId) => setForm((current) => ({
    ...current,
    circuits: current.circuits.length > 1 ? current.circuits.filter((circuit) => circuit.id !== circuitId) : current.circuits,
  }));

  const handleSelectWork = (workId) => {
    setForm((current) => {
      const next = {
        ...current,
        header: { ...current.header, work_id: workId === 'none' ? '' : workId },
      };
      return workId === 'none' ? next : applyWorkToReport(next, works, workId);
    });
  };

  const handleSelectService = (circuitId, service) => {
    updateCircuit(circuitId, {
      icon_key: service.iconKey,
      service_key: service.key,
      description: service.label.toUpperCase(),
      circuit_type: service.defaultCircuitType,
      usage_point: service.defaultUsagePoint,
    });
  };

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('A foto deve ter no máximo 8MB');
      return;
    }
    setUploadingPhoto(true);
    try {
      const dataUrl = await optimizeImageToDataUrl(file);
      updateBoard('photo_data_url', dataUrl);
      toast.success('Foto do quadro pronta');
    } catch {
      toast.error('Não foi possível otimizar a foto');
    } finally {
      setUploadingPhoto(false);
      event.target.value = '';
    }
  };

  const saveReport = async (status = form.status) => {
    setSaving(true);
    const payload = { ...form, status };
    try {
      const response = form.id
        ? await api.put(`/tech/visit-reports/${form.id}`, payload)
        : await api.post('/tech/visit-reports', payload);
      const nextReport = normalizeReport(response.data);
      setForm(nextReport);
      setReports((current) => {
        const withoutCurrent = current.filter((item) => item.id !== nextReport.id);
        return [nextReport, ...withoutCurrent];
      });
      toast.success(status === 'final' ? 'Relação final guardada' : 'Rascunho guardado');
      return nextReport;
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao guardar relação de visita');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const deleteCurrent = async () => {
    if (!form.id) {
      setForm(createEmptyReport());
      return;
    }
    try {
      await api.delete(`/tech/visit-reports/${form.id}`);
      setReports((current) => current.filter((item) => item.id !== form.id));
      setForm(createEmptyReport());
      toast.success('Relação eliminada');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao eliminar relação');
    }
  };

  const exportPdf = async () => {
    const ensured = form.id ? form : await saveReport('final');
    if (!ensured) return;
    await generateVisitReportPDF(ensured, settings, user?.name || user?.email || 'Técnico');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" data-testid="visit-report-loading">
        <Loader2 className="h-8 w-8 animate-spin text-yellow-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="tech-visit-reports-page">
      <div className="space-y-4 rounded-[32px] border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(245,190,43,0.16),transparent_38%),linear-gradient(180deg,#18181b_0%,#09090b_100%)] p-5 text-white">
        <Link to={selectedWork ? `/tech/obra/${selectedWork.id}` : '/tech'} className="inline-flex items-center gap-2 text-sm text-yellow-300 hover:text-yellow-200" data-testid="visit-report-back-link">
          <ArrowLeft className="h-4 w-4" /> Voltar ao portal técnico
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <p className="text-[11px] uppercase tracking-[0.28em] text-yellow-300">Portal técnico · mobile first</p>
            <h1 className="mt-2 text-4xl font-black leading-none sm:text-5xl" data-testid="visit-report-page-title">Relação de Visita em Obra</h1>
            <p className="mt-3 max-w-lg text-sm text-zinc-300">Formulário rápido para campo: menos digitação, ícones grandes, foto direta da câmara e relatório pronto para PDF.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[220px]">
            <Button type="button" onClick={() => setForm(createEmptyReport())} data-testid="visit-report-new-button" className="h-12 rounded-2xl bg-yellow-500 text-zinc-950 hover:bg-yellow-400">
              <FilePlus2 className="h-4 w-4" /> Nova relação
            </Button>
            <Button type="button" variant="outline" onClick={() => setTab('preview')} data-testid="visit-report-open-preview-button" className="h-12 rounded-2xl border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800">
              <Eye className="h-4 w-4" /> Abrir pré-visualização
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[330px,minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="rounded-[28px] border-zinc-800 bg-zinc-950/80 text-white">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Recentes</p>
                  <h2 className="text-lg font-black">Relações guardadas</h2>
                </div>
                <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400" data-testid="visit-report-total-count">{reports.length} registo(s)</span>
              </div>
              <VisitReportList reports={reports} selectedId={form.id} onSelect={(report) => setForm(normalizeReport(report))} />
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-zinc-800 bg-zinc-950/80 text-white">
            <CardContent className="space-y-3 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Navegação rápida</p>
              <div className="grid gap-2">
                <button type="button" onClick={() => setTab('form')} data-testid="visit-report-tab-form" className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold ${tab === 'form' ? 'border-yellow-400 bg-yellow-500/10 text-yellow-300' : 'border-zinc-800 bg-zinc-900 text-zinc-300'}`}>
                  Formulário móvel
                </button>
                <button type="button" onClick={() => setTab('preview')} data-testid="visit-report-tab-preview" className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold ${tab === 'preview' ? 'border-yellow-400 bg-yellow-500/10 text-yellow-300' : 'border-zinc-800 bg-zinc-900 text-zinc-300'}`}>
                  Relatório final
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {tab === 'form' ? (
          <div className="space-y-4" data-testid="visit-report-form-view">
            <Card className="rounded-[30px] border-zinc-800 bg-zinc-950/85 text-white">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">1. Cabeçalho da visita</p>
                    <h2 className="text-lg font-black">Dados rápidos de obra e cliente</h2>
                  </div>
                  <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400" data-testid="visit-report-status-chip">{form.status}</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="visit-work-select">Obra atribuída (opcional)</Label>
                    <Select value={form.header.work_id || 'none'} onValueChange={handleSelectWork}>
                      <SelectTrigger id="visit-work-select" data-testid="visit-report-work-select" className="h-12 rounded-2xl border-zinc-800 bg-zinc-900 text-white">
                        <SelectValue placeholder="Selecionar obra" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem obra ligada</SelectItem>
                        {works.map((work) => (
                          <SelectItem key={work.id} value={work.id}>{work.title || work.client_name || work.id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visit-date-input">Data da visita</Label>
                    <Input id="visit-date-input" type="date" value={form.header.visit_date} onChange={(event) => updateHeader('visit_date', event.target.value)} data-testid="visit-report-date-input" className="h-12 rounded-2xl border-zinc-800 bg-zinc-900 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visit-reference-input">Referência da obra</Label>
                    <Input id="visit-reference-input" value={form.header.work_reference} onChange={(event) => updateHeader('work_reference', event.target.value)} data-testid="visit-report-reference-input" className="h-12 rounded-2xl border-zinc-800 bg-zinc-900 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visit-client-input">Cliente / Obra</Label>
                    <Input id="visit-client-input" value={form.header.client_name} onChange={(event) => updateHeader('client_name', event.target.value)} data-testid="visit-report-client-input" className="h-12 rounded-2xl border-zinc-800 bg-zinc-900 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visit-phone-input">Telefone do cliente</Label>
                    <Input id="visit-phone-input" value={form.header.client_phone} onChange={(event) => updateHeader('client_phone', event.target.value)} data-testid="visit-report-phone-input" className="h-12 rounded-2xl border-zinc-800 bg-zinc-900 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[30px] border-zinc-800 bg-zinc-950/85 text-white">
              <CardContent className="space-y-4 p-5">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">2. Escopo</p>
                  <h2 className="text-lg font-black">O que foi analisado nesta visita</h2>
                </div>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="visit-scope-title-input">Título da secção</Label>
                    <Input id="visit-scope-title-input" value={form.scope.title} onChange={(event) => updateScope('title', event.target.value)} data-testid="visit-report-scope-title-input" className="h-12 rounded-2xl border-zinc-800 bg-zinc-900 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visit-scope-description-input">Descrição geral</Label>
                    <Textarea id="visit-scope-description-input" value={form.scope.description} onChange={(event) => updateScope('description', event.target.value)} data-testid="visit-report-scope-description-input" className="min-h-[120px] rounded-3xl border-zinc-800 bg-zinc-900 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[30px] border-zinc-800 bg-zinc-950/85 text-white">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">3. Circuitos</p>
                    <h2 className="text-lg font-black">Lista dinâmica com ícones e pouca digitação</h2>
                  </div>
                  <Button type="button" onClick={addCircuit} data-testid="visit-report-add-circuit-button" className="h-11 rounded-2xl bg-yellow-500 text-zinc-950 hover:bg-yellow-400">
                    <Plus className="h-4 w-4" /> Adicionar
                  </Button>
                </div>

                <div className="space-y-4">
                  {form.circuits.map((circuit, index) => {
                    const service = getVisitServiceMeta(circuit.service_key);
                    return (
                      <div key={circuit.id} className="rounded-[28px] border border-zinc-800 bg-zinc-900/80 p-4" data-testid={`visit-report-circuit-card-${index}`}>
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Circuito {index + 1}</p>
                            <p className="text-sm font-semibold text-white" data-testid={`visit-report-circuit-service-${index}`}>{service.label}</p>
                          </div>
                          <button type="button" onClick={() => removeCircuit(circuit.id)} data-testid={`visit-report-remove-circuit-${index}`} className="rounded-2xl border border-zinc-700 bg-zinc-950 p-3 text-zinc-400 hover:text-red-300" disabled={form.circuits.length === 1}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="grid gap-4">
                          <VisitServicePicker value={circuit.service_key} onSelect={(serviceOption) => handleSelectService(circuit.id, serviceOption)} testIdPrefix={`visit-service-picker-${index}`} />
                          <div className="space-y-2">
                            <Label htmlFor={`visit-circuit-description-${index}`}>Descrição do serviço</Label>
                            <Input id={`visit-circuit-description-${index}`} value={circuit.description} onChange={(event) => updateCircuit(circuit.id, { description: event.target.value })} data-testid={`visit-report-circuit-description-${index}`} className="h-12 rounded-2xl border-zinc-800 bg-zinc-950 text-white" />
                          </div>
                          <div className="grid gap-4 sm:grid-cols-3">
                            <div className="space-y-2">
                              <Label>Quantidade</Label>
                              <div className="flex h-12 items-center rounded-2xl border border-zinc-800 bg-zinc-950">
                                <button type="button" onClick={() => updateCircuit(circuit.id, { quantity: Math.max(1, Number(circuit.quantity || 1) - 1) })} data-testid={`visit-report-circuit-quantity-minus-${index}`} className="flex h-full w-12 items-center justify-center text-zinc-400 hover:text-yellow-300">
                                  <Minus className="h-4 w-4" />
                                </button>
                                <div className="flex-1 text-center text-lg font-black text-white" data-testid={`visit-report-circuit-quantity-${index}`}>{circuit.quantity}</div>
                                <button type="button" onClick={() => updateCircuit(circuit.id, { quantity: Number(circuit.quantity || 1) + 1 })} data-testid={`visit-report-circuit-quantity-plus-${index}`} className="flex h-full w-12 items-center justify-center text-zinc-400 hover:text-yellow-300">
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Tipo de circuito</Label>
                              <Select value={circuit.circuit_type || VISIT_CIRCUIT_TYPES[0]} onValueChange={(value) => updateCircuit(circuit.id, { circuit_type: value })}>
                                <SelectTrigger data-testid={`visit-report-circuit-type-${index}`} className="h-12 rounded-2xl border-zinc-800 bg-zinc-950 text-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {VISIT_CIRCUIT_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Ponto de uso</Label>
                              <Select value={circuit.usage_point || VISIT_USAGE_POINTS[0]} onValueChange={(value) => updateCircuit(circuit.id, { usage_point: value })}>
                                <SelectTrigger data-testid={`visit-report-circuit-usage-${index}`} className="h-12 rounded-2xl border-zinc-800 bg-zinc-950 text-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {VISIT_USAGE_POINTS.map((point) => <SelectItem key={point} value={point}>{point}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[30px] border-zinc-800 bg-zinc-950/85 text-white">
              <CardContent className="space-y-4 p-5">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">4. Quadro de distribuição</p>
                  <h2 className="text-lg font-black">Foto direta da câmara + especificações finais</h2>
                </div>
                <div className="grid gap-4 md:grid-cols-[1.1fr,1fr]">
                  <div className="space-y-3">
                    <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" id="visit-board-photo-input" />
                    <label htmlFor="visit-board-photo-input" data-testid="visit-report-board-photo-trigger" className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-[28px] border border-dashed border-zinc-700 bg-zinc-900 text-center text-zinc-400 transition-colors hover:border-yellow-400/50 hover:text-yellow-300">
                      {form.distribution_board.photo_data_url ? (
                        <img src={form.distribution_board.photo_data_url} alt="Quadro" className="h-full max-h-[280px] w-full rounded-[28px] object-cover" data-testid="visit-report-board-photo-preview" />
                      ) : (
                        <>
                          {uploadingPhoto ? <Loader2 className="mb-3 h-8 w-8 animate-spin" /> : <Camera className="mb-3 h-8 w-8" />}
                          <p className="text-sm font-semibold">Abrir câmara / enviar foto</p>
                          <p className="mt-1 text-xs text-zinc-500">Toque aqui para fotografar o quadro elétrico.</p>
                        </>
                      )}
                    </label>
                  </div>
                  <div className="grid gap-4">
                    <div className="space-y-2"><Label htmlFor="visit-board-modules-input">Módulos</Label><Input id="visit-board-modules-input" value={form.distribution_board.modules} onChange={(event) => updateBoard('modules', event.target.value)} data-testid="visit-report-board-modules-input" className="h-12 rounded-2xl border-zinc-800 bg-zinc-900 text-white" /></div>
                    <div className="space-y-2"><Label htmlFor="visit-board-dimensions-input">Dimensões</Label><Input id="visit-board-dimensions-input" value={form.distribution_board.dimensions} onChange={(event) => updateBoard('dimensions', event.target.value)} data-testid="visit-report-board-dimensions-input" className="h-12 rounded-2xl border-zinc-800 bg-zinc-900 text-white" /></div>
                    <div className="space-y-2"><Label htmlFor="visit-board-installation-input">Tipo de instalação</Label><Input id="visit-board-installation-input" value={form.distribution_board.installation_type} onChange={(event) => updateBoard('installation_type', event.target.value)} data-testid="visit-report-board-installation-input" className="h-12 rounded-2xl border-zinc-800 bg-zinc-900 text-white" /></div>
                    <div className="space-y-2"><Label htmlFor="visit-board-purpose-input">Finalidade</Label><Textarea id="visit-board-purpose-input" value={form.distribution_board.purpose} onChange={(event) => updateBoard('purpose', event.target.value)} data-testid="visit-report-board-purpose-input" className="min-h-[92px] rounded-3xl border-zinc-800 bg-zinc-900 text-white" /></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="sticky bottom-20 z-20 flex flex-col gap-2 rounded-[28px] border border-zinc-800 bg-zinc-950/90 p-3 backdrop-blur sm:bottom-4 sm:flex-row">
              <Button type="button" onClick={() => saveReport('rascunho')} disabled={saving} data-testid="visit-report-save-draft-button" className="h-12 flex-1 rounded-2xl bg-zinc-100 text-zinc-950 hover:bg-white">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar rascunho
              </Button>
              <Button type="button" onClick={() => saveReport('final')} disabled={saving} data-testid="visit-report-save-final-button" className="h-12 flex-1 rounded-2xl bg-yellow-500 text-zinc-950 hover:bg-yellow-400">
                <FileText className="h-4 w-4" /> Fechar como final
              </Button>
              <Button type="button" variant="outline" onClick={deleteCurrent} data-testid="visit-report-delete-button" className="h-12 rounded-2xl border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800">
                <Trash2 className="h-4 w-4" /> Eliminar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4" data-testid="visit-report-preview-view">
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={exportPdf} data-testid="visit-report-export-pdf-button" className="h-12 rounded-2xl bg-yellow-500 text-zinc-950 hover:bg-yellow-400">
                <FileText className="h-4 w-4" /> Exportar PDF
              </Button>
              <Button type="button" variant="outline" onClick={() => window.print()} data-testid="visit-report-print-button" className="h-12 rounded-2xl border-zinc-700 bg-zinc-950 text-white hover:bg-zinc-900">
                <Eye className="h-4 w-4" /> Imprimir / Guardar PDF
              </Button>
              <Button type="button" variant="outline" onClick={() => setTab('form')} data-testid="visit-report-back-to-form-button" className="h-12 rounded-2xl border-zinc-700 bg-zinc-950 text-white hover:bg-zinc-900">
                <ArrowLeft className="h-4 w-4" /> Voltar ao formulário
              </Button>
            </div>
            <VisitReportPreview report={form} companyName={companyName} technicianName={user?.name || user?.email || 'Técnico'} />
          </div>
        )}
      </div>
    </div>
  );
}