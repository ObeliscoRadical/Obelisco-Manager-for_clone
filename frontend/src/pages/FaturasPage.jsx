import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, MessageCircle, CheckCircle2, Clock, AlertTriangle, Receipt as ReceiptIcon, Euro, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

const STATUS_META = {
  paga: { label: 'Paga', color: 'bg-green-500/20 text-green-400', icon: CheckCircle2 },
  pendente: { label: 'Pendente', color: 'bg-blue-500/20 text-blue-400', icon: Clock },
  parcial: { label: 'Parcial', color: 'bg-purple-500/20 text-purple-400', icon: Clock },
  vencida: { label: 'Vencida', color: 'bg-red-500/20 text-red-400', icon: AlertTriangle },
  vencida_parcial: { label: 'Vencida Parc.', color: 'bg-orange-500/20 text-orange-400', icon: AlertTriangle },
};

const emptyForm = {
  number: '', issue_date: new Date().toISOString().slice(0, 10),
  due_date: '',
  client_name: '', client_phone: '', client_email: '', client_nif: '',
  obra_id: '', proposal_id: '',
  value_net: 0, vat_rate: 23, vat_amount: 0, value_total: 0, notes: '',
};

const addDays = (dateStr, days) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export default function FaturasPage() {
  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [payDialog, setPayDialog] = useState({ open: false, invoice: null });
  const [payAmount, setPayAmount] = useState(0);
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState('Transferência');

  const fetchAll = useCallback(async () => {
    try {
      const [invRes, sumRes] = await Promise.all([
        api.get('/invoices', { params: { status: filterStatus || undefined } }),
        api.get('/invoices/summary'),
      ]);
      setInvoices(invRes.data);
      setSummary(sumRes.data);
    } catch {
      toast.error('Erro ao carregar faturas');
    } finally { setLoading(false); }
  }, [filterStatus]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, due_date: addDays(new Date().toISOString().slice(0, 10), 30) });
    setDialogOpen(true);
  };
  const openEdit = (inv) => {
    setEditing(inv);
    setForm({ ...emptyForm, ...inv });
    setDialogOpen(true);
  };

  const setField = (k, v) => {
    setForm(prev => {
      const n = { ...prev, [k]: v };
      if (k === 'value_net' || k === 'vat_rate') {
        const net = parseFloat(n.value_net) || 0;
        const rate = parseFloat(n.vat_rate) || 0;
        n.vat_amount = Math.round(net * rate) / 100;
        n.value_total = Math.round((net + n.vat_amount) * 100) / 100;
      } else if (k === 'value_total') {
        const total = parseFloat(v) || 0;
        const rate = parseFloat(n.vat_rate) || 0;
        const net = total / (1 + rate / 100);
        n.value_net = Math.round(net * 100) / 100;
        n.vat_amount = Math.round((total - net) * 100) / 100;
      }
      return n;
    });
  };

  const handleSave = async () => {
    if (!form.client_name || !form.issue_date || !form.due_date || !form.value_total) {
      toast.error('Cliente, datas e valor total são obrigatórios');
      return;
    }
    try {
      if (editing) {
        await api.put(`/invoices/${editing.id}`, form);
        toast.success('Fatura atualizada');
      } else {
        await api.post('/invoices', form);
        toast.success('Fatura criada');
      }
      setDialogOpen(false);
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro ao guardar'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar esta fatura?')) return;
    try {
      await api.delete(`/invoices/${id}`);
      toast.success('Eliminada');
      fetchAll();
    } catch { toast.error('Erro'); }
  };

  const openPay = (invoice) => {
    setPayDialog({ open: true, invoice });
    setPayAmount(invoice.balance || 0);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod('Transferência');
  };

  const handleAddPayment = async () => {
    if (!payAmount || payAmount <= 0) { toast.error('Valor inválido'); return; }
    try {
      await api.post(`/invoices/${payDialog.invoice.id}/payment`, {
        date: payDate, amount: payAmount, method: payMethod,
      });
      toast.success('Pagamento registado');
      setPayDialog({ open: false, invoice: null });
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  const sendWhatsAppReminder = async (invoice) => {
    const phone = (invoice.client_phone || '').replace(/\D/g, '');
    if (!phone) { toast.error('Cliente sem telefone'); return; }
    const fullPhone = phone.startsWith('351') ? phone : `351${phone}`;
    const overdue = invoice.days_overdue > 0
      ? `Está em atraso há ${invoice.days_overdue} dia(s). `
      : `Vence a ${invoice.due_date}. `;
    const msg = `Olá ${invoice.client_name}, este é um lembrete amigável da fatura ${invoice.number} no valor de ${formatEuro(invoice.balance)}. ${overdue}Agradecemos o pagamento. - Obelisco Radical`;
    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    // Log reminder
    try {
      await api.post(`/invoices/${invoice.id}/reminder-log`);
      fetchAll();
    } catch { /* ignore */ }
  };

  if (loading) return <div className="text-zinc-400 text-sm">A carregar...</div>;

  return (
    <div data-testid="faturas-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Faturas</h1>
          <p className="text-zinc-400 mt-1 font-medium">Controlo de cobrança e lembretes via WhatsApp</p>
        </div>
        <Button data-testid="new-invoice-btn" onClick={openNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={18} className="mr-2" /> Nova Fatura
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
            <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium flex items-center gap-1"><ReceiptIcon size={12} /> Emitido</p>
            <p className="text-2xl font-black text-white mt-1">{formatEuro(summary.total_emitido)}</p>
          </div>
          <div className="p-4 rounded-2xl bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/30">
            <p className="text-xs uppercase tracking-wider text-green-400/80 font-medium flex items-center gap-1"><DollarSign size={12} /> Recebido</p>
            <p className="text-2xl font-black text-green-400 mt-1">{formatEuro(summary.total_recebido)}</p>
          </div>
          <div className="p-4 rounded-2xl bg-gradient-to-br from-yellow-400/10 to-yellow-400/5 border border-yellow-400/30">
            <p className="text-xs uppercase tracking-wider text-yellow-400/80 font-medium flex items-center gap-1"><Euro size={12} /> Em Aberto</p>
            <p className="text-2xl font-black text-yellow-400 mt-1">{formatEuro(summary.total_em_aberto)}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{summary.count_pendentes} pendentes</p>
          </div>
          <div className="p-4 rounded-2xl bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/30">
            <p className="text-xs uppercase tracking-wider text-red-400/80 font-medium flex items-center gap-1"><AlertTriangle size={12} /> Vencidas</p>
            <p className="text-2xl font-black text-red-400 mt-1">{formatEuro(summary.total_vencido)}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{summary.count_vencidas} faturas</p>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {[
          { v: '', l: 'Todas' },
          { v: 'pendente', l: 'Pendentes' },
          { v: 'parcial', l: 'Parciais' },
          { v: 'vencida', l: 'Vencidas' },
          { v: 'paga', l: 'Pagas' },
        ].map(s => (
          <button
            key={s.v}
            onClick={() => setFilterStatus(s.v)}
            data-testid={`filter-${s.v || 'all'}`}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition border ${filterStatus === s.v ? 'bg-yellow-400 text-zinc-950 border-yellow-400' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'}`}
          >{s.l}</button>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400 text-xs uppercase">Nº / Cliente</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase">Emissão</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase">Vencimento</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase">Estado</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase text-right">Total</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase text-right">Pago</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase text-right">Em Aberto</TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-zinc-500 py-8">Sem faturas. Clique em "Nova Fatura".</TableCell></TableRow>
            ) : invoices.map(inv => {
              const meta = STATUS_META[inv.status] || STATUS_META.pendente;
              const Icon = meta.icon;
              return (
                <TableRow key={inv.id} className="border-zinc-800/50 hover:bg-zinc-800/30">
                  <TableCell>
                    <p className="text-white font-bold text-sm">{inv.number}</p>
                    <p className="text-xs text-zinc-400">{inv.client_name}</p>
                  </TableCell>
                  <TableCell className="text-zinc-300 text-xs">{inv.issue_date}</TableCell>
                  <TableCell>
                    <p className="text-zinc-300 text-xs">{inv.due_date}</p>
                    {inv.days_overdue > 0 && <p className="text-[10px] text-red-400">-{inv.days_overdue} dias</p>}
                  </TableCell>
                  <TableCell><Badge className={`${meta.color} border-0`}><Icon size={10} className="mr-1" />{meta.label}</Badge></TableCell>
                  <TableCell className="text-right text-zinc-200 font-semibold text-sm">{formatEuro(inv.value_total)}</TableCell>
                  <TableCell className="text-right text-green-400 text-sm">{formatEuro(inv.amount_paid)}</TableCell>
                  <TableCell className="text-right text-yellow-400 font-bold">{formatEuro(inv.balance)}</TableCell>
                  <TableCell className="text-right">
                    {inv.balance > 0.01 && (
                      <>
                        <button data-testid={`pay-${inv.id}`} onClick={() => openPay(inv)} className="text-green-400 hover:text-green-300 p-1 mr-1" title="Registar pagamento"><DollarSign size={14} /></button>
                        {inv.client_phone && <button data-testid={`whatsapp-${inv.id}`} onClick={() => sendWhatsAppReminder(inv)} className="text-green-500 hover:text-green-400 p-1 mr-1" title="Enviar lembrete WhatsApp"><MessageCircle size={14} /></button>}
                      </>
                    )}
                    <button onClick={() => openEdit(inv)} className="text-zinc-400 hover:text-yellow-400 p-1 mr-1"><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(inv.id)} className="text-zinc-400 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Invoice Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase text-white">{editing ? 'Editar' : 'Nova'} Fatura</DialogTitle>
            <DialogDescription className="text-zinc-500">Preencha os dados da fatura emitida</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            <div><Label className="text-zinc-400 text-xs">Nº Fatura (auto se vazio)</Label><Input value={form.number} onChange={e => setField('number', e.target.value)} placeholder="FT 2026/0001" className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div className="hidden md:block"></div>
            <div><Label className="text-zinc-400 text-xs">Data Emissão *</Label><Input type="date" value={form.issue_date} onChange={e => setField('issue_date', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Data Vencimento *</Label><Input type="date" value={form.due_date} onChange={e => setField('due_date', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Cliente *</Label><Input data-testid="inv-client" value={form.client_name} onChange={e => setField('client_name', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">NIF</Label><Input value={form.client_nif} onChange={e => setField('client_nif', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Telefone (para lembretes WhatsApp)</Label><Input value={form.client_phone} onChange={e => setField('client_phone', e.target.value)} placeholder="+351 912 345 678" className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Email</Label><Input value={form.client_email} onChange={e => setField('client_email', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Valor s/ IVA</Label><Input type="number" step="0.01" value={form.value_net} onChange={e => setField('value_net', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Taxa IVA (%)</Label>
              <select value={form.vat_rate} onChange={e => setField('vat_rate', parseFloat(e.target.value))} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
                <option value={0}>0%</option>
                <option value={6}>6%</option>
                <option value={13}>13%</option>
                <option value={23}>23%</option>
              </select>
            </div>
            <div><Label className="text-zinc-400 text-xs">Valor IVA</Label><Input type="number" step="0.01" value={form.vat_amount} onChange={e => setField('vat_amount', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Total c/ IVA *</Label><Input data-testid="inv-total" type="number" step="0.01" value={form.value_total} onChange={e => setField('value_total', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1 font-bold text-yellow-400" /></div>
            <div className="md:col-span-2"><Label className="text-zinc-400 text-xs">Notas</Label><Input value={form.notes} onChange={e => setField('notes', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700 text-zinc-300">Cancelar</Button>
            <Button data-testid="save-invoice-btn" onClick={handleSave} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-semibold">Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={payDialog.open} onOpenChange={(o) => setPayDialog({ ...payDialog, open: o })}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-white">Registar Pagamento</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Fatura {payDialog.invoice?.number} | Em aberto: <span className="text-yellow-400 font-bold">{formatEuro(payDialog.invoice?.balance)}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 mt-2">
            <div><Label className="text-zinc-400 text-xs">Data</Label><Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Valor</Label><Input data-testid="pay-amount" type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1 font-bold" /></div>
            <div>
              <Label className="text-zinc-400 text-xs">Método</Label>
              <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
                <option>Transferência</option>
                <option>MB Way</option>
                <option>Multibanco</option>
                <option>Numerário</option>
                <option>Cheque</option>
                <option>Cartão</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setPayDialog({ open: false, invoice: null })} className="border-zinc-700 text-zinc-300">Cancelar</Button>
            <Button data-testid="save-payment-btn" onClick={handleAddPayment} className="bg-green-500 text-white hover:bg-green-600 font-semibold">Registar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
