import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Search, Users, FileText, HardHat, FileCheck, Zap, Clock, Loader2,
  Receipt, ChevronRight, ChevronDown, Calendar, MapPin, Phone, Mail, TrendingUp, TrendingDown, Wallet
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const STATUS_COLORS = {
  pendente: 'bg-yellow-500/20 text-yellow-400',
  aceite: 'bg-green-500/20 text-green-400',
  rejeitado: 'bg-red-500/20 text-red-400',
  em_progresso: 'bg-blue-500/20 text-blue-400',
  concluido: 'bg-green-500/20 text-green-400',
  orcamento: 'bg-zinc-500/20 text-zinc-400',
  em_curso: 'bg-blue-500/20 text-blue-400',
  finalizada: 'bg-green-500/20 text-green-400',
  cancelada: 'bg-red-500/20 text-red-400',
  paga: 'bg-green-500/20 text-green-400',
  vencida: 'bg-red-500/20 text-red-400',
  vencida_parcial: 'bg-orange-500/20 text-orange-400',
  parcial: 'bg-orange-500/20 text-orange-400',
};

function Badge({ status }) {
  const color = STATUS_COLORS[status] || 'bg-zinc-500/20 text-zinc-400';
  return <span className={`px-2 py-0.5 text-xs font-bold rounded ${color}`}>{status}</span>;
}

function fmt(v) { return typeof v === 'number' ? v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : '—'; }
function fmtDate(d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString('pt-PT'); } catch { return d; } }

export default function PerfilClientePage() {
  const { token } = useAuth();
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    axios.get(`${API}/api/clients`, { headers })
      .then(r => setClients(r.data))
      .catch(() => {})
      .finally(() => setLoadingClients(false));
  }, []);

  const selectClient = async (name) => {
    setSelectedName(name);
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/clients/profile`, { headers, params: { name } });
      setProfile(res.data);
    } catch (err) {
      toast.error('Erro ao carregar perfil');
    } finally {
      setLoading(false);
    }
  };

  const filtered = clients.filter(c => c.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6" data-testid="perfil-cliente-page">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Perfil 360° do Cliente</h1>
        <p className="text-sm text-zinc-500 mt-1">Histórico completo por cliente</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Client List */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-zinc-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                data-testid="client-search-input"
                type="text"
                placeholder="Pesquisar cliente..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50"
              />
            </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto divide-y divide-zinc-800/50">
            {loadingClients ? (
              <div className="p-8 text-center"><Loader2 className="w-6 h-6 text-yellow-400 animate-spin mx-auto" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-sm">Nenhum cliente</div>
            ) : (
              filtered.map(name => (
                <button
                  key={name}
                  data-testid={`client-item-${name.replace(/\s+/g, '-')}`}
                  onClick={() => selectClient(name)}
                  className={`w-full text-left px-4 py-3 hover:bg-zinc-800/50 transition-colors flex items-center justify-between ${
                    selectedName === name ? 'bg-zinc-800 border-l-2 border-yellow-400' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-yellow-400/10 rounded-lg flex items-center justify-center text-yellow-400 text-sm font-bold">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-white truncate max-w-[200px]">{name}</span>
                  </div>
                  <ChevronRight size={14} className="text-zinc-600" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Profile Content */}
        <div>
          {!selectedName ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
              <Users className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-500">Selecione um cliente para ver o perfil completo</p>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-yellow-400 animate-spin" /></div>
          ) : profile ? (
            <ProfileContent profile={profile} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProfileContent({ profile }) {
  const { kpis } = profile;
  const [openSection, setOpenSection] = useState('propostas');

  const toggle = (s) => setOpenSection(openSection === s ? null : s);

  return (
    <div className="space-y-4" data-testid="client-profile-content">
      {/* Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 bg-yellow-400/10 rounded-xl flex items-center justify-center text-yellow-400 text-2xl font-bold">
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white" data-testid="client-profile-name">{profile.name}</h2>
            {profile.nif && <p className="text-sm text-zinc-500">NIF: {profile.nif}</p>}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard label="Faturado" value={fmt(kpis.total_invoiced)} icon={Receipt} color="text-white" testid="kpi-invoiced" />
          <KPICard label="Recebido" value={fmt(kpis.total_received)} icon={Wallet} color="text-green-400" testid="kpi-received" />
          <KPICard label="A Receber" value={fmt(kpis.total_pending)} icon={Clock} color={kpis.total_pending > 0 ? "text-red-400" : "text-zinc-400"} testid="kpi-pending" />
          <KPICard label="Prazo Médio" value={kpis.avg_payment_days != null ? `${kpis.avg_payment_days} dias` : '—'} icon={Calendar} color="text-yellow-400" testid="kpi-avg-days" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <MiniStat label="Propostas" value={kpis.proposals_count} sub={`${kpis.proposals_accepted} aceites`} />
          <MiniStat label="Obras" value={kpis.works_count} />
          <MiniStat label="Faturas" value={kpis.invoices_count} />
          <MiniStat label="Pedidos Serviço" value={kpis.service_orders_count} />
        </div>
      </div>

      {/* Sections */}
      <Section title="Propostas" count={profile.proposals.length} icon={FileText} open={openSection === 'propostas'} onToggle={() => toggle('propostas')}>
        {profile.proposals.length === 0 ? <Empty /> : (
          <div className="divide-y divide-zinc-800/50">
            {profile.proposals.map(p => (
              <div key={p.id} className="py-3 px-1 flex items-center justify-between">
                <div>
                  <p className="text-sm text-white font-medium">{p.title}</p>
                  <p className="text-xs text-zinc-500">{fmtDate(p.created_at)} · {p.tier}</p>
                </div>
                <div className="text-right">
                  <Badge status={p.status} />
                  <p className="text-xs text-zinc-400 mt-1">{fmt(p.total_pvp)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Obras" count={profile.works.length} icon={HardHat} open={openSection === 'obras'} onToggle={() => toggle('obras')}>
        {profile.works.length === 0 ? <Empty /> : (
          <div className="divide-y divide-zinc-800/50">
            {profile.works.map(w => (
              <div key={w.id} className="py-3 px-1 flex items-center justify-between">
                <div>
                  <p className="text-sm text-white font-medium">{w.title}</p>
                  <p className="text-xs text-zinc-500">{fmtDate(w.created_at)}</p>
                </div>
                <Badge status={w.status} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Faturas" count={profile.invoices.length} icon={FileCheck} open={openSection === 'faturas'} onToggle={() => toggle('faturas')}>
        {profile.invoices.length === 0 ? <Empty /> : (
          <div className="divide-y divide-zinc-800/50">
            {profile.invoices.map(inv => {
              const paid = (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
              const balance = (inv.value_total || 0) - paid;
              return (
                <div key={inv.id} className="py-3 px-1 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white font-medium">{inv.number || inv.id?.slice(0, 8)}</p>
                    <p className="text-xs text-zinc-500">{fmtDate(inv.issue_date)} → {fmtDate(inv.due_date)}</p>
                  </div>
                  <div className="text-right">
                    <Badge status={inv.status} />
                    <p className="text-xs text-zinc-400 mt-1">{fmt(inv.value_total)}</p>
                    {balance > 0.01 && <p className="text-xs text-red-400">Falta {fmt(balance)}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Pedidos de Serviço" count={profile.service_orders.length} icon={Zap} open={openSection === 'pedidos'} onToggle={() => toggle('pedidos')}>
        {profile.service_orders.length === 0 ? <Empty /> : (
          <div className="divide-y divide-zinc-800/50">
            {profile.service_orders.map(o => (
              <div key={o.id} className="py-3 px-1 flex items-center justify-between">
                <div>
                  <p className="text-sm text-white font-medium">{o.description?.slice(0, 60)}{o.description?.length > 60 ? '...' : ''}</p>
                  <p className="text-xs text-zinc-500">{fmtDate(o.created_at)} · {o.service_type}</p>
                </div>
                <Badge status={o.status} />
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function KPICard({ label, value, icon: Icon, color, testid }) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-3" data-testid={testid}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-zinc-500" />
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value, sub }) {
  return (
    <div className="bg-zinc-800/30 rounded-lg p-2 text-center">
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
      {sub && <p className="text-xs text-yellow-400">{sub}</p>}
    </div>
  );
}

function Section({ title, count, icon: Icon, open, onToggle, children }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
        <div className="flex items-center gap-3">
          <Icon size={18} className="text-yellow-400" />
          <span className="text-sm font-semibold text-white">{title}</span>
          <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">{count}</span>
        </div>
        <ChevronDown size={16} className={`text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-zinc-500 py-4 text-center">Sem registos</p>;
}
