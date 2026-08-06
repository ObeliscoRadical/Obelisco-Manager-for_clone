import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Play, Square, Coffee, Undo2, MapPin, Loader2, AlertCircle, MapPinned } from 'lucide-react';
import { toast } from 'sonner';

const ACTION_LABEL = { in: 'Entrada', out: 'Saída', break_start: 'Início pausa', break_end: 'Fim pausa' };
const ACTION_ICON = { in: Play, out: Square, break_start: Coffee, break_end: Undo2 };
const ACTION_COLOR = { in: 'text-green-500', out: 'text-red-500', break_start: 'text-orange-400', break_end: 'text-blue-400' };

export default function TechPontoPage() {
  const [today, setToday] = useState(null);
  const [week, setWeek] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locationError, setLocationError] = useState('');

  const reload = useCallback(async () => {
    try {
      const [t, w] = await Promise.all([
        api.get('/tech/timesheet/today'),
        api.get('/tech/timesheet/week'),
      ]);
      setToday(t.data);
      setWeek(w.data || []);
    } catch (err) {
      console.debug('[ponto]', err.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const getLocation = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocalização não suportada')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      err => {
        const msgs = { 1: 'Permissão de localização negada. Ative nas definições.', 2: 'Localização indisponível', 3: 'Tempo esgotado' };
        reject(new Error(msgs[err.code] || 'Erro ao obter localização'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

  const punch = async (action) => {
    setSaving(true);
    setLocationError('');
    try {
      // Capture GPS
      const loc = await getLocation();

      // Try to resolve address (optional, non-blocking)
      let address = null;
      try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.latitude}&lon=${loc.longitude}`);
        const geoData = await geoRes.json();
        address = geoData.display_name;
      } catch { /* continue without address */ }

      const { data } = await api.post('/tech/timesheet/punch', {
        action,
        latitude: loc.latitude,
        longitude: loc.longitude,
        address,
      });
      setToday(data);
      toast.success(`${ACTION_LABEL[action]} registada com localização`);
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || 'Erro';
      if (msg.includes('localização') || msg.includes('Permissão') || msg.includes('Geolocalização')) {
        setLocationError(msg);
      }
      toast.error(msg);
    } finally { setSaving(false); }
  };

  const lastAction = today?.punches?.[today.punches.length - 1]?.action;
  const canIn = !lastAction || ['out', 'break_end'].includes(lastAction);
  const canOut = ['in', 'break_end'].includes(lastAction);
  const canBreakStart = lastAction === 'in';
  const canBreakEnd = lastAction === 'break_start';

  if (loading) return (
    <div className="flex items-center justify-center py-24"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
  );

  return (
    <div className="space-y-5" data-testid="tech-ponto-page">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
          <Clock className="h-6 w-6 text-yellow-400" /> Ponto GPS
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Registe entradas, saídas e pausas com localização GPS.</p>
      </div>

      {locationError && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {locationError}
        </div>
      )}

      {/* Hoje */}
      <Card className="bg-gradient-to-br from-yellow-500/10 to-zinc-900 border-yellow-500/40">
        <CardContent className="p-4">
          <p className="text-xs text-zinc-400 uppercase tracking-widest">Hoje</p>
          <p className="text-4xl font-bold text-yellow-400 mt-1" data-testid="ponto-total-today">{today?.total_hours?.toFixed(2) || '0.00'}h</p>
          <p className="text-xs text-zinc-500 mt-1">{(today?.punches || []).length} marcações · GPS activo</p>
        </CardContent>
      </Card>

      {/* Botões grandes */}
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={() => punch('in')} disabled={saving || !canIn} data-testid="ponto-btn-in"
          className="h-16 bg-emerald-500 hover:bg-emerald-400 text-zinc-900 font-bold text-base disabled:opacity-40 disabled:hover:bg-emerald-500">
          {saving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Play className="h-5 w-5 mr-2" />} Entrada
        </Button>
        <Button onClick={() => punch('out')} disabled={saving || !canOut} data-testid="ponto-btn-out"
          className="h-16 bg-red-500 hover:bg-red-400 text-white font-bold text-base disabled:opacity-40 disabled:hover:bg-red-500">
          {saving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Square className="h-5 w-5 mr-2" />} Saída
        </Button>
        <Button onClick={() => punch('break_start')} disabled={saving || !canBreakStart} data-testid="ponto-btn-break-start"
          className="h-14 bg-orange-500 hover:bg-orange-400 text-white font-semibold disabled:opacity-40 disabled:hover:bg-orange-500">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Coffee className="h-4 w-4 mr-2" />} Início pausa
        </Button>
        <Button onClick={() => punch('break_end')} disabled={saving || !canBreakEnd} data-testid="ponto-btn-break-end"
          className="h-14 bg-blue-500 hover:bg-blue-400 text-white font-semibold disabled:opacity-40 disabled:hover:bg-blue-500">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Undo2 className="h-4 w-4 mr-2" />} Fim pausa
        </Button>
      </div>

      <p className="text-xs text-zinc-600 text-center flex items-center justify-center gap-1">
        <MapPinned size={12} /> A sua localização GPS é registada em cada marcação
      </p>

      {/* Marcações de hoje */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <p className="text-xs uppercase tracking-widest text-zinc-500 font-semibold mb-2">Marcações de hoje</p>
          {(today?.punches || []).length === 0 && (
            <p className="text-sm text-zinc-500 italic py-3">Sem marcações. Comece com "Entrada".</p>
          )}
          <div className="space-y-1.5">
            {(today?.punches || []).map(p => {
              const Icon = ACTION_ICON[p.action];
              const color = ACTION_COLOR[p.action] || 'text-yellow-400';
              return (
                <div key={p.id} className="flex items-center justify-between text-sm p-2.5 rounded-lg bg-zinc-950" data-testid={`punch-${p.id}`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {Icon && <Icon className={`h-3.5 w-3.5 ${color} flex-shrink-0`} />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${color}`}>{ACTION_LABEL[p.action]}</span>
                        <span className="font-mono text-xs text-zinc-400">
                          {new Date(p.at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {p.address && (
                        <p className="text-[10px] text-zinc-600 truncate">{p.address}</p>
                      )}
                    </div>
                  </div>
                  {p.latitude && p.longitude && (
                    <a
                      href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-600 hover:text-yellow-400 p-1 flex-shrink-0"
                      title="Ver no mapa"
                    >
                      <MapPin size={14} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Semana */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <p className="text-xs uppercase tracking-widest text-zinc-500 font-semibold mb-2">Últimos 7 dias</p>
          {week.length === 0 && <p className="text-sm text-zinc-500 italic py-2">Sem histórico.</p>}
          {week.map(d => (
            <div key={d.date} className="flex justify-between py-1.5 border-b border-zinc-800 last:border-0 text-sm">
              <span className="text-zinc-300">{new Date(d.date).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
              <span className="font-mono text-yellow-400">{d.total_hours?.toFixed(2) || '0.00'}h</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
