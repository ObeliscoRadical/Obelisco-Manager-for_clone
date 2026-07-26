import { useEffect, useState } from 'react';
import api from '../lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, Briefcase, Clock, CheckCircle2, HardHat, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';

const STATUS_COLOR = {
  planeada:   'bg-blue-500/20 text-blue-300 border-blue-500/40',
  em_curso:   'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  concluida:  'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  cancelada:  'bg-red-500/20 text-red-300 border-red-500/40',
};

export default function TechAgendaPage() {
  const nav = useNavigate();
  const [works, setWorks] = useState([]);
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [w, a] = await Promise.all([
          api.get('/tech/works/my').catch(() => ({ data: [] })),
          api.get('/tech/appointments/my').catch(() => ({ data: [] })),
        ]);
        setWorks(w.data || []);
        setAppts(a.data || []);
      } finally { setLoading(false); }
    })();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const isToday = (d) => d && d.slice(0, 10) === today;

  if (loading) return (
    <div className="flex items-center justify-center py-24"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
  );

  return (
    <div className="space-y-5" data-testid="tech-agenda-page">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
          <Calendar className="h-6 w-6 text-yellow-400" /> A minha agenda
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Obras atribuídas + próximos compromissos.</p>
      </div>

      {/* Compromissos */}
      <div className="space-y-2">
        <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">Próximos compromissos</h2>
        {appts.length === 0 && (
          <p className="text-sm text-zinc-500 italic py-3">Sem compromissos marcados.</p>
        )}
        {appts.map(a => {
          const hasWork = !!a.work_id;
          const onOpen = () => hasWork && nav(`/tech/obra/${a.work_id}`);
          return (
          <Card
            key={a.id}
            className={`bg-zinc-900 border-zinc-800 ${isToday(a.date) ? 'border-yellow-500/50' : ''} ${hasWork ? 'cursor-pointer hover:border-yellow-500/60 transition-colors' : ''}`}
            data-testid={`tech-appt-${a.id}`}
            onClick={onOpen}
          >
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{a.title || 'Compromisso'}</p>
                  {a.client_name && <p className="text-xs text-zinc-400">{a.client_name}</p>}
                  {hasWork && (
                    <Badge className="bg-yellow-500/15 text-yellow-300 border-yellow-500/40 text-[10px] mt-1" data-testid={`tech-appt-work-badge-${a.id}`}>
                      <HardHat className="h-2.5 w-2.5 mr-1" /> Ver detalhes da obra
                    </Badge>
                  )}
                  {a.notes && <p className="text-xs text-zinc-400 mt-0.5">{a.notes}</p>}
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(a.date).toLocaleDateString('pt-PT')}</span>
                    {(a.time_start || a.time_end) && (
                      <span className="flex items-center gap-1 text-yellow-400 font-mono">
                        {a.time_start || ''}{a.time_end ? ` — ${a.time_end}` : ''}
                      </span>
                    )}
                    {a.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {a.location}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isToday(a.date) && <Badge className="bg-yellow-500 text-zinc-900 text-[10px]">HOJE</Badge>}
                  {hasWork && <ChevronRight className="h-4 w-4 text-yellow-400" />}
                </div>
              </div>
            </CardContent>
          </Card>
        );})}
      </div>

      {/* Obras */}
      <div className="space-y-2">
        <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">As minhas obras</h2>
        {works.length === 0 && (
          <p className="text-sm text-zinc-500 italic py-3">Sem obras atribuídas.</p>
        )}
        {works.map(w => {
          const st = STATUS_COLOR[w.status] || 'bg-zinc-700 text-zinc-300';
          return (
            <Card key={w.id} className="bg-zinc-900 border-zinc-800" data-testid={`tech-work-${w.id}`}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between mb-1.5">
                  <p className="text-sm font-semibold text-white">{w.title || w.name || 'Obra'}</p>
                  <Badge className={`text-[10px] ${st}`}>{w.status}</Badge>
                </div>
                <p className="text-xs text-zinc-400 mb-1">{w.client_name || w.client || ''}</p>
                <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                  {w.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {w.location}</span>}
                  {w.scheduled_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(w.scheduled_date).toLocaleDateString('pt-PT')}</span>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
