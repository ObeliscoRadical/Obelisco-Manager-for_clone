import { useState, useEffect, useCallback, Fragment } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Lock, Unlock, Trash2, Calculator, ChevronDown, ChevronUp } from 'lucide-react';
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedRun.items.map(it => (
                      <Fragment key={it.id}>
                      <TableRow className="border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer" onClick={() => setExpandedItem(expandedItem === it.id ? null : it.id)}>
                        <TableCell>{expandedItem === it.id ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}</TableCell>
                        <TableCell className="text-white font-medium text-sm">{it.employee_name}</TableCell>
                        <TableCell className="text-center text-zinc-300 text-sm">{it.dias_trabalhados}</TableCell>
                        <TableCell className="text-right text-zinc-300 text-sm">{formatEuro(it.salário_base)}</TableCell>
                        <TableCell className="text-right text-zinc-300 text-sm">{formatEuro(it.total_horas_extra)}</TableCell>
                        <TableCell className="text-right text-zinc-300 text-sm">{formatEuro(it.subsidio_alimentacao)}</TableCell>
                        <TableCell className="text-right text-zinc-200 text-sm font-semibold">{formatEuro(it.total_ilíquido)}</TableCell>
                        <TableCell className="text-right text-red-300 text-sm">-{formatEuro(it.total_descontos)}</TableCell>
                        <TableCell className="text-right text-yellow-400 font-bold">{formatEuro(it.total_líquido)}</TableCell>
                      </TableRow>
                      {expandedItem === it.id && (
                        <TableRow className="border-zinc-800/50 bg-zinc-900/60">
                          <TableCell colSpan={9} className="p-4">
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
