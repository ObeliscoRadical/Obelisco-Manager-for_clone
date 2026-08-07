import { useMemo, useState } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, SearchCheck } from 'lucide-react';
import { toast } from 'sonner';

const monthName = (m) => ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][m] || '';

export const ReconcileExpensesButton = ({
  month,
  year,
  category,
  type,
  onCompleted,
  buttonClassName = '',
  buttonVariant = 'secondary',
  testIdPrefix = 'expense-reconcile',
}) => {
  const [open, setOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState(null);

  const params = useMemo(() => ({
    month,
    year,
    category: category || undefined,
    type: type || undefined,
  }), [month, year, category, type]);

  const totalActions = (preview?.summary?.reconcilable_pairs || 0) + (preview?.summary?.duplicates_to_remove || 0);

  const openDialog = async () => {
    setOpen(true);
    setLoadingPreview(true);
    try {
      const { data } = await api.get('/expenses/reconcile-preview', { params });
      setPreview(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao gerar preview da reconciliação');
      setOpen(false);
    } finally {
      setLoadingPreview(false);
    }
  };

  const applyChanges = async () => {
    setApplying(true);
    try {
      const { data } = await api.post('/expenses/reconcile-apply', null, { params });
      toast.success(data.report?.id ? `${data.message} Relatório Excel guardado na auditoria.` : (data.message || 'Verificação concluída com sucesso'));
      setOpen(false);
      onCompleted?.(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao aplicar reconciliação');
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <Button
        data-testid={`${testIdPrefix}-button`}
        variant={buttonVariant}
        onClick={openDialog}
        className={buttonClassName}
      >
        <SearchCheck size={16} className="mr-2" /> 🔍 Reconciliar &amp; Validar Duplicados
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-2xl" data-testid={`${testIdPrefix}-dialog`}>
          <DialogHeader>
            <DialogTitle className="text-white text-2xl font-black uppercase tracking-tight">Verificar Duplicados & Reconciliação</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Vai analisar {monthName(month)} {year} e cruzar documentos fiscais com movimentos bancários do mesmo valor e janela de ±2 dias.
            </DialogDescription>
          </DialogHeader>

          {loadingPreview ? (
            <div className="py-10 text-center" data-testid={`${testIdPrefix}-loading`}>
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-yellow-400" />
              <p className="mt-3 text-sm text-zinc-400">A preparar o resumo da reconciliação…</p>
            </div>
          ) : preview && (
            <div className="space-y-4" data-testid={`${testIdPrefix}-preview`}>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4" data-testid={`${testIdPrefix}-records-scanned`}>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Registos analisados</div>
                  <div className="mt-2 text-2xl font-black text-white">{preview.summary?.records_scanned || 0}</div>
                </div>
                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4" data-testid={`${testIdPrefix}-reconcilable-count`}>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-blue-300/80">Reconciliáveis</div>
                  <div className="mt-2 text-2xl font-black text-blue-400">{preview.summary?.reconcilable_pairs || 0}</div>
                </div>
                <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4" data-testid={`${testIdPrefix}-duplicates-count`}>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-orange-300/80">Duplicados a remover</div>
                  <div className="mt-2 text-2xl font-black text-orange-400">{preview.summary?.duplicates_to_remove || 0}</div>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4" data-testid={`${testIdPrefix}-groups-count`}>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Grupos de duplicados</div>
                  <div className="mt-2 text-2xl font-black text-white">{preview.summary?.hard_duplicate_groups || 0}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4" data-testid={`${testIdPrefix}-summary-block`}>
                {totalActions > 0 ? (
                  <p className="text-sm text-zinc-300">
                    Foram encontrados <span className="font-semibold text-white">{preview.summary?.reconcilable_pairs || 0}</span> pares para reconciliação e
                    <span className="font-semibold text-white"> {preview.summary?.duplicates_to_remove || 0}</span> duplicados rígidos para limpeza automática.
                  </p>
                ) : (
                  <p className="text-sm text-zinc-400">Não foram encontrados pares reconciliáveis nem duplicados rígidos neste período.</p>
                )}
              </div>

              {(preview.reconciliation_preview?.length || 0) > 0 && (
                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4" data-testid={`${testIdPrefix}-reconciliation-list`}>
                  <div className="text-xs uppercase tracking-[0.22em] text-blue-300/80">Prévia de reconciliações</div>
                  <div className="mt-3 space-y-2">
                    {preview.reconciliation_preview.slice(0, 5).map((item, index) => (
                      <div key={`${item.fiscal_id}-${item.bank_id}`} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2" data-testid={`${testIdPrefix}-reconciliation-item-${index}`}>
                        <div>
                          <div className="text-sm font-semibold text-white">{item.supplier || 'Despesa reconciliável'}</div>
                          <div className="text-[11px] text-zinc-500">{item.invoice_number || 'sem nº fatura'} · desvio data {item.date_diff_days} dia(s)</div>
                        </div>
                        <div className="text-sm font-black text-blue-400">{new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(item.amount || 0)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(preview.hard_duplicate_preview?.length || 0) > 0 && (
                <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4" data-testid={`${testIdPrefix}-duplicates-list`}>
                  <div className="text-xs uppercase tracking-[0.22em] text-orange-300/80">Prévia de duplicados rígidos</div>
                  <div className="mt-3 space-y-2">
                    {preview.hard_duplicate_preview.slice(0, 5).map((item, index) => (
                      <div key={item.hard_dedupe_key} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2" data-testid={`${testIdPrefix}-duplicate-item-${index}`}>
                        <div>
                          <div className="text-sm font-semibold text-white">{item.keep_supplier || 'Despesa principal'}</div>
                          <div className="text-[11px] text-zinc-500">Mantém {item.keep_invoice_number || 'descrição principal'} · remove {item.remove_count} registo(s)</div>
                        </div>
                        <div className="text-sm font-black text-orange-400">-{item.remove_count}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-zinc-700 text-zinc-300"
              data-testid={`${testIdPrefix}-cancel-button`}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={applyChanges}
              disabled={loadingPreview || applying || totalActions === 0}
              className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-semibold"
              data-testid={`${testIdPrefix}-confirm-button`}
            >
              {applying ? <Loader2 size={16} className="mr-2 animate-spin" /> : <SearchCheck size={16} className="mr-2" />}
              Confirmar Verificação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
