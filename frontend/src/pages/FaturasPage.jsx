import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, MessageCircle, CheckCircle2, Clock, AlertTriangle, Receipt as ReceiptIcon, Euro, DollarSign, Upload, FileText, Loader2, Sparkles, Eye, Percent } from 'lucide-react';
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
  invoice_file: null,
};

const addDays = (dateStr, days) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function FaturasPage() {
  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [payDialog, setPayDialog] = useState({ open: false, invoice: null });
  const [payAmount, setPayAmount] = useState(0);
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState('Transferência');
  const [payNotes, setPayNotes] = useState('');
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const params = {
        status: filterStatus || undefined,
        year: filterYear || undefined,
        month: filterMonth || undefined,
        client: filterClient || undefined,
      };
      const [invRes, sumRes, cliRes] = await Promise.all([
        api.get('/invoices', { params }),
        api.get('/invoices/summary', { params: { year: params.year, month: params.month, client: params.client } }),
        api.get('/invoices/clients'),
      ]);
      setInvoices(invRes.data);
      setSummary(sumRes.data);
      setClients(cliRes.data);
    } catch {
      toast.error('Erro ao carregar faturas');
    } finally { setLoading(false); }
  }, [filterStatus, filterYear, filterMonth, filterClient]);

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

  const handleUpload = async (file) => {
    if (!file) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/invoices/extract', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const ext = data.extracted || {};
      if (ext.error) {
        toast.error(`IA falhou: ${ext.error}`);
        setForm(prev => ({ ...prev, invoice_file: data.file_name }));
      } else {
        setForm(prev => {
          const next = {
            ...prev,
            number: ext.number || prev.number,
            issue_date: ext.issue_date || prev.issue_date,
            due_date: ext.due_date || prev.due_date || addDays(ext.issue_date || prev.issue_date, 30),
            client_name: ext.client_name || prev.client_name,
            client_nif: ext.client_nif || prev.client_nif,
            client_email: ext.client_email || prev.client_email,
            client_phone: ext.client_phone || prev.client_phone,
            value_net: ext.value_net || prev.value_net,
            vat_rate: ext.vat_rate || prev.vat_rate,
            vat_amount: ext.vat_amount || prev.vat_amount,
            value_total: ext.value_total || prev.value_total,
            notes: ext.notes ? (prev.notes ? `${prev.notes} | ${ext.notes}` : ext.notes) : prev.notes,
            invoice_file: data.file_name,
          };
          // Re-derive if total present but net missing
          if (next.value_total && !next.value_net) {
            const rate = parseFloat(next.vat_rate) || 0;
            const net = next.value_total / (1 + rate / 100);
            next.value_net = Math.round(net * 100) / 100;
            next.vat_amount = Math.round((next.value_total - net) * 100) / 100;
          }
          return next;
        });
        toast.success('Fatura lida por IA! Confira os dados antes de guardar.');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao processar fatura');
    } finally { setExtracting(false); }
  };

  const viewInvoice = (filename) => {
    if (!filename) return;
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/invoices/file/${filename}`;
    window.open(url, '_blank');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar esta fatura?')) return;
    try {
      await api.delete(`/invoices/${id}`);
      toast.success('Eliminada');
      fetchAll();
    } catch { toast.error('Erro'); }
  };

  const resetPayForm = () => {
    setPayAmount(0);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod('Transferência');
    setPayNotes('');
    setEditingPaymentId(null);
  };

  const openPay = (invoice) => {
    setPayDialog({ open: true, invoice });
    setPayAmount(invoice.balance || 0);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod('Transferência');
    setPayNotes('');
    setEditingPaymentId(null);
  };

  const startEditPayment = (payment) => {
    setEditingPaymentId(payment.id);
    setPayAmount(payment.amount || 0);
    setPayDate(payment.date || new Date().toISOString().slice(0, 10));
    setPayMethod(payment.method || 'Transferência');
    setPayNotes(payment.notes || '');
  };

  const refreshDialogInvoice = async (invoiceId) => {
    try {
      const { data } = await api.get(`/invoices/${invoiceId}`);
      setPayDialog(prev => prev.open ? { ...prev, invoice: data } : prev);
    } catch (err) { console.debug('[refresh invoice]', err?.message); }
  };

  const handleAddPayment = async () => {
    if (!payAmount || payAmount <= 0) { toast.error('Valor inválido'); return; }
    try {
      const payload = { date: payDate, amount: payAmount, method: payMethod, notes: payNotes };
      if (editingPaymentId) {
        await api.put(`/invoices/${payDialog.invoice.id}/payment/${editingPaymentId}`, payload);
        toast.success('Pagamento atualizado');
      } else {
        await api.post(`/invoices/${payDialog.invoice.id}/payment`, payload);
        toast.success('Pagamento registado');
      }
      resetPayForm();
      await refreshDialogInvoice(payDialog.invoice.id);
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm('Eliminar este pagamento?')) return;
    try {
      await api.delete(`/invoices/${payDialog.invoice.id}/payment/${paymentId}`);
      toast.success('Pagamento eliminado');
      if (editingPaymentId === paymentId) resetPayForm();
      await refreshDialogInvoice(payDialog.invoice.id);
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  // Gera mensagem de cobrança formal e amigável, com 3 tons consoante dias em atraso.
  const buildCollectionMessage = (invoice) => {
    const name = (invoice.client_name || '').split(/\s+/)[0] || 'Cliente';
    const amount = formatEuro(invoice.balance);
    const number = invoice.number || '—';
    const due = invoice.due_date || '—';
    const days = invoice.days_overdue || 0;

    if (days <= 0) {
      // Lembrete antes do vencimento / no dia
      return (
        `Olá ${name}, tudo bem? 👋\n\n` +
        `Aqui é da Obelisco Radical — Instalações Eléctricas. Enviamos este lembrete amigável da fatura *${number}* no valor de *${amount}*, com vencimento a *${due}*.\n\n` +
        `Se já tiver efectuado o pagamento, por favor desconsidere esta mensagem. Caso contrário, agradecemos desde já a regularização.\n\n` +
        `Qualquer dúvida estamos ao seu dispor.\n\n` +
        `Com os melhores cumprimentos,\nObelisco Radical`
      );
    }
    if (days <= 7) {
      // Primeira cobrança amigável
      return (
        `Olá ${name}, tudo bem? 👋\n\n` +
        `Aqui é da Obelisco Radical. Notámos que a fatura *${number}* no valor de *${amount}* venceu a *${due}* e ainda não foi liquidada (${days} dia${days === 1 ? '' : 's'} em atraso).\n\n` +
        `Presumimos que se tenha tratado de um esquecimento. Agradecíamos que procedesse ao pagamento logo que possível. Se já efectuou a transferência, por favor confirme-nos para atualizarmos os nossos registos.\n\n` +
        `Obrigado pela preferência!\n\nObelisco Radical`
      );
    }
    if (days <= 30) {
      // Segunda cobrança, mais firme mas cordial
      return (
        `Bom dia ${name},\n\n` +
        `Da parte da Obelisco Radical, vimos por este meio alertar que a fatura *${number}* no valor de *${amount}*, com vencimento a *${due}*, está em atraso há *${days} dias*.\n\n` +
        `Solicitamos que proceda à regularização no prazo de 48h. Caso exista alguma questão ou necessite de acordar um plano de pagamento, fale connosco e procuramos a melhor solução em conjunto.\n\n` +
        `Agradecemos a sua atenção.\n\nObelisco Radical · Gestão de Cobranças`
      );
    }
    // Cobrança formal final (acima de 30 dias)
    return (
      `Exmo(a). ${invoice.client_name},\n\n` +
      `Serve a presente para informar V. Exa. que a fatura *${number}*, emitida em nome de V. Exa., no valor de *${amount}* e com data de vencimento a *${due}*, encontra-se em atraso há *${days} dias*.\n\n` +
      `Apesar das tentativas de contacto prévias, o valor permanece por liquidar. Solicitamos encarecidamente a regularização no prazo máximo de 5 dias úteis, findo o qual seremos forçados a encaminhar o processo para cobrança judicial, com os encargos legais e honorários inerentes a correrem por conta de V. Exa.\n\n` +
      `Caso pretenda negociar um plano de pagamento, contacte-nos com urgência.\n\n` +
      `Atenciosamente,\nObelisco Radical · Departamento de Cobranças`
    );
  };

  const sendWhatsAppReminder = async (invoice) => {
    const phone = (invoice.client_phone || '').replace(/\D/g, '');
    if (!phone) { toast.error(`${invoice.client_name}: sem telefone registado`); return false; }
    const fullPhone = phone.startsWith('351') ? phone : `351${phone}`;
    const msg = buildCollectionMessage(invoice);
    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    try {
      await api.post(`/invoices/${invoice.id}/reminder-log`);
      fetchAll();
    } catch (err) { console.debug('[reminder-log] best-effort failed:', err?.message); }
    return true;
  };

  const sendBulkCollection = async () => {
    const overdue = invoices.filter(i => i.status && i.status.startsWith('vencida') && i.balance > 0.01);
    if (overdue.length === 0) { toast.info('Sem faturas vencidas para cobrar'); return; }
    const withPhone = overdue.filter(i => (i.client_phone || '').trim());
    const noPhone = overdue.length - withPhone.length;
    if (withPhone.length === 0) { toast.error('Nenhuma fatura vencida tem telefone registado'); return; }
    const confirmMsg = `Vai abrir ${withPhone.length} conversa${withPhone.length === 1 ? '' : 's'} de WhatsApp para cobrança${noPhone > 0 ? ` (${noPhone} sem telefone serão ignoradas)` : ''}. Continuar?`;
    if (!window.confirm(confirmMsg)) return;
    for (const inv of withPhone) {
      await sendWhatsAppReminder(inv);
      await new Promise(r => setTimeout(r, 400));   // dá tempo ao browser para abrir separador novo
    }
    toast.success(`${withPhone.length} mensagem${withPhone.length === 1 ? '' : 's'} aberta${withPhone.length === 1 ? '' : 's'} no WhatsApp`);
  };

  if (loading) return <div className="text-zinc-400 text-sm">A carregar...</div>;

  return (
    <div data-testid="faturas-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Faturas</h1>
          <p className="text-zinc-400 mt-1 font-medium">Controlo de cobrança e lembretes via WhatsApp</p>
        </div>
        <div className="flex items-center gap-2">
          {summary?.count_vencidas > 0 && (
            <Button
              data-testid="bulk-collection-btn"
              onClick={sendBulkCollection}
              className="bg-red-500 text-white hover:bg-red-600 rounded-full font-semibold"
              title={`Enviar cobrança a ${summary.count_vencidas} fatura(s) vencida(s)`}
            >
              <MessageCircle size={16} className="mr-2" /> Cobrar vencidas ({summary.count_vencidas})
            </Button>
          )}
          <Button data-testid="new-invoice-btn" onClick={openNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
            <Plus size={18} className="mr-2" /> Nova Fatura
          </Button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div data-testid="kpi-emitido" className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
            <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium flex items-center gap-1"><ReceiptIcon size={12} /> Emitido</p>
            <p className="text-2xl font-black text-white mt-1">{formatEuro(summary.total_emitido)}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{summary.count_total} faturas</p>
          </div>
          <div data-testid="kpi-iva" className="p-4 rounded-2xl bg-gradient-to-br from-sky-500/10 to-sky-500/5 border border-sky-500/30">
            <p className="text-xs uppercase tracking-wider text-sky-400/80 font-medium flex items-center gap-1"><Percent size={12} /> IVA Emitido</p>
            <p className="text-2xl font-black text-sky-400 mt-1">{formatEuro(summary.total_iva)}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{summary.total_emitido > 0 ? `${((summary.total_iva / summary.total_emitido) * 100).toFixed(1)}% do total` : '—'}</p>
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

      <div className="flex flex-wrap items-end gap-3 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Ano</label>
          <select
            data-testid="filter-year"
            value={filterYear}
            onChange={e => setFilterYear(parseInt(e.target.value))}
            className="h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm min-w-[100px]"
          >
            {[filterYear + 1, filterYear, filterYear - 1, filterYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Mês</label>
          <select
            data-testid="filter-month"
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm min-w-[140px]"
          >
            <option value="">Todos</option>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Cliente</label>
          <select
            data-testid="filter-client"
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
            className="h-10 w-full bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm"
          >
            <option value="">Todos os clientes</option>
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {(filterMonth || filterClient) && (
          <button
            data-testid="clear-filters"
            onClick={() => { setFilterMonth(''); setFilterClient(''); }}
            className="h-10 px-4 rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-xs font-semibold"
          >
            Limpar filtros
          </button>
        )}
      </div>

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
                    {inv.invoice_file && <button data-testid={`view-file-${inv.id}`} onClick={() => viewInvoice(inv.invoice_file)} className="text-zinc-400 hover:text-yellow-400 p-1 mr-1" title="Ver fatura"><Eye size={14} /></button>}
                    {inv.balance > 0.01 && (
                      <>
                        {/* Botão de cobrança WhatsApp: destacado para vencidas, discreto para pendentes */}
                        {inv.client_phone && (inv.status || '').startsWith('vencida') && (
                          <button
                            data-testid={`collect-${inv.id}`}
                            onClick={() => sendWhatsAppReminder(inv)}
                            className="inline-flex items-center gap-1 bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-full text-xs font-semibold mr-2 shadow-lg shadow-red-500/20"
                            title={`Cobrar ${inv.days_overdue} dia(s) de atraso via WhatsApp`}
                          >
                            <MessageCircle size={12} /> Cobrar
                          </button>
                        )}
                        <button data-testid={`pay-${inv.id}`} onClick={() => openPay(inv)} className="text-green-400 hover:text-green-300 p-1 mr-1" title="Registar pagamento"><DollarSign size={14} /></button>
                        {inv.client_phone && !(inv.status || '').startsWith('vencida') && (
                          <button data-testid={`whatsapp-${inv.id}`} onClick={() => sendWhatsAppReminder(inv)} className="text-green-500 hover:text-green-400 p-1 mr-1" title="Enviar lembrete amigável via WhatsApp"><MessageCircle size={14} /></button>
                        )}
                      </>
                    )}
                    {inv.balance <= 0.01 && (inv.payments?.length > 0) && (
                      <button data-testid={`payments-${inv.id}`} onClick={() => openPay(inv)} className="text-zinc-400 hover:text-green-400 p-1 mr-1" title="Ver / editar pagamentos"><DollarSign size={14} /></button>
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
            <DialogDescription className="text-zinc-500">Faça upload da fatura e a IA preenche tudo automaticamente.</DialogDescription>
          </DialogHeader>

          {!editing && (
            <div className="rounded-2xl border-2 border-dashed border-yellow-400/30 bg-yellow-400/5 p-6 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={e => handleUpload(e.target.files?.[0])}
                className="hidden"
                data-testid="invoice-file-input"
              />
              {extracting ? (
                <div className="flex flex-col items-center gap-3 text-yellow-400">
                  <Loader2 className="animate-spin" size={32} />
                  <p className="font-medium">A ler fatura com IA...</p>
                  <p className="text-xs text-zinc-500">Isto pode demorar 10-20 segundos</p>
                </div>
              ) : form.invoice_file ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-green-400">
                    <FileText size={20} />
                    <span className="font-medium text-sm">Fatura carregada</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="border-zinc-700 text-zinc-300 rounded-full text-xs">
                    Carregar outra
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Sparkles className="text-yellow-400" size={32} />
                  <div>
                    <p className="text-white font-semibold">Upload de Fatura (PDF / Imagem)</p>
                    <p className="text-xs text-zinc-500 mt-1">A IA extrai nº, cliente, NIF, datas, valores e IVA automaticamente</p>
                  </div>
                  <Button data-testid="upload-invoice-btn" onClick={() => fileInputRef.current?.click()} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
                    <Upload size={16} className="mr-2" /> Escolher ficheiro
                  </Button>
                </div>
              )}
            </div>
          )}

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
      <Dialog open={payDialog.open} onOpenChange={(o) => { if (!o) resetPayForm(); setPayDialog({ ...payDialog, open: o }); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-white">Pagamentos</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Fatura {payDialog.invoice?.number} · Total {formatEuro(payDialog.invoice?.value_total)} · Em aberto: <span className="text-yellow-400 font-bold">{formatEuro(payDialog.invoice?.balance)}</span>
            </DialogDescription>
          </DialogHeader>

          {/* Existing payments list */}
          {payDialog.invoice?.payments?.length > 0 && (
            <div data-testid="payments-list" className="rounded-xl border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/60">
              {payDialog.invoice.payments.map(p => {
                const isEditing = editingPaymentId === p.id;
                return (
                  <div key={p.id} className={`p-3 flex items-center justify-between gap-2 ${isEditing ? 'bg-yellow-400/5' : ''}`}>
                    <div className="min-w-0">
                      <p className="text-sm text-white font-semibold">{formatEuro(p.amount)} <span className="text-zinc-500 text-xs font-normal">· {p.method || '—'}</span></p>
                      <p className="text-xs text-zinc-400">Pago em <span className="text-zinc-200">{p.date}</span>{p.notes ? <span className="text-zinc-500"> · {p.notes}</span> : null}</p>
                      {p.updated_at && <p className="text-[10px] text-zinc-600">editado {new Date(p.updated_at).toLocaleDateString('pt-PT')}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        data-testid={`edit-payment-${p.id}`}
                        onClick={() => startEditPayment(p)}
                        className={`p-1.5 rounded-md text-xs ${isEditing ? 'bg-yellow-400 text-zinc-950' : 'text-zinc-400 hover:text-yellow-400 hover:bg-zinc-800'}`}
                        title="Editar pagamento"
                      ><Pencil size={13} /></button>
                      <button
                        data-testid={`delete-payment-${p.id}`}
                        onClick={() => handleDeletePayment(p.id)}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-zinc-800"
                        title="Eliminar pagamento"
                      ><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Form: add new or edit */}
          <div className="border-t border-zinc-800 pt-3 mt-1">
            <p className="text-xs uppercase tracking-wider font-medium mb-2" style={{ color: editingPaymentId ? '#facc15' : '#a1a1aa' }}>
              {editingPaymentId ? 'A editar pagamento' : 'Novo pagamento'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1"><Label className="text-zinc-400 text-xs">Data do pagamento</Label><Input data-testid="pay-date" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
              <div className="col-span-2 sm:col-span-1"><Label className="text-zinc-400 text-xs">Valor</Label><Input data-testid="pay-amount" type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1 font-bold" /></div>
              <div className="col-span-2">
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
              <div className="col-span-2"><Label className="text-zinc-400 text-xs">Notas (opcional)</Label><Input data-testid="pay-notes" value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Ex: ref. transferência 1234" className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            {editingPaymentId && (
              <Button variant="outline" onClick={resetPayForm} className="border-zinc-700 text-zinc-300">Cancelar edição</Button>
            )}
            <Button variant="outline" onClick={() => { resetPayForm(); setPayDialog({ open: false, invoice: null }); }} className="border-zinc-700 text-zinc-300">Fechar</Button>
            <Button data-testid="save-payment-btn" onClick={handleAddPayment} className="bg-green-500 text-white hover:bg-green-600 font-semibold">
              {editingPaymentId ? 'Guardar alterações' : 'Registar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
