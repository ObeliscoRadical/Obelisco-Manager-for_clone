import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Wallet, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, HardHat,
  Receipt, FileCheck, Clock, PiggyBank, Target, Plus, Unlink, Search, X,
  Siren, BellRing,
} from 'lucide-react';
import { toast } from 'sonner';

const fmt = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const fmt0 = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(v || 0));
const pct = (v) => `${(v || 0).toFixed(1)}%`;

const KPI = ({ label, value, icon: Icon, color = 'text-white', hint, testid }) => (
  <Card className="bg-zinc-900 border-zinc-800" data-testid={testid}>
    <CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-zinc-500 uppercase tracking-widest mb-1">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-zinc-500 mt-1">{hint}</p>}
    </CardContent>
  </Card>
);

/**
 * Diálogo genérico para associar registos existentes (faturas ou despesas) a uma obra.
 * kind: 'invoice' | 'expense'
 */
function LinkPickerDialog({ open, onClose, kind, currentWorkId, currentWorkTitle, onLinked, works }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showAllObras, setShowAllObras] = useState(false);   // por defeito só sem obra
  const [confirming, setConfirming] = useState(null);        // item que já tem obra, aguarda confirmação de troca

  const endpoint = kind === 'invoice' ? '/invoices' : '/expenses';
  const label = kind === 'invoice' ? 'Fatura' : 'Despesa';
  const titleLabel = kind === 'invoice' ? 'Associar Fatura à Obra' : 'Associar Despesa à Obra';

  useEffect(() => {
    if (!open) return;
    setSearch(''); setShowAllObras(false); setConfirming(null);
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(endpoint);
        setItems(data || []);
      } catch { toast.error(`Erro ao carregar ${label.toLowerCase()}s`); }
      finally { setLoading(false); }
    })();
  }, [open, endpoint, label]);

  const worksById = useMemo(() => Object.fromEntries((works || []).map(w => [w.id, w])), [works]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items || []).filter(it => {
      // Excluir os já pertencentes à obra actual
      if (it.obra_id === currentWorkId) return false;
      // Por defeito só sem obra
      if (!showAllObras && it.obra_id) return false;
      if (!q) return true;
      if (kind === 'invoice') {
        return [it.number, it.client_name, it.notes, it.value_total, it.issue_date]
          .filter(Boolean).some(v => String(v).toLowerCase().includes(q));
      }
      return [it.supplier, it.invoice_number, it.category, it.description, it.notes, it.value_gross, it.date]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    });
  }, [items, search, showAllObras, currentWorkId, kind]);

  const doLink = async (item) => {
    try {
      const url = kind === 'invoice'
        ? `/invoices/${item.id}/link-work`
        : `/expenses/${item.id}/link-work`;
      await api.put(url, { obra_id: currentWorkId });
      toast.success(`${label} associada à obra.`);
      setConfirming(null);
      onLinked();
      onClose();
    } catch (e) {
      const msg = e?.response?.data?.detail || `Erro ao associar ${label.toLowerCase()}.`;
      toast.error(typeof msg === 'string' ? msg : 'Erro ao associar.');
    }
  };

  const handlePick = (item) => {
    if (item.obra_id && item.obra_id !== currentWorkId) {
      setConfirming(item);   // pedir confirmação
    } else {
      doLink(item);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        data-testid={`link-${kind}-dialog`}
        className="bg-zinc-950 border-zinc-800 text-white max-w-2xl max-h-[85vh] flex flex-col"
      >
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            {kind === 'invoice' ? <FileCheck className="h-5 w-5 text-emerald-400" /> : <Receipt className="h-5 w-5 text-red-400" />}
            {titleLabel}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            Obra: <span className="text-yellow-400">{currentWorkTitle}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              data-testid={`link-${kind}-search`}
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder={kind === 'invoice' ? 'Procurar por número, cliente, valor…' : 'Procurar por fornecedor, categoria, valor…'}
              className="pl-9 bg-zinc-900 border-zinc-800 text-white"
            />
          </div>
          <Button
            data-testid={`link-${kind}-toggle-all`}
            variant="outline" size="sm"
            className={`h-10 whitespace-nowrap ${showAllObras ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-300' : 'bg-zinc-900 border-zinc-800 text-zinc-300'}`}
            onClick={() => setShowAllObras(v => !v)}
          >
            {showAllObras ? 'A mostrar todas' : 'Só sem obra'}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[240px] rounded-lg border border-zinc-800 divide-y divide-zinc-800/60">
          {loading && <p className="text-xs text-zinc-500 text-center py-8">A carregar…</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-xs text-zinc-500 italic text-center py-10">
              {items.length === 0 ? `Sem ${label.toLowerCase()}s registadas.` : 'Sem resultados para os filtros escolhidos.'}
            </p>
          )}
          {filtered.map((it) => {
            const otherObra = it.obra_id && worksById[it.obra_id];
            const primary = kind === 'invoice' ? (it.number || 'Sem número') : (it.supplier || it.description || 'Despesa');
            const secondary = kind === 'invoice'
              ? `${it.client_name || '—'} · ${it.issue_date || '—'}`
              : `${it.category || '—'} · ${it.date || '—'}${it.invoice_number ? ` · ${it.invoice_number}` : ''}`;
            const value = kind === 'invoice' ? it.value_total : it.value_gross;
            return (
              <button
                key={it.id}
                data-testid={`link-${kind}-item-${it.id}`}
                onClick={() => handlePick(it)}
                className="w-full text-left p-3 hover:bg-zinc-900/60 transition-colors flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white font-medium truncate">{primary}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{secondary}</p>
                  {it.obra_id && (
                    <Badge className="mt-1 bg-amber-500/15 text-amber-300 border-amber-500/40 text-[9px]">
                      Actualmente em: {otherObra?.title || '(obra desconhecida)'}
                    </Badge>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-white font-mono">{fmt(value)}</p>
                  <p className="text-[10px] text-yellow-400 mt-1">+ Associar</p>
                </div>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid={`link-${kind}-close`} className="text-zinc-400">Fechar</Button>
        </DialogFooter>

        {confirming && (
          <Dialog open onOpenChange={(v) => { if (!v) setConfirming(null); }}>
            <DialogContent data-testid={`link-${kind}-confirm`} className="bg-zinc-950 border-zinc-800 text-white max-w-md">
              <DialogHeader>
                <DialogTitle className="text-white flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" /> Trocar de obra?
                </DialogTitle>
                <DialogDescription className="text-sm text-zinc-300">
                  Esta {label.toLowerCase()} já está associada à obra <span className="text-amber-300 font-medium">
                    “{worksById[confirming.obra_id]?.title || '(obra desconhecida)'}”
                  </span>. Confirma que quer <strong>movê-la</strong> para <span className="text-yellow-400 font-medium">“{currentWorkTitle}”</span>?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setConfirming(null)} data-testid={`link-${kind}-confirm-cancel`}>Cancelar</Button>
                <Button
                  data-testid={`link-${kind}-confirm-ok`}
                  className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold"
                  onClick={() => doLink(confirming)}
                >
                  Sim, mover para esta obra
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}

const SEVERITY_STYLE = {
  high:   { border: 'border-red-800',    bg: 'bg-red-950/50',    text: 'text-red-200',    dot: 'text-red-400',    Icon: Siren        },
  medium: { border: 'border-amber-800',  bg: 'bg-amber-950/40',  text: 'text-amber-100',  dot: 'text-amber-400',  Icon: AlertTriangle},
  low:    { border: 'border-blue-800',   bg: 'bg-blue-950/40',   text: 'text-blue-100',   dot: 'text-blue-400',   Icon: BellRing     },
};

function AlertsPanel({ alerts }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-900/60 flex items-center gap-2" data-testid="alerts-none">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        <p className="text-xs text-emerald-200">Sem alertas nesta obra — tudo sob controlo.</p>
      </div>
    );
  }
  const counts = alerts.reduce((acc, a) => { acc[a.severity] = (acc[a.severity] || 0) + 1; return acc; }, {});
  return (
    <Card className="bg-zinc-900 border-zinc-800" data-testid="alerts-panel">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm text-white flex items-center gap-2">
          <Siren className="h-4 w-4 text-red-400" /> Alertas da Obra
          <Badge className="bg-zinc-800 text-zinc-300 text-[10px] ml-1">{alerts.length}</Badge>
        </CardTitle>
        <div className="text-[10px] text-zinc-500 flex gap-2">
          {counts.high   && <span className="text-red-400">● {counts.high} crítico(s)</span>}
          {counts.medium && <span className="text-amber-400">● {counts.medium} atenção</span>}
          {counts.low    && <span className="text-blue-400">● {counts.low} info</span>}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {alerts.map((a, i) => {
          const s = SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.medium;
          const Icon = s.Icon;
          return (
            <div
              key={`${a.code}-${i}`}
              data-testid={`alert-${a.code}`}
              className={`p-3 rounded-lg border ${s.border} ${s.bg} flex items-start gap-3`}
            >
              <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${s.dot}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${s.text}`}>{a.title}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{a.message}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function CaixaObraPage() {
  const nav = useNavigate();
  const [works, setWorks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [caixa, setCaixa] = useState(null);
  const [loading, setLoading] = useState(true);
  const [linkKind, setLinkKind] = useState(null);        // 'invoice' | 'expense' | null
  const [unlinking, setUnlinking] = useState(null);      // { kind, id, name }

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/works');
      setWorks(data || []);
      if (!selectedId && data?.length) setSelectedId(data[0].id);
    } catch { toast.error('Erro ao carregar obras'); }
    finally { setLoading(false); }
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  const reloadCaixa = useCallback(async () => {
    if (!selectedId) return;
    try {
      const { data } = await api.get(`/works/${selectedId}/caixa`);
      setCaixa(data);
    } catch { toast.error('Erro ao carregar caixa'); }
  }, [selectedId]);

  useEffect(() => { reloadCaixa(); }, [reloadCaixa]);

  const doUnlink = async () => {
    if (!unlinking) return;
    try {
      const url = unlinking.kind === 'invoice'
        ? `/invoices/${unlinking.id}/link-work`
        : `/expenses/${unlinking.id}/link-work`;
      await api.put(url, { obra_id: null });
      toast.success('Associação removida.');
      setUnlinking(null);
      reloadCaixa();
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Erro ao desassociar.';
      toast.error(typeof msg === 'string' ? msg : 'Erro ao desassociar.');
    }
  };

  if (loading) return <div className="flex items-center justify-center py-24"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>;

  const currentWork = works.find(w => w.id === selectedId);
  const marginColor = caixa?.resumo?.margin_real_pct >= caixa?.resumo?.margin_predicted_pct * 0.85 ? 'text-emerald-400' : 'text-red-400';
  const cashColor = (caixa?.caixa?.cash_balance || 0) >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="space-y-5" data-testid="caixa-obra-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            <Wallet className="h-8 w-8 text-yellow-400" /> Caixa da Obra
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Cash-flow por obra: recebido, a receber, pago, a pagar, margem prevista vs real.</p>
        </div>
        <select value={selectedId || ''} onChange={e => setSelectedId(e.target.value)}
          data-testid="work-selector"
          className="bg-zinc-900 border border-zinc-800 rounded-xl h-11 px-4 text-white text-sm min-w-[280px]">
          <option value="">Escolha uma obra…</option>
          {works.map(w => <option key={w.id} value={w.id}>{w.title} — {w.client_name || ''} ({w.status})</option>)}
        </select>
      </div>

      {!caixa && selectedId && <p className="text-zinc-500 text-center py-12">A carregar caixa…</p>}
      {!selectedId && (
        <Card className="bg-zinc-900 border-zinc-800"><CardContent className="py-16 text-center">
          <HardHat className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400">Escolha uma obra para ver o balanço.</p>
        </CardContent></Card>
      )}

      {caixa && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI testid="kpi-sale-total" label="Valor de Venda" value={fmt0(caixa.resumo.sale_total)} icon={Target} color="text-white" hint="do orçamento" />
            <KPI testid="kpi-received" label="Já Recebido" value={fmt0(caixa.receitas.total_received)} icon={CheckCircle2} color="text-emerald-400" hint={`de ${fmt0(caixa.receitas.total_invoiced)} facturado`} />
            <KPI testid="kpi-to-receive" label="A Receber" value={fmt0(caixa.receitas.to_receive)} icon={Clock} color="text-yellow-400" hint={`+ ${fmt0(caixa.receitas.to_invoice)} por facturar`} />
            <KPI testid="kpi-cash-balance" label="Caixa Efectiva" value={fmt0(caixa.caixa.cash_balance)} icon={PiggyBank} color={cashColor} hint="recebido − pago" />
          </div>

          <AlertsPanel alerts={caixa.alerts || []} />

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3"><CardTitle className="text-sm text-white">Progresso Financeiro</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400">Cobrança do valor de venda</span>
                  <span className="text-emerald-400 font-mono">{pct(caixa.caixa.receipts_progress_pct)}</span>
                </div>
                <Progress value={caixa.caixa.receipts_progress_pct} className="h-3 bg-zinc-800" />
                <p className="text-[10px] text-zinc-500 mt-1">{fmt0(caixa.receitas.total_received)} de {fmt0(caixa.resumo.sale_total)}</p>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400">Custo real vs previsto</span>
                  <span className={caixa.caixa.cost_progress_pct > 100 ? 'text-red-400 font-mono' : 'text-yellow-400 font-mono'}>{pct(caixa.caixa.cost_progress_pct)}</span>
                </div>
                <Progress value={Math.min(caixa.caixa.cost_progress_pct, 150)} className="h-3 bg-zinc-800" />
                <p className="text-[10px] text-zinc-500 mt-1">{fmt0(caixa.resumo.real_total_cost)} de {fmt0(caixa.resumo.predicted_total)} previsto</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <KPI testid="kpi-margin-predicted" label="Margem Prevista" value={pct(caixa.resumo.margin_predicted_pct)} icon={TrendingUp} color="text-blue-400" hint={fmt0(caixa.resumo.predicted_profit)} />
            <KPI testid="kpi-margin-real" label="Margem Real (actual)" value={pct(caixa.resumo.margin_real_pct)} icon={caixa.resumo.margin_real_pct >= caixa.resumo.margin_predicted_pct ? TrendingUp : TrendingDown} color={marginColor} hint={fmt0(caixa.resumo.real_profit)} />
            <KPI testid="kpi-projected-cash" label="Caixa Projectada Final" value={fmt0(caixa.caixa.projected_cash_balance)} icon={PiggyBank} color={caixa.caixa.projected_cash_balance >= 0 ? 'text-emerald-400' : 'text-red-400'} hint="se tudo cobrado e pago" />
          </div>

          {caixa.resumo.margin_real_pct < caixa.resumo.margin_predicted_pct * 0.7 && caixa.resumo.margin_predicted_pct > 0 && (
            <div className="hidden" data-testid="warning-margem" />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* FACTURAS */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-emerald-400" /> Facturas ({caixa.receitas.invoices_count})
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    data-testid="btn-associar-fatura"
                    size="sm"
                    className="h-7 px-2 text-xs bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                    onClick={() => setLinkKind('invoice')}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Associar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => nav('/faturas')} className="text-xs text-yellow-400 h-7">Ver todas →</Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {caixa.receitas.invoices.length === 0 && <p className="text-xs text-zinc-500 italic py-3 text-center">Sem facturas ainda. Clique em “Associar” para vincular uma existente.</p>}
                {caixa.receitas.invoices.map(i => {
                  const outstanding = (i.value_total || 0) - (i.paid_total || 0);
                  return (
                    <div key={i.id} className="py-2 border-b border-zinc-800/60 last:border-0 text-sm group" data-testid={`inv-${i.id}`}>
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <p className="text-white font-mono text-xs">{i.number || 'sem número'}</p>
                          <p className="text-[10px] text-zinc-500">Emitida: {i.issue_date} · Vence: {i.due_date}</p>
                        </div>
                        <div className="text-right flex items-start gap-2">
                          <div>
                            <p className="text-white font-mono">{fmt(i.value_total)}</p>
                            {outstanding > 0 ? (
                              <p className="text-[10px] text-yellow-400">Falta {fmt(outstanding)}</p>
                            ) : (
                              <Badge className="bg-emerald-500/20 text-emerald-300 text-[9px]">PAGA</Badge>
                            )}
                          </div>
                          <button
                            data-testid={`unlink-invoice-${i.id}`}
                            onClick={() => setUnlinking({ kind: 'invoice', id: i.id, name: i.number || 'sem número' })}
                            title="Remover associação"
                            className="opacity-40 hover:opacity-100 text-zinc-400 hover:text-red-400 transition-opacity"
                          >
                            <Unlink className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* DESPESAS */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-red-400" /> Despesas ({caixa.despesas.count})
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    data-testid="btn-associar-despesa"
                    size="sm"
                    className="h-7 px-2 text-xs bg-red-500/15 border border-red-500/40 text-red-300 hover:bg-red-500/25"
                    onClick={() => setLinkKind('expense')}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Associar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => nav('/despesas')} className="text-xs text-yellow-400 h-7">Ver todas →</Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-xs mb-2 flex gap-3">
                  <span className="text-emerald-400">Pago: {fmt0(caixa.despesas.expenses_paid)}</span>
                  <span className="text-yellow-400">A pagar: {fmt0(caixa.despesas.expenses_to_pay)}</span>
                </div>
                {caixa.despesas.expenses.length === 0 && <p className="text-xs text-zinc-500 italic py-3 text-center">Sem despesas registadas. Clique em “Associar” para vincular uma existente.</p>}
                {caixa.despesas.expenses.slice(0, 10).map(e => (
                  <div key={e.id} className="py-2 border-b border-zinc-800/60 last:border-0 text-sm group" data-testid={`exp-${e.id}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs truncate">{e.description || e.supplier || 'Despesa'}</p>
                        <p className="text-[10px] text-zinc-500">{e.date} · {e.category || ''}</p>
                      </div>
                      <div className="text-right flex items-start gap-2">
                        <div>
                          <p className="text-white font-mono text-xs">{fmt(e.value_gross)}</p>
                          {e.paid ? <Badge className="bg-emerald-500/20 text-emerald-300 text-[9px]">PAGA</Badge> : <Badge className="bg-yellow-500/20 text-yellow-300 text-[9px]">POR PAGAR</Badge>}
                        </div>
                        <button
                          data-testid={`unlink-expense-${e.id}`}
                          onClick={() => setUnlinking({ kind: 'expense', id: e.id, name: e.supplier || e.description || 'despesa' })}
                          title="Remover associação"
                          className="opacity-40 hover:opacity-100 text-zinc-400 hover:text-red-400 transition-opacity"
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {caixa.despesas.expenses.length > 10 && (
                  <p className="text-[10px] text-zinc-500 text-center pt-2">+ {caixa.despesas.expenses.length - 10} despesa(s)…</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Diálogo de associar (partilhado) */}
          <LinkPickerDialog
            open={!!linkKind}
            onClose={() => setLinkKind(null)}
            kind={linkKind}
            currentWorkId={selectedId}
            currentWorkTitle={currentWork?.title || ''}
            works={works}
            onLinked={reloadCaixa}
          />

          {/* Confirmação de desassociar */}
          <Dialog open={!!unlinking} onOpenChange={(v) => { if (!v) setUnlinking(null); }}>
            <DialogContent data-testid="unlink-confirm" className="bg-zinc-950 border-zinc-800 text-white max-w-md">
              <DialogHeader>
                <DialogTitle className="text-white flex items-center gap-2">
                  <X className="h-5 w-5 text-red-400" /> Remover associação
                </DialogTitle>
                <DialogDescription className="text-sm text-zinc-300">
                  Tem a certeza que quer desassociar a {unlinking?.kind === 'invoice' ? 'fatura' : 'despesa'}{' '}
                  <span className="text-white font-medium">“{unlinking?.name}”</span> desta obra? O registo continua no módulo respectivo, apenas fica sem obra.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setUnlinking(null)} data-testid="unlink-cancel">Cancelar</Button>
                <Button
                  data-testid="unlink-ok"
                  className="bg-red-500 hover:bg-red-400 text-white font-semibold"
                  onClick={doUnlink}
                >
                  Desassociar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
