import { Button } from '@/components/ui/button';
import { Plus, Loader2, Wand2, RefreshCw } from 'lucide-react';
import { ReconcileExpensesButton } from '../ReconcileExpensesButton';

export const ExpensesToolbar = ({ month, year, category, type, onRefresh, loading, onNew, onCategorize, categorizing }) => {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Despesas</h1>
        <p className="text-zinc-400 mt-1 font-medium">Controlo de custos mensais com extração IA de faturas</p>
      </div>
      <div className="flex items-center gap-2">
        <ReconcileExpensesButton
          month={month}
          year={year}
          category={category}
          type={type}
          onCompleted={onRefresh}
          buttonClassName="h-10 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 text-xs font-semibold"
          testIdPrefix="expenses-reconcile"
        />
        <button
          data-testid="ai-categorize-btn"
          onClick={onCategorize}
          disabled={categorizing}
          className="h-10 px-4 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 hover:bg-purple-500/20 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
          title="Categorizar despesas com IA"
        >
          {categorizing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          {categorizing ? 'A categorizar...' : 'Categorizar com IA'}
        </button>
        <button
          data-testid="refresh-expenses"
          onClick={onRefresh}
          disabled={loading}
          className="h-10 px-4 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 hover:bg-yellow-400/20 text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
          title="Atualizar dados"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
        <Button data-testid="new-expense-btn" onClick={onNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={18} className="mr-2" /> Nova Despesa
        </Button>
      </div>
    </div>
  );
};