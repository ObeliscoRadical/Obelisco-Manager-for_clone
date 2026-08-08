import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { CheckCircle2, Clock, AlertTriangle, Receipt as ReceiptIcon } from 'lucide-react';
import { toast } from 'sonner';
import { InvoicesToolbar } from '../components/invoices/InvoicesToolbar';
import { InvoicesSummaryFilters } from '../components/invoices/InvoicesSummaryFilters';
import { InvoicesTable } from '../components/invoices/InvoicesTable';
import { InvoiceFormDialog } from '../components/invoices/InvoiceFormDialog';
import { InvoicePaymentsDialog } from '../components/invoices/InvoicePaymentsDialog';
import { devLog } from '../lib/browserStorage';

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
  due_date: '', client_name: '', client_phone: '', client_email: '', client_nif: '',
  obra_id: '', proposal_id: '', value_net: 0, vat_rate: 23, vat_amount: 0, value_total: 0,
  notes: '', invoice_file: null,
};

const addDays = (dateStr, days) => {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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
    } catch (err) {
      toast.error('Erro ao carregar faturas');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterYear, filterMonth, filterClient]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, due_date: addDays(new Date().toISOString().slice(0, 10), 30) });
    setDialogOpen(true);
  };

  const openEdit = (invoice) => {
    setEditing(invoice);
    setForm({ ...emptyForm, ...invoice });
    setDialogOpen(true);
  };

  const setField = (key, value) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'value_net' || key === 'vat_rate') {
        const net = parseFloat(next.value_net) || 0;
        const rate = parseFloat(next.vat_rate) || 0;
        next.vat_amount = Math.round(net * rate) / 100;
        next.value_total = Math.round((net + next.vat_amount) * 100) / 100;
      } else if (key === 'value_total') {
        const total = parseFloat(value) || 0;
        const rate = parseFloat(next.vat_rate) || 0;
        const net = total / (1 + rate / 100);
        next.value_net = Math.round(net * 100) / 100;
        next.vat_amount = Math.round((total - net) * 100) / 100;
      }
      return next;
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
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao guardar');
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/invoices/extract', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const extracted = data.extracted || {};
      if (extracted.error) {
        toast.error(`IA falhou: ${extracted.error}`);
        setForm(prev => ({ ...prev, invoice_file: data.file_name }));
      } else {
        setForm(prev => {
          const next = {
            ...prev,
            number: extracted.number || prev.number,
            issue_date: extracted.issue_date || prev.issue_date,
            due_date: extracted.due_date || prev.due_date || addDays(extracted.issue_date || prev.issue_date, 30),
            client_name: extracted.client_name || prev.client_name,
            client_nif: extracted.client_nif || prev.client_nif,
            client_email: extracted.client_email || prev.client_email,
            client_phone: extracted.client_phone || prev.client_phone,
            value_net: extracted.value_net || prev.value_net,
            vat_rate: extracted.vat_rate || prev.vat_rate,
            vat_amount: extracted.vat_amount || prev.vat_amount,
            value_total: extracted.value_total || prev.value_total,
            notes: extracted.notes ? (prev.notes ? `${prev.notes} | ${extracted.notes}` : extracted.notes) : prev.notes,
            invoice_file: data.file_name,
          };
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
    } finally {
      setExtracting(false);
    }
  };

  const viewInvoice = (filename) => {
    if (!filename) return;
    window.open(`${process.env.REACT_APP_BACKEND_URL}/api/invoices/file/${filename}`, '_blank');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar esta fatura?')) return;
    try {
      await api.delete(`/invoices/${id}`);
      toast.success('Eliminada');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro');
    }
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
    } catch (err) {
      devLog('[refresh invoice]', err?.message || err);
    }
  };

  const handleAddPayment = async () => {
    if (!payAmount || payAmount <= 0) {
      toast.error('Valor inválido');
      return;
    }
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
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro');
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm('Eliminar este pagamento?')) return;
    try {
      await api.delete(`/invoices/${payDialog.invoice.id}/payment/${paymentId}`);
      toast.success('Pagamento eliminado');
      if (editingPaymentId === paymentId) resetPayForm();
      await refreshDialogInvoice(payDialog.invoice.id);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro');
    }
  };

  const buildCollectionMessage = (invoice) => {
    const name = (invoice.client_name || '').split(/\s+/)[0] || 'Cliente';
    const amount = formatEuro(invoice.balance);
    const number = invoice.number || '—';
    const due = invoice.due_date || '—';
    const days = invoice.days_overdue || 0;
    if (days <= 0) return `Olá ${name}, tudo bem? 👋\n\nAqui é da Obelisco Radical — Instalações Eléctricas. Enviamos este lembrete amigável da fatura *${number}* no valor de *${amount}*, com vencimento a *${due}*.\n\nSe já tiver efectuado o pagamento, por favor desconsidere esta mensagem. Caso contrário, agradecemos desde já a regularização.\n\nQualquer dúvida estamos ao seu dispor.\n\nCom os melhores cumprimentos,\nObelisco Radical`;
    if (days <= 7) return `Olá ${name}, tudo bem? 👋\n\nAqui é da Obelisco Radical. Notámos que a fatura *${number}* no valor de *${amount}* venceu a *${due}* e ainda não foi liquidada (${days} dia${days === 1 ? '' : 's'} em atraso).\n\nPresumimos que se tenha tratado de um esquecimento. Agradecíamos que procedesse ao pagamento logo que possível. Se já efectuou a transferência, por favor confirme-nos para atualizarmos os nossos registos.\n\nObrigado pela preferência!\n\nObelisco Radical`;
    if (days <= 30) return `Bom dia ${name},\n\nDa parte da Obelisco Radical, vimos por este meio alertar que a fatura *${number}* no valor de *${amount}*, com vencimento a *${due}*, está em atraso há *${days} dias*.\n\nSolicitamos que proceda à regularização no prazo de 48h. Caso exista alguma questão ou necessite de acordar um plano de pagamento, fale connosco e procuramos a melhor solução em conjunto.\n\nAgradecemos a sua atenção.\n\nObelisco Radical · Gestão de Cobranças`;
    return `Exmo(a). ${invoice.client_name},\n\nServe a presente para informar V. Exa. que a fatura *${number}*, emitida em nome de V. Exa., no valor de *${amount}* e com data de vencimento a *${due}*, encontra-se em atraso há *${days} dias*.\n\nApesar das tentativas de contacto prévias, o valor permanece por liquidar. Solicitamos encarecidamente a regularização no prazo máximo de 5 dias úteis, findo o qual seremos forçados a encaminhar o processo para cobrança judicial, com os encargos legais e honorários inerentes a correrem por conta de V. Exa.\n\nCaso pretenda negociar um plano de pagamento, contacte-nos com urgência.\n\nAtenciosamente,\nObelisco Radical · Departamento de Cobranças`;
  };

  const sendWhatsAppReminder = async (invoice) => {
    const phone = (invoice.client_phone || '').replace(/\D/g, '');
    if (!phone) {
      toast.error(`${invoice.client_name}: sem telefone registado`);
      return false;
    }
    const fullPhone = phone.startsWith('351') ? phone : `351${phone}`;
    window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(buildCollectionMessage(invoice))}`, '_blank');
    try {
      await api.post(`/invoices/${invoice.id}/reminder-log`);
      fetchAll();
    } catch (err) {
      devLog('[reminder-log]', err?.message || err);
    }
    return true;
  };

  const sendBulkCollection = async () => {
    const overdue = invoices.filter(i => i.status && i.status.startsWith('vencida') && i.balance > 0.01);
    if (overdue.length === 0) return toast.info('Sem faturas vencidas para cobrar');
    const withPhone = overdue.filter(i => (i.client_phone || '').trim());
    const noPhone = overdue.length - withPhone.length;
    if (withPhone.length === 0) return toast.error('Nenhuma fatura vencida tem telefone registado');
    const confirmMsg = `Vai abrir ${withPhone.length} conversa${withPhone.length === 1 ? '' : 's'} de WhatsApp para cobrança${noPhone > 0 ? ` (${noPhone} sem telefone serão ignoradas)` : ''}. Continuar?`;
    if (!window.confirm(confirmMsg)) return;
    for (const inv of withPhone) {
      await sendWhatsAppReminder(inv);
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    toast.success(`${withPhone.length} mensagem${withPhone.length === 1 ? '' : 's'} aberta${withPhone.length === 1 ? '' : 's'} no WhatsApp`);
  };

  if (loading) return <div className="text-zinc-400 text-sm">A carregar...</div>;

  return (
    <div data-testid="faturas-page" className="space-y-6">
      <InvoicesToolbar summary={summary} onBulkCollection={sendBulkCollection} onNew={openNew} />

      <InvoicesSummaryFilters
        summary={summary}
        formatEuro={formatEuro}
        filterYear={filterYear}
        filterMonth={filterMonth}
        filterClient={filterClient}
        filterStatus={filterStatus}
        clients={clients}
        months={MONTHS}
        onYearChange={setFilterYear}
        onMonthChange={setFilterMonth}
        onClientChange={setFilterClient}
        onStatusChange={setFilterStatus}
        onClearFilters={() => { setFilterMonth(''); setFilterClient(''); }}
      />

      <InvoicesTable
        invoices={invoices}
        statusMeta={STATUS_META}
        formatEuro={formatEuro}
        onViewFile={viewInvoice}
        onOpenPayment={openPay}
        onWhatsApp={sendWhatsAppReminder}
        onEdit={openEdit}
        onDelete={handleDelete}
      />

      <InvoiceFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} form={form} setField={setField} extracting={extracting} fileInputRef={fileInputRef} onUpload={handleUpload} onSave={handleSave} />

      <InvoicePaymentsDialog
        open={payDialog.open}
        onOpenChange={(open) => setPayDialog(prev => ({ ...prev, open, invoice: open ? prev.invoice : null }))}
        payDialog={payDialog}
        formatEuro={formatEuro}
        editingPaymentId={editingPaymentId}
        resetPayForm={resetPayForm}
        startEditPayment={startEditPayment}
        handleDeletePayment={handleDeletePayment}
        payDate={payDate}
        setPayDate={setPayDate}
        payAmount={payAmount}
        setPayAmount={setPayAmount}
        payMethod={payMethod}
        setPayMethod={setPayMethod}
        payNotes={payNotes}
        setPayNotes={setPayNotes}
        handleAddPayment={handleAddPayment}
      />
    </div>
  );
}