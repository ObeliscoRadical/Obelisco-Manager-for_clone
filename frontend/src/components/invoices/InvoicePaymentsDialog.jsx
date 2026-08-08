import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Pencil, Trash2 } from 'lucide-react';

export const InvoicePaymentsDialog = ({ open, onOpenChange, payDialog, formatEuro, editingPaymentId, resetPayForm, startEditPayment, handleDeletePayment, payDate, setPayDate, payAmount, setPayAmount, payMethod, setPayMethod, payNotes, setPayNotes, handleAddPayment }) => {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) resetPayForm(); onOpenChange(nextOpen); }}>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase text-white">Pagamentos</DialogTitle>
          <DialogDescription className="text-zinc-500">Fatura {payDialog.invoice?.number} · Total {formatEuro(payDialog.invoice?.value_total)} · Em aberto: <span className="text-yellow-400 font-bold">{formatEuro(payDialog.invoice?.balance)}</span></DialogDescription>
        </DialogHeader>

        {payDialog.invoice?.payments?.length > 0 && (
          <div data-testid="payments-list" className="rounded-xl border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/60">
            {payDialog.invoice.payments.map(p => {
              const isEditing = editingPaymentId === p.id;
              return (
                <div key={p.id} className={`p-3 flex items-center justify-between gap-2 ${isEditing ? 'bg-yellow-400/5' : ''}`}>
                  <div className="min-w-0">
                    <p className="text-sm text-white font-semibold">{formatEuro(p.amount)} <span className="text-zinc-500 text-xs font-normal">· {p.method || '—'}</span></p>
                    <p className="text-xs text-zinc-400">Pago em <span className="text-zinc-200">{p.date}</span>{p.notes ? <span className="text-zinc-500"> · {p.notes}</span> : null}</p>
                    {p.updated_at && <p className="text-[10px] text-zinc-600">editado {new Date(p.updated_at).toLocaleDateString('pt-PT')}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button data-testid={`edit-payment-${p.id}`} onClick={() => startEditPayment(p)} className={`p-1.5 rounded-md text-xs ${isEditing ? 'bg-yellow-400 text-zinc-950' : 'text-zinc-400 hover:text-yellow-400 hover:bg-zinc-800'}`} title="Editar pagamento"><Pencil size={13} /></button>
                    <button data-testid={`delete-payment-${p.id}`} onClick={() => handleDeletePayment(p.id)} className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-zinc-800" title="Eliminar pagamento"><Trash2 size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t border-zinc-800 pt-3 mt-1">
          <p className="text-xs uppercase tracking-wider font-medium mb-2" style={{ color: editingPaymentId ? '#facc15' : '#a1a1aa' }}>{editingPaymentId ? 'A editar pagamento' : 'Novo pagamento'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1"><Label className="text-zinc-400 text-xs">Data do pagamento</Label><Input data-testid="pay-date" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div className="col-span-2 sm:col-span-1"><Label className="text-zinc-400 text-xs">Valor</Label><Input data-testid="pay-amount" type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1 font-bold" /></div>
            <div className="col-span-2"><Label className="text-zinc-400 text-xs">Método</Label><select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm"><option>Transferência</option><option>MB Way</option><option>Multibanco</option><option>Numerário</option><option>Cheque</option><option>Cartão</option></select></div>
            <div className="col-span-2"><Label className="text-zinc-400 text-xs">Notas (opcional)</Label><Input data-testid="pay-notes" value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Ex: ref. transferência 1234" className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          {editingPaymentId && <Button variant="outline" onClick={resetPayForm} className="border-zinc-700 text-zinc-300">Cancelar edição</Button>}
          <Button variant="outline" onClick={() => { resetPayForm(); onOpenChange(false); }} className="border-zinc-700 text-zinc-300">Fechar</Button>
          <Button data-testid="save-payment-btn" onClick={handleAddPayment} className="bg-green-500 text-white hover:bg-green-600 font-semibold">{editingPaymentId ? 'Guardar alterações' : 'Registar'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};