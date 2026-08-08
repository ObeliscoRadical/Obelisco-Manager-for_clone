import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import TechLayout from '../components/TechLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  HardHat, ArrowLeft, Phone, MapPin, MessageSquare, Package as PackageIcon,
  CheckCircle2, Circle, Play, User, StickyNote, CalendarClock,
  LogIn, LogOut, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS = {
  done: { badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', Icon: CheckCircle2, label: 'Concluído', bar: 'bg-emerald-500' },
  in_progress: { badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40', Icon: Play, label: 'Em Curso', bar: 'bg-yellow-400' },
  pending: { badge: 'bg-zinc-800 text-zinc-400 border-zinc-700', Icon: Circle, label: 'Pendente', bar: 'bg-zinc-600' },
};

/** Página da obra para o técnico — todos os dados úteis em obra, SEM valores. */
export default function TechObraDetailPage() {
  const { workId } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState(null);          // timesheet do dia
  const [punching, setPunching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resWork, resToday] = await Promise.all([
        api.get(`/tech/works/${workId}/execution`),
        api.get('/tech/timesheet/today').catch(() => ({ data: null })),
      ]);
      setData(resWork.data);
      setToday(resToday.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro ao carregar obra');
    } finally { setLoading(false); }
  }, [workId]);

  useEffect(() => { load(); }, [load]);

  const punch = async (action) => {
    setPunching(true);
    try {
      const { data: updated } = await api.post('/tech/timesheet/punch', { action, work_id: workId });
      setToday(updated);
      toast.success(action === 'in' ? '📍 Chegada registada' : '✅ Saída registada');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro ao registar');
    } finally { setPunching(false); }
  };

  if (loading || !data) {
    return (
      <TechLayout title="Obra">
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </TechLayout>
    );
  }

  const items = data.items || [];
  const groupedByCategory = items.reduce((acc, it) => {
    const cat = it.category || 'Sem categoria';
    (acc[cat] ||= []).push(it);
    return acc;
  }, {});

  const total = items.length;
  const done = items.filter(i => i.execution_status === 'done').length;
  const inProg = items.filter(i => i.execution_status === 'in_progress').length;
  const pending = total - done - inProg;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Localizar a marcação mais recente/próxima
  const upcoming = (data.appointments || []).find(a => new Date(a.date) >= new Date(new Date().toDateString()))
                || (data.appointments || [])[0];
  const location = upcoming?.location || '';
  const phone = data.client_phone || '';

  const openMaps = () => {
    if (!location) return;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`, '_blank');
  };
  const openCall = () => {
    if (!phone) return;
    window.location.href = `tel:${phone.replace(/\s/g, '')}`;
  };

  // Picagens do dia relativas a ESTA obra
  const punchesForThisWork = ((today && today.punches) || []).filter(p => p.work_id === workId);
  const lastPunchThisWork = punchesForThisWork[punchesForThisWork.length - 1];
  const isCheckedIn = lastPunchThisWork && lastPunchThisWork.action === 'in';
  // Também bloqueia se está in noutra obra (evita picar 2 obras em simultâneo)
  const allPunches = (today?.punches || []);
  const globalLast = allPunches[allPunches.length - 1];
  const inAnotherWork = globalLast && globalLast.action === 'in' && globalLast.work_id && globalLast.work_id !== workId;

  return (
    <TechLayout title="Obra">
      <div className="space-y-4" data-testid="tech-obra-detail">
        <button
          data-testid="tech-obra-back"
          onClick={() => nav(-1)}
          className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </button>

        {/* BOTÕES CHEGUEI / TERMINEI — bem visíveis no topo */}
        <div className="grid grid-cols-2 gap-2" data-testid="tech-obra-punch">
          <Button
            data-testid="tech-obra-punch-in"
            onClick={() => punch('in')}
            disabled={punching || isCheckedIn || inAnotherWork}
            className={`h-14 rounded-xl font-black text-base shadow-lg ${
              isCheckedIn
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-emerald-500 hover:bg-emerald-400 text-white'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {punching ? <Loader2 className="h-5 w-5 animate-spin" /> : <><LogIn className="h-5 w-5 mr-2" /> {isCheckedIn ? 'NA OBRA' : 'CHEGUEI'}</>}
          </Button>
          <Button
            data-testid="tech-obra-punch-out"
            onClick={() => punch('out')}
            disabled={punching || !isCheckedIn}
            className="h-14 rounded-xl font-black text-base shadow-lg bg-red-500 hover:bg-red-400 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {punching ? <Loader2 className="h-5 w-5 animate-spin" /> : <><LogOut className="h-5 w-5 mr-2" /> TERMINEI</>}
          </Button>
        </div>

        {inAnotherWork && (
          <p className="text-xs text-amber-300 bg-amber-900/30 border border-amber-500/30 rounded-lg p-2 text-center" data-testid="tech-obra-punch-warning">
            ⚠️ Estás noutra obra em curso — termina lá primeiro para picares aqui.
          </p>
        )}

        {punchesForThisWork.length > 0 && (
          <div className="text-[11px] text-zinc-500 flex flex-wrap gap-x-3 gap-y-1" data-testid="tech-obra-punch-log">
            <span className="text-zinc-400 font-bold uppercase tracking-wider text-[10px]">Hoje aqui:</span>
            {punchesForThisWork.map((p) => (
              <span key={p.id || `${p.action}-${p.at}`} className={p.action === 'in' ? 'text-emerald-400' : 'text-red-400'}>
                {p.action === 'in' ? '→' : '←'} {new Date(p.at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ))}
          </div>
        )}

        {/* CABEÇALHO */}
        <Card className="bg-gradient-to-br from-zinc-900 to-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-yellow-400">
                  <HardHat className="h-4 w-4" />
                  <p className="text-[10px] uppercase tracking-widest font-bold">Obra em curso</p>
                </div>
                <h1 className="text-xl md:text-2xl font-black text-white mt-1">{data.title}</h1>
                {data.client_name && (
                  <p className="text-sm text-zinc-300 flex items-center gap-2 mt-1">
                    <User className="h-3.5 w-3.5 text-zinc-500" /> {data.client_name}
                  </p>
                )}
                {upcoming && (
                  <p className="text-xs text-zinc-400 flex items-center gap-2 mt-1">
                    <CalendarClock className="h-3.5 w-3.5 text-zinc-500" />
                    {new Date(upcoming.date).toLocaleDateString('pt-PT')} · {upcoming.time_start || ''}–{upcoming.time_end || ''}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-3xl md:text-4xl font-black text-white" data-testid="tech-obra-pct">
                  {pct}<span className="text-sm text-zinc-500">%</span>
                </p>
                <p className="text-[10px] text-zinc-500 uppercase">Progresso</p>
              </div>
            </div>
            <Progress value={pct} className="h-2 bg-zinc-800 mt-3" />
            <div className="flex gap-3 mt-2 text-xs">
              <span className="text-emerald-400">● {done} concluídos</span>
              <span className="text-yellow-400">● {inProg} em curso</span>
              <span className="text-zinc-500">● {pending} pendentes</span>
              <span className="text-zinc-500 ml-auto">{total} itens</span>
            </div>
          </CardContent>
        </Card>

        {/* CONTACTO / MORADA — botões grandes para mobile */}
        {(phone || location) && (
          <div className="grid grid-cols-2 gap-2">
            {location && (
              <button
                data-testid="tech-obra-maps"
                onClick={openMaps}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-left hover:border-yellow-500/50 transition-colors"
              >
                <div className="flex items-center gap-2 text-yellow-400 mb-1">
                  <MapPin className="h-4 w-4" />
                  <span className="text-[10px] uppercase tracking-widest font-bold">Google Maps</span>
                </div>
                <p className="text-xs text-white line-clamp-2">{location}</p>
              </button>
            )}
            {phone && (
              <button
                data-testid="tech-obra-call"
                onClick={openCall}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-left hover:border-yellow-500/50 transition-colors"
              >
                <div className="flex items-center gap-2 text-yellow-400 mb-1">
                  <Phone className="h-4 w-4" />
                  <span className="text-[10px] uppercase tracking-widest font-bold">Ligar Cliente</span>
                </div>
                <p className="text-sm text-white font-mono">{phone}</p>
              </button>
            )}
          </div>
        )}

        {/* NOTAS ADMIN */}
        {(data.notes || upcoming?.notes) && (
          <Card className="bg-yellow-500/5 border-yellow-500/30" data-testid="tech-obra-notes">
            <CardContent className="p-3 flex gap-3">
              <StickyNote className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
              <div className="text-xs text-yellow-100 space-y-1">
                {upcoming?.notes && <p><strong className="text-yellow-300">Nota da marcação:</strong> {upcoming.notes}</p>}
                {data.notes && <p><strong className="text-yellow-300">Nota da obra:</strong> {data.notes}</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ACÇÕES RÁPIDAS */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            data-testid="tech-obra-chat"
            onClick={() => nav('/tech/chat')}
            className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs h-10 rounded-xl"
          >
            <MessageSquare className="h-4 w-4 mr-2" /> Falar com Escritório
          </Button>
          <Button
            data-testid="tech-obra-guides"
            onClick={() => nav('/tech')}
            className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs h-10 rounded-xl"
          >
            <PackageIcon className="h-4 w-4 mr-2" /> Guias de Transporte
          </Button>
        </div>

        {/* ITEMS POR CATEGORIA */}
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
            Trabalhos previstos ({total})
          </p>
          {total === 0 && (
            <p className="text-xs text-zinc-500 italic text-center py-6">Esta obra ainda não tem itens.</p>
          )}
          {Object.entries(groupedByCategory).map(([cat, catItems]) => {
            const catDone = catItems.filter(i => i.execution_status === 'done').length;
            return (
              <div key={cat} className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <p className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold">{cat}</p>
                  <span className="text-[10px] text-zinc-500">{catDone} / {catItems.length}</span>
                </div>
                {catItems.map(it => {
                  const s = STATUS[it.execution_status || 'pending'];
                  const qty = Number(it.quantity || 0);
                  const exec = Number(it.executed_quantity || 0);
                  const itemPct = qty > 0 ? Math.min(100, Math.round((exec / qty) * 100)) : 0;
                  return (
                    <div
                      key={it.id}
                      data-testid={`tech-obra-item-${it.id}`}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl p-3"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm text-white font-medium min-w-0 flex-1">{it.name}</p>
                        <Badge className={`${s.badge} border text-[9px] uppercase font-bold shrink-0 whitespace-nowrap`}>
                          <s.Icon className="h-3 w-3 mr-1" /> {s.label}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        <span className="text-white font-mono">{qty}</span> {it.unit || 'un'}
                        {it.execution_status !== 'pending' && (
                          <>
                            <span className="mx-1.5 text-zinc-700">·</span>
                            executado <span className="text-yellow-400 font-mono">{exec}</span> ({itemPct}%)
                          </>
                        )}
                        {it.is_extra && <Badge className="ml-2 bg-yellow-500/15 text-yellow-300 border-yellow-500/40 text-[9px]">EXTRA</Badge>}
                      </p>
                      {itemPct > 0 && (
                        <div className="mt-1.5 h-1 bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full ${s.bar}`} style={{ width: `${itemPct}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-zinc-600 text-center italic py-4">
          Os valores comerciais desta obra são geridos pelo escritório.
        </p>
      </div>
    </TechLayout>
  );
}
