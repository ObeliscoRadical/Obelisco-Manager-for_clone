import { Button } from '@/components/ui/button';
import { Plus, RefreshCw } from 'lucide-react';

export const GuidesToolbar = ({ filter, onFilterChange, onRefresh, onNew }) => {
  const filters = [
    { v: 'all', label: 'Todas' },
    { v: 'rascunho', label: 'Rascunho' },
    { v: 'emitida', label: 'Emitidas' },
    { v: 'recebida', label: 'Recebidas' },
    { v: 'recebida_com_diferencas', label: 'C/ Diferenças' },
  ];

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Guias de Transporte</h1>
          <p className="text-zinc-400 mt-1 font-medium">Saída de material para obra · confirmação pelo técnico</p>
        </div>
        <Button data-testid="new-guide-btn" onClick={onNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold h-12 px-5">
          <Plus size={18} className="mr-2" /> Nova Guia
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {filters.map(t => (
          <button key={t.v} data-testid={`filter-${t.v}`} onClick={() => onFilterChange(t.v)} className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase transition ${filter === t.v ? 'bg-yellow-400 text-zinc-950' : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'}`}>{t.label}</button>
        ))}
        <Button onClick={onRefresh} variant="ghost" className="text-zinc-400 hover:text-yellow-400 ml-auto"><RefreshCw size={14} className="mr-1" /> Atualizar</Button>
      </div>
    </>
  );
};