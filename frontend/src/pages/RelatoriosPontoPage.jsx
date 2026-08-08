import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Download, Loader2, MapPin, Radio, Navigation, RefreshCw } from 'lucide-react';
import { TeamGeoMap } from '../components/timeclock/TeamGeoMap';

const API = process.env.REACT_APP_BACKEND_URL;
const todayIso = () => new Date().toISOString().split('T')[0];

export default function RelatoriosPontoPage() {
  const { user, token } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [teamMap, setTeamMap] = useState(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [focusedTechnicianId, setFocusedTechnicianId] = useState('');
  const [tableTechnicianId, setTableTechnicianId] = useState('');
  const [historyDate, setHistoryDate] = useState(todayIso());
  const isAdmin = user?.role === 'admin';

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API}/api/service-orders/timeclock/all?`;
      const today = new Date();
      if (filter === 'today') {
        const d = today.toISOString().split('T')[0];
        url += `start_date=${d}&end_date=${d}`;
      } else if (filter === 'week') {
        const weekAgo = new Date(today - 7 * 86400000);
        url += `start_date=${weekAgo.toISOString().split('T')[0]}&end_date=${today.toISOString().split('T')[0]}`;
      } else if (filter === 'month') {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        url += `start_date=${monthStart.toISOString().split('T')[0]}&end_date=${today.toISOString().split('T')[0]}`;
      } else if (filter === 'custom' && startDate && endDate) {
        url += `start_date=${startDate}&end_date=${endDate}`;
      }
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      setEntries(res.data.entries || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filter, startDate, endDate, token]);

  const fetchTeamMap = useCallback(async () => {
    if (!isAdmin) return;
    setMapLoading(true);
    try {
      const res = await axios.get(`${API}/api/service-orders/timeclock/team-map`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          history_date: historyDate,
          technician_id: focusedTechnicianId || undefined,
        },
      });
      setTeamMap(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setMapLoading(false);
    }
  }, [focusedTechnicianId, historyDate, isAdmin, token]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    fetchTeamMap();
  }, [fetchTeamMap]);

  useEffect(() => {
    if (isAdmin && !focusedTechnicianId && teamMap?.latest_positions?.length) {
      setFocusedTechnicianId(teamMap.latest_positions[0].technician_id);
    }
  }, [focusedTechnicianId, isAdmin, teamMap]);

  useEffect(() => {
    const timer = setInterval(() => {
      fetchEntries();
      fetchTeamMap();
    }, 60000);
    return () => clearInterval(timer);
  }, [fetchEntries, fetchTeamMap]);

  const downloadCSV = () => {
    let url = `${API}/api/service-orders/timeclock/export?`;
    if (startDate && endDate) url += `start_date=${startDate}&end_date=${endDate}`;
    window.open(url, '_blank');
  };

  const visibleEntries = tableTechnicianId
    ? entries.filter(entry => entry.technician_id === tableTechnicianId)
    : entries;

  const latestPositions = teamMap?.latest_positions || [];
  const focusedTrail = teamMap?.history_entries || [];
  const technicians = latestPositions.map(item => ({ id: item.technician_id, name: item.technician_name }));

  return (
    <div className="space-y-6" data-testid="relatorios-ponto-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Relatórios de Ponto</h1>
          <p className="text-sm text-zinc-500 mt-1">Registos de entrada e saída com GPS, mapa da equipa e histórico diário.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={fetchTeamMap} className="flex items-center gap-2 px-4 py-2 border border-zinc-700 bg-zinc-900 text-zinc-300 font-semibold rounded-lg hover:bg-zinc-800" data-testid="refresh-team-map-btn">
            <RefreshCw size={16} className={mapLoading ? 'animate-spin' : ''} /> Atualizar mapa
          </button>
          <button onClick={downloadCSV} className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-zinc-950 font-semibold rounded-lg hover:bg-yellow-300" data-testid="export-csv-btn">
            <Download size={18} /> CSV
          </button>
        </div>
      </div>

      {isAdmin && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div data-testid="team-map-kpi-techs" className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"><p className="text-xs uppercase tracking-wider text-zinc-500">Técnicos no mapa</p><p className="mt-1 text-2xl font-black text-white">{teamMap?.summary?.technicians_count || 0}</p></div>
              <div data-testid="team-map-kpi-active" className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"><p className="text-xs uppercase tracking-wider text-zinc-500">Em serviço</p><p className="mt-1 text-2xl font-black text-emerald-400">{teamMap?.summary?.clocked_in_count || 0}</p></div>
              <div data-testid="team-map-kpi-stale" className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4"><p className="text-xs uppercase tracking-wider text-zinc-500">Posições antigas</p><p className="mt-1 text-2xl font-black text-orange-400">{teamMap?.summary?.stale_count || 0}</p></div>
              <div data-testid="team-map-kpi-history" className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"><p className="text-xs uppercase tracking-wider text-zinc-500">Pontos do dia</p><p className="mt-1 text-2xl font-black text-yellow-400">{teamMap?.summary?.history_points || 0}</p></div>
            </div>

            <TeamGeoMap positions={latestPositions} selectedTechnicianId={focusedTechnicianId} onSelectTechnician={setFocusedTechnicianId} />

            <div data-testid="team-map-trail-panel" className="rounded-[28px] border border-zinc-800 bg-zinc-900/70 p-5">
              <div className="flex items-end gap-3 flex-wrap justify-between mb-4">
                <div>
                  <h2 className="text-white font-black uppercase tracking-wide text-sm">Trilho diário do técnico</h2>
                  <p className="text-xs text-zinc-500 mt-1">Sequência do dia para o técnico selecionado.</p>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">Data do trilho</label>
                  <input data-testid="team-map-history-date" type="date" value={historyDate} onChange={e => setHistoryDate(e.target.value)} className="h-10 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-white" />
                </div>
              </div>
              {focusedTrail.length ? (
                <div className="space-y-3">
                  {focusedTrail.map(item => (
                    <div key={item.id} data-testid={`team-trail-item-${item.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{item.technician_name}</p>
                        <p className="text-xs text-zinc-500">{new Date(item.timestamp).toLocaleString('pt-PT')}</p>
                        <p className="text-xs text-zinc-400 mt-1">{item.address || `${item.latitude?.toFixed(5)}, ${item.longitude?.toFixed(5)}`}</p>
                      </div>
                      <a data-testid={`team-trail-map-link-${item.id}`} href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`} target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:text-yellow-300">
                        <Navigation size={16} />
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6 text-sm text-zinc-500">Selecione um técnico com coordenadas para ver o trilho diário.</div>
              )}
            </div>
          </div>

          <div data-testid="team-map-latest-list" className="rounded-[28px] border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="mb-4 flex items-center gap-2 text-white font-black uppercase tracking-wide text-sm"><Radio size={14} /> Últimas posições</div>
            <div className="space-y-3">
              {latestPositions.length ? latestPositions.map(item => (
                <div
                  key={item.technician_id}
                  data-testid={`team-position-card-${item.technician_id}`}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${focusedTechnicianId === item.technician_id ? 'border-yellow-400/30 bg-yellow-400/5' : 'border-zinc-800 bg-zinc-950/60 hover:bg-zinc-900'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.technician_name}</p>
                      <p className="text-xs text-zinc-500">{item.is_clocked_in ? 'Em serviço' : 'Último registo de saída'}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.is_clocked_in ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>{item.minutes_since_update ?? '—'} min</span>
                  </div>
                  <p className="mt-3 text-xs text-zinc-400">{item.address || `${item.latitude?.toFixed(5)}, ${item.longitude?.toFixed(5)}`}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-500 gap-3">
                    <span>{new Date(item.timestamp).toLocaleString('pt-PT')}</span>
                    <button onClick={() => setFocusedTechnicianId(item.technician_id)} className="rounded-full border border-zinc-700 px-3 py-1 text-zinc-300 hover:border-yellow-400/40 hover:text-yellow-300" data-testid={`focus-team-position-${item.technician_id}`}>Focar</button>
                    <a href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`} target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:text-yellow-300">Abrir mapa</a>
                  </div>
                </div>
              )) : <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6 text-sm text-zinc-500">Sem posições recentes com GPS.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'today', label: 'Hoje' },
            { value: 'week', label: 'Semana' },
            { value: 'month', label: 'Mês' },
            { value: 'custom', label: 'Personalizado' },
          ].map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)} data-testid={`ponto-filter-${f.value}`}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                filter === f.value ? 'bg-yellow-400 text-zinc-950 font-bold' : 'bg-zinc-950 text-zinc-400 border border-zinc-800 hover:text-white'
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {filter === 'custom' && (
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <input data-testid="ponto-start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-yellow-400/50" />
              <input data-testid="ponto-end-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-yellow-400/50" />
            </div>
          )}

          {isAdmin && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">Filtrar tabela por técnico</label>
              <select data-testid="ponto-table-technician-filter" value={tableTechnicianId} onChange={e => setTableTechnicianId(e.target.value)} className="h-10 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-white min-w-[220px]">
                <option value="">Todos os técnicos</option>
                {technicians.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-yellow-400 animate-spin" /></div>
      ) : visibleEntries.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center text-zinc-500">Nenhum registo encontrado</div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-3 px-4 text-zinc-400 text-xs uppercase tracking-wider">Técnico</th>
                  <th className="text-left py-3 px-4 text-zinc-400 text-xs uppercase tracking-wider">Tipo</th>
                  <th className="text-left py-3 px-4 text-zinc-400 text-xs uppercase tracking-wider">Data/Hora</th>
                  <th className="text-left py-3 px-4 text-zinc-400 text-xs uppercase tracking-wider">Local</th>
                  <th className="text-left py-3 px-4 text-zinc-400 text-xs uppercase tracking-wider">Mapa</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map(entry => (
                  <tr key={entry.id} data-testid={`ponto-entry-${entry.id}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="py-3 px-4 text-white text-sm">{entry.technician_name}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${entry.type === 'entrada' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {entry.type === 'entrada' ? 'ENTRADA' : 'SAÍDA'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-300 text-sm">{new Date(entry.timestamp).toLocaleString('pt-PT')}</td>
                    <td className="py-3 px-4 text-zinc-400 text-sm max-w-xs truncate">{entry.address || `${entry.latitude?.toFixed(4)}, ${entry.longitude?.toFixed(4)}`}</td>
                    <td className="py-3 px-4">
                      {entry.latitude && entry.longitude && (
                        <a href={`https://www.google.com/maps?q=${entry.latitude},${entry.longitude}`} target="_blank" rel="noopener noreferrer"
                          className="text-yellow-400 hover:text-yellow-300">
                          <MapPin size={16} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
