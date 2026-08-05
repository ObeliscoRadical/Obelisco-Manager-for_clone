import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Download, Loader2, Clock, MapPin, LogIn, LogOut as LogOutIcon } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function RelatoriosPontoPage() {
  const { user, token } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchEntries();
  }, [filter, startDate, endDate]);

  const fetchEntries = async () => {
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
      const res = await axios.get(url, { headers });
      setEntries(res.data.entries || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    let url = `${API}/api/service-orders/timeclock/export?`;
    if (startDate && endDate) url += `start_date=${startDate}&end_date=${endDate}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6" data-testid="relatorios-ponto-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Relatórios de Ponto</h1>
          <p className="text-sm text-zinc-500 mt-1">Registos de entrada e saída com GPS</p>
        </div>
        <button onClick={downloadCSV} className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-zinc-950 font-semibold rounded-lg hover:bg-yellow-300" data-testid="export-csv-btn">
          <Download size={18} /> CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {[
          { value: 'today', label: 'Hoje' },
          { value: 'week', label: 'Semana' },
          { value: 'month', label: 'Mês' },
          { value: 'custom', label: 'Personalizado' },
        ].map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)} data-testid={`ponto-filter-${f.value}`}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              filter === f.value ? 'bg-yellow-400 text-zinc-950 font-bold' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {filter === 'custom' && (
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-yellow-400/50" />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-yellow-400/50" />
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-yellow-400 animate-spin" /></div>
      ) : entries.length === 0 ? (
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
                {entries.map(entry => (
                  <tr key={entry.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
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
