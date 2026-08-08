import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Eye, MessageCircle, DollarSign, Pencil, Trash2 } from 'lucide-react';

export const InvoicesTable = ({ invoices, statusMeta, formatEuro, onViewFile, onOpenPayment, onWhatsApp, onEdit, onDelete }) => {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-400 text-xs uppercase">Nº / Cliente</TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase">Emissão</TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase">Vencimento</TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase">Estado</TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase text-right">Total</TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase text-right">Pago</TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase text-right">Em Aberto</TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="text-center text-zinc-500 py-8">Sem faturas. Clique em &quot;Nova Fatura&quot;.</TableCell></TableRow>
          ) : invoices.map(inv => {
            const meta = statusMeta[inv.status] || statusMeta.pendente;
            const Icon = meta.icon;
            return (
              <TableRow key={inv.id} className="border-zinc-800/50 hover:bg-zinc-800/30">
                <TableCell><p className="text-white font-bold text-sm">{inv.number}</p><p className="text-xs text-zinc-400">{inv.client_name}</p></TableCell>
                <TableCell className="text-zinc-300 text-xs">{inv.issue_date}</TableCell>
                <TableCell><p className="text-zinc-300 text-xs">{inv.due_date}</p>{inv.days_overdue > 0 && <p className="text-[10px] text-red-400">-{inv.days_overdue} dias</p>}</TableCell>
                <TableCell><Badge className={`${meta.color} border-0`}><Icon size={10} className="mr-1" />{meta.label}</Badge></TableCell>
                <TableCell className="text-right text-zinc-200 font-semibold text-sm">{formatEuro(inv.value_total)}</TableCell>
                <TableCell className="text-right text-green-400 text-sm">{formatEuro(inv.amount_paid)}</TableCell>
                <TableCell className="text-right text-yellow-400 font-bold">{formatEuro(inv.balance)}</TableCell>
                <TableCell className="text-right">
                  {inv.invoice_file && <button data-testid={`view-file-${inv.id}`} onClick={() => onViewFile(inv.invoice_file)} className="text-zinc-400 hover:text-yellow-400 p-1 mr-1" title="Ver fatura"><Eye size={14} /></button>}
                  {inv.balance > 0.01 && (
                    <>
                      {inv.client_phone && (inv.status || '').startsWith('vencida') && (
                        <button data-testid={`collect-${inv.id}`} onClick={() => onWhatsApp(inv)} className="inline-flex items-center gap-1 bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-full text-xs font-semibold mr-2 shadow-lg shadow-red-500/20" title={`Cobrar ${inv.days_overdue} dia(s) de atraso via WhatsApp`}>
                          <MessageCircle size={12} /> Cobrar
                        </button>
                      )}
                      <button data-testid={`pay-${inv.id}`} onClick={() => onOpenPayment(inv)} className="text-green-400 hover:text-green-300 p-1 mr-1" title="Registar pagamento"><DollarSign size={14} /></button>
                      {inv.client_phone && !(inv.status || '').startsWith('vencida') && <button data-testid={`whatsapp-${inv.id}`} onClick={() => onWhatsApp(inv)} className="text-green-500 hover:text-green-400 p-1 mr-1" title="Enviar lembrete amigável via WhatsApp"><MessageCircle size={14} /></button>}
                    </>
                  )}
                  {inv.balance <= 0.01 && (inv.payments?.length > 0) && <button data-testid={`payments-${inv.id}`} onClick={() => onOpenPayment(inv)} className="text-zinc-400 hover:text-green-400 p-1 mr-1" title="Ver / editar pagamentos"><DollarSign size={14} /></button>}
                  <button onClick={() => onEdit(inv)} className="text-zinc-400 hover:text-yellow-400 p-1 mr-1"><Pencil size={14} /></button>
                  <button onClick={() => onDelete(inv.id)} className="text-zinc-400 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};