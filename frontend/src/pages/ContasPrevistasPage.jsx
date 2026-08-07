import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Calendar, Plus, Pencil, Trash2, Loader2, X, Check, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

const CAT_OPTIONS = [
  { value: 'fixo', label: 'Custo Fixo', color: '#3B82F6' },
  { value: 'variavel', label: 'Custo Variável', color: '#F59E0B' },
  { value: 'obra', label: 'Custo de Obra', color: '#FACC15' },
  { value: 'imposto', label: 'Imposto', color: '#EF4444' },
  { value: 'financeiro', label: 'Financeiro', color: '#64748B' },
  { value: 'outro', label: 'Outro', color: '#71717A' },
];
const FREQ_OPTIONS = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'anual', label: 'Anual' },
];

const catMeta = (key) => CAT_OPTIONS.find(c => c.value === key) || CAT_OPTIONS[5];

const emptyForm = { title: '', date: '', amount: 0, category: 'fixo', frequency: 'mensal' };

export default function ContasPrevistasPage() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchBills = useCallback(async () => {
    try {
      const { data } = await api.get('/bank-analysis/predicted-bills/list');
      setBills(data);
    } catch { }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  const openNew = () => { setEditingId(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (b) => {
    setEditingId(b.id);
    setForm({
      title: b.title || '',
      date: b.date || '',
      amount: b.predicted_amount || 0,
      category: b.predicted_category || 'outro',
      frequency: b.predicted_frequency || b.notes?.match(/mensal|trimestral|anual/)?.[0] || 'mensal',
    });
    setShowForm(true);
  };
  const cancel = () => { setShowForm(false); setEditingId(null); setForm(emptyForm); };

  const handleSave = async () => {
    if (!form.title.trim() || !form.date) { toast.error('Título e data são obrigatórios'); return; }
    setSaving(true);
    try {
      if (editingId) {
        const { data } = await api.patch(`/bank-analysis/predicted-bills/${editingId}`, form);
        setBills(prev => prev.map(b => b.id === editingId ? data : b));
        toast.success('Conta prevista atualizada');
      } else {
        const { data } = await api.post('/bank-analysis/predicted-bills', form);
        setBills(prev => [...prev, data].sort((a, b) => a.date?.localeCompare(b.date)));
        toast.success('Conta prevista criada');
      }
      cancel();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro ao guardar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar esta conta prevista?')) return;
    try {
      await api.delete(`/bank-analysis/predicted-bills/${id}`);
      setBills(prev => prev.filter(b => b.id !== id));
      toast.success('Eliminada');
    } catch { toast.error('Erro ao eliminar'); }
  };

  const total = bills.reduce((s, b) => s + (b.predicted_amount || 0), 0);
  const byMonth = {};
  bills.forEach(b => {
    const m = (b.date || '').slice(0, 7);
    if (m) byMonth[m] = (byMonth[m] || 0) + (b.predicted_amount || 0);
  });

  return (
    <div className="space-y-6" data-testid="contas-previstas-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Contas Previstas</h1>
          <p className="text-sm text-zinc-500 mt-1">Pagamentos recorrentes previstos no calendário</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/agenda" className="flex items-center gap-2 px-4 py-2 text-sm bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors">
            <Calendar size={14} /> Ver Agenda
          </a>
          <button
            data-testid="new-bill-btn"
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-zinc-950 font-semibold rounded-lg hover:bg-yellow-300 text-sm"
          >
            <Plus size={16} /> Nova Conta
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Total Previsto</p>
          <p className="text-xl font-bold text-yellow-400 mt-1">{fmt(total)}</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Contas Ativas</p>
          <p className="text-xl font-bold text-white mt-1">{bills.length}</p>
        </div>
        {Object.entries(byMonth).slice(0, 2).map(([m, v]) => (
          <div key={m} className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">{m}</p>
            <p className="text-xl font-bold text-blue-400 mt-1">{fmt(v)}</p>
          </div>
        ))}
      </div>

      {/* Form (Create/Edit) */}
      {showForm && (
        <div className="p-5 rounded-xl border border-yellow-400/30 bg-yellow-400/5" data-testid="bill-form">
          <h3 className="text-sm font-semibold text-yellow-400 mb-4">{editingId ? 'Editar Conta Prevista' : 'Nova Conta Prevista'}</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-zinc-400">Título / Descrição</label>
              <input data-testid="bill-title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Ex: Vodafone Comunicações" className="w-full mt-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-yellow-400/50 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-zinc-400">Data</label>
              <input data-testid="bill-date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-yellow-400/50 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-zinc-400">Valor Estimado</label>
              <input data-testid="bill-amount" type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                className="w-full mt-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-yellow-400/50 focus:outline-none" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-zinc-400">Categoria</label>
                <select data-testid="bill-category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm">
                  {CAT_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <div className="w-40">
              <label className="text-xs text-zinc-400">Frequência</label>
              <select data-testid="bill-frequency" value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm">
                {FREQ_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="flex-1" />
            <button onClick={cancel} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">Cancelar</button>
            <button data-testid="save-bill-btn" onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-yellow-400 text-zinc-950 font-semibold rounded-lg hover:bg-yellow-300 text-sm disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {editingId ? 'Atualizar' : 'Criar'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-yellow-400 animate-spin" /></div>
      ) : bills.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <Calendar className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-500 mb-2">Nenhuma conta prevista</p>
          <p className="text-xs text-zinc-600">Carregue um extrato bancário ou crie manualmente.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden" data-testid="bills-table">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-3 px-4 text-zinc-400 text-xs uppercase tracking-wider">Data</th>
                  <th className="text-left py-3 px-4 text-zinc-400 text-xs uppercase tracking-wider">Descrição</th>
                  <th className="text-left py-3 px-4 text-zinc-400 text-xs uppercase tracking-wider">Categoria</th>
                  <th className="text-left py-3 px-4 text-zinc-400 text-xs uppercase tracking-wider">Frequência</th>
                  <th className="text-right py-3 px-4 text-zinc-400 text-xs uppercase tracking-wider">Valor</th>
                  <th className="text-right py-3 px-4 text-zinc-400 text-xs uppercase tracking-wider w-24">Ações</th>
                </tr>
              </thead>
              <tbody>
                {bills.map(b => {
                  const cm = catMeta(b.predicted_category);
                  const freq = b.predicted_frequency || b.notes?.match(/mensal|trimestral|anual/)?.[0] || '—';
                  const isPast = b.date && b.date < new Date().toISOString().slice(0, 10);
                  return (
                    <tr key={b.id} className={`border-b border-zinc-800/30 hover:bg-zinc-800/20 ${isPast ? 'opacity-50' : ''}`} data-testid={`bill-row-${b.id}`}>
                      <td className="py-3 px-4 text-zinc-300 text-sm font-mono">{b.date || '—'}</td>
                      <td className="py-3 px-4 text-white text-sm max-w-xs truncate">{b.title}</td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: cm.color, background: cm.color + '20' }}>
                          {cm.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-zinc-400 capitalize">{freq}</td>
                      <td className="py-3 px-4 text-right text-sm text-red-400 font-mono font-semibold">{fmt(b.predicted_amount || 0)}</td>
                      <td className="py-3 px-4 text-right">
                        <button onClick={() => openEdit(b)} className="text-zinc-500 hover:text-yellow-400 p-1 mr-1" title="Editar" data-testid={`edit-bill-${b.id}`}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(b.id)} className="text-zinc-500 hover:text-red-400 p-1" title="Eliminar" data-testid={`delete-bill-${b.id}`}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
