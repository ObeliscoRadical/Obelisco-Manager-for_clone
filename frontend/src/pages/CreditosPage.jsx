import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Wallet, CheckCircle2, HandCoins, Coins, Users, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

const emptyForm = {
  employee_id: '',
  issue_date: new Date().toISOString().slice(0, 10),
  amount: 0,
  instalments: 1,
  instalment_amount: 0,
  method: 'Transferência',
  purpose: '',
  notes: '',
};

export default function CreditosPage() {
  const [loans, setLoans] = useState([]);
  const [summary, setSummary] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [payDialog, setPayDialog] = useState({ open: false, loan: null });
  const [payForm, setPayForm] = useState({ id: null, date: new Date().toISOString().slice(0, 10), amount: 0, method: 'Desconto Salário', notes: '' });

  const fetchAll = useCallback(async () => {
    try {
      const [loansRes, sumRes, empRes] = await Promise.all([
        api.get('/payroll/loans', {
          params: {
            status: filterStatus || undefined,
            employee_id: filterEmployee || undefined,
          },
        }),
        api.get('/payroll/loans/summary'),
        api.get('/payroll/employees'),
      ]);
      setLoans(loansRes.data);
      setSummary(sumRes.data);
      setEmployees(empRes.data);
    } catch (err) {
      console.debug('[loans] fetch failed:', err?.message);
      toast.error('Erro ao carregar créditos');
    } finally { setLoading(false); }
  }, [filterStatus, filterEmployee]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, employee_id: employees[0]?.id || '' });
    setDialogOpen(true);
  };

  const openEdit = (loan) => {
    setEditing(loan);
    setForm({
      employee_id: loan.employee_id,
      issue_date: loan.issue_date,
      amount: loan.amount,
      instalments: loan.instalments,
      instalment_amount: loan.instalment_amount,
      method: loan.method || 'Transferência',
      purpose: loan.purpose || '',
      notes: loan.notes || '',
    });
    setDialogOpen(true);
  };

  // Auto-recalcula parcela quando valor ou nº parcelas muda (se utilizador não tocou no campo manualmente)
  const updateField = (k, v) => {
    setForm(prev => {
      const next = { ...prev, [k]: v };
      if (k === 'amount' || k === 'instalments') {
        const amount = parseFloat(next.amount) || 0;
        const inst = parseInt(next.instalments) || 1;
        if (inst > 0) next.instalment_amount = Math.round((amount / inst) * 100) / 100;
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!form.employee_id) { toast.error('Selecione o funcionário'); return; }
    if (!form.amount || form.amount <= 0) { toast.error('Valor inválido'); return; }
    if (!form.instalments || form.instalments <= 0) { toast.error('Nº de parcelas inválido'); return; }
    try {
      if (editing) {
        await api.put(`/payroll/loans/${editing.id}`, form);
        toast.success('Crédito atualizado');
      } else {
        await api.post('/payroll/loans', form);
        toast.success('Crédito registado');
      }
      setDialogOpen(false);
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar este crédito e todos os pagamentos associados?')) return;
    try {
      await api.delete(`/payroll/loans/${id}`);
      toast.success('Crédito eliminado');
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  // Pagamentos
  const openPay = async (loan) => {
    try {
      const { data } = await api.get(`/payroll/loans/${loan.id}`);
      setPayDialog({ open: true, loan: data });
      setPayForm({
        id: null,
        date: new Date().toISOString().slice(0, 10),
        amount: data.instalment_amount || data.balance,
        method: 'Desconto Salário',
        notes: '',
      });
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  const refreshLoan = async () => {
    if (!payDialog.loan) return;
    const { data } = await api.get(`/payroll/loans/${payDialog.loan.id}`);
    setPayDialog(prev => ({ ...prev, loan: data }));
  };

  const startEditPayment = (p) => {
    setPayForm({ id: p.id, date: p.date, amount: p.amount, method: p.method || 'Desconto Salário', notes: p.notes || '' });
  };

  const submitPayment = async () => {
    if (!payDialog.loan) return;
    if (!payForm.amount || payForm.amount <= 0) { toast.error('Valor inválido'); return; }
    try {
      if (payForm.id) {
        await api.put(`/payroll/loans/${payDialog.loan.id}/payment/${payForm.id}`, payForm);
        toast.success('Pagamento atualizado');
      } else {
        await api.post(`/payroll/loans/${payDialog.loan.id}/payment`, payForm);
        toast.success('Pagamento registado');
      }
      setPayForm({ id: null, date: new Date().toISOString().slice(0, 10), amount: 0, method: 'Desconto Salário', notes: '' });
      await refreshLoan();
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  const deletePayment = async (paymentId) => {
    if (!window.confirm('Eliminar este pagamento?')) return;
    try {
      await api.delete(`/payroll/loans/${payDialog.loan.id}/payment/${paymentId}`);
      toast.success('Pagamento eliminado');
      if (payForm.id === paymentId) setPayForm({ id: null, date: new Date().toISOString().slice(0, 10), amount: 0, method: 'Desconto Salário', notes: '' });
      await refreshLoan();
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div data-testid="creditos-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Créditos</h1>
          <p className="text-zinc-400 mt-1 font-medium">Empréstimos a funcionários e pagamentos parcelares</p>
        </div>
        <Button data-testid="new-loan-btn" onClick={openNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={18} className="mr-2" /> Novo Crédito
        </Button>
      </div>

      {/* KPIs */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div data-testid="kpi-emprestado" className="p-4 rounded-2xl bg-gradient-to-br from-yellow-400/10 to-yellow-400/5 border border-yellow-400/30">
            <p className="text-xs uppercase tracking-wider text-yellow-400/80 font-medium flex items-center gap-1"><HandCoins size={12} /> Total Emprestado</p>
            <p className="text-2xl font-black text-yellow-400 mt-1">{formatEuro(summary.total_emprestado)}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">{summary.count_total} créditos</p>
          </div>
          <div className="p-4 rounded-2xl bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/30">
            <p className="text-xs uppercase tracking-wider text-green-400/80 font-medium flex items-center gap-1"><Coins size={12} /> Já Recebido</p>
            <p className="text-2xl font-black text-green-400 mt-1">{formatEuro(summary.total_pago)}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">{summary.count_quitados} quitados</p>
          </div>
          <div className="p-4 rounded-2xl bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-500/30">
            <p className="text-xs uppercase tracking-wider text-orange-400/80 font-medium flex items-center gap-1"><AlertCircle size={12} /> Em Dívida</p>
            <p className="text-2xl font-black text-orange-400 mt-1">{formatEuro(summary.total_aberto)}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">{summary.count_ativos} créditos ativos</p>
          </div>
          <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
            <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium flex items-center gap-1"><Users size={12} /> Funcionários</p>
            <p className="text-2xl font-black text-white mt-1">{summary.by_employee?.length || 0}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">com crédito ativo</p>
          </div>
        </div>
      )}

      {/* Resumo por funcionário */}
      {summary?.by_employee?.length > 0 && (
        <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-3">Em dívida por funcionário</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {summary.by_employee.map(emp => (
              <div key={emp.employee_id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                <div>
                  <p className="text-white font-semibold text-sm">{emp.employee_name}</p>
                  <p className="text-[11px] text-zinc-500">{emp.loan_count} crédito{emp.loan_count === 1 ? '' : 's'} ativo{emp.loan_count === 1 ? '' : 's'}</p>
                </div>
                <div className="text-right">
                  <p className="text-orange-400 font-bold">{formatEuro(emp.total_balance)}</p>
                  <p className="text-[10px] text-zinc-500">de {formatEuro(emp.total_amount)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
        <div>
          <Label className="text-[10px] text-zinc-500 uppercase tracking-wider">Estado</Label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm min-w-[140px]">
            <option value="">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="quitado">Quitados</option>
          </select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <Label className="text-[10px] text-zinc-500 uppercase tracking-wider">Funcionário</Label>
          <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} className="mt-1 h-10 w-full bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
            <option value="">Todos os funcionários</option>
            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        </div>
        {(filterStatus || filterEmployee) && (
          <button onClick={() => { setFilterStatus(''); setFilterEmployee(''); }} className="h-10 px-4 rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-xs font-semibold">Limpar filtros</button>
        )}
      </div>

      {/* Lista */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Data</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Funcionário</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Finalidade</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider text-right">Valor</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider text-center">Parcelas</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider text-right">Pago</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider text-right">Em dívida</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Estado</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loans.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-zinc-500 py-8">Sem créditos. Clica em "Novo Crédito" para começar.</TableCell></TableRow>
            ) : loans.map(loan => {
              const pct = loan.amount > 0 ? Math.min(100, (loan.amount_paid / loan.amount) * 100) : 0;
              const isClosed = loan.status === 'quitado' || loan.balance <= 0.01;
              return (
                <TableRow key={loan.id} className="border-zinc-800/50 hover:bg-zinc-800/30">
                  <TableCell className="text-zinc-300 text-sm">{loan.issue_date}</TableCell>
                  <TableCell className="text-white font-medium text-sm">{loan.employee_name}</TableCell>
                  <TableCell className="text-zinc-400 text-sm">{loan.purpose || <span className="text-zinc-600 italic">—</span>}</TableCell>
                  <TableCell className="text-right text-yellow-400 font-semibold text-sm">{formatEuro(loan.amount)}</TableCell>
                  <TableCell className="text-center text-zinc-300 text-xs">
                    <span className="text-white font-semibold">{loan.instalments_paid}/{loan.instalments}</span>
                    <p className="text-[10px] text-zinc-500">{formatEuro(loan.instalment_amount)}/parc.</p>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <span className="text-green-400 font-semibold">{formatEuro(loan.amount_paid)}</span>
                    <div className="h-1 mt-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {isClosed ? <span className="text-zinc-500">—</span> : <span className="text-orange-400 font-bold">{formatEuro(loan.balance)}</span>}
                  </TableCell>
                  <TableCell>
                    {isClosed
                      ? <Badge className="bg-green-500/20 text-green-400 border-0"><CheckCircle2 size={10} className="mr-1" /> Quitado</Badge>
                      : <Badge className="bg-yellow-400/20 text-yellow-400 border-0">Ativo</Badge>}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <button data-testid={`pay-loan-${loan.id}`} onClick={() => openPay(loan)} className={`p-1.5 rounded-md mr-1 ${isClosed ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-green-400 hover:text-green-300 hover:bg-zinc-800'}`} title={isClosed ? 'Ver pagamentos' : 'Registar pagamento'}>
                      <Wallet size={14} />
                    </button>
                    <button onClick={() => openEdit(loan)} className="p-1.5 rounded-md text-zinc-400 hover:text-yellow-400 hover:bg-zinc-800 mr-1" title="Editar"><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(loan.id)} className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-zinc-800" title="Eliminar"><Trash2 size={14} /></button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialog: Novo / Editar Crédito */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase text-white">{editing ? 'Editar' : 'Novo'} Crédito</DialogTitle>
            <DialogDescription className="text-zinc-500">Empréstimo a funcionário com pagamento parcelar</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-zinc-400 text-xs">Funcionário *</Label>
              <select data-testid="loan-employee" value={form.employee_id} onChange={e => updateField('employee_id', e.target.value)} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
                <option value="">— escolher —</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div><Label className="text-zinc-400 text-xs">Data</Label><Input data-testid="loan-date" type="date" value={form.issue_date} onChange={e => updateField('issue_date', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Método entrega</Label>
              <select value={form.method} onChange={e => updateField('method', e.target.value)} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
                <option>Transferência</option><option>MB Way</option><option>Numerário</option><option>Cheque</option>
              </select>
            </div>
            <div><Label className="text-zinc-400 text-xs">Valor emprestado (€) *</Label><Input data-testid="loan-amount" type="number" min="0" step="0.01" value={form.amount} onChange={e => updateField('amount', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1 font-bold" /></div>
            <div><Label className="text-zinc-400 text-xs">Nº de parcelas *</Label><Input data-testid="loan-instalments" type="number" min="1" value={form.instalments} onChange={e => updateField('instalments', parseInt(e.target.value) || 1)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div className="col-span-2"><Label className="text-zinc-400 text-xs">Valor por parcela (€) — opcional</Label><Input type="number" step="0.01" value={form.instalment_amount} onChange={e => setForm({ ...form, instalment_amount: parseFloat(e.target.value) || 0 })} className="bg-zinc-900 border-zinc-700 text-white mt-1" />
              <p className="text-[10px] text-zinc-500 mt-1">Calculado automaticamente como Valor ÷ Parcelas. Podes editar para arredondar.</p>
            </div>
            <div className="col-span-2"><Label className="text-zinc-400 text-xs">Finalidade</Label><Input value={form.purpose} onChange={e => updateField('purpose', e.target.value)} placeholder="Ex: Adiantamento para férias" className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div className="col-span-2"><Label className="text-zinc-400 text-xs">Notas</Label><Input value={form.notes} onChange={e => updateField('notes', e.target.value)} placeholder="Opcional" className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700 text-zinc-300">Cancelar</Button>
            <Button data-testid="save-loan-btn" onClick={handleSave} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-semibold">{editing ? 'Guardar' : 'Registar'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Pagamentos do crédito */}
      <Dialog open={payDialog.open} onOpenChange={(o) => { if (!o) setPayDialog({ open: false, loan: null }); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-white">Pagamentos · {payDialog.loan?.employee_name}</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Emprestado: <span className="text-white font-semibold">{formatEuro(payDialog.loan?.amount)}</span>
              {' · '}Pago: <span className="text-green-400 font-semibold">{formatEuro(payDialog.loan?.amount_paid)}</span>
              {' · '}Em dívida: <span className="text-orange-400 font-bold">{formatEuro(payDialog.loan?.balance)}</span>
              {' · '}Parcela: <span className="text-yellow-400">{formatEuro(payDialog.loan?.instalment_amount)} ({payDialog.loan?.instalments_paid}/{payDialog.loan?.instalments})</span>
            </DialogDescription>
          </DialogHeader>

          {/* Pagamentos */}
          {payDialog.loan?.payments?.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/60">
              {payDialog.loan.payments.map(p => {
                const isEditing = payForm.id === p.id;
                return (
                  <div key={p.id} className={`p-3 flex items-center justify-between gap-2 ${isEditing ? 'bg-yellow-400/5' : ''}`}>
                    <div>
                      <p className="text-sm text-white font-semibold">{formatEuro(p.amount)} · <span className="text-zinc-500 text-xs font-normal">{p.method}</span></p>
                      <p className="text-xs text-zinc-400">Pago em <span className="text-zinc-200">{p.date}</span>{p.notes ? <span className="text-zinc-500"> · {p.notes}</span> : null}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => startEditPayment(p)} className={`p-1.5 rounded-md ${isEditing ? 'bg-yellow-400 text-zinc-950' : 'text-zinc-400 hover:text-yellow-400 hover:bg-zinc-800'}`} title="Editar"><Pencil size={13} /></button>
                      <button onClick={() => deletePayment(p.id)} className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-zinc-800" title="Eliminar"><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Form */}
          {payDialog.loan && payDialog.loan.balance > 0.01 && (
            <div className="border-t border-zinc-800 pt-3">
              <p className="text-xs uppercase tracking-wider font-medium mb-2" style={{ color: payForm.id ? '#facc15' : '#a1a1aa' }}>
                {payForm.id ? 'A editar pagamento' : 'Registar pagamento'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-zinc-400 text-xs">Data</Label><Input type="date" value={payForm.date} onChange={e => setPayForm({ ...payForm, date: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
                <div><Label className="text-zinc-400 text-xs">Valor</Label><Input data-testid="loan-pay-amount" type="number" step="0.01" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: parseFloat(e.target.value) || 0 })} className="bg-zinc-900 border-zinc-700 text-white mt-1 font-bold" /></div>
                <div className="col-span-2">
                  <Label className="text-zinc-400 text-xs">Método</Label>
                  <select value={payForm.method} onChange={e => setPayForm({ ...payForm, method: e.target.value })} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
                    <option>Desconto Salário</option><option>Transferência</option><option>MB Way</option><option>Numerário</option><option>Multibanco</option>
                  </select>
                </div>
                <div className="col-span-2"><Label className="text-zinc-400 text-xs">Notas</Label><Input value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} placeholder="Ex: Parcela 2/6" className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
              </div>
            </div>
          )}

          {payDialog.loan && payDialog.loan.balance <= 0.01 && (
            <div className="text-center py-4 rounded-xl bg-green-500/10 border border-green-500/30">
              <CheckCircle2 size={32} className="text-green-400 mx-auto mb-2" />
              <p className="text-green-400 font-bold uppercase tracking-wider text-sm">Crédito Quitado</p>
              <p className="text-zinc-400 text-xs mt-1">Todas as parcelas foram pagas</p>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-2">
            {payForm.id && <Button variant="outline" onClick={() => setPayForm({ id: null, date: new Date().toISOString().slice(0, 10), amount: 0, method: 'Desconto Salário', notes: '' })} className="border-zinc-700 text-zinc-300">Cancelar edição</Button>}
            <Button variant="outline" onClick={() => setPayDialog({ open: false, loan: null })} className="border-zinc-700 text-zinc-300">Fechar</Button>
            {payDialog.loan && payDialog.loan.balance > 0.01 && (
              <Button data-testid="save-loan-payment" onClick={submitPayment} className="bg-green-500 text-white hover:bg-green-600 font-semibold">{payForm.id ? 'Guardar' : 'Registar'}</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
