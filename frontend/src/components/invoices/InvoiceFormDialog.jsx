import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Upload, Loader2, FileText, Sparkles } from 'lucide-react';

export const InvoiceFormDialog = ({ open, onOpenChange, editing, form, setField, extracting, fileInputRef, onUpload, onSave }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black uppercase text-white">{editing ? 'Editar' : 'Nova'} Fatura</DialogTitle>
          <DialogDescription className="text-zinc-500">Faça upload da fatura e a IA preenche tudo automaticamente.</DialogDescription>
        </DialogHeader>

        {!editing && (
          <div className="rounded-2xl border-2 border-dashed border-yellow-400/30 bg-yellow-400/5 p-6 text-center">
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => onUpload(e.target.files?.[0])} className="hidden" data-testid="invoice-file-input" />
            {extracting ? (
              <div className="flex flex-col items-center gap-3 text-yellow-400"><Loader2 className="animate-spin" size={32} /><p className="font-medium">A ler fatura com IA...</p><p className="text-xs text-zinc-500">Isto pode demorar 10-20 segundos</p></div>
            ) : form.invoice_file ? (
              <div className="flex flex-col items-center gap-2"><div className="flex items-center gap-2 text-green-400"><FileText size={20} /><span className="font-medium text-sm">Fatura carregada</span></div><Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="border-zinc-700 text-zinc-300 rounded-full text-xs">Carregar outra</Button></div>
            ) : (
              <div className="flex flex-col items-center gap-3"><Sparkles className="text-yellow-400" size={32} /><div><p className="text-white font-semibold">Upload de Fatura (PDF / Imagem)</p><p className="text-xs text-zinc-500 mt-1">A IA extrai nº, cliente, NIF, datas, valores e IVA automaticamente</p></div><Button data-testid="upload-invoice-btn" onClick={() => fileInputRef.current?.click()} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold"><Upload size={16} className="mr-2" /> Escolher ficheiro</Button></div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          <div><Label className="text-zinc-400 text-xs">Nº Fatura (auto se vazio)</Label><Input value={form.number} onChange={e => setField('number', e.target.value)} placeholder="FT 2026/0001" className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          <div className="hidden md:block"></div>
          <div><Label className="text-zinc-400 text-xs">Data Emissão *</Label><Input type="date" value={form.issue_date} onChange={e => setField('issue_date', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          <div><Label className="text-zinc-400 text-xs">Data Vencimento *</Label><Input type="date" value={form.due_date} onChange={e => setField('due_date', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          <div><Label className="text-zinc-400 text-xs">Cliente *</Label><Input data-testid="inv-client" value={form.client_name} onChange={e => setField('client_name', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          <div><Label className="text-zinc-400 text-xs">NIF</Label><Input value={form.client_nif} onChange={e => setField('client_nif', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          <div><Label className="text-zinc-400 text-xs">Telefone (para lembretes WhatsApp)</Label><Input value={form.client_phone} onChange={e => setField('client_phone', e.target.value)} placeholder="+351 912 345 678" className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          <div><Label className="text-zinc-400 text-xs">Email</Label><Input value={form.client_email} onChange={e => setField('client_email', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          <div><Label className="text-zinc-400 text-xs">Valor s/ IVA</Label><Input type="number" step="0.01" value={form.value_net} onChange={e => setField('value_net', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          <div><Label className="text-zinc-400 text-xs">Taxa IVA (%)</Label><select value={form.vat_rate} onChange={e => setField('vat_rate', parseFloat(e.target.value))} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm"><option value={0}>0%</option><option value={6}>6%</option><option value={13}>13%</option><option value={23}>23%</option></select></div>
          <div><Label className="text-zinc-400 text-xs">Valor IVA</Label><Input type="number" step="0.01" value={form.vat_amount} onChange={e => setField('vat_amount', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          <div><Label className="text-zinc-400 text-xs">Total c/ IVA *</Label><Input data-testid="inv-total" type="number" step="0.01" value={form.value_total} onChange={e => setField('value_total', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1 font-bold text-yellow-400" /></div>
          <div className="md:col-span-2"><Label className="text-zinc-400 text-xs">Notas</Label><Input value={form.notes} onChange={e => setField('notes', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700 text-zinc-300">Cancelar</Button>
          <Button data-testid="save-invoice-btn" onClick={onSave} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-semibold">Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};