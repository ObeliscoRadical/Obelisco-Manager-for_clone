import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Clock, MapPin, CheckCircle, Loader2, AlertCircle, LogIn, LogOut as LogOutIcon, MapPinned
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

export default function PontoGPSPage() {
  const { user, token } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [todayEntries, setTodayEntries] = useState([]);
  const headers = { Authorization: `Bearer ${token}` };
  const isAdmin = user?.role === 'admin';

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API}/api/service-orders/timeclock/my-status`, { headers });
      setStatus(res.data);
      setTodayEntries(res.data.today_entries || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllToday = async () => {
    if (!isAdmin) return;
    try {
      const res = await axios.get(`${API}/api/service-orders/timeclock/today`, { headers });
      setTodayEntries(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchStatus();
    if (isAdmin) fetchAllToday();
  }, []);

  const getLocation = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocalização não suportada')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      err => {
        const msgs = { 1: 'Permissão de localização negada', 2: 'Localização indisponível', 3: 'Tempo esgotado' };
        reject(new Error(msgs[err.code] || 'Erro ao obter localização'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

  const registerClock = async (type) => {
    setRegistering(true);
    setLocationError('');
    try {
      const loc = await getLocation();
      let address = null;
      try {
        const geo = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.latitude}&lon=${loc.longitude}`);
        const data = await geo.json();
        address = data.display_name;
      } catch { /* optional */ }

      await axios.post(`${API}/api/service-orders/timeclock`, {
        type, latitude: loc.latitude, longitude: loc.longitude, address,
      }, { headers });

      toast.success(`${type === 'entrada' ? 'Entrada' : 'Saída'} registada`);
      await fetchStatus();
      if (isAdmin) await fetchAllToday();
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Erro';
      setLocationError(msg);
    } finally {
      setRegistering(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-yellow-400 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="ponto-gps-page">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Registo de Ponto (GPS)</h1>
        <p className="text-sm text-zinc-500 mt-1">Registar entrada e saída com localização</p>
      </div>

      {locationError && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {locationError}
        </div>
      )}

      {/* Status Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 flex items-center justify-center rounded-lg ${status?.is_clocked_in ? 'bg-green-500/10 border border-green-500/30' : 'bg-zinc-800 border border-zinc-700'}`}>
              {status?.is_clocked_in ? <CheckCircle className="w-6 h-6 text-green-500" /> : <Clock className="w-6 h-6 text-zinc-500" />}
            </div>
            <div>
              <p className="text-lg font-bold text-white">{status?.is_clocked_in ? 'EM SERVIÇO' : 'FORA DE SERVIÇO'}</p>
              <p className="text-sm text-zinc-500">
                {status?.last_entry ? `Último: ${new Date(status.last_entry.timestamp).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}` : 'Nenhum registo hoje'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => registerClock('entrada')} disabled={registering || status?.is_clocked_in}
            className={`py-4 flex flex-col items-center justify-center gap-2 rounded-xl transition-all ${
              status?.is_clocked_in ? 'bg-zinc-800 border border-zinc-700 text-zinc-600 cursor-not-allowed' : 'bg-green-500/10 border border-green-500/30 text-green-500 hover:bg-green-500/20'
            }`} data-testid="gps-clock-in-btn">
            {registering ? <Loader2 className="w-8 h-8 animate-spin" /> : <><LogIn className="w-8 h-8" /><span className="text-lg font-bold">ENTRADA</span></>}
          </button>
          <button onClick={() => registerClock('saida')} disabled={registering || !status?.is_clocked_in}
            className={`py-4 flex flex-col items-center justify-center gap-2 rounded-xl transition-all ${
              !status?.is_clocked_in ? 'bg-zinc-800 border border-zinc-700 text-zinc-600 cursor-not-allowed' : 'bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500/20'
            }`} data-testid="gps-clock-out-btn">
            {registering ? <Loader2 className="w-8 h-8 animate-spin" /> : <><LogOutIcon className="w-8 h-8" /><span className="text-lg font-bold">SAÍDA</span></>}
          </button>
        </div>

        <p className="text-xs text-zinc-600 text-center mt-4 flex items-center justify-center gap-1">
          <MapPinned size={12} /> A sua localização GPS será registada automaticamente
        </p>
      </div>

      {/* Today Entries */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="p-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            {isAdmin ? 'Registos de hoje (todos)' : 'Meus registos de hoje'}
          </h3>
        </div>
        {todayEntries.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">Nenhum registo hoje</div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {todayEntries.map(entry => (
              <div key={entry.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${entry.type === 'entrada' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                    {entry.type === 'entrada' ? <LogIn className="w-5 h-5 text-green-500" /> : <LogOutIcon className="w-5 h-5 text-red-500" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold uppercase text-xs ${entry.type === 'entrada' ? 'text-green-500' : 'text-red-500'}`}>{entry.type}</span>
                      <span className="text-white text-sm font-mono">{new Date(entry.timestamp).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {isAdmin && <p className="text-xs text-zinc-500">{entry.technician_name}</p>}
                    {entry.address && <p className="text-xs text-zinc-600 truncate max-w-xs">{entry.address}</p>}
                  </div>
                </div>
                {entry.latitude && entry.longitude && (
                  <a href={`https://www.google.com/maps?q=${entry.latitude},${entry.longitude}`} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-yellow-400 p-2">
                    <MapPin size={18} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
