import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, FileDown, LayoutGrid, ChevronUp, ChevronDown, Copy } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { generateLegendaQuadroPDF } from '../lib/legendaQuadroPdf';

const COMPONENT_TYPES = [
  'Corte Geral / Interruptor Geral',
  'Interruptor Diferencial (ID)',
  'Disjuntor Magnetotérmico (MCB)',
  'Contactor',
  'Porta-Fusíveis',
  'Barramento / Passagem',
  'Descarregador de Sobretensões (DPS)',
  'Outros / Acessório',
];

const AMPERAGE_SUGGESTIONS = ['6A', '10A', '16A', '20A', '25A', '32A', '40A', '63A', '30mA', '300mA', '16A/30mA', '25A/30mA', '40A/30mA', '63A/30mA'];

const newModule = (number) => ({
  id: Math.random().toString(36).slice(2, 10),
  number,
  type: 'Disjuntor Magnetotérmico (MCB)',
  description: '',
  amperage: '',
});

const MODULES_PER_PAGE = 22;

export default function LegendaQuadroPage() {
  const today = new Date().toISOString().slice(0, 10);
  const HIST_KEY = 'legenda_quadro_desc_history';

  const [descHistory, setDescHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); }
    catch { return []; }
  });

  const saveDesc = (val) => {
    const v = (val || '').trim();
    if (!v || v.length < 2) return;
    setDescHistory(prev => {
      const dedup = [v, ...prev.filter(x => x.toLowerCase() !== v.toLowerCase())].slice(0, 100);
      try { localStorage.setItem(HIST_KEY, JSON.stringify(dedup)); } catch { /* ignore */ }
      return dedup;
    });
  };

  const [header, setHeader] = useState({
    client_name: '',
    work_date: today,
    panel_name: 'Quadro Geral',
    technician: '',
  });
  const [modules, setModules] = useState([newModule(1), newModule(2), newModule(3)]);
  const [logoBase64, setLogoBase64] = useState(null);

  useEffect(() => {
    // Carrega o logo (mesma técnica das outras páginas)
    api.get('/settings/logo').then(res => res.data?.logo && setLogoBase64(res.data.logo)).catch(() => {});
  }, []);

  const renumber = (list) => list.map((m, i) => ({ ...m, number: i + 1 }));

  const addModule = () => setModules(prev => [...prev, newModule(prev.length + 1)]);
  const duplicateModule = (idx) => setModules(prev => {
    const dup = { ...prev[idx], id: Math.random().toString(36).slice(2, 10) };
    return renumber([...prev.slice(0, idx + 1), dup, ...prev.slice(idx + 1)]);
  });
  const removeModule = (idx) => setModules(prev => renumber(prev.filter((_, i) => i !== idx)));
  const moveModule = (idx, dir) => setModules(prev => {
    const j = idx + dir;
    if (j < 0 || j >= prev.length) return prev;
    const copy = [...prev];
    [copy[idx], copy[j]] = [copy[j], copy[idx]];
    return renumber(copy);
  });
  const updateModule = (idx, patch) => setModules(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m));

  const totalPages = Math.max(1, Math.ceil(modules.length / MODULES_PER_PAGE));

  const handleGenerate = () => {
    if (modules.length === 0) { toast.error('Adicione pelo menos um módulo.'); return; }
    if (!header.client_name.trim()) { toast.error('Preencha o cliente/obra.'); return; }
    // Guardar descrições no histórico de autocomplete
    modules.forEach(m => saveDesc(m.description));
    try {
      generateLegendaQuadroPDF(header, modules, logoBase64);
      toast.success(`Legenda gerada (${modules.length} módulos · ${totalPages} folha${totalPages === 1 ? '' : 's'} A4).`);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar PDF.');
    }
  };

  return (
    <div className="space-y-5" data-testid="legenda-quadro-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            <LayoutGrid className="h-8 w-8 text-yellow-400" /> Legenda de Quadro
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Etiquetas técnicas para portas de quadros eléctricos. Auto-divisão em várias folhas A4 para colagem lado a lado.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-zinc-900 border-zinc-800 text-zinc-300">
            {modules.length} módulos · {totalPages} folha{totalPages === 1 ? '' : 's'} A4
          </Badge>
          <Button data-testid="legenda-generate-pdf" onClick={handleGenerate} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold rounded-full">
            <FileDown className="h-4 w-4 mr-2" /> Gerar PDF
          </Button>
        </div>
      </div>

      {/* CABEÇALHO DA OBRA */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-white">Identificação da Obra</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-zinc-400">Cliente / Obra *</Label>
            <Input data-testid="legenda-client" value={header.client_name} onChange={e => setHeader({ ...header, client_name: e.target.value })} className="bg-zinc-950 border-zinc-800 text-white" placeholder="Ex.: Habitação Sr. Silva, Alfama" />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Identificação do Quadro *</Label>
            <Input data-testid="legenda-panel" value={header.panel_name} onChange={e => setHeader({ ...header, panel_name: e.target.value })} className="bg-zinc-950 border-zinc-800 text-white" placeholder="Ex.: Quadro Geral, Quadro Técnico Piso 1" />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Data de Montagem</Label>
            <Input data-testid="legenda-date" type="date" value={header.work_date} onChange={e => setHeader({ ...header, work_date: e.target.value })} className="bg-zinc-950 border-zinc-800 text-white" />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Técnico Responsável</Label>
            <Input data-testid="legenda-tech" value={header.technician} onChange={e => setHeader({ ...header, technician: e.target.value })} className="bg-zinc-950 border-zinc-800 text-white" placeholder="Ex.: Daniel Oliveira" />
          </div>
        </CardContent>
      </Card>

      {/* MÓDULOS */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm text-white">Módulos / Circuitos</CardTitle>
          <Button data-testid="legenda-add-module" size="sm" onClick={addModule} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 rounded-full text-xs h-8">
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar módulo
          </Button>
        </CardHeader>
        <CardContent className="space-y-2" data-testid="legenda-modules-list">
          {modules.map((m, idx) => (
            <div key={m.id} data-testid={`legenda-module-${idx}`} className="grid grid-cols-12 gap-2 items-center bg-zinc-950 border border-zinc-800 rounded-lg p-2">
              <div className="col-span-1 flex flex-col items-center gap-0.5">
                <span className="text-yellow-400 font-mono font-bold text-lg leading-none">{m.number}</span>
                <div className="flex flex-col">
                  <button onClick={() => moveModule(idx, -1)} disabled={idx === 0} className="h-4 text-zinc-500 hover:text-white disabled:opacity-20"><ChevronUp size={12} /></button>
                  <button onClick={() => moveModule(idx, 1)} disabled={idx === modules.length - 1} className="h-4 text-zinc-500 hover:text-white disabled:opacity-20"><ChevronDown size={12} /></button>
                </div>
              </div>
              <div className="col-span-4">
                <select
                  data-testid={`legenda-module-type-${idx}`}
                  value={m.type}
                  onChange={e => updateModule(idx, { type: e.target.value })}
                  className="w-full h-9 bg-zinc-900 border border-zinc-800 rounded-md text-white text-xs px-2"
                >
                  {COMPONENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-span-5">
                <Input
                  data-testid={`legenda-module-desc-${idx}`}
                  list="legenda-desc-history"
                  value={m.description}
                  onChange={e => updateModule(idx, { description: e.target.value })}
                  onBlur={e => saveDesc(e.target.value)}
                  placeholder="Ex.: Iluminação Sala, Tomadas Cozinha, Bomba de Calor"
                  className="h-9 bg-zinc-900 border-zinc-800 text-white text-xs"
                />
              </div>
              <div className="col-span-1">
                <Input
                  data-testid={`legenda-module-amp-${idx}`}
                  list="ampsug"
                  value={m.amperage}
                  onChange={e => updateModule(idx, { amperage: e.target.value })}
                  placeholder="16A"
                  className="h-9 bg-zinc-900 border-zinc-800 text-white text-xs text-center font-mono"
                />
              </div>
              <div className="col-span-1 flex justify-end gap-1">
                <button data-testid={`legenda-duplicate-${idx}`} onClick={() => duplicateModule(idx)} className="text-zinc-500 hover:text-yellow-400 p-1" title="Duplicar"><Copy size={13} /></button>
                <button data-testid={`legenda-remove-${idx}`} onClick={() => removeModule(idx)} className="text-zinc-500 hover:text-red-400 p-1" title="Remover"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
          <datalist id="ampsug">
            {AMPERAGE_SUGGESTIONS.map(a => <option key={a} value={a} />)}
          </datalist>
          <datalist id="legenda-desc-history">
            {descHistory.map(d => <option key={d} value={d} />)}
          </datalist>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/30 text-xs text-yellow-200" data-testid="legenda-multipage-hint">
          ℹ️ <strong>Vai gerar {totalPages} folhas A4</strong> desenhadas para colagem lado a lado. Marcas de alinhamento serão impressas nas margens internas para facilitar a junção.
        </div>
      )}
    </div>
  );
}
