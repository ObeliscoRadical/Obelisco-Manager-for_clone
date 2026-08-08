import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Upload, FileText, Loader2, Sparkles, AlertTriangle } from 'lucide-react';

export const ExpenseFormDialog = ({
  open,
  onOpenChange,
  editing,
  form,
  setField,
  categories,
  types,
  obras,
  extracting,
  fileInputRef,
  onUpload,
  duplicateWarning,
  setDuplicateWarning,
  categorySource,
  suggestions,
  saveDuplicateConfirm,
  setSaveDuplicateConfirm,
  onSave,
  formatEuro,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black uppercase text-white">{editing ? 'Editar' : 'Nova'} Despesa</DialogTitle>
          <DialogDescription className="text-zinc-500">Faça upload da fatura e a IA preenche tudo automaticamente.</DialogDescription>
        </DialogHeader>

        {!editing && (
          <div className="rounded-2xl border-2 border-dashed border-yellow-400/30 bg-yellow-400/5 p-6 text-center">
            <input ref={fileInputRef} key={open ? 'file-input-open' : 'file-input-closed'} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => { if (e.target.files?.[0]) onUpload(e.target.files[0]); }} className="hidden" data-testid="invoice-file-input" />
            {extracting ? (
              <div className="flex flex-col items-center gap-3 text-yellow-400">
                <Loader2 className="animate-spin" size={32} />
                <p className="font-medium">A ler fatura com IA...</p>
                <p className="text-xs text-zinc-500">Isto pode demorar 10-20 segundos</p>
              </div>
            ) : form.invoice_file ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2 text-green-400"><FileText size={20} /><span className="font-medium text-sm">Fatura carregada</span></div>
                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="border-zinc-700 text-zinc-300 rounded-full text-xs">Carregar outra</Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Sparkles className="text-yellow-400" size={32} />
                <div>
                  <p className="text-white font-semibold">Upload de Fatura (PDF / Imagem)</p>
                  <p className="text-xs text-zinc-500 mt-1">A IA extrai NIF, fornecedor, valor, IVA, data e categoria automaticamente</p>
                </div>
                <Button data-testid="upload-invoice-btn" onClick={() => fileInputRef.current?.click()} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
                  <Upload size={16} className="mr-2" /> Escolher ficheiro
                </Button>
              </div>
            )}
          </div>
        )}

        {duplicateWarning && (
          <div data-testid="duplicate-warning" className="rounded-xl border-2 border-orange-500/50 bg-orange-500/10 p-3 flex items-start gap-3">
            <AlertTriangle className="text-orange-400 shrink-0 mt-0.5" size={20} />
            <div className="flex-1 min-w-0">
              <p className="text-orange-400 font-bold text-sm">Possível Duplicado</p>
              <p className="text-xs text-zinc-300 mt-1">
                {duplicateWarning.reason || 'Dados semelhantes encontrados'}:
                {duplicateWarning.supplier && <> <span className="font-semibold text-white">{duplicateWarning.supplier}</span></>}
                {duplicateWarning.date && <> em <span className="font-semibold text-white">{duplicateWarning.date}</span></>}
                {duplicateWarning.value_gross != null && <> ({formatEuro(duplicateWarning.value_gross)})</>}
                {duplicateWarning.invoice_number && <> — Fatura #{duplicateWarning.invoice_number}</>}
              </p>
              <p className="text-[10px] text-zinc-500 mt-1">Verifica se não estás a registar a mesma fatura duas vezes.</p>
            </div>
            <button onClick={() => setDuplicateWarning(null)} className="text-zinc-500 hover:text-white text-xs">✕</button>
          </div>
        )}

        {categorySource && !editing && (
          <div data-testid="suggestion-banner" className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-3">
            <Sparkles className="text-emerald-400 shrink-0" size={18} />
            <div className="flex-1 min-w-0">
              <p className="text-emerald-400 font-semibold text-xs">Categorização automática</p>
              <p className="text-[11px] text-zinc-300 mt-0.5">
                Categoria <span className="font-semibold text-white">{form.category}</span>{' '}e tipo <span className="font-semibold text-white">{types.find(t => t.value === form.type)?.label || form.type}</span>{' '}
                sugeridos por <span className="font-medium text-emerald-300">{categorySource === 'histórico' ? 'histórico de despesas' : categorySource === 'palavras-chave' ? 'palavras-chave do fornecedor' : 'leitura IA'}</span>
                {suggestions?.confidence != null && <> ({suggestions.confidence}% confiança)</>}. <span className="text-zinc-500">Pode alterar manualmente.</span>
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div><Label className="text-zinc-400 text-xs">Data *</Label><Input data-testid="exp-date" type="date" value={form.date} onChange={e => setField('date', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          <div><Label className="text-zinc-400 text-xs">Fornecedor</Label><Input data-testid="exp-supplier" value={form.supplier} onChange={e => setField('supplier', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          <div><Label className="text-zinc-400 text-xs">NIF</Label><Input value={form.nif} onChange={e => setField('nif', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          <div><Label className="text-zinc-400 text-xs">Nº Fatura</Label><Input value={form.invoice_number} onChange={e => setField('invoice_number', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          <div>
            <div className="flex items-center gap-2">
              <Label className="text-zinc-400 text-xs">Categoria</Label>
              {categorySource && !editing && <span data-testid="category-source-badge" className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">{categorySource}</span>}
            </div>
            <select data-testid="exp-category" value={form.category} onChange={e => setField('category', e.target.value)} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Label className="text-zinc-400 text-xs">Tipo</Label>
              {categorySource && !editing && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">auto</span>}
            </div>
            <div className="flex gap-1 mt-1">
              {types.map(t => (
                <button key={t.value} type="button" onClick={() => setField('type', t.value)} className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium transition border ${form.type === t.value ? 'bg-yellow-400 text-zinc-950 border-yellow-400' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {form.type === 'obra' && (
            <div className="md:col-span-2">
              <Label className="text-zinc-400 text-xs">Obra Associada</Label>
              <select value={form.obra_id || ''} onChange={e => setField('obra_id', e.target.value)} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
                <option value="">Selecione obra...</option>
                {obras.map(o => <option key={o.id} value={o.id}>{o.title} - {o.client_name}</option>)}
              </select>
            </div>
          )}
          <div><Label className="text-zinc-400 text-xs">Valor s/ IVA (€)</Label><Input type="number" step="0.01" value={form.value_net} onChange={e => setField('value_net', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          <div><Label className="text-zinc-400 text-xs">Taxa IVA (%)</Label><select value={form.vat_rate} onChange={e => setField('vat_rate', parseFloat(e.target.value))} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm"><option value={0}>0% (isento)</option><option value={6}>6% (reduzida)</option><option value={13}>13% (intermédia)</option><option value={23}>23% (normal)</option></select></div>
          <div><Label className="text-zinc-400 text-xs">Valor IVA (€)</Label><Input type="number" step="0.01" value={form.vat_amount} onChange={e => setField('vat_amount', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          <div><Label className="text-zinc-400 text-xs">Total c/ IVA (€) *</Label><Input data-testid="exp-gross" type="number" step="0.01" value={form.value_gross} onChange={e => setField('value_gross', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1 font-bold text-yellow-400" /></div>
          <div><Label className="text-zinc-400 text-xs">Forma Pagamento</Label><Input value={form.payment_method} onChange={e => setField('payment_method', e.target.value)} placeholder="Transferência, MB Way, etc." className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          <div><Label className="text-zinc-400 text-xs">Notas</Label><Input value={form.notes} onChange={e => setField('notes', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
        </div>

        {saveDuplicateConfirm && (
          <div data-testid="save-duplicate-confirm" className="rounded-xl border-2 border-red-500/50 bg-red-500/10 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={22} />
              <div>
                <p className="text-red-400 font-bold text-sm">Fatura Duplicada Detetada</p>
                <p className="text-xs text-zinc-300 mt-1">{saveDuplicateConfirm.message}</p>
              </div>
            </div>
            {saveDuplicateConfirm.existing && (
              <div className="bg-zinc-900/80 rounded-lg p-3 text-xs space-y-1 border border-zinc-800">
                <p className="text-zinc-500 uppercase tracking-wider font-semibold text-[10px]">Despesa existente</p>
                <div className="flex gap-4 text-zinc-300">
                  <span>Fornecedor: <span className="text-white font-medium">{saveDuplicateConfirm.existing.supplier || '—'}</span></span>
                  <span>Data: <span className="text-white font-medium">{saveDuplicateConfirm.existing.date || '—'}</span></span>
                  <span>Valor: <span className="text-yellow-400 font-semibold">{formatEuro(saveDuplicateConfirm.existing.value_gross)}</span></span>
                </div>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button data-testid="cancel-duplicate-btn" variant="outline" size="sm" onClick={() => setSaveDuplicateConfirm(null)} className="border-zinc-700 text-zinc-300 rounded-full text-xs">Cancelar</Button>
              <Button data-testid="force-save-btn" size="sm" onClick={() => { setSaveDuplicateConfirm(null); onSave(true); }} className="bg-red-500 text-white hover:bg-red-600 rounded-full text-xs font-semibold">Criar Mesmo Assim</Button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700 text-zinc-300">Cancelar</Button>
          <Button data-testid="save-expense-btn" onClick={() => onSave(false)} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-semibold">Guardar Despesa</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};