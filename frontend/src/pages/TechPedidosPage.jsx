import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import TechLayout from '../components/TechLayout';
import {
  ClipboardList, Search, Clock, MapPin, Phone, UserCheck, ChevronRight,
  Loader2, AlertCircle, CheckCircle, Send, Trash2, Camera, X, Calendar, Zap
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const SERVICE_TYPES = [
  { value: 'instalacao', label: 'Instalação', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'reparacao', label: 'Reparação', color: 'bg-orange-500/20 text-orange-400' },
  { value: 'manutencao', label: 'Manutenção', color: 'bg-green-500/20 text-green-400' },
  { value: 'visita_tecnica', label: 'Visita Técnica', color: 'bg-purple-500/20 text-purple-400' },
  { value: 'certificacao', label: 'Certificação', color: 'bg-cyan-500/20 text-cyan-400' },
];
const STATUS_MAP = {
  pendente: { label: 'Pendente', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  em_progresso: { label: 'Em Progresso', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  concluido: { label: 'Concluído', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
};

function ServiceBadge({ type }) {
  const st = SERVICE_TYPES.find(s => s.value === type);
  if (!st) return null;
  return <span className={`px-2 py-0.5 text-xs font-bold rounded ${st.color}`}>{st.label}</span>;
}
function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.pendente;
  return <span className={`px-2 py-0.5 text-xs font-bold border rounded ${s.color}`}>{s.label}</span>;
}

export default function TechPedidosPage() {
  const { user, token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const headers = { Authorization: `Bearer ${token}` };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const res = await axios.get(`${API}/api/service-orders`, { headers, params });
      setOrders(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filter, token]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  if (selectedId) {
    return <TechOrderDetail orderId={selectedId} onBack={() => { setSelectedId(null); fetchOrders(); }} />;
  }

  return (
    <TechLayout>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6" data-testid="tech-pedidos-page">
        <div>
          <h1 className="text-xl font-bold">Pedidos de Serviço</h1>
          <p className="text-sm text-zinc-500">{user?.name}</p>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ v: 'all', l: 'Todos' }, { v: 'pendente', l: 'Pendentes' }, { v: 'em_progresso', l: 'Em Progresso' }, { v: 'concluido', l: 'Concluídos' }].map(f => (
            <button key={f.v} onClick={() => setFilter(f.v)} className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap ${
              filter === f.v ? 'bg-yellow-400 text-zinc-950 font-bold' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
            }`}>{f.l}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-yellow-400 animate-spin" /></div>
        ) : orders.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
            Nenhum pedido encontrado
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(order => (
              <div key={order.id} onClick={() => setSelectedId(order.id)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 active:bg-zinc-800/70 cursor-pointer" data-testid={`tech-order-${order.id}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-white">{order.client_name}</span>
                      <ServiceBadge type={order.service_type} />
                    </div>
                    <p className="text-xs text-zinc-400 line-clamp-1">{order.description}</p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 mt-2">
                  <span className="flex items-center gap-1"><MapPin size={12} /> {order.address?.split(',')[0]}</span>
                  <span className="flex items-center gap-1"><Phone size={12} /> {order.phone}</span>
                  <span className="flex items-center gap-1"><Clock size={12} /> {new Date(order.created_at).toLocaleDateString('pt-PT')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TechLayout>
  );
}

/* Detail for tech */
function TechOrderDetail({ orderId, onBack }) {
  const { user, token } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const headers = { Authorization: `Bearer ${token}` };
  const fileInputRef = useRef(null);

  const fetchOrder = async () => {
    try {
      const res = await axios.get(`${API}/api/service-orders/${orderId}`, { headers });
      setOrder(res.data);
    } catch { toast.error('Erro'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchOrder(); }, [orderId]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    try {
      await axios.post(`${API}/api/service-orders/${orderId}/notes`, { text: newNote }, { headers });
      setNewNote('');
      fetchOrder();
    } catch { toast.error('Erro'); }
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file || file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        await axios.post(`${API}/api/service-orders/${orderId}/photos`, { image_data: reader.result, caption: '' }, { headers });
        fetchOrder();
      } catch { toast.error('Erro'); }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) return <TechLayout><div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-yellow-400 animate-spin" /></div></TechLayout>;
  if (!order) return <TechLayout><div className="text-center py-20 text-zinc-500">Não encontrado</div></TechLayout>;

  const st = SERVICE_TYPES.find(s => s.value === order.service_type);

  return (
    <TechLayout>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4" data-testid="tech-order-detail">
        <button onClick={onBack} className="text-zinc-500 hover:text-white flex items-center gap-1 text-sm">
          <ChevronRight size={16} className="rotate-180" /> Voltar
        </button>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-lg font-bold text-white">{order.client_name}</h2>
            <ServiceBadge type={order.service_type} />
            <StatusBadge status={order.status} />
          </div>
          <div className="space-y-1 text-sm text-zinc-400">
            <a href={`tel:${order.phone}`} className="flex items-center gap-2 hover:text-yellow-400"><Phone size={14} /> {order.phone}</a>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-yellow-400">
              <MapPin size={14} /> {order.address}
            </a>
            {order.preferred_date && <div className="flex items-center gap-2 text-yellow-400"><Calendar size={14} /> {new Date(order.preferred_date).toLocaleString('pt-PT')}</div>}
          </div>
          <div className="mt-3 p-3 bg-zinc-800/50 rounded-lg">
            <p className="text-sm text-zinc-300 whitespace-pre-wrap">{order.description}</p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2">
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.address)}`} target="_blank" rel="noopener noreferrer"
            className="flex-1 py-3 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center justify-center gap-2 text-blue-400 text-sm font-medium">
            <MapPin size={16} /> Navegar
          </a>
          <a href={`tel:${order.phone}`}
            className="flex-1 py-3 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center justify-center gap-2 text-green-400 text-sm font-medium">
            <Phone size={16} /> Ligar
          </a>
        </div>

        {/* Notes */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Notas ({order.notes?.length || 0})</h3>
          {order.notes?.map(n => (
            <div key={n.id} className="bg-zinc-800/50 rounded-lg p-2 mb-2">
              <div className="flex justify-between text-xs mb-1"><span className="text-yellow-400">{n.created_by_name}</span><span className="text-zinc-600">{new Date(n.created_at).toLocaleString('pt-PT')}</span></div>
              <p className="text-sm text-zinc-300">{n.text}</p>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()}
              placeholder="Nota..." className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50" />
            <button onClick={addNote} className="px-3 py-2 bg-yellow-400 text-zinc-950 rounded-lg"><Send size={16} /></button>
          </div>
        </div>

        {/* Photos */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Fotos ({order.photos?.length || 0})</h3>
          {order.photos?.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {order.photos.map(p => <img key={p.id} src={p.image_data} alt="" className="w-full h-24 object-cover rounded border border-zinc-700" />)}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={uploadPhoto} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="w-full py-2 border border-dashed border-zinc-700 text-zinc-500 hover:border-yellow-400 hover:text-yellow-400 rounded-lg flex items-center justify-center gap-2 text-sm">
            <Camera size={16} /> Tirar Foto
          </button>
        </div>
      </div>
    </TechLayout>
  );
}
