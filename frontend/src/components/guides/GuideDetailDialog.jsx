import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CheckCircle2, FileDown, Package } from 'lucide-react';

function Info({ label, value }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2">
      <div className="text-[10px] uppercase text-zinc-500 tracking-wide">{label}</div>
      <div className="text-sm text-white truncate">{value || '—'}</div>
    </div>
  );
}

export const GuideDetailDialog = ({ open, onOpenChange, detailGuide, statusLabel, onReturnToStock, onDownloadPDF }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="detail-guide-dialog" className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-4xl max-h-[92vh] overflow-y-auto">
        {detailGuide && (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <DialogTitle className="text-2xl font-black uppercase text-white" translate="no">{detailGuide.number}</DialogTitle>
                  <DialogDescription className="text-zinc-500">{detailGuide.obra_name || detailGuide.destination || '—'} · Técnico: {detailGuide.assigned_employee_name || '—'}</DialogDescription>
                </div>
                <Badge className={(statusLabel[detailGuide.status] || statusLabel.rascunho).color}>{(statusLabel[detailGuide.status] || statusLabel.rascunho).label}</Badge>
              </div>
            </DialogHeader>

            <div className="space-y-5 mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Info label="Origem" value={detailGuide.origin} />
                <Info label="Destino" value={detailGuide.destination} />
                <Info label="Prevista" value={detailGuide.expected_delivery_date || '—'} />
                <Info label="Emitida em" value={detailGuide.emitted_at ? new Date(detailGuide.emitted_at).toLocaleString('pt-PT') : '—'} />
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-950/80 text-zinc-500 uppercase text-xs"><tr><th className="text-left px-4 py-2 font-semibold">Material</th><th className="text-right px-2 py-2 font-semibold">Previsto</th><th className="text-right px-2 py-2 font-semibold">Recebido</th><th className="text-right px-2 py-2 font-semibold">Utilizado</th><th className="text-right px-2 py-2 font-semibold">Devolvido</th><th className="text-right px-2 py-2 font-semibold">Sobra Obra</th><th className="text-right px-2 py-2 font-semibold">Danificado</th><th className="text-left px-2 py-2 font-semibold">Nota</th></tr></thead>
                  <tbody>
                    {(detailGuide.items || []).map(it => {
                      const planned = Number(it.qty_planned || 0);
                      const received = it.qty_received == null ? null : Number(it.qty_received);
                      const used = Number(it.qty_used || 0);
                      const returned = Number(it.qty_returned || 0);
                      const surplus = received == null ? null : (received - used - returned);
                      const diff = received != null && received < planned;
                      return (
                        <tr key={it.id} className="border-t border-zinc-800">
                          <td className="px-4 py-2 text-white">{it.name} <span className="text-zinc-500 text-xs">({it.unit})</span></td>
                          <td className="px-2 py-2 text-right text-zinc-300">{planned}</td>
                          <td className={`px-2 py-2 text-right font-bold ${received == null ? 'text-zinc-600' : diff ? 'text-orange-300' : 'text-green-400'}`}>{received == null ? '—' : received}</td>
                          <td className="px-2 py-2 text-right text-blue-300 font-semibold">{used > 0 ? used : '—'}</td>
                          <td className="px-2 py-2 text-right text-zinc-400">{returned > 0 ? returned : '—'}</td>
                          <td className={`px-2 py-2 text-right font-bold ${surplus == null ? 'text-zinc-600' : surplus > 0 ? 'text-yellow-400' : 'text-zinc-500'}`}>{surplus == null ? '—' : surplus.toFixed(2).replace(/\.00$/, '')}</td>
                          <td className={`px-2 py-2 text-right ${it.damaged_qty > 0 ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>{it.damaged_qty || 0}</td>
                          <td className="px-2 py-2 text-zinc-400 text-xs">{it.notes || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {(() => {
                const totalSurplus = (detailGuide.items || []).reduce((s, it) => {
                  const received = Number(it.qty_received || 0);
                  const used = Number(it.qty_used || 0);
                  const returned = Number(it.qty_returned || 0);
                  return s + Math.max(0, received - used - returned);
                }, 0);
                if (totalSurplus <= 0.0001) return null;
                return (
                  <div data-testid="surplus-banner" className="bg-yellow-400/5 border border-yellow-400/30 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div><div className="text-yellow-300 font-bold text-sm">Material em sobra na obra</div><div className="text-zinc-400 text-xs mt-1">Total: <span className="text-white font-bold">{totalSurplus.toFixed(2).replace(/\.00$/, '')}</span> unidade(s) entre vários items. Quando o técnico voltar ao armazém, clica em devolver.</div></div>
                    <Button data-testid="return-to-stock-btn" onClick={() => onReturnToStock(detailGuide.id)} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-bold rounded-full"><Package size={14} className="mr-2" /> Devolver sobra ao armazém</Button>
                  </div>
                );
              })()}

              {detailGuide.reception && (
                <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-green-400 font-bold mb-2"><CheckCircle2 size={16} /> Receção registada em {new Date(detailGuide.reception.received_at).toLocaleString('pt-PT')}</div>
                  <div className="text-sm text-zinc-300">Recebida por: <span className="text-white">{detailGuide.reception.received_by_name}</span></div>
                  {detailGuide.reception.notes && <p className="text-sm text-zinc-400 mt-1">{detailGuide.reception.notes}</p>}
                  {detailGuide.reception.signature_data && <div className="mt-3 inline-block bg-white p-2 rounded"><img src={detailGuide.reception.signature_data} alt="Assinatura" className="h-20" /></div>}
                  {detailGuide.reception.photos && detailGuide.reception.photos.length > 0 && <div className="mt-3 grid grid-cols-3 md:grid-cols-6 gap-2">{detailGuide.reception.photos.map((p, i) => <img key={`${p}-${i}`} src={p} alt={`Foto ${i + 1}`} className="rounded-lg w-full h-20 object-cover" />)}</div>}
                </div>
              )}

              {(detailGuide.history || []).length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                  <h4 className="text-white font-bold text-sm uppercase mb-2">Histórico</h4>
                  <div className="space-y-1.5 text-xs">{detailGuide.history.slice().reverse().map((h, i) => <div key={`${h.at}-${h.action}-${h.by || 'user'}-${i}`} className="flex items-start gap-2 text-zinc-400"><span className="text-zinc-600 shrink-0">{new Date(h.at).toLocaleString('pt-PT')}</span><span className="text-yellow-400 font-semibold">{h.action}</span><span className="text-zinc-500">· {h.by}</span></div>)}</div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800"><Button onClick={() => onDownloadPDF(detailGuide)} variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-full"><FileDown size={14} className="mr-2" /> Descarregar PDF</Button></div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};