import { useState, useMemo } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, Circle, TrendingUp, Search, Play, Check } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_LABEL = { pending: 'Pendente', in_progress: 'Em Curso', done: 'Concluído' };
const STATUS_COLOR = {
  pending: { bg: 'bg-zinc-800', text: 'text-zinc-400', border: 'border-zinc-700', Icon: Circle },
  in_progress: { bg: 'bg-yellow-500/15', text: 'text-yellow-300', border: 'border-yellow-500/40', Icon: Play },
  done: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40', Icon: Check },
};

/**
 * Painel de execução dentro do WorkAnalysisDialog.
 * Permite a admin marcar cada item como Pendente/Em Curso/Concluído + qty executada.
 * Chama PUT /api/works/{workId}/items/{itemId} com execution_status/executed_quantity.
 */
export default function WorkExecutionPanel({ workId, items, onUpdated }) {
  const [savingId, setSavingId] = useState(null);
  const [qtyDraft, setQtyDraft] = useState({});      // { itemId: '20' }
  const [filter, setFilter] = useState('all');       // all | pending | in_progress | done
  const [search, setSearch] = useState('');

  const stats = useMemo(() => {
    let done = 0, inProg = 0, pending = 0;
    let saleTotal = 0, executedValue = 0;
    for (const it of items) {
      const qty = Number(it.quantity || 0);
      const uc = Number(it.predicted_unit_cost || 0);
      const marg = Number(it.margin || 0);
      const lineSale = uc * (1 + marg) * qty;
      saleTotal += lineSale;
      const st = it.execution_status || 'pending';
      const exec = Number(it.executed_quantity || 0);
      if (st === 'done') { done++; executedValue += lineSale; }
      else if (st === 'in_progress') { inProg++; executedValue += qty > 0 ? lineSale * (exec / qty) : 0; }
      else { pending++; }
    }
    const pct = saleTotal > 0 ? Math.round((executedValue / saleTotal) * 1000) / 10 : 0;
    return { done, inProg, pending, total: items.length, pct, saleTotal, executedValue };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(it => {
      const st = it.execution_status || 'pending';
      if (filter !== 'all' && st !== filter) return false;
      if (!q) return true;
      return (it.name || '').toLowerCase().includes(q) || (it.category || '').toLowerCase().includes(q);
    });
  }, [items, filter, search]);

  const applyStatus = async (item, newStatus) => {
    setSavingId(item.id);
    try {
      const payload = { execution_status: newStatus };
      // Se for "in_progress" e o utilizador já preencheu qty draft, envia
      if (newStatus === 'in_progress') {
        const draft = qtyDraft[item.id];
        if (draft !== undefined && draft !== '') payload.executed_quantity = Number(draft) || 0;
      }
      await api.put(`/works/${workId}/items/${item.id}`, payload);
      toast.success(`${STATUS_LABEL[newStatus]}: ${item.name}`);
      onUpdated?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro ao atualizar');
    } finally { setSavingId(null); }
  };

  const applyQuantity = async (item) => {
    const draft = qtyDraft[item.id];
    if (draft === undefined) return;
    const value = draft === '' ? 0 : Number(draft);
    if (Number.isNaN(value) || value < 0) { toast.error('Quantidade inválida'); return; }
    const qty = Number(item.quantity || 0);
    if (value > qty) { toast.error(`Máximo: ${qty}`); return; }
    setSavingId(item.id);
    try {
      const status = value === 0 ? 'pending' : value >= qty ? 'done' : 'in_progress';
      await api.put(`/works/${workId}/items/${item.id}`, {
        execution_status: status,
        executed_quantity: value,
      });
      setQtyDraft(prev => { const next = { ...prev }; delete next[item.id]; return next; });
      toast.success('Quantidade atualizada');
      onUpdated?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro ao atualizar');
    } finally { setSavingId(null); }
  };

  return (
    <div className="space-y-4" data-testid="work-execution-panel">
      {/* CABEÇALHO: Progresso global */}
      <div className="bg-gradient-to-r from-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500">Execução da Obra</p>
            <p className="text-3xl md:text-4xl font-black text-white mt-1" data-testid="exec-pct">
              {stats.pct}% <span className="text-sm text-zinc-500 font-normal">concluída</span>
            </p>
          </div>
          <div className="flex gap-2">
            <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-lg px-3 py-2 text-center">
              <p className="text-2xl font-bold text-emerald-300">{stats.done}</p>
              <p className="text-[10px] text-emerald-400/70 uppercase">Concluídos</p>
            </div>
            <div className="bg-yellow-500/15 border border-yellow-500/30 rounded-lg px-3 py-2 text-center">
              <p className="text-2xl font-bold text-yellow-300">{stats.inProg}</p>
              <p className="text-[10px] text-yellow-400/70 uppercase">Em Curso</p>
            </div>
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-center">
              <p className="text-2xl font-bold text-zinc-300">{stats.pending}</p>
              <p className="text-[10px] text-zinc-500 uppercase">Pendentes</p>
            </div>
          </div>
        </div>
        <Progress value={stats.pct} className="h-3 bg-zinc-800" />
        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="text-zinc-500">
            <TrendingUp className="inline h-3 w-3 mr-1" />
            Valor executado: <span className="text-white font-mono">{new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(stats.executedValue)}</span>
          </span>
          <span className="text-zinc-500">
            Falta: <span className="text-yellow-400 font-mono">{new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(stats.saleTotal - stats.executedValue)}</span>
          </span>
        </div>
      </div>

      {/* FILTROS */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            data-testid="exec-search"
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filtrar item por nome ou categoria…"
            className="pl-9 bg-zinc-900 border-zinc-800 text-white rounded-xl"
          />
        </div>
        <div className="flex gap-1">
          {['all', 'pending', 'in_progress', 'done'].map(f => (
            <Button
              key={f}
              data-testid={`exec-filter-${f}`}
              variant="outline"
              size="sm"
              onClick={() => setFilter(f)}
              className={`h-9 rounded-full text-xs ${filter === f ? 'bg-yellow-400 text-zinc-950 border-yellow-400 font-semibold' : 'bg-zinc-900 border-zinc-800 text-zinc-300'}`}
            >
              {f === 'all' ? 'Todos' : STATUS_LABEL[f]}
            </Button>
          ))}
        </div>
      </div>

      {/* LISTA DE ITEMS */}
      <div className="space-y-2" data-testid="exec-items-list">
        {filtered.length === 0 && (
          <p className="text-xs text-zinc-500 italic text-center py-6">Sem items para este filtro.</p>
        )}
        {filtered.map((it) => {
          const st = it.execution_status || 'pending';
          const qty = Number(it.quantity || 0);
          const exec = Number(it.executed_quantity || 0);
          const draft = qtyDraft[it.id];
          const currentDraft = draft !== undefined ? draft : String(exec || '');
          const itemPct = qty > 0 ? Math.min(100, Math.round((exec / qty) * 100)) : 0;
          const S = STATUS_COLOR[st];
          const isSaving = savingId === it.id;
          return (
            <div key={it.id} data-testid={`exec-item-${it.id}`} className={`bg-zinc-900 border ${S.border} rounded-xl p-3 transition-colors`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={`${S.bg} ${S.text} ${S.border} border text-[10px] uppercase font-bold`}>
                      <S.Icon className="h-3 w-3 mr-1" /> {STATUS_LABEL[st]}
                    </Badge>
                    {it.is_extra && <Badge className="bg-yellow-500/15 text-yellow-300 border-yellow-500/40 text-[9px]">Extra</Badge>}
                    <span className="text-[10px] text-zinc-500">{it.category || '—'}</span>
                  </div>
                  <p className="text-sm text-white font-medium truncate">{it.name}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Executado: <span className="text-white font-mono">{exec}</span> / <span className="font-mono">{qty}</span> {it.unit || 'un'}
                    {st !== 'pending' && <span className="ml-2 text-yellow-400">({itemPct}%)</span>}
                  </p>
                  {qty > 0 && st !== 'pending' && (
                    <div className="mt-1.5 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full ${st === 'done' ? 'bg-emerald-500' : 'bg-yellow-400'}`} style={{ width: `${itemPct}%` }} />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 items-end">
                  {/* 3 botões de estado */}
                  <div className="flex gap-1">
                    {['pending', 'in_progress', 'done'].map(s => {
                      const active = st === s;
                      const cfg = STATUS_COLOR[s];
                      const Icon = cfg.Icon;
                      return (
                        <button
                          key={s}
                          data-testid={`exec-set-${s}-${it.id}`}
                          onClick={() => applyStatus(it, s)}
                          disabled={isSaving || active}
                          title={STATUS_LABEL[s]}
                          className={`h-8 w-8 rounded-lg flex items-center justify-center border transition-colors ${
                            active
                              ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                              : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-600'
                          } disabled:opacity-50`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </button>
                      );
                    })}
                  </div>
                  {/* Input qty */}
                  <div className="flex items-center gap-1">
                    <Input
                      data-testid={`exec-qty-${it.id}`}
                      type="number" min="0" step="0.01" max={qty}
                      value={currentDraft}
                      onChange={(e) => setQtyDraft({ ...qtyDraft, [it.id]: e.target.value })}
                      placeholder="0"
                      className="h-8 w-20 bg-zinc-950 border-zinc-800 text-white text-right rounded-lg text-xs"
                    />
                    <span className="text-[10px] text-zinc-500">/ {qty}</span>
                    <Button
                      data-testid={`exec-save-qty-${it.id}`}
                      size="sm"
                      onClick={() => applyQuantity(it)}
                      disabled={isSaving || draft === undefined || String(exec) === String(draft)}
                      className="h-8 px-2 bg-yellow-400 text-zinc-950 hover:bg-yellow-300 text-xs font-semibold disabled:opacity-30 rounded-lg"
                    >
                      OK
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
