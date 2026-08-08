import { useMemo, useState } from 'react';
import api from '../../lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

const emptyForm = {
  credor: '',
  tipo_divida: 'Segurança_Social',
  valor_total: 0,
  valor_vencido: 0,
  data_vencimento: new Date().toISOString().slice(0, 10),
  status: 'ativa',
  observacoes: '',
};

export const CfoDebtsTable = ({ debts, onChanged }) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const totals = useMemo(() => ({
    total: debts.reduce((sum, item) => sum + (item.valor_total || 0), 0),
    overdue: debts.reduce((sum, item) => sum + (item.valor_vencido || 0), 0),
  }), [debts]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({ ...emptyForm, ...item });
    setDialogOpen(true);
  };

  const saveDebt = async () => {
    try {
      if (editing) {
        await api.put(`/cfo-virtual/debts/${editing.id}`, form);
        toast.success('Dívida atualizada');
      } else {
        await api.post('/cfo-virtual/debts', form);
        toast.success('Dívida registada');
      }
      setDialogOpen(false);
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao guardar dívida');
    }
  };

  const removeDebt = async (id) => {
    if (!window.confirm('Eliminar esta dívida?')) return;
    try {
      await api.delete(`/cfo-virtual/debts/${id}`);
      toast.success('Dívida eliminada');
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao eliminar dívida');
    }
  };

  return (
    <div data-testid="cfo-debts-section" className="rounded-[28px] border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight text-white">Passivo & Dívidas Ativas</h2>
          <p className="text-sm text-zinc-500 mt-1">Base obrigatória para o motor do CFO Virtual.</p>
        </div>
        <Button data-testid="new-debt-button" onClick={openNew} className="rounded-full bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold">
          <Plus size={16} className="mr-2" /> Nova Dívida
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div data-testid="debt-total-card" className="rounded-2xl border border-yellow-400/20 bg-yellow-400/5 p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Passivo total</p>
          <p className="text-xl font-black text-yellow-400 mt-1">{formatEuro(totals.total)}</p>
        </div>
        <div data-testid="debt-overdue-card" className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Valor vencido</p>
          <p className="text-xl font-black text-red-400 mt-1">{formatEuro(totals.overdue)}</p>
        </div>
        <div data-testid="debt-count-card" className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Registos</p>
          <p className="text-xl font-black text-white mt-1">{debts.length}</p>
        </div>
        <div data-testid="debt-critical-card" className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Alta prioridade</p>
          <p className="text-xl font-black text-orange-400 mt-1">{debts.filter(item => ['Segurança_Social', 'Fiscal_AT'].includes(item.tipo_divida)).length}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-500">Credor</TableHead>
              <TableHead className="text-zinc-500">Tipo</TableHead>
              <TableHead className="text-zinc-500 text-right">Total</TableHead>
              <TableHead className="text-zinc-500 text-right">Vencido</TableHead>
              <TableHead className="text-zinc-500">Vencimento</TableHead>
              <TableHead className="text-zinc-500">Status</TableHead>
              <TableHead className="text-zinc-500 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {debts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-zinc-500">Ainda não há dívidas registadas. Sem isto o CFO vê menos realidade.</TableCell>
              </TableRow>
            ) : debts.map(item => (
              <TableRow key={item.id} data-testid={`debt-row-${item.id}`} className="border-zinc-800/70 hover:bg-zinc-800/30">
                <TableCell className="text-white font-semibold">{item.credor}</TableCell>
                <TableCell>
                  <Badge className="border-0 bg-zinc-800 text-zinc-300">{item.tipo_divida}</Badge>
                </TableCell>
                <TableCell className="text-right text-yellow-400 font-semibold">{formatEuro(item.valor_total)}</TableCell>
                <TableCell className="text-right text-red-400 font-semibold">{formatEuro(item.valor_vencido)}</TableCell>
                <TableCell className="text-zinc-400">{item.data_vencimento}</TableCell>
                <TableCell>
                  <Badge className={`border-0 ${item.status === 'regularizada' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-orange-500/15 text-orange-300'}`}>{item.status}</Badge>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <button data-testid={`edit-debt-${item.id}`} onClick={() => openEdit(item)} className="p-2 rounded-lg text-zinc-500 hover:text-yellow-400 hover:bg-zinc-800 mr-1">
                    <Pencil size={14} />
                  </button>
                  <button data-testid={`delete-debt-${item.id}`} onClick={() => removeDebt(item.id)} className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800">
                    <Trash2 size={14} />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl border-zinc-800 bg-zinc-950">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase text-white">{editing ? 'Editar dívida' : 'Nova dívida'}</DialogTitle>
            <DialogDescription className="text-zinc-500">Credor, vencimento e parte vencida são obrigatórios para a decisão do CFO.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label className="text-xs text-zinc-400">Credor</Label>
              <Input data-testid="debt-creditor-input" value={form.credor} onChange={(e) => setForm(prev => ({ ...prev, credor: e.target.value }))} className="mt-1 border-zinc-700 bg-zinc-900 text-white" />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Tipo de dívida</Label>
              <select data-testid="debt-type-select" value={form.tipo_divida} onChange={(e) => setForm(prev => ({ ...prev, tipo_divida: e.target.value }))} className="mt-1 h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white">
                <option value="Fiscal_AT">Fiscal_AT</option>
                <option value="Segurança_Social">Segurança_Social</option>
                <option value="Fornecedores">Fornecedores</option>
                <option value="Bancária">Bancária</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Status</Label>
              <select data-testid="debt-status-select" value={form.status} onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value }))} className="mt-1 h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white">
                <option value="ativa">ativa</option>
                <option value="vencida">vencida</option>
                <option value="parcial">parcial</option>
                <option value="em_negociacao">em_negociacao</option>
                <option value="regularizada">regularizada</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Valor total (€)</Label>
              <Input data-testid="debt-total-input" type="number" min="0" step="0.01" value={form.valor_total} onChange={(e) => setForm(prev => ({ ...prev, valor_total: parseFloat(e.target.value) || 0 }))} className="mt-1 border-zinc-700 bg-zinc-900 text-white" />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Valor vencido (€)</Label>
              <Input data-testid="debt-overdue-input" type="number" min="0" step="0.01" value={form.valor_vencido} onChange={(e) => setForm(prev => ({ ...prev, valor_vencido: parseFloat(e.target.value) || 0 }))} className="mt-1 border-zinc-700 bg-zinc-900 text-white" />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Data de vencimento</Label>
              <Input data-testid="debt-due-date-input" type="date" value={form.data_vencimento} onChange={(e) => setForm(prev => ({ ...prev, data_vencimento: e.target.value }))} className="mt-1 border-zinc-700 bg-zinc-900 text-white" />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs text-zinc-400">Observações</Label>
              <Input data-testid="debt-notes-input" value={form.observacoes} onChange={(e) => setForm(prev => ({ ...prev, observacoes: e.target.value }))} className="mt-1 border-zinc-700 bg-zinc-900 text-white" placeholder="Ex: plano prestacional pedido, processo AT, bloqueio iminente..." />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700 text-zinc-300">Cancelar</Button>
            <Button data-testid="save-debt-button" onClick={saveDebt} className="rounded-full bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold">Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};