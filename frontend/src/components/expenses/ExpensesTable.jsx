import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Eye, Pencil, Trash2 } from 'lucide-react';

export const ExpensesTable = ({ expenses, types, formatEuro, onViewInvoice, onEdit, onDelete }) => {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-400 text-xs uppercase">Data</TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase">Fornecedor</TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase">Categoria</TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase">Tipo</TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase">Obra</TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase text-right">Valor s/IVA</TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase text-right">IVA</TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase text-right">Total</TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.length === 0 ? (
            <TableRow><TableCell colSpan={9} className="text-center text-zinc-500 py-8">Sem despesas para os filtros selecionados.</TableCell></TableRow>
          ) : expenses.map((expense) => {
            const typeMeta = types.find(t => t.value === expense.type) || types[1];
            return (
              <TableRow key={expense.id} className="border-zinc-800/50 hover:bg-zinc-800/30">
                <TableCell className="text-zinc-300 text-xs">{expense.date}</TableCell>
                <TableCell className="text-white font-medium text-sm">
                  {expense.supplier || '-'}
                  {expense.invoice_number && <p className="text-[10px] text-zinc-500">#{expense.invoice_number}</p>}
                </TableCell>
                <TableCell className="text-zinc-300 text-xs">{expense.category}</TableCell>
                <TableCell><Badge className={`${typeMeta.color} border-0 text-[10px]`}>{typeMeta.label}</Badge></TableCell>
                <TableCell className="text-zinc-400 text-xs">{expense.obra_name || '-'}</TableCell>
                <TableCell className="text-right text-zinc-300 text-sm">{formatEuro(expense.value_net)}</TableCell>
                <TableCell className="text-right text-zinc-400 text-xs">{formatEuro(expense.vat_amount)}</TableCell>
                <TableCell className="text-right text-yellow-400 font-semibold">{formatEuro(expense.value_gross)}</TableCell>
                <TableCell className="text-right">
                  {expense.invoice_file && <button onClick={() => onViewInvoice(expense.invoice_file)} className="text-zinc-400 hover:text-yellow-400 p-1 mr-1" title="Ver fatura"><Eye size={14} /></button>}
                  <button onClick={() => onEdit(expense)} className="text-zinc-400 hover:text-yellow-400 p-1 mr-1"><Pencil size={14} /></button>
                  <button onClick={() => onDelete(expense.id)} className="text-zinc-400 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};