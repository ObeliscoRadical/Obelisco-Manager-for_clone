import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

const emptyForm = {
  name: '', nif: '', niss: '', iban: '', address: '', phone: '', email: '',
  role: '', category: '', contract_type: 'efetivo', admission_date: '',
  base_salary: 0, hourly_rate: 0, meal_allowance: 6.00,
  weekly_hours: 40, work_days_per_week: 5, payment_frequency: 'mensal', active: true,
  has_duodecimos: false, has_commissions: false, has_advances: false, has_fixed_deductions: false,
  accident_insurance: '', notes: '',
};

export default function FuncionariosPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const fetchList = useCallback(async () => {
    try {
      const { data } = await api.get('/payroll/employees');
      setList(data);
    } catch { toast.error('Erro ao carregar funcionários'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const openNew = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (e) => { setEditing(e); setForm({ ...emptyForm, ...e }); setDialogOpen(true); };

  const updateField = (k, v) => setForm({ ...form, [k]: v });

  const handleSave = async () => {
    if (!form.name) { toast.error('Nome e obrigatorio'); return; }
    try {
      if (editing) {
        await api.put(`/payroll/employees/${editing.id}`, form);
        toast.success('Funcionário atualizado');
      } else {
        await api.post('/payroll/employees', form);
        toast.success('Funcionário criado');
      }
      setDialogOpen(false);
      fetchList();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao guardar');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar este funcionário?')) return;
    try {
      await api.delete(`/payroll/employees/${id}`);
      toast.success('Funcionário eliminado');
      fetchList();
    } catch { toast.error('Erro ao eliminar'); }
  };

  if (loading) return <div className="text-zinc-400 text-sm">A carregar...</div>;

  return (
    <div data-testid="funcionários-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Funcionários</h1>
          <p className="text-zinc-400 mt-1 font-medium">Ficha individual, contratos e dados salariais</p>
        </div>
        <Button data-testid="new-employee-btn" onClick={openNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={18} className="mr-2" /> Novo Funcionário
        </Button>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Nome</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">NIF</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Cargo</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Contrato</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider text-right">Salário Base</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Pagamento</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider text-right">S. Alimentacao</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">Estado</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-zinc-500 py-8">Sem funcionários. Clique em "Novo Funcionário".</TableCell></TableRow>
            ) : list.map(e => (
              <TableRow key={e.id} className="border-zinc-800/50 hover:bg-zinc-800/30">
                <TableCell className="text-white font-medium">{e.name}</TableCell>
                <TableCell className="text-zinc-300">{e.nif || '-'}</TableCell>
                <TableCell className="text-zinc-300">{e.role || '-'}</TableCell>
                <TableCell className="text-zinc-400 text-xs capitalize">{e.contract_type}</TableCell>
                <TableCell className="text-right text-yellow-400 font-semibold">{formatEuro(e.base_salary)}</TableCell>
                <TableCell>
                  {(() => {
                    const f = e.payment_frequency || 'mensal';
                    const cls = f === 'semanal' ? 'bg-purple-500/20 text-purple-300' : f === 'quinzenal' ? 'bg-blue-500/20 text-blue-300' : 'bg-zinc-700 text-zinc-300';
                    const lbl = f === 'semanal' ? 'Semanal' : f === 'quinzenal' ? 'Quinzenal' : 'Mensal';
                    return <Badge className={`${cls} border-0 capitalize`}>{lbl}</Badge>;
                  })()}
                </TableCell>
                <TableCell className="text-right text-zinc-300">{formatEuro(e.meal_allowance)}/dia</TableCell>
                <TableCell>
                  {e.active
                    ? <Badge className="bg-green-500/20 text-green-400 border-0"><UserCheck size={10} className="mr-1" /> Ativo</Badge>
                    : <Badge className="bg-zinc-700 text-zinc-400 border-0"><UserX size={10} className="mr-1" /> Inativo</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <button data-testid={`edit-employee-${e.id}`} onClick={() => openEdit(e)} className="text-zinc-400 hover:text-yellow-400 p-1 mr-1"><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(e.id)} className="text-zinc-400 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase text-white">{editing ? 'Editar' : 'Novo'} Funcionário</DialogTitle>
            <DialogDescription className="text-zinc-500">Ficha completa do trabalhador para processamento salarial</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div><Label className="text-zinc-400 text-xs">Nome completo *</Label><Input data-testid="emp-name" value={form.name} onChange={e => updateField('name', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">NIF</Label><Input data-testid="emp-nif" value={form.nif} onChange={e => updateField('nif', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">NISS</Label><Input value={form.niss} onChange={e => updateField('niss', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">IBAN</Label><Input value={form.iban} onChange={e => updateField('iban', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Telefone</Label><Input value={form.phone} onChange={e => updateField('phone', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Email</Label><Input value={form.email} onChange={e => updateField('email', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div className="md:col-span-2"><Label className="text-zinc-400 text-xs">Morada</Label><Input value={form.address} onChange={e => updateField('address', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Cargo</Label><Input value={form.role} onChange={e => updateField('role', e.target.value)} placeholder="Ex: Eletricista" className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Categoria profissional</Label><Input value={form.category} onChange={e => updateField('category', e.target.value)} placeholder="Ex: Oficial 1a" className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div>
              <Label className="text-zinc-400 text-xs">Tipo de contrato</Label>
              <select value={form.contract_type} onChange={e => updateField('contract_type', e.target.value)} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
                <option value="efetivo">Efetivo (sem termo)</option>
                <option value="termo_certo">Termo certo</option>
                <option value="termo_incerto">Termo incerto</option>
                <option value="prestacao_serviços">Prestacao de serviços</option>
                <option value="estagio">Estagio</option>
              </select>
            </div>
            <div><Label className="text-zinc-400 text-xs">Data admissao</Label><Input type="date" value={form.admission_date} onChange={e => updateField('admission_date', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Salário base mensal (EUR) *</Label><Input data-testid="emp-salary" type="number" min="0" step="0.01" value={form.base_salary} onChange={e => updateField('base_salary', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Valor/hora (opcional, calculado se 0)</Label><Input type="number" min="0" step="0.01" value={form.hourly_rate} onChange={e => updateField('hourly_rate', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Subsidio alimentacao/dia (EUR)</Label><Input type="number" min="0" step="0.01" value={form.meal_allowance} onChange={e => updateField('meal_allowance', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Horas semanais</Label><Input type="number" min="0" step="0.5" value={form.weekly_hours} onChange={e => updateField('weekly_hours', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Dias/semana</Label><Input type="number" min="1" max="7" value={form.work_days_per_week} onChange={e => updateField('work_days_per_week', parseInt(e.target.value) || 5)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div className="md:col-span-2">
              <Label className="text-zinc-400 text-xs">Frequência de pagamento</Label>
              <select
                data-testid="emp-payment-frequency"
                value={form.payment_frequency || 'mensal'}
                onChange={e => updateField('payment_frequency', e.target.value)}
                className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm"
              >
                <option value="mensal">Mensal — 1 pagamento no fim do mês</option>
                <option value="quinzenal">Quinzenal — 2 pagamentos (dia 15 e fim do mês)</option>
                <option value="semanal">Semanal — pagamento à sexta-feira de cada semana</option>
              </select>
              <p className="text-[10px] text-zinc-500 mt-1">O salário base continua mensal (para IRS/SS) — esta opção apenas divide o pagamento ao funcionário.</p>
            </div>
            <div><Label className="text-zinc-400 text-xs">Seguro de acidentes</Label><Input value={form.accident_insurance} onChange={e => updateField('accident_insurance', e.target.value)} placeholder="Apolice n." className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>

            <div className="md:col-span-2">
              <Label className="text-zinc-400 text-xs mb-2 block">Extras</Label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                  {k:'active', l:'Ativo'},
                  {k:'has_duodecimos', l:'Duodecimos'},
                  {k:'has_commissions', l:'Comissoes'},
                  {k:'has_advances', l:'Adiantamentos'},
                  {k:'has_fixed_deductions', l:'Desc. fixos'},
                ].map(o => (
                  <button
                    key={o.k}
                    type="button"
                    onClick={() => updateField(o.k, !form[o.k])}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition border ${form[o.k] ? 'bg-yellow-400 text-zinc-950 border-yellow-400' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}
                  >{o.l}</button>
                ))}
              </div>
            </div>

            <div className="md:col-span-2"><Label className="text-zinc-400 text-xs">Observações</Label><textarea value={form.notes} onChange={e => updateField('notes', e.target.value)} rows={2} className="w-full mt-1 bg-zinc-900 border border-zinc-700 text-white rounded-md p-2 text-sm" /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700 text-zinc-300">Cancelar</Button>
            <Button data-testid="save-employee-btn" onClick={handleSave} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-semibold">Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
