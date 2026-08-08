import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { FileUp, Wand2, Trash2, Plus, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const num = (v) => (v === '' || v === null || v === undefined ? '' : Number(v));

/**
 * Botão + Diálogo "Importar Proposta Antiga (PDF)".
 * Fluxo: upload PDF -> IA extrai -> ecrã editável -> confirma -> cria orçamento + propostas.
 */
export default function ImportarPropostaButton({ onImported }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState('upload');   // upload | extracting | review | saving
  const [meta, setMeta] = useState(null);         // { file_name, original_name, confidence, is_summary, raw_summary, notes... }
  const [form, setForm] = useState(null);         // formulário editável
  const fileRef = useRef(null);

  const reset = () => { setPhase('upload'); setMeta(null); setForm(null); };
  const handleOpen = (v) => { setOpen(v); if (!v) reset(); };

  const onFilePicked = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) { toast.error('Só PDF é suportado.'); return; }
    setPhase('extracting');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await api.post('/proposal-import/extract', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (data?.error) {
        toast.error(data.error);
        setPhase('upload');
        return;
      }
      const ex = data.extracted || {};
      // Auto-preencher unit_cost com sale_price_hint / (1+margin) se estiver a 0 (para o utilizador ver algo)
      const items = (ex.items || []).map(it => {
        const hint = Number(it.sale_price_hint || 0);
        const unitCost = Number(it.unit_cost || 0);
        return {
          category: it.category || '',
          name: it.name || '',
          unit: it.unit || 'un',
          quantity: Number(it.quantity || 1),
          unit_cost: unitCost > 0 ? unitCost : (hint > 0 ? Math.round((hint / 1.6) * 100) / 100 : 0),
          margin: Number(it.margin || 0.6),
          discount_type: 'percentage',
          discount_value: 0,
          _sale_hint: hint,
          _line_hint: Number(it.line_total_hint || 0),
        };
      });
      setMeta({
        file_name: data.file_name,
        original_name: data.original_name,
        confidence: ex.confidence,
        is_summary: ex.is_summary,
        raw_summary: ex.raw_summary,
        proposal_date: ex.proposal_date,
        proposal_number: ex.proposal_number,
        detected_total: ex.detected_total,
        detected_total_includes_vat: ex.detected_total_includes_vat,
        vat_rate: ex.vat_rate,
      });
      setForm({
        title: ex.title || '',
        client_name: ex.client_name || '',
        client_phone: ex.client_phone || '',
        payment_methods: [],
        payment_split: '',
        payment_notes: ex.notes || '',
        items,
      });
      setPhase('review');
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || 'Erro na extração';
      toast.error(typeof msg === 'string' ? msg : 'Erro na extração');
      setPhase('upload');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const updateItem = (idx, patch) => {
    setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  };
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const addItem = () => setForm(f => ({
    ...f, items: [...f.items, { category: '', name: '', unit: 'un', quantity: 1, unit_cost: 0, margin: 0.6, discount_type: 'percentage', discount_value: 0 }],
  }));

  const totals = () => {
    if (!form) return { cost: 0, price: 0 };
    let cost = 0, price = 0;
    for (const it of form.items) {
      const qty = Number(it.quantity || 0);
      const uc = Number(it.unit_cost || 0);
      const marg = Number(it.margin || 0);
      cost += uc * qty;
      price += uc * (1 + marg) * qty;
    }
    return { cost: Math.round(cost * 100) / 100, price: Math.round(price * 100) / 100 };
  };

  const doSave = async () => {
    if (!form) return;
    if (!form.title.trim()) { toast.error('Título é obrigatório.'); return; }
    if (!form.client_name.trim()) { toast.error('Cliente é obrigatório.'); return; }
    if (!form.items.length) { toast.error('Adicione pelo menos um item.'); return; }
    setPhase('saving');
    try {
      const payload = {
        title: form.title,
        client_name: form.client_name,
        client_phone: form.client_phone,
        payment_methods: form.payment_methods || [],
        payment_split: form.payment_split || '',
        payment_notes: form.payment_notes || '',
        items: form.items.map(it => ({
          category: it.category || '',
          name: it.name || '',
          unit: it.unit || 'un',
          quantity: Number(it.quantity || 0),
          unit_cost: Number(it.unit_cost || 0),
          margin: Number(it.margin || 0.6),
          discount_type: it.discount_type || 'percentage',
          discount_value: Number(it.discount_value || 0),
        })),
      };
      const { data: budget } = await api.post('/budgets', payload);
      // Gerar as 3 propostas ligadas
      await api.post(`/budgets/${budget.id}/generate-proposals`);
      toast.success('Proposta importada com sucesso! Orçamento e propostas criados.');
      handleOpen(false);
      if (onImported) onImported();
      // Navegar para o orçamento criado para o utilizador confirmar
      nav(`/orcamentos?highlight=${budget.id}`);
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || 'Erro ao gravar';
      toast.error(typeof msg === 'string' ? msg : 'Erro ao gravar');
      setPhase('review');
    }
  };

  const { cost, price } = totals();

  return (
    <>
      <Button
        data-testid="import-proposal-btn"
        onClick={() => setOpen(true)}
        className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 rounded-full font-semibold"
      >
        <Wand2 size={16} className="mr-2" /> Importar Proposta (IA)
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent
          data-testid="import-proposal-dialog"
          className="bg-zinc-950 border-zinc-800 text-white max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        >
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-yellow-400" /> Importar Proposta Antiga (PDF)
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              O sistema lê o PDF com IA, extrai cliente e itens, e você revê antes de gravar.
              Após confirmar, é criado um <strong>Orçamento</strong> com as 3 <strong>Propostas</strong> (Básico/Profissional/Premium) associadas.
            </DialogDescription>
          </DialogHeader>

          {phase === 'upload' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4 border-2 border-dashed border-zinc-800 rounded-xl">
              <FileUp className="h-12 w-12 text-yellow-400" />
              <p className="text-sm text-zinc-300">Escolha o PDF da proposta antiga</p>
              <p className="text-[11px] text-zinc-500">Máx. 25 MB · Apenas PDF</p>
              <input
                ref={fileRef} type="file" accept="application/pdf" className="hidden"
                onChange={onFilePicked} data-testid="import-proposal-file"
              />
              <Button
                data-testid="import-proposal-pick"
                onClick={() => fileRef.current?.click()}
                className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold"
              >
                <FileUp size={16} className="mr-2" /> Escolher PDF
              </Button>
            </div>
          )}

          {phase === 'extracting' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3" data-testid="import-proposal-extracting">
              <Loader2 className="h-10 w-10 text-yellow-400 animate-spin" />
              <p className="text-sm text-zinc-300">A analisar a proposta com IA…</p>
              <p className="text-[11px] text-zinc-500">Isto pode demorar 10–30 segundos.</p>
            </div>
          )}

          {phase === 'saving' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3" data-testid="import-proposal-saving">
              <Loader2 className="h-10 w-10 text-yellow-400 animate-spin" />
              <p className="text-sm text-zinc-300">A gravar orçamento e a gerar propostas…</p>
            </div>
          )}

          {phase === 'review' && form && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1" data-testid="import-proposal-review">
              {/* Meta / Confidence banner */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge className={
                  meta?.confidence === 'high' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                  meta?.confidence === 'low'  ? 'bg-red-500/20 text-red-300 border-red-500/40' :
                                                'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }>Confiança IA: {meta?.confidence || 'medium'}</Badge>
                {meta?.is_summary && <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40">Modo resumido (1 item)</Badge>}
                {meta?.detected_total > 0 && (
                  <Badge className="bg-zinc-800 border-zinc-700 text-zinc-200">
                    Total detectado: {fmt(meta.detected_total)} {meta.detected_total_includes_vat ? '(c/ IVA)' : '(s/ IVA)'}
                  </Badge>
                )}
                {meta?.proposal_number && <Badge className="bg-zinc-800 border-zinc-700 text-zinc-300">Ref: {meta.proposal_number}</Badge>}
                {meta?.proposal_date && <Badge className="bg-zinc-800 border-zinc-700 text-zinc-300">Data: {meta.proposal_date}</Badge>}
              </div>

              {/* Cliente/Título */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-zinc-400">Título / Obra *</Label>
                  <Input
                    data-testid="import-field-title"
                    value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                    className="bg-zinc-900 border-zinc-800 text-white"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Cliente *</Label>
                  <Input
                    data-testid="import-field-client"
                    value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })}
                    className="bg-zinc-900 border-zinc-800 text-white"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Telefone</Label>
                  <Input
                    data-testid="import-field-phone"
                    value={form.client_phone} onChange={e => setForm({ ...form, client_phone: e.target.value })}
                    className="bg-zinc-900 border-zinc-800 text-white"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs text-zinc-400">Notas / Condições</Label>
                <textarea
                  data-testid="import-field-notes"
                  value={form.payment_notes} onChange={e => setForm({ ...form, payment_notes: e.target.value })}
                  rows={2}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-2 text-sm text-white"
                />
              </div>

              {/* Items */}
              <div className="border border-zinc-800 rounded-lg overflow-hidden" data-testid="import-items-table">
                <div className="bg-zinc-900 px-3 py-2 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-widest text-zinc-400">Itens ({form.items.length})</p>
                  <Button data-testid="import-add-item" size="sm" variant="ghost" onClick={addItem} className="h-7 text-xs text-yellow-400">
                    <Plus size={13} className="mr-1" /> Adicionar linha
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-900/60 text-zinc-500">
                      <tr>
                        <th className="text-left px-2 py-1.5">Categoria</th>
                        <th className="text-left px-2 py-1.5 min-w-[200px]">Descrição</th>
                        <th className="text-left px-2 py-1.5">Un.</th>
                        <th className="text-right px-2 py-1.5">Qtd</th>
                        <th className="text-right px-2 py-1.5">Custo Unit.</th>
                        <th className="text-right px-2 py-1.5">Margem</th>
                        <th className="text-right px-2 py-1.5">PVP linha</th>
                        <th className="text-center px-1 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((it, idx) => {
                        const lineSale = Number(it.unit_cost || 0) * (1 + Number(it.margin || 0)) * Number(it.quantity || 0);
                        return (
                          <tr key={`${it.name}-${it.category}-${it.quantity}-${idx}`} className="border-t border-zinc-800/60 hover:bg-zinc-900/40" data-testid={`import-item-${idx}`}>
                            <td className="px-2 py-1">
                              <Input value={it.category} onChange={e => updateItem(idx, { category: e.target.value })}
                                className="h-8 bg-zinc-900 border-zinc-800 text-white text-xs" />
                            </td>
                            <td className="px-2 py-1">
                              <Input value={it.name} onChange={e => updateItem(idx, { name: e.target.value })}
                                data-testid={`import-item-${idx}-name`}
                                className="h-8 bg-zinc-900 border-zinc-800 text-white text-xs" />
                              {it._sale_hint > 0 && (
                                <p className="text-[9px] text-zinc-500 mt-0.5">IA leu venda unit.: {fmt(it._sale_hint)} · linha: {fmt(it._line_hint)}</p>
                              )}
                            </td>
                            <td className="px-2 py-1">
                              <Input value={it.unit} onChange={e => updateItem(idx, { unit: e.target.value })}
                                className="h-8 bg-zinc-900 border-zinc-800 text-white text-xs w-16" />
                            </td>
                            <td className="px-2 py-1">
                              <Input type="number" min="0" step="0.01" value={num(it.quantity)}
                                onChange={e => updateItem(idx, { quantity: e.target.value })}
                                className="h-8 bg-zinc-900 border-zinc-800 text-white text-xs w-20 text-right" />
                            </td>
                            <td className="px-2 py-1">
                              <Input type="number" min="0" step="0.01" value={num(it.unit_cost)}
                                data-testid={`import-item-${idx}-cost`}
                                onChange={e => updateItem(idx, { unit_cost: e.target.value })}
                                className="h-8 bg-zinc-900 border-zinc-800 text-white text-xs w-24 text-right" />
                            </td>
                            <td className="px-2 py-1">
                              <Input type="number" min="0" step="0.01" value={num(it.margin)}
                                onChange={e => updateItem(idx, { margin: e.target.value })}
                                className="h-8 bg-zinc-900 border-zinc-800 text-white text-xs w-20 text-right" />
                            </td>
                            <td className="px-2 py-1 text-right font-mono text-white">{fmt(lineSale)}</td>
                            <td className="px-1 py-1 text-center">
                              <button onClick={() => removeItem(idx)} data-testid={`import-item-${idx}-remove`}
                                className="text-zinc-500 hover:text-red-400"><Trash2 size={13} /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-end gap-4 text-sm">
                <span className="text-zinc-400">Custo total: <span className="text-white font-mono">{fmt(cost)}</span></span>
                <span className="text-zinc-400">PVP total: <span className="text-yellow-400 font-mono font-bold">{fmt(price)}</span></span>
                {meta?.detected_total > 0 && Math.abs(price - meta.detected_total) > 1 && (
                  <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/40 text-[10px]">
                    Diverge do detectado ({fmt(meta.detected_total)}) — ajuste custos ou margens
                  </Badge>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {phase === 'review' && (
              <>
                <Button variant="ghost" onClick={() => handleOpen(false)} data-testid="import-cancel">Cancelar</Button>
                <Button
                  data-testid="import-save"
                  onClick={doSave}
                  className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold"
                >
                  Criar Orçamento + Propostas <ArrowRight size={16} className="ml-2" />
                </Button>
              </>
            )}
            {(phase === 'upload' || phase === 'extracting') && (
              <Button variant="ghost" onClick={() => handleOpen(false)} data-testid="import-close">Fechar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
