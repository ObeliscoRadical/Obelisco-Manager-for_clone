import { useState, useEffect, useCallback, Fragment } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Lock, Unlock, Trash2, Calculator, ChevronDown, ChevronUp, Wallet, Pencil, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const monthName = (m) => ['', 'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][m] || '';

export default function ProcessamentoSalarialPage() {
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newMonth, setNewMonth] = useState(new Date().getMonth() + 1);
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [expandedItem, setExpandedItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payDialog, setPayDialog] = useState({ open: false, item: null, plan: null });
  const [payForm, setPayForm] = useState({ id: null, date: '', amount: 0, method: 'Transferência', notes: '' });

  const fetchRuns = useCallback(async () => {
    try {
      const { data } = await api.get('/payroll/runs');
      setRuns(data);
    } catch { toast.error('Erro ao carregar processamentos'); }
    finally { setLoading(false); }
  }, []);

  const fetchRun = async (id) => {
    try {
      const { data } = await api.get(`/payroll/runs/${id}`);
      setSelectedRun(data);
    } catch { toast.error('Erro ao carregar detalhes'); }
  };

  const openPayDialog = async (item) => {
    try {
      const { data } = await api.get(`/payroll/items/${item.id}/plan`);
      setPayDialog({ open: true, item, plan: data });
      setPayForm({ id: null, date: new Date().toISOString().slice(0, 10), amount: 0, method: 'Transferência', notes: '' });
    } catch { toast.error('Erro ao carregar plano de pagamentos'); }
  };

  const refreshPlan = async () => {
    if (!payDialog.item) return;
    const { data } = await api.get(`/payroll/items/${payDialog.item.id}/plan`);
    setPayDialog(prev => ({ ...prev, plan: data }));
  };

  const fillFromPlan = (line) => {
    setPayForm({ id: null, date: line.date, amount: line.amount, method: 'Transferência', notes: line.label });
  };

  const startEditPayment = (p) => {
    setPayForm({ id: p.id, date: p.date, amount: p.amount, method: p.method || 'Transferência', notes: p.notes || '' });
  };

  const submitPayment = async () => {
    const it = payDialog.item;
    if (!it) return;
    if (!payForm.amount || payForm.amount <= 0) { toast.error('Valor inválido'); return; }
    try {
      if (payForm.id) {
        await api.put(`/payroll/items/${it.id}/payment/${payForm.id}`, payForm);
        toast.success('Pagamento atualizado');
      } else {
        await api.post(`/payroll/items/${it.id}/payment`, payForm);
        toast.success('Pagamento registado');
      }
      setPayForm({ id: null, date: new Date().toISOString().slice(0, 10), amount: 0, method: 'Transferência', notes: '' });
      await refreshPlan();
      fetchRun(selectedRun.run.id);
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  const deletePayment = async (paymentId) => {
    if (!window.confirm('Eliminar este pagamento?')) return;
    try {
      await api.delete(`/payroll/items/${payDialog.item.id}/payment/${paymentId}`);
      toast.success('Pagamento eliminado');
      if (payForm.id === paymentId) setPayForm({ id: null, date: new Date().toISOString().slice(0, 10), amount: 0, method: 'Transferência', notes: '' });
      await refreshPlan();
      fetchRun(selectedRun.run.id);
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  const handleCreate = async () => {
    try {
      const { data } = await api.post('/payroll/runs', { month: newMonth, year: newYear });
      toast.success(`Processamento de ${monthName(newMonth)}/${newYear} criado (${data.run.employees_count} funcionarios)`);
      setNewDialogOpen(false);
      fetchRuns();
      fetchRun(data.run.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao criar processamento');
    }
  };

  const handleClose = async (id) => {
    if (!window.confirm('Fechar este processamento? Nao sera possivel editar depois (pode reabrir).')) return;
    try {
      await api.post(`/payroll/runs/${id}/close`);
      toast.success('Processamento fechado');
      if (selectedRun?.run?.id === id) fetchRun(id);
      fetchRuns();
    } catch { toast.error('Erro ao fechar'); }
  };

  const handleReopen = async (id) => {
    try {
      await api.post(`/payroll/runs/${id}/reopen`);
      toast.success('Processamento reaberto');
      if (selectedRun?.run?.id === id) fetchRun(id);
      fetchRuns();
    } catch { toast.error('Erro ao reabrir'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar este processamento?')) return;
    try {
      await api.delete(`/payroll/runs/${id}`);
      toast.success('Eliminado');
      if (selectedRun?.run?.id === id) setSelectedRun(null);
      fetchRuns();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro ao eliminar'); }
  };

  const updateItem = async (runId, itemId, patch) => {
    try {
      await api.put(`/payroll/runs/${runId}/items/${itemId}`, patch);
      fetchRun(runId);
      fetchRuns();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro ao atualizar'); }
  };

  if (loading) return <div className="text-zinc-400 text-sm">A carregar...</div>;

  return (
    <div data-testid="processamento-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Processamento Salarial</h1>
          <p className="text-zinc-400 mt-1 font-medium">Calcule salários mensais com base em assiduidade</p>
        </div>
        <Button data-testid="new-run-btn" onClick={() => setNewDialogOpen(true)} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={18} className="mr-2" /> Novo Processamento
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-2 max-h-[75vh] overflow-y-auto">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium px-3 py-2">Processamentos</p>
          {runs.length === 0 && <p className="text-zinc-500 text-sm px-3 py-4">Sem processamentos. Crie um novo.</p>}
          {runs.map(r => (
            <button
              key={r.id}
              data-testid={`run-${r.id}`}
              onClick={() => fetchRun(r.id)}
              className={`w-full text-left px-3 py-3 rounded-xl transition mb-1 ${selectedRun?.run?.id === r.id ? 'bg-yellow-400/10 border border-yellow-400/40' : 'hover:bg-zinc-800 border border-transparent'}`}
            >
              <div className="flex items-center justify-between">
                <div className="font-bold text-white text-sm">{monthName(r.month)}/{r.year}</div>
                {r.status === 'fechado' ? <Badge className="bg-red-500/20 text-red-400 border-0 text-[10px]"><Lock size={9} className="mr-1" />Fechado</Badge> : <Badge className="bg-zinc-700 text-zinc-300 border-0 text-[10px]">Rascunho</Badge>}
              </div>
              <div className="text-xs text-zinc-400 mt-1">{r.employees_count} func. | {formatEuro(r.total_líquido)} liq.</div>
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {!selectedRun ? (
            <div className="text-center py-16 rounded-2xl border border-zinc-800 bg-zinc-900/40">
              <Calculator className="mx-auto text-zinc-600 mb-3" size={48} />
              <p className="text-zinc-400">Selecione um processamento ou crie um novo</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                <div>
                  <h2 className="text-xl font-bold text-white">{monthName(selectedRun.run.month)}/{selectedRun.run.year}</h2>
                  <p className="text-xs text-zinc-500">{selectedRun.run.employees_count} funcionários processados</p>
                </div>
                <div className="flex gap-3 text-sm">
                  <div><span className="text-zinc-500 text-xs">Ilíquido:</span> <span className="text-zinc-300 font-bold ml-1">{formatEuro(selectedRun.run.total_ilíquido)}</span></div>
                  <div><span className="text-zinc-500 text-xs">Líquido:</span> <span className="text-yellow-400 font-bold ml-1">{formatEuro(selectedRun.run.total_líquido)}</span></div>
                  <div><span className="text-zinc-500 text-xs">Custo empresa:</span> <span className="text-red-300 font-bold ml-1">{formatEuro(selectedRun.run.total_custo_empresa)}</span></div>
                </div>
                <div className="flex gap-2">
                  {selectedRun.run.status === 'fechado' ? (
                    <Button size="sm" onClick={() => handleReopen(selectedRun.run.id)} className="bg-zinc-800 hover:bg-zinc-700 rounded-full"><Unlock size={14} className="mr-1" /> Reabrir</Button>
                  ) : (
                    <Button data-testid="close-run-btn" size="sm" onClick={() => handleClose(selectedRun.run.id)} className="bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-full"><Lock size={14} className="mr-1" /> Fechar mes</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => handleDelete(selectedRun.run.id)} className="border-zinc-700 text-zinc-400 rounded-full"><Trash2 size={14} /></Button>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="text-zinc-400 text-xs w-8"></TableHead>
                      <TableHead className="text-zinc-400 text-xs">Funcionário</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-center">Dias</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-right">Base</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-right">H.Extra</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-right">S.Alim.</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-right">Ilíquido</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-right">Descontos</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-right">Líquido</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-right">Pagamentos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedRun.items.map(it => (
                      <Fragment key={it.id}>
                      <TableRow className="border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer" onClick={() => setExpandedItem(expandedItem === it.id ? null : it.id)}>
                        <TableCell>{expandedItem === it.id ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}</TableCell>
                        <TableCell className="text-white font-medium text-sm">
                          <div className="flex items-center gap-2">
                            <span>{it.employee_name}</span>
                            {it.payment_frequency && it.payment_frequency !== 'mensal' && (
                              <Badge className={`border-0 text-[10px] capitalize ${it.payment_frequency === 'semanal' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'}`}>
                                {it.payment_frequency}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-zinc-300 text-sm">{it.dias_trabalhados}</TableCell>
                        <TableCell className="text-right text-zinc-300 text-sm">{formatEuro(it.salário_base)}</TableCell>
                        <TableCell className="text-right text-zinc-300 text-sm">{formatEuro(it.total_horas_extra)}</TableCell>
                        <TableCell className="text-right text-zinc-300 text-sm">{formatEuro(it.subsidio_alimentacao)}</TableCell>
                        <TableCell className="text-right text-zinc-200 text-sm font-semibold">{formatEuro(it.total_ilíquido)}</TableCell>
                        <TableCell className="text-right text-red-300 text-sm">-{formatEuro(it.total_descontos)}</TableCell>
                        <TableCell className="text-right text-yellow-400 font-bold">{formatEuro(it.total_líquido)}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          {(() => {
                            const paid = (it.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
                            const balance = (it.total_líquido || 0) - paid;
                            const fullyPaid = balance <= 0.01;
                            return (
                              <button
                                data-testid={`open-payments-${it.id}`}
                                onClick={() => openPayDialog(it)}
                                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${fullyPaid ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20'}`}
                                title={fullyPaid ? 'Pago' : `Em aberto: ${formatEuro(balance)}`}
                              >
                                {fullyPaid ? <CheckCircle2 size={12} /> : <Wallet size={12} />}
                                {fullyPaid ? 'Pago' : formatEuro(balance)}
                              </button>
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                      {expandedItem === it.id && (
                        <TableRow className="border-zinc-800/50 bg-zinc-900/60">
                          <TableCell colSpan={10} className="p-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                              <div><Label className="text-zinc-500 text-[10px]">Horas normais</Label><p className="text-zinc-300">{it.horas_normais}h</p></div>
                              <div><Label className="text-zinc-500 text-[10px]">Valor/hora</Label><p className="text-zinc-300">{formatEuro(it.valor_hora)}</p></div>
                              <div><Label className="text-zinc-500 text-[10px]">H.Extra 125% / 137.5%</Label><p className="text-zinc-300">{it.horas_extra_1}h / {it.horas_extra_2}h</p></div>
                              <div><Label className="text-zinc-500 text-[10px]">H.Extra 150% / 200%</Label><p className="text-zinc-300">{it.horas_extra_fds}h / {it.horas_extra_dom}h</p></div>
                              <div><Label className="text-zinc-500 text-[10px]">Faltas inj. / just.</Label><p className="text-zinc-300">{it.faltas_injustificadas} / {it.faltas_justificadas}</p></div>
                              <div><Label className="text-zinc-500 text-[10px]">Desconto faltas</Label><p className="text-red-300">-{formatEuro(it.desconto_faltas)}</p></div>
                              <div><Label className="text-zinc-500 text-[10px]">Desc. SS 11%</Label><p className="text-red-300">-{formatEuro(it.desconto_ss)}</p></div>
                              <div><Label className="text-zinc-500 text-[10px]">Desc. IRS ({it.irs_rate}%)</Label><p className="text-red-300">-{formatEuro(it.desconto_irs)}</p></div>
                              <div><Label className="text-zinc-500 text-[10px]">SS Patronal 23.75%</Label><p className="text-orange-300">{formatEuro(it.ss_patronal)}</p></div>
                              <div><Label className="text-zinc-500 text-[10px]">Custo empresa</Label><p className="text-orange-400 font-bold">{formatEuro(it.custo_total_empresa)}</p></div>
                            </div>

                            {selectedRun.run.status !== 'fechado' && (
                              <div className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-2 md:grid-cols-4 gap-2">
                                {[
                                  { k: 'premio', l: 'Premio' },
                                  { k: 'comissao', l: 'Comissao' },
                                  { k: 'ajuda_custo', l: 'Ajuda custo' },
                                  { k: 'adiantamento', l: 'Adiantamento' },
                                  { k: 'desconto_manual', l: 'Desc. manual' },
                                  { k: 'outros_descontos', l: 'Outros desc.' },
                                ].map(f => (
                                  <div key={f.k}>
                                    <Label className="text-zinc-500 text-[10px]">{f.l} (EUR)</Label>
                                    <Input
                                      data-testid={`item-${f.k}-${it.id}`}
                                      type="number" min="0" step="0.01" defaultValue={it[f.k] || 0}
                                      onBlur={(e) => {
                                        const v = parseFloat(e.target.value) || 0;
                                        if (v !== (it[f.k] || 0)) updateItem(selectedRun.run.id, it.id, { [f.k]: v });
                                      }}
                                      className="bg-zinc-900 border-zinc-700 text-white mt-1 h-8 text-xs"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={payDialog.open} onOpenChange={(o) => { if (!o) setPayDialog({ open: false, item: null, plan: null }); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-white">Pagamentos · {payDialog.item?.employee_name}</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Líquido: <span className="text-white font-semibold">{formatEuro(payDialog.plan?.total_liquido)}</span>
              {' · '}Pago: <span className="text-green-400 font-semibold">{formatEuro(payDialog.plan?.amount_paid)}</span>
              {' · '}Em aberto: <span className="text-yellow-400 font-bold">{formatEuro(payDialog.plan?.balance)}</span>
              {' · '}Frequência: <span className="capitalize text-purple-300">{payDialog.plan?.payment_frequency}</span>
            </DialogDescription>
          </DialogHeader>

          {/* Plano sugerido */}
          {payDialog.plan && (payDialog.plan.payment_frequency || 'mensal') !== 'mensal' && (
            <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3">
              <p className="text-[10px] uppercase tracking-wider text-purple-300 font-semibold mb-2">Plano sugerido (clique para preencher abaixo)</p>
              <div className="flex flex-wrap gap-2">
                {payDialog.plan.plan.map((line, i) => (
                  <button
                    key={i}
                    data-testid={`plan-line-${i}`}
                    onClick={() => fillFromPlan(line)}
                    className="text-xs bg-zinc-900 border border-zinc-700 hover:border-purple-400 rounded-lg px-3 py-2 text-left"
                  >
                    <p className="text-purple-300 font-semibold">{line.label}</p>
                    <p className="text-zinc-400">{line.date}</p>
                    <p className="text-yellow-400 font-bold">{formatEuro(line.amount)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pagamentos efectuados */}
          {payDialog.plan?.payments?.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/60">
              {payDialog.plan.payments.map(p => {
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
          <div className="border-t border-zinc-800 pt-3">
            <p className="text-xs uppercase tracking-wider font-medium mb-2" style={{ color: payForm.id ? '#facc15' : '#a1a1aa' }}>
              {payForm.id ? 'A editar pagamento' : 'Registar pagamento'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-zinc-400 text-xs">Data</Label><Input type="date" value={payForm.date} onChange={e => setPayForm({ ...payForm, date: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
              <div><Label className="text-zinc-400 text-xs">Valor</Label><Input type="number" step="0.01" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: parseFloat(e.target.value) || 0 })} className="bg-zinc-900 border-zinc-700 text-white mt-1 font-bold" /></div>
              <div className="col-span-2">
                <Label className="text-zinc-400 text-xs">Método</Label>
                <select value={payForm.method} onChange={e => setPayForm({ ...payForm, method: e.target.value })} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
                  <option>Transferência</option><option>MB Way</option><option>Numerário</option><option>Multibanco</option><option>Cheque</option>
                </select>
              </div>
              <div className="col-span-2"><Label className="text-zinc-400 text-xs">Notas</Label><Input value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} placeholder="Ex: Semana 2" className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            {payForm.id && <Button variant="outline" onClick={() => setPayForm({ id: null, date: new Date().toISOString().slice(0, 10), amount: 0, method: 'Transferência', notes: '' })} className="border-zinc-700 text-zinc-300">Cancelar edição</Button>}
            <Button variant="outline" onClick={() => setPayDialog({ open: false, item: null, plan: null })} className="border-zinc-700 text-zinc-300">Fechar</Button>
            <Button onClick={submitPayment} className="bg-green-500 text-white hover:bg-green-600 font-semibold">{payForm.id ? 'Guardar' : 'Registar'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-white">Novo Processamento</DialogTitle>
            <DialogDescription className="text-zinc-500 text-xs">Vai puxar dados de assiduidade e calcular salários automaticamente</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <Label className="text-zinc-400 text-xs">Mes</Label>
              <select data-testid="run-month" value={newMonth} onChange={e => setNewMonth(parseInt(e.target.value))} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
                {Array.from({ length: 12 }).map((_, i) => <option key={i+1} value={i+1}>{monthName(i+1)}</option>)}
              </select>
            </div>
            <div><Label className="text-zinc-400 text-xs">Ano</Label><Input data-testid="run-year" type="number" value={newYear} onChange={e => setNewYear(parseInt(e.target.value) || newYear)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setNewDialogOpen(false)} className="border-zinc-700 text-zinc-300">Cancelar</Button>
            <Button data-testid="confirm-run-btn" onClick={handleCreate} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-semibold">Criar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
