import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Truck, Package, AlertTriangle, Eye, FileDown, Send, Trash2 } from 'lucide-react';

export const GuidesGrid = ({ loading, guides, statusLabel, onViewDetail, onDownloadPDF, onEmit, onDelete }) => {
  if (loading) {
    return <div className="flex justify-center py-16"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (guides.length === 0) {
    return <div className="text-center py-16 text-zinc-500"><Truck size={48} className="mx-auto mb-4 text-zinc-700" /><p>Sem guias para mostrar</p></div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {guides.map(g => {
        const st = statusLabel[g.status] || statusLabel.rascunho;
        const itemsCount = (g.items || []).length;
        const diffsCount = (g.items || []).filter(it => it.qty_received != null && it.qty_received < it.qty_planned).length;
        return (
          <div key={g.id} data-testid={`guide-card-${g.id}`} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 hover:border-zinc-700 transition cursor-pointer" onClick={() => onViewDetail(g)}>
            <div className="flex items-start justify-between mb-3"><div><div className="text-[10px] uppercase tracking-widest text-zinc-500">Guia</div><div className="text-lg font-black text-yellow-400" translate="no">{g.number}</div></div><Badge className={`${st.color} text-[10px]`}>{st.label}</Badge></div>
            <div className="space-y-1.5 text-sm">
              <div className="text-white font-semibold truncate">{g.obra_name || g.destination || '—'}</div>
              {g.client_name && <div className="text-zinc-500 text-xs">{g.client_name}</div>}
              <div className="flex items-center gap-1 text-zinc-400 text-xs mt-2"><Package size={12} /> {itemsCount} item(s){g.status === 'recebida_com_diferencas' && diffsCount > 0 && <span className="text-orange-300 ml-2 flex items-center gap-1"><AlertTriangle size={12} /> {diffsCount} diff.</span>}</div>
              <div className="text-zinc-500 text-xs">Técnico: <span className="text-zinc-300">{g.assigned_employee_name || '—'}</span></div>
              {g.expected_delivery_date && <div className="text-zinc-500 text-xs">Entrega: {g.expected_delivery_date}</div>}
            </div>
            <div className="flex gap-1 mt-4 pt-3 border-t border-zinc-800" onClick={(e) => e.stopPropagation()}>
              <Button data-testid={`view-${g.id}`} size="sm" variant="ghost" onClick={() => onViewDetail(g)} className="flex-1 h-8 text-xs text-zinc-300 hover:text-white"><Eye size={12} className="mr-1" /> Detalhe</Button>
              <Button data-testid={`pdf-${g.id}`} size="sm" variant="ghost" onClick={() => onDownloadPDF(g)} className="flex-1 h-8 text-xs text-zinc-300 hover:text-white"><FileDown size={12} className="mr-1" /> PDF</Button>
              {g.status === 'rascunho' && <Button data-testid={`emit-${g.id}`} size="sm" onClick={() => onEmit(g)} className="flex-1 h-8 text-xs bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-bold"><Send size={12} className="mr-1" /> Emitir</Button>}
              {g.status === 'rascunho' && <Button size="sm" variant="ghost" onClick={() => onDelete(g)} className="h-8 px-2 text-xs text-zinc-400 hover:text-red-400"><Trash2 size={12} /></Button>}
            </div>
          </div>
        );
      })}
    </div>
  );
};