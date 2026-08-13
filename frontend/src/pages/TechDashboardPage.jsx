import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Calendar, MapPin, ArrowRight, Truck, CheckCircle2, AlertTriangle, Clock, FileText } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_MAP = {
  emitida:        { label: 'Emitida',            color: 'bg-blue-500/20 text-blue-300 border-blue-500/40',   icon: Truck },
  em_transito:    { label: 'Em trânsito',        color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40', icon: Truck },
  recebida:       { label: 'Recebida',           color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', icon: CheckCircle2 },
  recebida_com_diferencas: { label: 'Rec. com diferenças', color: 'bg-orange-500/20 text-orange-300 border-orange-500/40', icon: AlertTriangle },
};

export default function TechDashboardPage() {
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('todas');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/tech/transport-guides');
        setGuides(data || []);
      } catch (err) {
        console.debug('[tech-guides]', err?.message);
        toast.error('Erro ao carregar guias');
      } finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'todas') return guides;
    if (filter === 'pendentes') return guides.filter(g => ['emitida', 'em_transito'].includes(g.status));
    if (filter === 'recebidas') return guides.filter(g => ['recebida', 'recebida_com_diferencas'].includes(g.status));
    return guides;
  }, [guides, filter]);

  const counts = useMemo(() => ({
    todas: guides.length,
    pendentes: guides.filter(g => ['emitida', 'em_transito'].includes(g.status)).length,
    recebidas: guides.filter(g => ['recebida', 'recebida_com_diferencas'].includes(g.status)).length,
  }), [guides]);

  return (
    <div className="space-y-4" data-testid="tech-dashboard">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
          <Package className="h-6 w-6 text-yellow-400" /> As minhas guias
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Guias de transporte atribuídas a si.</p>
      </div>

      <Link to="/tech/visitas" className="block" data-testid="tech-visit-report-shortcut">
        <Card className="bg-[linear-gradient(135deg,#111111_0%,#1f1f1f_100%)] border-yellow-500/30 hover:border-yellow-400/60 transition-colors">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-yellow-300">Novo módulo</p>
              <p className="mt-1 text-lg font-black text-white flex items-center gap-2"><FileText className="h-5 w-5 text-yellow-400" /> Relação de Visita em Obra</p>
              <p className="mt-1 text-sm text-zinc-400">Abrir formulário mobile para campo, foto do quadro e PDF final.</p>
            </div>
            <ArrowRight className="h-5 w-5 text-yellow-400 shrink-0" />
          </CardContent>
        </Card>
      </Link>

      {/* Filter tabs */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { key: 'todas',     label: 'Todas',     count: counts.todas },
          { key: 'pendentes', label: 'Pendentes', count: counts.pendentes },
          { key: 'recebidas', label: 'Recebidas', count: counts.recebidas },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            data-testid={`tech-filter-${t.key}`}
            className={`py-3 rounded-lg font-medium text-sm border transition-colors ${
              filter === t.key
                ? 'bg-yellow-500 border-yellow-500 text-zinc-900'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
            }`}
          >
            <div>{t.label}</div>
            <div className="text-[11px] opacity-70 mt-0.5">{t.count}</div>
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12" data-testid="tech-loading">
          <div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Sem guias nesta categoria.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {filtered.map(g => {
          const st = STATUS_MAP[g.status] || { label: g.status, color: 'bg-zinc-800 text-zinc-300 border-zinc-700', icon: Clock };
          const Icon = st.icon;
          const nItems = (g.items || []).length;
          return (
            <Link key={g.id} to={`/tech/guias/${g.id}`} className="block" data-testid={`tech-guide-card-${g.number}`}>
              <Card className="bg-zinc-900 border-zinc-800 hover:border-yellow-500/50 transition-colors active:scale-[0.99]">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wide">Guia</p>
                      <p className="text-lg font-bold text-white font-mono">{g.number}</p>
                    </div>
                    <Badge className={`gap-1 border ${st.color}`}>
                      <Icon className="h-3 w-3" /> {st.label}
                    </Badge>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-start gap-2 text-zinc-300">
                      <MapPin className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-1">{g.destination || '—'}</span>
                    </div>
                    {g.expected_delivery_date && (
                      <div className="flex items-center gap-2 text-zinc-400 text-xs">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(g.expected_delivery_date).toLocaleDateString('pt-PT')}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-zinc-500">{nItems} item{nItems !== 1 ? 's' : ''}</span>
                      <ArrowRight className="h-4 w-4 text-yellow-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
