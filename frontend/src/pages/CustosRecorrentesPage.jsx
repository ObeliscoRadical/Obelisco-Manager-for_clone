import { Fragment, useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Repeat, RefreshCw, Loader2, Pencil, Trash2, Check, X, Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const recurringFactor = (frequency) => (frequency === 'Anual' ? 12 : frequency === 'Trimestral' ? 3 : 1);

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

const TYPE_OPTIONS = ['TRF', 'DD', 'Cartão', 'ATM', 'Outro'];

export default function CustosRecorrentesPage() {
  const [masters, setMasters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [expandedId, setExpandedId] = useState(null);

  const fetch = useCallback(async () => {
    try {
      const { data } = await api.get('/bank-analysis/recurring-consolidated');
      setMasters(data.masters || []);
    } catch (err) { console.debug('[recurring-consolidated]', err?.message); }
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
    setExpandedId(m.id);
    setEditForm({
      description: m.description,
      day_of_month: m.day_of_month,
      category: m.category,
      payment_type: m.payment_type,
      frequency: m.frequency,
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

  const totalMonthly = masters.reduce((s, m) => s + ((m.avg_amount || 0) / recurringFactor(m.frequency)), 0);
  const totalAnnual = masters.reduce((s, m) => s + ((m.avg_amount || 0) * (12 / recurringFactor(m.frequency))), 0);
  const byCategory = {};
  masters.forEach(m => {
    const cat = m.category || 'outro';
    byCategory[cat] = (byCategory[cat] || 0) + ((m.avg_amount || 0) / recurringFactor(m.frequency));
  });

  return (
    <div className="space-y-6" data-testid="custos-recorrentes-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Custos Recorrentes</h1>
          <p className="text-sm text-zinc-500 mt-1">Vista master por contrato, agrupando referências recorrentes pela descrição e/ou NIB/IBAN</p>
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
          <p className="text-xs text-zinc-600 mb-4">Carregue extratos bancários na Análise Bancária e clique &quot;Recalcular&quot; para detetar padrões.</p>
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
                  <th className="text-left py-3 px-3 text-zinc-400 text-[10px] uppercase tracking-wider">Tipo de Pagamento</th>
                  <th className="text-left py-3 px-3 text-zinc-400 text-[10px] uppercase tracking-wider w-24">Recorrência</th>
                  <th className="text-right py-3 px-3 text-zinc-400 text-[10px] uppercase tracking-wider">Valor Médio (€)</th>
                </tr>
              </thead>
              <tbody>
                {masters.map(m => {
                  const cm = catMeta(m.category);
                  const isEditing = editingId === m.id;
                  const isExpanded = expandedId === m.id;

                  return (
                    <Fragment key={m.id}>
                      <tr key={m.id} className="border-b border-zinc-800/30 hover:bg-zinc-800/20" data-testid={`master-row-${m.id}`}>
                        <td className="py-3 px-4">
                          <div className="flex items-start gap-3">
                            <button
                              data-testid={`expand-master-${m.id}`}
                              onClick={() => setExpandedId(isExpanded ? null : m.id)}
                              className="mt-0.5 text-zinc-500 hover:text-white"
                            >
                              {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm text-white font-medium">{m.description}</p>
                                {m.group_reference && <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{m.group_reference}</span>}
                              </div>
                              <p className="text-[10px] text-zinc-600 mt-0.5">{m.occurrences} lançamentos · {m.months_seen} meses · {m.first_date} → {m.last_date}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => startEdit(m)} className="text-zinc-500 hover:text-yellow-400 p-1" title="Editar" data-testid={`edit-master-${m.id}`}>
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => handleDelete(m.id)} className="text-zinc-500 hover:text-red-400 p-1" title="Remover" data-testid={`delete-master-${m.id}`}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs text-zinc-300 font-mono">{m.day_of_month}</td>
                        <td className="py-3 px-3">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: cm.color, background: cm.color + '20' }}>{cm.label}</span>
                        </td>
                        <td className="py-3 px-3 text-xs text-zinc-400 font-semibold">{m.payment_type}</td>
                        <td className="py-3 px-3 text-xs text-zinc-400">{m.frequency}</td>
                        <td className="py-3 px-3 text-right">
                          <span className="text-sm text-red-400 font-mono font-semibold">{fmt(m.avg_amount)}</span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-zinc-800/30 bg-zinc-950/40" data-testid={`expanded-master-${m.id}`}>
                          <td colSpan={6} className="px-4 py-4">
                            {isEditing ? (
                              <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-4 space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-white text-sm focus:border-yellow-400/50 focus:outline-none" />
                                  <input value={editForm.day_of_month} onChange={e => setEditForm({ ...editForm, day_of_month: e.target.value })}
                                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-white text-sm focus:border-yellow-400/50 focus:outline-none" />
                                  <input type="number" step="0.01" value={editForm.avg_amount} onChange={e => setEditForm({ ...editForm, avg_amount: parseFloat(e.target.value) || 0 })}
                                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-white text-sm text-right focus:border-yellow-400/50 focus:outline-none" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <select value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                                    className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-white">
                                    {CAT_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                  </select>
                                  <select value={editForm.payment_type} onChange={e => setEditForm({ ...editForm, payment_type: e.target.value })}
                                    className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-white">
                                    {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                  <select value={editForm.frequency} onChange={e => setEditForm({ ...editForm, frequency: e.target.value })}
                                    className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-white">
                                    {['Mensal', 'Trimestral', 'Anual'].map(freq => <option key={freq} value={freq}>{freq}</option>)}
                                  </select>
                                </div>
                                <input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Observações da linha master"
                                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-white focus:border-yellow-400/50 focus:outline-none" />
                                <div className="flex justify-end gap-2">
                                  <button onClick={saveEdit} className="text-green-400 hover:text-green-300 p-1" title="Guardar"><Check size={16} /></button>
                                  <button onClick={cancelEdit} className="text-zinc-400 hover:text-white p-1" title="Cancelar"><X size={16} /></button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                                    <p className="text-zinc-500 uppercase tracking-wider text-[10px]">Contrato/Ref.</p>
                                    <p className="text-zinc-200 mt-1 break-words">{m.group_reference || 'Descrição normalizada'}</p>
                                  </div>
                                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                                    <p className="text-zinc-500 uppercase tracking-wider text-[10px]">Recorrência inferida</p>
                                    <p className="text-zinc-200 mt-1">{m.frequency}</p>
                                  </div>
                                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                                    <p className="text-zinc-500 uppercase tracking-wider text-[10px]">Faixa de valores</p>
                                    <p className="text-zinc-200 mt-1">{fmt(m.min_amount)} → {fmt(m.max_amount)}</p>
                                  </div>
                                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                                    <p className="text-zinc-500 uppercase tracking-wider text-[10px]">Observações</p>
                                    <p className="text-zinc-200 mt-1">{m.notes || '—'}</p>
                                  </div>
                                </div>
                                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
                                  <div className="px-4 py-3 border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">Lançamentos agrupados</div>
                                  <div className="divide-y divide-zinc-800/60">
                                    {(m.detail_transactions || []).map((tx, idx) => (
                                      <div key={`${tx.id || tx.date}-${idx}`} className="grid grid-cols-1 md:grid-cols-[100px_1fr_120px_90px] gap-3 px-4 py-3 text-xs" data-testid={`detail-transaction-${m.id}-${idx}`}>
                                        <span className="text-zinc-400">{tx.date}</span>
                                        <span className="text-zinc-200 break-words">{tx.description}</span>
                                        <span className="text-zinc-400 font-medium">{tx.payment_type}</span>
                                        <span className="text-right text-zinc-300 font-mono">{fmt(tx.amount)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-700 bg-zinc-800/30">
                  <td colSpan={5} className="py-3 px-4 text-sm text-zinc-300 font-semibold">Total Mensal Estimado</td>
                  <td className="py-3 px-3 text-right text-sm text-red-400 font-mono font-bold">{fmt(totalMonthly)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
