import { useState, useRef } from 'react';
import axios from 'axios';
import { Zap, CheckCircle, AlertCircle, Loader2, Camera, X, Clock, Calendar, MapPin, Phone, Mail, User } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const LOGO_URL = "https://customer-assets.emergentagent.com/job_5fce1f4d-80cf-4626-b6e9-65e04d47c472/artifacts/h167wiyk_Captura%20de%20Tela%202026-03-12%20a%CC%80s%2021.48.12.png";

const SERVICE_TYPES = [
  { value: 'instalacao', label: 'Instalação' },
  { value: 'reparacao', label: 'Reparação' },
  { value: 'manutencao', label: 'Manutenção' },
  { value: 'visita_tecnica', label: 'Visita Técnica' },
  { value: 'certificacao', label: 'Certificação' },
];

export default function WidgetPedidoPage() {
  const [formData, setFormData] = useState({
    client_name: '', email: '', phone: '', address: '',
    description: '', service_type: 'reparacao', preferred_date: '',
  });
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files);
    if (photos.length + files.length > 10) { alert('Máximo de 10 fotos'); return; }
    files.forEach(file => {
      if (file.size > 5 * 1024 * 1024) { alert('Cada foto deve ter menos de 5MB'); return; }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotos(prev => [...prev, { id: Date.now() + Math.random(), data: reader.result, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const orderRes = await axios.post(`${API}/api/service-orders`, {
        ...formData,
        preferred_date: formData.preferred_date || null,
      });
      const orderId = orderRes.data.id;
      for (const photo of photos) {
        try {
          await axios.post(`${API}/api/service-orders/${orderId}/photos/public`, {
            image_data: photo.data, caption: 'Foto enviada pelo cliente',
          });
        } catch { /* continue */ }
      }
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao enviar pedido. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Pedido Enviado!</h2>
          <p className="text-zinc-400 mb-6">Recebemos o seu pedido e entraremos em contacto brevemente.</p>
          <button
            onClick={() => { setSuccess(false); setFormData({ client_name: '', email: '', phone: '', address: '', description: '', service_type: 'reparacao', preferred_date: '' }); setPhotos([]); }}
            className="px-6 py-3 bg-yellow-400 text-zinc-950 font-bold rounded-lg hover:bg-yellow-300"
            data-testid="widget-new-order-btn"
          >
            Novo Pedido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4" data-testid="widget-pedido-page">
      <div className="max-w-lg w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8">
        <div className="flex justify-center mb-6">
          <img src={LOGO_URL} alt="Obelisco Radical" className="h-14 w-auto" style={{ mixBlendMode: 'screen', filter: 'drop-shadow(0 0 8px rgba(250,204,21,0.35))' }} />
        </div>

        <h2 className="text-2xl font-bold text-white text-center mb-1 tracking-tight">Pedir Serviço</h2>
        <p className="text-zinc-500 text-center text-sm mb-8">Preencha o formulário e entraremos em contacto</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 mb-6 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Nome Completo *</label>
            <input name="client_name" value={formData.client_name} onChange={handleChange} placeholder="O seu nome" required
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50" data-testid="widget-name" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Email *</label>
              <input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="seu@email.com" required
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50" data-testid="widget-email" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Telefone *</label>
              <input name="phone" value={formData.phone} onChange={handleChange} placeholder="+351 900 000 000" required
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50" data-testid="widget-phone" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Morada *</label>
            <input name="address" value={formData.address} onChange={handleChange} placeholder="Rua, número, cidade" required
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50" data-testid="widget-address" />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Tipo de Serviço *</label>
            <select name="service_type" value={formData.service_type} onChange={handleChange}
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-yellow-400/50" data-testid="widget-service-type">
              {SERVICE_TYPES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Data Preferida</label>
            <input name="preferred_date" type="datetime-local" value={formData.preferred_date} onChange={handleChange}
              min={new Date(Date.now() + 86400000).toISOString().slice(0, 16)}
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-yellow-400/50" data-testid="widget-date" />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Descrição do Problema *</label>
            <textarea name="description" value={formData.description} onChange={handleChange} placeholder="Descreva o problema ou serviço necessário..." required rows={4}
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50 resize-none" data-testid="widget-description" />
          </div>

          {/* Photos */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Fotos do Problema (opcional)</label>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoSelect} className="hidden" />
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {photos.map(p => (
                  <div key={p.id} className="relative">
                    <img src={p.data} alt="" className="w-full h-20 object-cover rounded border border-zinc-700" />
                    <button type="button" onClick={() => setPhotos(prev => prev.filter(x => x.id !== p.id))} className="absolute top-1 right-1 p-0.5 bg-red-500/80 text-white rounded">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {photos.length < 10 && (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 border border-dashed border-zinc-700 text-zinc-500 hover:border-yellow-400 hover:text-yellow-400 rounded-lg flex items-center justify-center gap-2 transition-colors">
                <Camera size={18} /> {photos.length === 0 ? 'Adicionar Fotos' : `Mais fotos (${10 - photos.length} rest.)`}
              </button>
            )}
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-3 bg-yellow-400 text-zinc-950 font-bold rounded-lg hover:bg-yellow-300 disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="widget-submit-btn">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Zap size={18} /> Enviar Pedido</>}
          </button>
        </form>

        <p className="text-center text-xs text-zinc-600 mt-6">© {new Date().getFullYear()} Obelisco Radical - Eletricidade</p>
      </div>
    </div>
  );
}
