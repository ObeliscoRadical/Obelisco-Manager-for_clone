import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Repeat, RefreshCw, Loader2, Pencil, Trash2, Check, X, Calendar, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

const CAT_OPTIONS = [
  { value: 'fixo', label: 'Custo Fixo', color: '#3B82F6' },
  { value: 'variavel', label: 'Custo Variável', color: '#F59E0B' },
  { value: 'obra', label: 'Custo de Obra', color: '#FACC15' },
  { value: 'receita', label: 'Receita', color: '#22C55E' },
  { value: 'imposto', label: 'Imposto', color: '#EF4444' },
  { value: 'salario', label: 'Salário', color: '#8B5CF6' },
  { value: 'financeiro', label: 'Financeiro', color: '#64748B' },
  { value: 'outro', label: 'Outro', color: '#71717A' },
];
const catMeta = (key) => CAT_OPTIONS.find(c => c.value === key) || CAT_OPTIONS[7];

const TYPE_OPTIONS = ['Débito Direto', 'Transferência', 'Compra Cartão', 'Levantamento ATM', 'Outro'];

export default function CustosRecorrentesPage() {
  const [masters, setMasters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const fetch = useCallback(async () => {
    try {
      const { data } = await api.get('/bank-analysis/recurring-consolidated');
      setMasters(data.masters || []);
    } catch { }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data } = await api.post('/bank-analysis/recurring-consolidated/refresh');
      setMasters(data.masters || []);
      toast.success(`${(data.masters || []).length} custos recorrentes consolidados`);
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
    finally { setRefreshing(false); }
  };

  const startEdit = (m) => {
    setEditingId(m.id);
    setEditForm({
      description: m.description,
      category: m.category,
      payment_type: m.payment_type,
      avg_amount: m.avg_amount,
      notes: m.notes || '',
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); };

  const saveEdit = async () => {
    try {
      const { data } = await api.patch(`/bank-analysis/recurring-consolidated/${editingId}`, editForm);
      setMasters(prev => prev.map(m => m.id === editingId ? data : m));
      toast.success('Atualizado');
      setEditingId(null);
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remover este custo recorrente da lista?')) return;
    try {
      await api.delete(`/bank-analysis/recurring-consolidated/${id}`);
      setMasters(prev => prev.filter(m => m.id !== id));
      toast.success('Removido');
    } catch { toast.error('Erro'); }
  };

  const totalMonthly = masters.reduce((s, m) => s + (m.avg_amount || 0), 0);
  const totalAnnual = totalMonthly * 12;
  const byCategory = {};
  masters.forEach(m => {
    const cat = m.category || 'outro';
    byCategory[cat] = (byCategory[cat] || 0) + (m.avg_amount || 0);
  });

  return (
    <div className="space-y-6" data-testid="custos-recorrentes-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Custos Recorrentes</h1>
          <p className="text-sm text-zinc-500 mt-1">Mapeamento consolidado de compromissos mensais a partir dos extratos bancários</p>
        </div>
        <div className="flex items-center gap-2">
          <button data-testid="refresh-btn" onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-700 disabled:opacity-50">
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {refreshing ? 'A recalcular...' : 'Recalcular'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Compromisso Mensal</p>
          <p className="text-xl font-bold text-red-400 mt-1">{fmt(totalMonthly)}</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Projeção Anual</p>
          <p className="text-xl font-bold text-red-400 mt-1">{fmt(totalAnnual)}</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Custos Identificados</p>
          <p className="text-xl font-bold text-white mt-1">{masters.length}</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Categorias</p>
          <p className="text-xl font-bold text-white mt-1">{Object.keys(byCategory).length}</p>
        </div>
      </div>

      {/* Category breakdown */}
      {Object.keys(byCategory).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, val]) => {
            const cm = catMeta(cat);
            return (
              <div key={cat} className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: cm.color }}>{cm.label}</p>
                <p className="text-sm font-bold text-white mt-0.5">{fmt(val)}<span className="text-zinc-500 text-[10px] font-normal">/mês</span></p>
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-yellow-400 animate-spin" /></div>
      ) : masters.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <Repeat className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-500 mb-2">Nenhum custo recorrente consolidado</p>
          <p className="text-xs text-zinc-600 mb-4">Carregue extratos bancários na Análise Bancária e clique "Recalcular" para detetar padrões.</p>
          <button onClick={handleRefresh} disabled={refreshing} className="px-4 py-2 bg-yellow-400 text-zinc-950 font-semibold rounded-lg text-sm hover:bg-yellow-300">
            {refreshing ? 'A calcular...' : 'Consolidar Agora'}
          </button>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden" data-testid="masters-table">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-3 px-4 text-zinc-400 text-[10px] uppercase tracking-wider">Descrição do Pagamento</th>
                  <th className="text-left py-3 px-3 text-zinc-400 text-[10px] uppercase tracking-wider w-20">Dia do Mês</th>
                  <th className="text-left py-3 px-3 text-zinc-400 text-[10px] uppercase tracking-wider">Categoria</th>
                  <th className="text-left py-3 px-3 text-zinc-400 text-[10px] uppercase tracking-wider">Modelo</th>
                  <th className="text-left py-3 px-3 text-zinc-400 text-[10px] uppercase tracking-wider w-20">Recorrência</th>
                  <th className="text-right py-3 px-3 text-zinc-400 text-[10px] uppercase tracking-wider">Valor/Mês</th>
                  <th className="text-left py-3 px-3 text-zinc-400 text-[10px] uppercase tracking-wider">Observações</th>
                  <th className="text-right py-3 px-3 text-zinc-400 text-[10px] uppercase tracking-wider w-20">Ações</th>
                </tr>
              </thead>
              <tbody>
                {masters.map(m => {
                  const cm = catMeta(m.category);
                  const isEditing = editingId === m.id;

                  if (isEditing) {
                    return (
                      <tr key={m.id} className="border-b border-zinc-800/30 bg-yellow-400/5">
                        <td className="py-2 px-4">
                          <input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                            className="w-full px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-white text-sm focus:border-yellow-400/50 focus:outline-none" />
                        </td>
                        <td className="py-2 px-3 text-xs text-zinc-400">{m.day_of_month}</td>
                        <td className="py-2 px-3">
                          <select value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                            className="px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-xs text-white">
                            {CAT_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <select value={editForm.payment_type} onChange={e => setEditForm({ ...editForm, payment_type: e.target.value })}
                            className="px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-xs text-white">
                            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="py-2 px-3 text-xs text-zinc-400">{m.frequency}</td>
                        <td className="py-2 px-3">
                          <input type="number" step="0.01" value={editForm.avg_amount} onChange={e => setEditForm({ ...editForm, avg_amount: parseFloat(e.target.value) || 0 })}
                            className="w-24 px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-sm text-white text-right focus:border-yellow-400/50 focus:outline-none" />
                        </td>
                        <td className="py-2 px-3">
                          <input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Observações..."
                            className="w-full px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-xs text-white focus:border-yellow-400/50 focus:outline-none" />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button onClick={saveEdit} className="text-green-400 hover:text-green-300 p-1" title="Guardar"><Check size={14} /></button>
                          <button onClick={cancelEdit} className="text-zinc-400 hover:text-white p-1" title="Cancelar"><X size={14} /></button>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={m.id} className="border-b border-zinc-800/30 hover:bg-zinc-800/20" data-testid={`master-row-${m.id}`}>
                      <td className="py-3 px-4">
                        <p className="text-sm text-white">{m.description}</p>
                        <p className="text-[10px] text-zinc-600 mt-0.5">{m.occurrences}x em {m.months_seen} meses · {m.first_date} → {m.last_date}</p>
                      </td>
                      <td className="py-3 px-3 text-xs text-zinc-300 font-mono">{m.day_of_month}</td>
                      <td className="py-3 px-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: cm.color, background: cm.color + '20' }}>{cm.label}</span>
                      </td>
                      <td className="py-3 px-3 text-xs text-zinc-400">{m.payment_type}</td>
                      <td className="py-3 px-3 text-xs text-zinc-400">{m.frequency}</td>
                      <td className="py-3 px-3 text-right">
                        <span className="text-sm text-red-400 font-mono font-semibold">{fmt(m.avg_amount)}</span>
                        {!m.amount_consistent && (
                          <p className="text-[10px] text-zinc-500">{fmt(m.min_amount)} - {fmt(m.max_amount)}</p>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs text-zinc-500 max-w-[150px] truncate">{m.notes || '—'}</td>
                      <td className="py-3 px-3 text-right">
                        <button onClick={() => startEdit(m)} className="text-zinc-500 hover:text-yellow-400 p-1" title="Editar" data-testid={`edit-master-${m.id}`}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(m.id)} className="text-zinc-500 hover:text-red-400 p-1" title="Remover" data-testid={`delete-master-${m.id}`}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-700 bg-zinc-800/30">
                  <td colSpan={5} className="py-3 px-4 text-sm text-zinc-300 font-semibold">Total Mensal Estimado</td>
                  <td className="py-3 px-3 text-right text-sm text-red-400 font-mono font-bold">{fmt(totalMonthly)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
