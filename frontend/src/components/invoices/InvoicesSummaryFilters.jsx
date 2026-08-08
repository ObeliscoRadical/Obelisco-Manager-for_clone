import { AlertTriangle, DollarSign, Euro, Percent, Receipt as ReceiptIcon } from 'lucide-react';

export const InvoicesSummaryFilters = ({ summary, formatEuro, filterYear, filterMonth, filterClient, filterStatus, clients, months, onYearChange, onMonthChange, onClientChange, onStatusChange, onClearFilters }) => {
  const statusButtons = [
    { v: '', l: 'Todas' },
    { v: 'pendente', l: 'Pendentes' },
    { v: 'parcial', l: 'Parciais' },
    { v: 'vencida', l: 'Vencidas' },
    { v: 'paga', l: 'Pagas' },
  ];

  return (
    <>
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div data-testid="kpi-emitido" className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800"><p className="text-xs uppercase tracking-wider text-zinc-500 font-medium flex items-center gap-1"><ReceiptIcon size={12} /> Emitido</p><p className="text-2xl font-black text-white mt-1">{formatEuro(summary.total_emitido)}</p><p className="text-xs text-zinc-500 mt-0.5">{summary.count_total} faturas</p></div>
          <div data-testid="kpi-iva" className="p-4 rounded-2xl bg-gradient-to-br from-sky-500/10 to-sky-500/5 border border-sky-500/30"><p className="text-xs uppercase tracking-wider text-sky-400/80 font-medium flex items-center gap-1"><Percent size={12} /> IVA Emitido</p><p className="text-2xl font-black text-sky-400 mt-1">{formatEuro(summary.total_iva)}</p><p className="text-xs text-zinc-500 mt-0.5">{summary.total_emitido > 0 ? `${((summary.total_iva / summary.total_emitido) * 100).toFixed(1)}% do total` : '—'}</p></div>
          <div className="p-4 rounded-2xl bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/30"><p className="text-xs uppercase tracking-wider text-green-400/80 font-medium flex items-center gap-1"><DollarSign size={12} /> Recebido</p><p className="text-2xl font-black text-green-400 mt-1">{formatEuro(summary.total_recebido)}</p></div>
          <div className="p-4 rounded-2xl bg-gradient-to-br from-yellow-400/10 to-yellow-400/5 border border-yellow-400/30"><p className="text-xs uppercase tracking-wider text-yellow-400/80 font-medium flex items-center gap-1"><Euro size={12} /> Em Aberto</p><p className="text-2xl font-black text-yellow-400 mt-1">{formatEuro(summary.total_em_aberto)}</p><p className="text-xs text-zinc-500 mt-0.5">{summary.count_pendentes} pendentes</p></div>
          <div className="p-4 rounded-2xl bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/30"><p className="text-xs uppercase tracking-wider text-red-400/80 font-medium flex items-center gap-1"><AlertTriangle size={12} /> Vencidas</p><p className="text-2xl font-black text-red-400 mt-1">{formatEuro(summary.total_vencido)}</p><p className="text-xs text-zinc-500 mt-0.5">{summary.count_vencidas} faturas</p></div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Ano</label>
          <select data-testid="filter-year" value={filterYear} onChange={e => onYearChange(parseInt(e.target.value))} className="h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm min-w-[100px]">
            {[filterYear + 1, filterYear, filterYear - 1, filterYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Mês</label>
          <select data-testid="filter-month" value={filterMonth} onChange={e => onMonthChange(e.target.value)} className="h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm min-w-[140px]">
            <option value="">Todos</option>
            {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Cliente</label>
          <select data-testid="filter-client" value={filterClient} onChange={e => onClientChange(e.target.value)} className="h-10 w-full bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
            <option value="">Todos os clientes</option>
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {(filterMonth || filterClient) && <button data-testid="clear-filters" onClick={onClearFilters} className="h-10 px-4 rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-xs font-semibold">Limpar filtros</button>}
      </div>

      <div className="flex gap-2 flex-wrap">
        {statusButtons.map(s => (
          <button key={s.v} onClick={() => onStatusChange(s.v)} data-testid={`filter-${s.v || 'all'}`} className={`px-4 py-1.5 rounded-full text-xs font-medium transition border ${filterStatus === s.v ? 'bg-yellow-400 text-zinc-950 border-yellow-400' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'}`}>{s.l}</button>
        ))}
      </div>
    </>
  );
};