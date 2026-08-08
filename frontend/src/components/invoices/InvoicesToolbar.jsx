import { Button } from '@/components/ui/button';
import { Plus, MessageCircle } from 'lucide-react';

export const InvoicesToolbar = ({ summary, onBulkCollection, onNew }) => {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Faturas</h1>
        <p className="text-zinc-400 mt-1 font-medium">Controlo de cobrança e lembretes via WhatsApp</p>
      </div>
      <div className="flex items-center gap-2">
        {summary?.count_vencidas > 0 && (
          <Button data-testid="bulk-collection-btn" onClick={onBulkCollection} className="bg-red-500 text-white hover:bg-red-600 rounded-full font-semibold" title={`Enviar cobrança a ${summary.count_vencidas} fatura(s) vencida(s)`}>
            <MessageCircle size={16} className="mr-2" /> Cobrar vencidas ({summary.count_vencidas})
          </Button>
        )}
        <Button data-testid="new-invoice-btn" onClick={onNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={18} className="mr-2" /> Nova Fatura
        </Button>
      </div>
    </div>
  );
};