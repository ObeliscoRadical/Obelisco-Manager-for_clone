import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, CheckCircle2, RotateCcw, AlertTriangle, Clock, Repeat, ListChecks, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const CATEGORIES = ['Renda', 'Telecomunicações', 'Energia', 'Água', 'Combustível', 'Software/SaaS', 'Seguros', 'Contabilidade', 'Manutenção', 'Outros'];
const METHODS = ['Transferência', 'Débito Direto', 'MB Way', 'Multibanco', 'Numerário', 'Cheque'];

const emptyTemplate = {
  name: '', category: 'Outros', supplier: '', nif: '',
  expected_amount: 0, due_day: 1, payment_method: 'Transferência',
  notes: '', active: true,
};

export default function CustosFixosPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [tab, setTab] = useState('mes');     // 'mes' | 'modelos'
  const [templates, setTemplates] = useState([]);
  const [data, setData] = useState(null);    // { items, summary }
  const [loading, setLoading] = useState(true);

  const [tplDialog, setTplDialog] = useState({ open: false, editing: null });
  const [tplForm, setTplForm] = useState(emptyTemplate);
  const [payDialog, setPayDialog] = useState({ open: false, instance: null });
  const [payForm, setPayForm] = useState({ paid_date: '', paid_amount: 0, payment_method: 'Transferência', invoice_number: '', notes: '' });

  const fetchAll = useCallback(async () => {
    try {
      const [tplRes, instRes] = await Promise.all([
        api.get('/fixed-costs/templates'),
        api.get('/fixed-costs/instances', { params: { year, month } }),
      ]);
      setTemplates(tplRes.data);
      setData(instRes.data);
    } catch (err) {
      console.debug('[fixed-costs] fetch failed:', err?.message);
      toast.error('Erro ao carregar custos fixos');
    } finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ----- TEMPLATES -----
  const openNewTpl = () => { setTplDialog({ open: true, editing: null }); setTplForm(emptyTemplate); };
  const openEditTpl = (t) => { setTplDialog({ open: true, editing: t }); setTplForm({ ...emptyTemplate, ...t }); };

  const saveTpl = async () => {
    if (!tplForm.name.trim()) { toast.error('Nome é obrigatório'); return; }
    if (!tplForm.expected_amount || tplForm.expected_amount <= 0) { toast.error('Valor previsto inválido'); return; }
    try {
      if (tplDialog.editing) {
        await api.put(`/fixed-costs/templates/${tplDialog.editing.id}`, tplForm);
        toast.success('Modelo atualizado');
      } else {
        await api.post('/fixed-costs/templates', tplForm);
        toast.success('Modelo criado');
      }
      setTplDialog({ open: false, editing: null });
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  const deleteTpl = async (id) => {
    if (!window.confirm('Eliminar este modelo? (instâncias mensais geradas a partir dele permanecem)')) return;
    try {
      await api.delete(`/fixed-costs/templates/${id}`);
      toast.success('Modelo eliminado'); fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  // ----- INSTANCES -----
  const generateMonth = async () => {
    try {
      const { data: r } = await api.post(`/fixed-costs/generate?year=${year}&month=${month}`);
      if (r.created > 0) toast.success(`${r.created} novo(s) custo(s) fixo(s) adicionado(s) ao mês`);
      else toast.info('Sem novos custos fixos para gerar — todos os modelos activos já têm instância');
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  const openPay = (inst) => {
    setPayDialog({ open: true, instance: inst });
    setPayForm({
      paid_date: new Date().toISOString().slice(0, 10),
      paid_amount: inst.expected_amount,
      payment_method: inst.payment_method_default || 'Transferência',
      invoice_number: '',
      notes: '',
    });
  };

  const submitPay = async () => {
    if (!payDialog.instance) return;
    if (!payForm.paid_amount || payForm.paid_amount <= 0) { toast.error('Valor inválido'); return; }
    try {
      await api.post(`/fixed-costs/instances/${payDialog.instance.id}/pay`, payForm);
      toast.success('Pagamento registado e despesa criada');
      setPayDialog({ open: false, instance: null });
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  const unpay = async (inst) => {
    if (!window.confirm('Reverter pagamento? A despesa associada será eliminada.')) return;
    try {
      await api.post(`/fixed-costs/instances/${inst.id}/unpay`);
      toast.success('Pagamento revertido');
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  const deleteInstance = async (inst) => {
    if (!window.confirm('Eliminar esta linha? Se já estava paga, a despesa associada também será removida.')) return;
    try {
      await api.delete(`/fixed-costs/instances/${inst.id}`);
      toast.success('Eliminado');
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const s = data?.summary || {};
  const items = data?.items || [];

  return (
    <div data-testid="custos-fixos" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Custos Fixos</h1>
          <p className="text-zinc-400 mt-1 font-medium">Renda, telecomunicações, seguros — controlo de pagamento mensal</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-800">
        <button data-testid="tab-mes" onClick={() => setTab('mes')} className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${tab === 'mes' ? 'border-yellow-400 text-yellow-400' : 'border-transparent text-zinc-400 hover:text-white'}`}>
          <ListChecks size={14} className="inline mr-2" /> Pagamentos do mês
        </button>
        <button data-testid="tab-modelos" onClick={() => setTab('modelos')} className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${tab === 'modelos' ? 'border-yellow-400 text-yellow-400' : 'border-transparent text-zinc-400 hover:text-white'}`}>
          <Repeat size={14} className="inline mr-2" /> Modelos ({templates.length})
        </button>
      </div>

      {tab === 'mes' && (
        <>
          {/* Filtros + ações */}
          <div className="flex flex-wrap items-end gap-3 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
            <div>
              <Label className="text-[10px] text-zinc-500 uppercase tracking-wider">Ano</Label>
              <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm min-w-[100px]">
                {[year + 1, year, year - 1, year - 2].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-[10px] text-zinc-500 uppercase tracking-wider">Mês</Label>
              <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm min-w-[140px]">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="flex-1" />
            <Button data-testid="generate-month-btn" onClick={generateMonth} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
              <RefreshCw size={14} className="mr-2" /> Gerar custos do mês
            </Button>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div data-testid="kpi-previsto" className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
              <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium">Previsto {MONTHS[month - 1]}</p>
              <p className="text-2xl font-black text-white mt-1">{formatEuro(s.previsto)}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">{s.count_total} custos fixos</p>
            </div>
            <div className="p-4 rounded-2xl bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/30">
              <p className="text-xs uppercase tracking-wider text-green-400/80 font-medium flex items-center gap-1"><CheckCircle2 size={12} /> Pago</p>
              <p className="text-2xl font-black text-green-400 mt-1">{formatEuro(s.pago)}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">{s.count_pago} de {s.count_total}</p>
            </div>
            <div className="p-4 rounded-2xl bg-gradient-to-br from-yellow-400/10 to-yellow-400/5 border border-yellow-400/30">
              <p className="text-xs uppercase tracking-wider text-yellow-400/80 font-medium flex items-center gap-1"><Clock size={12} /> Pendente</p>
              <p className="text-2xl font-black text-yellow-400 mt-1">{formatEuro(s.pendente)}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">{s.count_pendente} por pagar</p>
            </div>
            <div className="p-4 rounded-2xl bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/30">
              <p className="text-xs uppercase tracking-wider text-red-400/80 font-medium flex items-center gap-1"><AlertTriangle size={12} /> Atrasado</p>
              <p className="text-2xl font-black text-red-400 mt-1">{formatEuro(s.atrasado)}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">{s.count_atrasado} em atraso</p>
            </div>
          </div>

          {/* Lista */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Estado</TableHead>
                  <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Custo</TableHead>
                  <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Categoria</TableHead>
                  <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Vencimento</TableHead>
                  <TableHead className="text-zinc-400 text-xs uppercase tracking-wider text-right">Previsto</TableHead>
                  <TableHead className="text-zinc-400 text-xs uppercase tracking-wider text-right">Pago</TableHead>
                  <TableHead className="text-zinc-400 text-xs uppercase tracking-wider text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-zinc-500 py-8">
                      Nenhum custo fixo neste mês. Cria modelos no separador acima e clica em &quot;Gerar custos do mês&quot;.
                    </TableCell>
                  </TableRow>
                ) : items.map(it => {
                  const overdue = it.status === 'atrasado';
                  const paid = it.status === 'pago';
                  const diff = paid ? (it.paid_amount || 0) - it.expected_amount : 0;
                  return (
                    <TableRow key={it.id} className="border-zinc-800/50 hover:bg-zinc-800/30">
                      <TableCell>
                        {paid && <Badge className="bg-green-500/20 text-green-400 border-0"><CheckCircle2 size={10} className="mr-1" /> Pago</Badge>}
                        {overdue && <Badge className="bg-red-500/20 text-red-400 border-0"><AlertTriangle size={10} className="mr-1" /> Atrasado {it.days_overdue}d</Badge>}
                        {it.status === 'pendente' && <Badge className="bg-yellow-400/20 text-yellow-400 border-0"><Clock size={10} className="mr-1" /> Pendente</Badge>}
                      </TableCell>
                      <TableCell className="text-white font-medium text-sm">
                        {it.name}
                        {it.supplier && <p className="text-[10px] text-zinc-500">{it.supplier}</p>}
                      </TableCell>
                      <TableCell className="text-zinc-400 text-xs">{it.category}</TableCell>
                      <TableCell className="text-zinc-300 text-sm">{it.due_date}</TableCell>
                      <TableCell className="text-right text-zinc-300 text-sm">{formatEuro(it.expected_amount)}</TableCell>
                      <TableCell className="text-right text-sm">
                        {paid ? (
                          <div>
                            <span className="text-green-400 font-bold">{formatEuro(it.paid_amount)}</span>
                            {Math.abs(diff) > 0.01 && (
                              <p className={`text-[10px] ${diff > 0 ? 'text-orange-400' : 'text-blue-400'}`}>
                                {diff > 0 ? '+' : ''}{formatEuro(diff)} vs previsto
                              </p>
                            )}
                            <p className="text-[10px] text-zinc-500">{it.paid_date} · {it.payment_method}</p>
                          </div>
                        ) : <span className="text-zinc-600">—</span>}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {!paid && (
                          <button data-testid={`pay-${it.id}`} onClick={() => openPay(it)} className="inline-flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-full text-xs font-semibold mr-1">
                            <CheckCircle2 size={12} /> Marcar pago
                          </button>
                        )}
                        {paid && (
                          <button onClick={() => unpay(it)} className="text-zinc-400 hover:text-orange-400 p-1.5 rounded-md hover:bg-zinc-800 mr-1" title="Reverter pagamento"><RotateCcw size={14} /></button>
                        )}
                        <button onClick={() => deleteInstance(it)} className="text-zinc-400 hover:text-red-400 p-1.5 rounded-md hover:bg-zinc-800" title="Eliminar"><Trash2 size={14} /></button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {tab === 'modelos' && (
        <>
          <div className="flex justify-end">
            <Button data-testid="new-template-btn" onClick={openNewTpl} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
              <Plus size={18} className="mr-2" /> Novo Modelo
            </Button>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Nome</TableHead>
                  <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Categoria</TableHead>
                  <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Fornecedor</TableHead>
                  <TableHead className="text-zinc-400 text-xs uppercase tracking-wider text-center">Dia venc.</TableHead>
                  <TableHead className="text-zinc-400 text-xs uppercase tracking-wider text-right">Valor previsto</TableHead>
                  <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Estado</TableHead>
                  <TableHead className="text-zinc-400 text-xs uppercase tracking-wider text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-zinc-500 py-8">Sem modelos. Clica em &quot;Novo Modelo&quot; para começar.</TableCell></TableRow>
                ) : templates.map(t => (
                  <TableRow key={t.id} className="border-zinc-800/50 hover:bg-zinc-800/30">
                    <TableCell className="text-white font-medium">{t.name}</TableCell>
                    <TableCell className="text-zinc-400 text-xs">{t.category}</TableCell>
                    <TableCell className="text-zinc-300 text-sm">{t.supplier || <span className="text-zinc-600 italic">—</span>}</TableCell>
                    <TableCell className="text-center text-zinc-300 text-sm">{t.due_day}</TableCell>
                    <TableCell className="text-right text-yellow-400 font-semibold">{formatEuro(t.expected_amount)}</TableCell>
                    <TableCell>
                      {t.active
                        ? <Badge className="bg-green-500/20 text-green-400 border-0">Ativo</Badge>
                        : <Badge className="bg-zinc-700 text-zinc-400 border-0">Inativo</Badge>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <button onClick={() => openEditTpl(t)} className="text-zinc-400 hover:text-yellow-400 p-1.5 rounded-md hover:bg-zinc-800 mr-1"><Pencil size={14} /></button>
                      <button onClick={() => deleteTpl(t.id)} className="text-zinc-400 hover:text-red-400 p-1.5 rounded-md hover:bg-zinc-800"><Trash2 size={14} /></button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Dialog: Modelo */}
      <Dialog open={tplDialog.open} onOpenChange={(o) => !o && setTplDialog({ open: false, editing: null })}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase text-white">{tplDialog.editing ? 'Editar' : 'Novo'} Modelo</DialogTitle>
            <DialogDescription className="text-zinc-500">Custo fixo recorrente que se repete todos os meses</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label className="text-zinc-400 text-xs">Nome *</Label><Input value={tplForm.name} onChange={e => setTplForm({ ...tplForm, name: e.target.value })} placeholder="Ex: Renda escritório" className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div>
              <Label className="text-zinc-400 text-xs">Categoria</Label>
              <select value={tplForm.category} onChange={e => setTplForm({ ...tplForm, category: e.target.value })} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><Label className="text-zinc-400 text-xs">Dia de vencimento (1-28) *</Label><Input type="number" min="1" max="28" value={tplForm.due_day} onChange={e => setTplForm({ ...tplForm, due_day: parseInt(e.target.value) || 1 })} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Fornecedor</Label><Input value={tplForm.supplier} onChange={e => setTplForm({ ...tplForm, supplier: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">NIF</Label><Input value={tplForm.nif} onChange={e => setTplForm({ ...tplForm, nif: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Valor previsto (€) *</Label><Input type="number" step="0.01" min="0" value={tplForm.expected_amount} onChange={e => setTplForm({ ...tplForm, expected_amount: parseFloat(e.target.value) || 0 })} className="bg-zinc-900 border-zinc-700 text-white mt-1 font-bold" /></div>
            <div>
              <Label className="text-zinc-400 text-xs">Método pagamento</Label>
              <select value={tplForm.payment_method} onChange={e => setTplForm({ ...tplForm, payment_method: e.target.value })} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="col-span-2"><Label className="text-zinc-400 text-xs">Notas</Label><Input value={tplForm.notes} onChange={e => setTplForm({ ...tplForm, notes: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div className="col-span-2 flex items-center gap-2">
              <input id="tpl-active" type="checkbox" checked={tplForm.active} onChange={e => setTplForm({ ...tplForm, active: e.target.checked })} className="h-4 w-4 accent-yellow-400" />
              <Label htmlFor="tpl-active" className="text-zinc-300 text-xs">Activo (gera instâncias mensais)</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setTplDialog({ open: false, editing: null })} className="border-zinc-700 text-zinc-300">Cancelar</Button>
            <Button data-testid="save-template-btn" onClick={saveTpl} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-semibold">{tplDialog.editing ? 'Guardar' : 'Criar'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Marcar como pago */}
      <Dialog open={payDialog.open} onOpenChange={(o) => !o && setPayDialog({ open: false, instance: null })}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-white">Marcar Pago · {payDialog.instance?.name}</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Vencimento: {payDialog.instance?.due_date} · Previsto: <span className="text-yellow-400 font-bold">{formatEuro(payDialog.instance?.expected_amount)}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-zinc-400 text-xs">Data pagamento *</Label><Input type="date" value={payForm.paid_date} onChange={e => setPayForm({ ...payForm, paid_date: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Valor pago (€) *</Label><Input data-testid="paid-amount" type="number" step="0.01" value={payForm.paid_amount} onChange={e => setPayForm({ ...payForm, paid_amount: parseFloat(e.target.value) || 0 })} className="bg-zinc-900 border-zinc-700 text-white mt-1 font-bold" /></div>
            <div className="col-span-2">
              <Label className="text-zinc-400 text-xs">Método</Label>
              <select value={payForm.payment_method} onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="col-span-2"><Label className="text-zinc-400 text-xs">Nº fatura (opcional)</Label><Input value={payForm.invoice_number} onChange={e => setPayForm({ ...payForm, invoice_number: e.target.value })} placeholder="Ex: FT 2026/1234" className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div className="col-span-2"><Label className="text-zinc-400 text-xs">Notas</Label><Input value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} placeholder="Opcional" className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          </div>
          <div className="text-xs text-zinc-500 italic">
            Será criada automaticamente uma despesa correspondente nas Despesas, do tipo &quot;fixo&quot;.
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setPayDialog({ open: false, instance: null })} className="border-zinc-700 text-zinc-300">Cancelar</Button>
            <Button data-testid="confirm-pay-btn" onClick={submitPay} className="bg-green-500 text-white hover:bg-green-600 font-semibold">Confirmar Pagamento</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
