import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, Search, Filter, Plus, Clock, MapPin, Phone, Mail,
  User, UserCheck, ChevronRight, Loader2, AlertCircle, CheckCircle,
  Send, Trash2, Edit2, Camera, Image, X, MessageSquare, Calendar
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

function ServiceTypeBadge({ type }) {
  const st = SERVICE_TYPES.find(s => s.value === type);
  if (!st) return null;
  return <span className={`px-2 py-0.5 text-xs font-bold ${st.color}`}>{st.label}</span>;
}

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.pendente;
  return <span className={`px-3 py-1 text-xs font-bold border ${s.color}`}>{s.label}</span>;
}

export default function PedidosServicoPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState('list'); // list | detail | new
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const headers = { Authorization: `Bearer ${token}` };
  const isAdmin = user?.role === 'admin';

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordersRes, statsRes] = await Promise.all([
        axios.get(`${API}/api/service-orders`, { headers, params: filter !== 'all' ? { status: filter } : {} }),
        axios.get(`${API}/api/service-orders/dashboard/stats`, { headers }),
      ]);
      setOrders(ordersRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [filter]);

  const filteredOrders = orders.filter(o =>
    o.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (view === 'detail' && selectedOrder) {
    return <OrderDetail orderId={selectedOrder} onBack={() => { setView('list'); setSelectedOrder(null); fetchData(); }} />;
  }
  if (view === 'new') {
    return <NewOrderForm onBack={() => { setView('list'); fetchData(); }} />;
  }

  return (
    <div className="space-y-6" data-testid="pedidos-servico-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Pedidos de Serviço</h1>
          <p className="text-sm text-zinc-500 mt-1">Gestão de pedidos de clientes</p>
        </div>
        {isAdmin && (
          <button
            data-testid="new-service-order-btn"
            onClick={() => setView('new')}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-zinc-950 font-semibold rounded-lg hover:bg-yellow-300 transition-colors"
          >
            <Plus size={18} /> Novo Pedido
          </button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: stats.total_orders, color: 'text-white' },
            { label: 'Pendentes', value: stats.pending_orders, color: 'text-yellow-400' },
            { label: 'Em Progresso', value: stats.in_progress_orders, color: 'text-blue-400' },
            { label: 'Concluídos', value: stats.completed_orders, color: 'text-green-400' },
          ].map(s => (
            <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4" data-testid={`stat-${s.label.toLowerCase()}`}>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">{s.label}</p>
              <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            data-testid="search-service-orders"
            type="text"
            placeholder="Pesquisar pedidos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { value: 'all', label: 'Todos' },
            { value: 'pendente', label: 'Pendentes' },
            { value: 'em_progresso', label: 'Em Progresso' },
            { value: 'concluido', label: 'Concluídos' },
          ].map(f => (
            <button
              key={f.value}
              data-testid={`filter-${f.value}`}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                filter === f.value
                  ? 'bg-yellow-400 text-zinc-950 font-bold'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 text-yellow-400 animate-spin" /></div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <ClipboardList className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-500">Nenhum pedido encontrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map(order => (
            <div
              key={order.id}
              data-testid={`order-card-${order.id}`}
              onClick={() => { setSelectedOrder(order.id); setView('detail'); }}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 cursor-pointer hover:border-yellow-400/30 transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-medium text-white">{order.client_name}</h3>
                    <ServiceTypeBadge type={order.service_type} />
                  </div>
                  <p className="text-sm text-zinc-400 line-clamp-1">{order.description}</p>
                </div>
                <StatusBadge status={order.status} />
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500 mt-2">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-yellow-400 transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <MapPin size={14} /> {order.address}
                </a>
                <span className="flex items-center gap-1"><Phone size={14} /> {order.phone}</span>
                <span className="flex items-center gap-1"><Clock size={14} /> {new Date(order.created_at).toLocaleDateString('pt-PT')}</span>
                {order.assigned_technician_name && (
                  <span className="flex items-center gap-1 text-yellow-400"><UserCheck size={14} /> {order.assigned_technician_name}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Order Detail ────────────────────────────────────────────────── */
function OrderDetail({ orderId, onBack }) {
  const { user, token } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [technicians, setTechnicians] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const headers = { Authorization: `Bearer ${token}` };
  const isAdmin = user?.role === 'admin';
  const fileInputRef = useRef(null);

  const fetchOrder = async () => {
    try {
      const [orderRes, techRes] = await Promise.all([
        axios.get(`${API}/api/service-orders/${orderId}`, { headers }),
        axios.get(`${API}/api/service-orders/helpers/technicians`, { headers }).catch(() => ({ data: [] })),
      ]);
      setOrder(orderRes.data);
      setTechnicians(techRes.data);
    } catch (err) {
      toast.error('Erro ao carregar pedido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrder(); }, [orderId]);

  const updateStatus = async (status) => {
    try {
      await axios.patch(`${API}/api/service-orders/${orderId}`, { status }, { headers });
      toast.success('Estado atualizado');
      fetchOrder();
    } catch (err) {
      toast.error('Erro ao atualizar');
    }
  };

  const assignTechnician = async (techId, techName) => {
    try {
      await axios.put(`${API}/api/service-orders/${orderId}/reassign?technician_id=${techId}&technician_name=${encodeURIComponent(techName)}`, {}, { headers });
      toast.success(`Atribuído a ${techName}`);
      fetchOrder();
    } catch (err) {
      toast.error('Erro ao atribuir');
    }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/service-orders/${orderId}/notes`, { text: newNote }, { headers });
      setNewNote('');
      toast.success('Nota adicionada');
      fetchOrder();
    } catch (err) {
      toast.error('Erro ao adicionar nota');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteNote = async (noteId) => {
    try {
      await axios.delete(`${API}/api/service-orders/${orderId}/notes/${noteId}`, { headers });
      toast.success('Nota apagada');
      fetchOrder();
    } catch (err) {
      toast.error('Erro ao apagar nota');
    }
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Máximo 5MB'); return; }
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        await axios.post(`${API}/api/service-orders/${orderId}/photos`, { image_data: reader.result, caption: '' }, { headers });
        toast.success('Foto adicionada');
        fetchOrder();
      } catch (err) {
        toast.error('Erro ao enviar foto');
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const deletePhoto = async (photoId) => {
    try {
      await axios.delete(`${API}/api/service-orders/${orderId}/photos/${photoId}`, { headers });
      toast.success('Foto apagada');
      fetchOrder();
    } catch (err) {
      toast.error('Erro');
    }
  };

  const deleteOrder = async () => {
    if (!window.confirm('Apagar este pedido?')) return;
    try {
      await axios.delete(`${API}/api/service-orders/${orderId}`, { headers });
      toast.success('Pedido apagado');
      onBack();
    } catch (err) {
      toast.error('Erro ao apagar');
    }
  };

  // PDF generation for completed orders
  const generatePDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF();

    doc.setFillColor(9, 9, 11);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setFillColor(250, 204, 21);
    doc.rect(0, 38, 210, 2, 'F');

    doc.setTextColor(250, 204, 21);
    doc.setFontSize(20);
    doc.text('OBELISCO RADICAL', 15, 20);
    doc.setFontSize(10);
    doc.setTextColor(180, 180, 180);
    doc.text('RELATÓRIO DE SERVIÇO', 15, 30);

    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    let y = 52;
    doc.text(`Nº Relatório: ${order.id.slice(0, 8).toUpperCase()}`, 15, y);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-PT')}`, 140, y);
    y += 12;

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('DADOS DO CLIENTE', 15, y); y += 8;
    doc.setFontSize(10);
    doc.text(`Nome: ${order.client_name}`, 15, y); y += 6;
    doc.text(`Telefone: ${order.phone}`, 15, y); y += 6;
    doc.text(`Email: ${order.email}`, 15, y); y += 6;
    doc.text(`Morada: ${order.address}`, 15, y); y += 10;

    doc.setFontSize(12);
    doc.text('DETALHES DO SERVIÇO', 15, y); y += 8;
    doc.setFontSize(10);
    const st = SERVICE_TYPES.find(s => s.value === order.service_type);
    doc.text(`Tipo: ${st?.label || order.service_type}`, 15, y); y += 6;
    if (order.assigned_technician_name) {
      doc.text(`Técnico: ${order.assigned_technician_name}`, 15, y); y += 6;
    }
    doc.text(`Criado: ${new Date(order.created_at).toLocaleDateString('pt-PT')}`, 15, y); y += 6;
    if (order.status === 'concluido') {
      doc.text(`Concluído: ${new Date(order.updated_at).toLocaleDateString('pt-PT')}`, 15, y); y += 6;
    }
    y += 4;

    doc.setFontSize(12);
    doc.text('DESCRIÇÃO', 15, y); y += 8;
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(order.description, 180);
    doc.text(lines, 15, y); y += lines.length * 5 + 6;

    if (order.notes?.length > 0) {
      doc.setFontSize(12);
      doc.text('NOTAS', 15, y); y += 4;
      doc.autoTable({
        startY: y,
        head: [['Data', 'Autor', 'Nota']],
        body: order.notes.map(n => [
          new Date(n.created_at).toLocaleDateString('pt-PT'),
          n.created_by_name,
          n.text,
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [9, 9, 11], textColor: [250, 204, 21] },
      });
    }

    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Obelisco Radical - Eletricidade | ${window.location.origin}`, 15, 285);

    doc.save(`Relatorio_${order.client_name.replace(/\s+/g, '_')}_${order.id.slice(0, 8)}.pdf`);
    toast.success('PDF gerado');
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-yellow-400 animate-spin" /></div>;
  if (!order) return <div className="text-zinc-500 text-center py-20">Pedido não encontrado</div>;

  return (
    <div className="space-y-6" data-testid="order-detail-page">
      <button onClick={onBack} className="text-zinc-500 hover:text-white flex items-center gap-2 transition-colors">
        <ChevronRight className="w-4 h-4 rotate-180" /> Voltar aos Pedidos
      </button>

      {/* Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">{order.client_name}</h2>
              <ServiceTypeBadge type={order.service_type} />
              <StatusBadge status={order.status} />
            </div>
            <p className="text-sm text-zinc-500 mt-1">ID: {order.id.slice(0, 8).toUpperCase()}</p>
          </div>
          {isAdmin && (
            <button onClick={deleteOrder} className="text-zinc-600 hover:text-red-400 p-2" data-testid="delete-order-btn">
              <Trash2 size={18} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2 text-zinc-400"><Phone size={16} /> <a href={`tel:${order.phone}`} className="hover:text-yellow-400">{order.phone}</a></div>
          <div className="flex items-center gap-2 text-zinc-400"><Mail size={16} /> <a href={`mailto:${order.email}`} className="hover:text-yellow-400">{order.email}</a></div>
          <div className="flex items-center gap-2 text-zinc-400">
            <MapPin size={16} />
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`} target="_blank" rel="noopener noreferrer" className="hover:text-yellow-400">{order.address}</a>
          </div>
          <div className="flex items-center gap-2 text-zinc-400"><Clock size={16} /> {new Date(order.created_at).toLocaleString('pt-PT')}</div>
        </div>

        {order.preferred_date && (
          <div className="mt-3 flex items-center gap-2 text-yellow-400 text-sm">
            <Calendar size={16} /> Data preferida: {new Date(order.preferred_date).toLocaleString('pt-PT')}
          </div>
        )}

        <div className="mt-4 p-3 bg-zinc-800/50 rounded-lg">
          <p className="text-sm text-zinc-300 whitespace-pre-wrap">{order.description}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {isAdmin && order.status !== 'concluido' && (
          <>
            {order.status === 'pendente' && (
              <button onClick={() => updateStatus('em_progresso')} className="px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-sm font-medium hover:bg-blue-500/30" data-testid="status-progress-btn">
                Iniciar Progresso
              </button>
            )}
            <button onClick={() => updateStatus('concluido')} className="px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-sm font-medium hover:bg-green-500/30" data-testid="status-complete-btn">
              Marcar Concluído
            </button>
          </>
        )}
        {order.status === 'concluido' && (
          <button onClick={generatePDF} className="px-4 py-2 bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 rounded-lg text-sm font-medium hover:bg-yellow-400/30" data-testid="generate-pdf-btn">
            Gerar PDF do Relatório
          </button>
        )}
      </div>

      {/* Assign technician */}
      {isAdmin && technicians.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Atribuir Técnico</h3>
          <div className="flex flex-wrap gap-2">
            {technicians.map(t => (
              <button
                key={t.id}
                onClick={() => assignTechnician(t.id, t.name)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  order.assigned_technician_id === t.id
                    ? 'bg-yellow-400 text-zinc-950 border-yellow-400 font-bold'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-yellow-400/50'
                }`}
                data-testid={`assign-tech-${t.id}`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Notas ({order.notes?.length || 0})</h3>
        {order.notes?.length > 0 && (
          <div className="space-y-3 mb-4">
            {order.notes.map(note => (
              <div key={note.id} className="bg-zinc-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-yellow-400 font-medium">{note.created_by_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-600">{new Date(note.created_at).toLocaleString('pt-PT')}</span>
                    <button onClick={() => deleteNote(note.id)} className="text-zinc-600 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </div>
                <p className="text-sm text-zinc-300">{note.text}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            data-testid="note-input"
            type="text"
            placeholder="Escrever nota..."
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addNote()}
            className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50"
          />
          <button onClick={addNote} disabled={submitting || !newNote.trim()} className="px-4 py-2 bg-yellow-400 text-zinc-950 rounded-lg font-medium disabled:opacity-50" data-testid="add-note-btn">
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>

      {/* Photos */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Fotos ({order.photos?.length || 0})</h3>
        {order.photos?.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {order.photos.map(photo => (
              <div key={photo.id} className="relative group">
                <img src={photo.image_data} alt={photo.caption || 'Foto'} className="w-full h-32 object-cover rounded-lg border border-zinc-700" />
                <button
                  onClick={() => deletePhoto(photo.id)}
                  className="absolute top-1 right-1 p-1 bg-red-500/80 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={14} />
                </button>
                {photo.caption && <p className="text-xs text-zinc-500 mt-1 truncate">{photo.caption}</p>}
              </div>
            ))}
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={uploadPhoto} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-3 border border-dashed border-zinc-700 text-zinc-500 hover:border-yellow-400 hover:text-yellow-400 rounded-lg flex items-center justify-center gap-2 transition-colors"
          data-testid="upload-photo-btn"
        >
          <Camera size={18} /> Adicionar Foto
        </button>
      </div>
    </div>
  );
}

/* ─── New Order Form ──────────────────────────────────────────────── */
function NewOrderForm({ onBack }) {
  const { token } = useAuth();
  const [formData, setFormData] = useState({
    client_name: '', email: '', phone: '', address: '',
    description: '', service_type: 'reparacao', preferred_date: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await axios.post(`${API}/api/service-orders/admin`, formData, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Pedido criado');
      onBack();
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao criar pedido');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl" data-testid="new-order-form">
      <button onClick={onBack} className="text-zinc-500 hover:text-white flex items-center gap-2 mb-6 transition-colors">
        <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
      </button>
      <h1 className="text-2xl font-bold text-white mb-6">Novo Pedido de Serviço</h1>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 mb-6 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-yellow-400 uppercase tracking-wider">Dados do Cliente</h3>
          <input name="client_name" value={formData.client_name} onChange={handleChange} placeholder="Nome completo *" required
            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50" data-testid="new-order-name" />
          <div className="grid grid-cols-2 gap-4">
            <input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="Email *" required
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50" data-testid="new-order-email" />
            <input name="phone" value={formData.phone} onChange={handleChange} placeholder="Telefone *" required
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50" data-testid="new-order-phone" />
          </div>
          <input name="address" value={formData.address} onChange={handleChange} placeholder="Morada *" required
            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50" data-testid="new-order-address" />
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-yellow-400 uppercase tracking-wider">Detalhes do Serviço</h3>
          <select name="service_type" value={formData.service_type} onChange={handleChange}
            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-yellow-400/50" data-testid="new-order-service-type">
            {SERVICE_TYPES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
          </select>
          <input name="preferred_date" type="datetime-local" value={formData.preferred_date} onChange={handleChange}
            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-yellow-400/50" data-testid="new-order-date" />
          <textarea name="description" value={formData.description} onChange={handleChange} placeholder="Descrição do problema/serviço *" required rows={4}
            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50 resize-none" data-testid="new-order-description" />
        </div>

        <button type="submit" disabled={loading} className="w-full py-3 bg-yellow-400 text-zinc-950 font-bold rounded-lg hover:bg-yellow-300 disabled:opacity-50 flex items-center justify-center gap-2" data-testid="submit-order-btn">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Plus size={18} /> Criar Pedido</>}
        </button>
      </form>
    </div>
  );
}
