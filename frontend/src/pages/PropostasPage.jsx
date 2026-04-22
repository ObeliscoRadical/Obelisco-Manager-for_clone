import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, MessageCircle, HardHat, Trash2, ClipboardList, Settings, Check, X, PenLine, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

const tierColors = {
  basico: 'bg-zinc-700 text-zinc-200',
  profissional: 'bg-yellow-400/20 text-yellow-400',
  premium: 'bg-green-500/20 text-green-400',
};

const PAYMENT_OPTIONS = [
  'Transferência Bancaria',
  'MB Way',
  'Multibanco',
  'Cartão de Crédito/Débito',
  'Numerario',
  'Cheque',
];

const SPLIT_OPTIONS = [
  '50% no início dos trabalhos, 50% na conclusao',
  '30% no início, 40% a meio, 30% na conclusao',
  '100% no início dos trabalhos',
  '100% na conclusao dos trabalhos',
  'Pagamento a 30 dias apos conclusao',
];

async function generatePDF(proposal, settings, logoBase64) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.width;
  const pageH = doc.internal.pageSize.height;

  // ===== DARK HEADER =====
  doc.setFillColor(9, 9, 11);
  doc.rect(0, 0, pageW, 52, 'F');
  doc.setFillColor(250, 204, 21);
  doc.rect(0, 52, pageW, 2, 'F');

  // Logo with soft dark halo to disguise any edge between logo and dark background
  if (logoBase64) {
    try {
      // Soft dark vignette around the logo (fades from #09090B to slightly darker)
      // Draw concentric rounded rectangles with decreasing opacity to blur the edge
      const logoX = 15, logoY = 6, logoW = 50, logoH = 28;
      const layers = 6;
      for (let i = layers; i >= 1; i--) {
        const pad = i * 1.2;
        const alpha = 0.08 * i;
        doc.setGState(new doc.GState({ opacity: alpha }));
        doc.setFillColor(9, 9, 11);
        doc.roundedRect(logoX - pad, logoY - pad, logoW + pad * 2, logoH + pad * 2, 4 + pad, 4 + pad, 'F');
      }
      doc.setGState(new doc.GState({ opacity: 1 }));
      doc.addImage(logoBase64, 'PNG', logoX, logoY, logoW, logoH);
    } catch (e) {
      console.error('Logo error:', e.message);
    }
  }

  // Company text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('OBELISCO RADICAL', 70, 18);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(161, 161, 170);
  doc.text('ELETRICIDADE & TELECOMUNICAÇÕES', 70, 24);
  doc.setFontSize(6);
  doc.text('Tel: +351 911 132 401 | obeliscoradical@gmail.com', 70, 30);
  doc.text('Grande Lisboa | www.obeliscoradical.pt', 70, 35);

  // PROPOSTA right (tier label removed from PDF - client does not see Básico/Profissional/Premium)
  doc.setTextColor(250, 204, 21);
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.text('PROPOSTA', pageW - 15, 30, { align: 'right' });

  // Date
  doc.setFillColor(39, 39, 42);
  doc.roundedRect(pageW - 60, 36, 45, 10, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setTextColor(200, 200, 200);
  doc.text(new Date().toLocaleDateString('pt-PT'), pageW - 38, 42.5, { align: 'center' });

  // ===== CLIENT BOX =====
  let y = 62;
  doc.setFillColor(24, 24, 27);
  doc.roundedRect(15, y, pageW - 30, 24, 3, 3, 'F');
  doc.setDrawColor(39, 39, 42);
  doc.roundedRect(15, y, pageW - 30, 24, 3, 3, 'S');

  doc.setTextColor(161, 161, 170);
  doc.setFontSize(6.5);
  doc.text('CLIENTE', 22, y + 7);
  doc.text('TELEFONE', 110, y + 7);
  doc.text('REF.', 160, y + 7);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(proposal.client_name || '-', 22, y + 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(proposal.client_phone || '-', 110, y + 16);
  doc.setTextColor(250, 204, 21);
  doc.setFontSize(8);
  doc.text(proposal.id ? proposal.id.substring(0, 8).toUpperCase() : '-', 160, y + 16);

  // ===== TITLE =====
  y = 94;
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(proposal.title || 'Proposta', 15, y);
  y += 6;
  doc.setTextColor(120, 120, 120);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const descLines = doc.splitTextToSize(proposal.description || '', pageW - 30);
  doc.text(descLines, 15, y);
  y += descLines.length * 4 + 5;

  // ===== ITEMS TABLE (PVP ONLY) =====
  const tableData = (proposal.items || []).map(item => {
    const pvpUnit = item.unit_cost * (1 + (item.margin || 0));
    let pvpTotal = pvpUnit * (item.quantity || 0);
    // Apply per-item discount silently to line total
    const dv = item.discount_value || 0;
    if (dv > 0) {
      if (item.discount_type === 'value') pvpTotal = Math.max(0, pvpTotal - dv);
      else pvpTotal = pvpTotal * (1 - dv / 100);
    }
    return [
      item.name || '-',
      (item.quantity || 0).toString(),
      formatEuro(pvpUnit),
      formatEuro(pvpTotal),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Descrição do Serviço', 'Qtd', 'Preço Unit.', 'Total']],
    body: tableData,
    theme: 'plain',
    headStyles: { fillColor: [250, 204, 21], textColor: [9, 9, 11], fontStyle: 'bold', fontSize: 8, cellPadding: 4 },
    bodyStyles: { fontSize: 8, textColor: [60, 60, 60], cellPadding: 3.5 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 15, right: 15 },
  });

  let finalY = doc.lastAutoTable.finalY + 8;

  // ===== TOTAL BOX =====
  doc.setFillColor(9, 9, 11);
  doc.roundedRect(pageW - 95, finalY, 80, 28, 3, 3, 'F');
  doc.setTextColor(161, 161, 170);
  doc.setFontSize(7);
  doc.text('SUBTOTAL', pageW - 88, finalY + 8);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text(formatEuro(proposal.final_value), pageW - 22, finalY + 8, { align: 'right' });
  doc.setFillColor(250, 204, 21);
  doc.rect(pageW - 88, finalY + 12, 66, 0.5, 'F');
  doc.setTextColor(250, 204, 21);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('VALOR TOTAL', pageW - 88, finalY + 19);
  doc.setFontSize(14);
  doc.text(formatEuro(proposal.final_value), pageW - 22, finalY + 25, { align: 'right' });

  finalY += 38;

  // ===== PAYMENT & CONDITIONS (prefer proposal-specific, fallback to global settings) =====
  const payMethodsArr = (proposal.payment_methods && proposal.payment_methods.length > 0)
    ? proposal.payment_methods
    : (settings?.payment_methods || ['Transferência Bancária', 'MB Way']);
  const payMethods = payMethodsArr.join(', ');
  const paySplit = proposal.payment_split || settings?.payment_split || '50% no início, 50% na conclusão';
  const payNotes = proposal.payment_notes || '';
  const validDays = settings?.validity_days || 30;
  const conditions = settings?.conditions || [];
  const notes = settings?.notes || '';

  // Always render payment + conditions: if there isn't enough vertical space, add a new page
  const payBoxH = payNotes ? 24 : 16;
  const WARRANTY_LINE = 'Garantia de 2 anos sobre mão de obra e materiais fornecidos';
  const IVA_LINE = 'Valores em EUR, IVA NÃO incluído (a acrescer à taxa legal em vigor)';
  const condLines = [
    `Proposta válida por ${validDays} dias`,
    WARRANTY_LINE,
    IVA_LINE,
    ...conditions.filter(c => {
      const l = c.toLowerCase();
      return !l.includes('iva') && !l.includes('garantia');
    }),
  ];
  if (notes) condLines.push(`Nota: ${notes}`);
  const condBoxH = 8 + condLines.length * 4;
  const requiredSpace = payBoxH + 6 + condBoxH + 10; // +10 footer margin

  if (finalY + requiredSpace > pageH - 25) {
    doc.addPage();
    finalY = 20;
  }

  // Payment box
  doc.setFillColor(24, 24, 27);
  doc.roundedRect(15, finalY, pageW - 30, payBoxH, 3, 3, 'F');
  doc.setTextColor(250, 204, 21);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('FORMA DE PAGAMENTO', 22, finalY + 6);
  doc.setTextColor(220, 220, 220);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`Métodos aceites: ${payMethods}`, 22, finalY + 11);
  const splitLines = doc.splitTextToSize(`Condições: ${paySplit}`, pageW - 44);
  doc.text(splitLines.slice(0, 2), 22, finalY + 15);
  if (payNotes) {
    const nLines = doc.splitTextToSize(`Obs: ${payNotes}`, pageW - 44);
    doc.text(nLines.slice(0, 2), 22, finalY + 20);
  }

  finalY += payBoxH + 6;

  // Conditions box
  doc.setFillColor(24, 24, 27);
  doc.roundedRect(15, finalY, pageW - 30, condBoxH, 3, 3, 'F');
  doc.setTextColor(250, 204, 21);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('CONDIÇÕES GERAIS', 22, finalY + 6);
  doc.setTextColor(180, 180, 180);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  condLines.forEach((line, i) => {
    doc.text(`• ${line}`, 22, finalY + 10 + i * 4);
  });

  // ===== SIGNATURE BLOCK (if signed) =====
  if (proposal.signature_data && proposal.sign_status === 'signed') {
    const sigY = pageH - 58;
    doc.setFillColor(250, 204, 21);
    doc.roundedRect(15, sigY, pageW - 30, 26, 3, 3, 'F');
    doc.setTextColor(9, 9, 11);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('PROPOSTA ACEITE E ASSINADA PELO CLIENTE', 22, sigY + 5);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`Por: ${proposal.signed_by_name || ''}`, 22, sigY + 10);
    const signedDate = proposal.signed_at ? new Date(proposal.signed_at).toLocaleString('pt-PT') : '';
    doc.text(`Data: ${signedDate}`, 22, sigY + 14);
    if (proposal.signed_by_email) doc.text(`Email: ${proposal.signed_by_email}`, 22, sigY + 18);
    if (proposal.signed_by_ip) doc.text(`IP: ${proposal.signed_by_ip}`, 22, sigY + 22);
    try {
      doc.addImage(proposal.signature_data, 'PNG', pageW - 90, sigY + 2, 72, 22);
    } catch (e) { console.error('Signature image error:', e.message); }
  }

  // ===== FOOTER WITH QR CODE =====
  doc.setFillColor(9, 9, 11);
  doc.rect(0, pageH - 25, pageW, 25, 'F');
  doc.setFillColor(250, 204, 21);
  doc.rect(0, pageH - 25, pageW, 0.8, 'F');

  // QR Code
  try {
    const qrDataUrl = await QRCode.toDataURL('https://www.obeliscoradical.pt', { width: 200, margin: 1, color: { dark: '#FACC15', light: '#09090b' } });
    doc.addImage(qrDataUrl, 'PNG', pageW - 32, pageH - 23, 18, 18);
  } catch (e) { console.error('QR error:', e.message); }

  doc.setTextColor(161, 161, 170);
  doc.setFontSize(7);
  doc.text('Obelisco Radical - Eletricidade & Telecomunicacoes', 15, pageH - 16);
  doc.text('Tel: +351 911 132 401  |  obeliscoradical@gmail.com', 15, pageH - 11);
  doc.text('www.obeliscoradical.pt  |  Grande Lisboa', 15, pageH - 6);
  doc.setTextColor(250, 204, 21);

  // Watermark
  if (logoBase64) {
    try {
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({ opacity: 0.03 }));
      doc.addImage(logoBase64, 'PNG', pageW / 2 - 40, pageH / 2 - 20, 80, 40);
      doc.restoreGraphicsState();
    } catch (e) { /* ignore */ }
  }

  doc.save(`Proposta_${proposal.label}_${proposal.client_name.replace(/\s/g, '_')}.pdf`);
  toast.success('Proposta PDF gerada com logo!');
}

function sendWhatsApp(proposal) {
  const phone = proposal.client_phone ? proposal.client_phone.replace(/\D/g, '') : '351911132401';
  const fullPhone = phone.startsWith('351') ? phone : `351${phone}`;
  const msg = `Ola ${proposal.client_name}, segue a proposta ${proposal.label} para "${proposal.title}" no valor de ${formatEuro(proposal.final_value)}. Obelisco Radical - Eletricidade`;
  window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

export default function PropostasPage() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [logoBase64, setLogoBase64] = useState(null);
  const [settings, setSettings] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editSettings, setEditSettings] = useState(null);

  const fetchProposals = useCallback(async () => {
    try {
      const { data } = await api.get('/proposals');
      setProposals(data);
    } catch (err) {
      console.error('Proposals fetch error:', err.message);
      toast.error('Erro ao carregar propostas');
    }
    finally { setLoading(false); }
  }, []);

  const fetchLogo = useCallback(async () => {
    try {
      const { data } = await api.get('/logo');
      setLogoBase64(data.logo);
    } catch (err) {
      console.error('Logo fetch error:', err.message);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await api.get('/proposal-settings');
      setSettings(data);
    } catch (err) {
      console.error('Settings fetch error:', err.message);
    }
  }, []);

  useEffect(() => {
    fetchProposals();
    fetchLogo();
    fetchSettings();
  }, [fetchProposals, fetchLogo, fetchSettings]);

  const openSettings = () => {
    setEditSettings(settings ? { ...settings } : {
      payment_methods: ['Transferência Bancaria', 'MB Way', 'Multibanco'],
      payment_split: '50% no início dos trabalhos, 50% na conclusao',
      validity_days: 30,
      warranty_text: 'Garantia de 2 anos sobre mão de obra e materiais fornecidos',
      conditions: ['Valores em EUR, IVA NAO incluído (a acrescer a taxa legal em vigor)', 'Deslocacao incluida na zona da Grande Lisboa', 'Material e mão de obra incluidos'],
      notes: '',
    });
    setSettingsOpen(true);
  };

  const togglePayMethod = (method) => {
    const current = editSettings.payment_methods || [];
    if (current.includes(method)) {
      setEditSettings({ ...editSettings, payment_methods: current.filter(m => m !== method) });
    } else {
      setEditSettings({ ...editSettings, payment_methods: [...current, method] });
    }
  };

  const toggleCondition = (cond) => {
    const current = editSettings.conditions || [];
    if (current.includes(cond)) {
      setEditSettings({ ...editSettings, conditions: current.filter(c => c !== cond) });
    } else {
      setEditSettings({ ...editSettings, conditions: [...current, cond] });
    }
  };

  const saveSettings = async () => {
    try {
      const { data } = await api.put('/proposal-settings', editSettings);
      setSettings(data);
      setSettingsOpen(false);
      toast.success('Definições de proposta guardadas');
    } catch (err) {
      console.error('Settings save error:', err.message);
      toast.error('Erro ao guardar definições');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar esta proposta?')) return;
    try { await api.delete(`/proposals/${id}`); toast.success('Proposta eliminada'); fetchProposals(); }
    catch { toast.error('Erro ao eliminar'); }
  };

  const handleCreateWork = async (proposalId) => {
    try {
      await api.post(`/works/from-proposal/${proposalId}`);
      toast.success('Obra criada a partir da proposta!');
    } catch { toast.error('Erro ao criar obra'); }
  };

  const [signLinkDialog, setSignLinkDialog] = useState({ open: false, proposal: null, token: '' });

  const handleSignLink = async (proposal) => {
    try {
      const { data } = await api.post(`/proposals/${proposal.id}/sign-link`);
      setSignLinkDialog({ open: true, proposal, token: data.token });
    } catch {
      toast.error('Erro ao criar link de assinatura');
    }
  };

  const buildSignUrl = (token) => `${window.location.origin}/p/${token}`;

  const copySignLink = (token) => {
    navigator.clipboard.writeText(buildSignUrl(token));
    toast.success('Link copiado!');
  };

  const shareWhatsAppSign = (proposal, token) => {
    const phone = proposal.client_phone ? proposal.client_phone.replace(/\D/g, '') : '';
    const link = buildSignUrl(token);
    const msg = `Olá ${proposal.client_name}, segue a proposta "${proposal.title}" no valor de ${formatEuro(proposal.final_value)}. Para aceitar e assinar digitalmente aceda a: ${link}`;
    const fullPhone = phone.startsWith('351') ? phone : (phone ? `351${phone}` : '');
    const url = fullPhone ? `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const filtered = activeTab === 'all' ? proposals : proposals.filter(p => p.tier === activeTab);
  const grouped = filtered.reduce((acc, p) => {
    const key = p.budget_id || 'sem-orçamento';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const DEFAULT_CONDITIONS = [
    'Valores em EUR com IVA incluído',
    'Deslocacao incluida na zona da Grande Lisboa',
    'Material e mão de obra incluidos',
    'Alteracoes ao orçamento podem afetar o valor final',
    'Trabalhos executados por tecnicos certificados',
    'Limpeza do local apos conclusao dos trabalhos',
  ];

  return (
    <div data-testid="propostas-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Propostas</h1>
          <p className="text-zinc-400 mt-1 font-medium">Visualize, exporte e envie propostas</p>
        </div>
        <Button data-testid="settings-btn" onClick={openSettings} className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded-full font-medium">
          <Settings size={16} className="mr-2" /> Pagamento e Condições
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800 rounded-full p-1">
          <TabsTrigger value="all" className="rounded-full data-[state=active]:bg-yellow-400 data-[state=active]:text-zinc-950 text-zinc-400 text-sm font-medium">Todas</TabsTrigger>
          <TabsTrigger value="basico" className="rounded-full data-[state=active]:bg-yellow-400 data-[state=active]:text-zinc-950 text-zinc-400 text-sm font-medium">Básico</TabsTrigger>
          <TabsTrigger value="profissional" className="rounded-full data-[state=active]:bg-yellow-400 data-[state=active]:text-zinc-950 text-zinc-400 text-sm font-medium">Profissional</TabsTrigger>
          <TabsTrigger value="premium" className="rounded-full data-[state=active]:bg-yellow-400 data-[state=active]:text-zinc-950 text-zinc-400 text-sm font-medium">Premium</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {loading && (
            <div className="flex justify-center py-16"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
          )}
          {!loading && Object.keys(grouped).length === 0 && (
            <div className="text-center py-16 text-zinc-500">
              <ClipboardList size={48} className="mx-auto mb-4 text-zinc-700" />
              <p>Nenhuma proposta encontrada</p>
              <p className="text-sm mt-1">Gere propostas a partir de um orçamento</p>
            </div>
          )}
          {!loading && Object.keys(grouped).length > 0 && (
            <div className="space-y-8">
              {Object.entries(grouped).map(([budgetId, props]) => (
                <div key={budgetId}>
                  <p className="text-xs uppercase tracking-wider text-zinc-500 mb-3 font-medium">Orçamento: {budgetId.substring(0, 8)}...</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {props.map(p => (
                      <Card key={p.id} className="bg-zinc-900 border-zinc-800 rounded-3xl hover:shadow-[0_0_15px_rgba(250,204,21,0.15)] transition-all duration-300">
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <Badge className={tierColors[p.tier]}>{p.label}</Badge>
                              {p.sign_status === 'signed' && (
                                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]" data-testid={`signed-badge-${p.id}`}>
                                  <Check size={10} className="mr-1" /> Assinada
                                </Badge>
                              )}
                            </div>
                            <button data-testid={`delete-proposal-${p.id}`} onClick={() => handleDelete(p.id)} className="text-zinc-600 hover:text-red-400 transition"><Trash2 size={16} /></button>
                          </div>
                          <h3 className="text-lg font-bold text-white mb-1 truncate">{p.title}</h3>
                          <p className="text-sm text-zinc-400 mb-4">{p.client_name}</p>
                          <p className="text-xs text-zinc-500 mb-1">{p.description}</p>
                          <div className="mt-4 pt-4 border-t border-zinc-800">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-500 font-semibold">VALOR FINAL</span>
                              <span className="text-2xl font-black text-yellow-400">{formatEuro(p.final_value)}</span>
                            </div>
                          </div>
                          {p.sign_status === 'signed' && p.signed_by_name && (
                            <div className="mt-3 p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs">
                              <p className="text-green-400 font-semibold">Assinada por {p.signed_by_name}</p>
                              <p className="text-zinc-500">{p.signed_at ? new Date(p.signed_at).toLocaleString('pt-PT') : ''}</p>
                            </div>
                          )}
                          <div className="mt-5 flex gap-2">
                            <Button data-testid={`export-pdf-${p.id}`} onClick={async () => {
                              // Backup: se a proposta não tem condições próprias preenchidas,
                              // vai buscar ao orçamento de origem as mais recentes antes de gerar.
                              let enriched = p;
                              const missing = (!p.payment_methods || p.payment_methods.length === 0) && !p.payment_split && !p.payment_notes;
                              if (missing && p.budget_id) {
                                try {
                                  const { data: b } = await api.get(`/budgets/${p.budget_id}`);
                                  enriched = {
                                    ...p,
                                    payment_methods: b.payment_methods || [],
                                    payment_split: b.payment_split || '',
                                    payment_notes: b.payment_notes || '',
                                  };
                                } catch { /* ignore, gera com o que existir */ }
                              }
                              generatePDF(enriched, settings, logoBase64);
                            }} size="sm" className="flex-1 bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full text-xs font-semibold">
                              <Download size={14} className="mr-1" /> PDF
                            </Button>
                            <Button data-testid={`send-whatsapp-${p.id}`} onClick={() => sendWhatsApp(p)} size="sm" className="flex-1 bg-green-500 text-white hover:bg-green-600 rounded-full text-xs font-semibold">
                              <MessageCircle size={14} className="mr-1" /> WhatsApp
                            </Button>
                          </div>
                          <Button data-testid={`sign-link-${p.id}`} onClick={() => handleSignLink(p)} variant="outline" size="sm" className="w-full mt-2 border-yellow-400/40 text-yellow-400 hover:bg-yellow-400/10 rounded-full text-xs">
                            <PenLine size={14} className="mr-1" /> {p.sign_status === 'signed' ? 'Ver link de assinatura' : 'Enviar para assinatura'}
                          </Button>
                          <Button data-testid={`create-work-${p.id}`} onClick={() => handleCreateWork(p.id)} variant="outline" size="sm" className="w-full mt-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-full text-xs">
                            <HardHat size={14} className="mr-1" /> Criar Obra
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white">Pagamento e Condições</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">Configure formas de pagamento e condições que aparecem nas propostas PDF</DialogDescription>
          </DialogHeader>
          {editSettings && (
            <div className="space-y-6 mt-4">
              {/* Payment Methods */}
              <div>
                <Label className="text-zinc-300 text-sm font-semibold">Formas de Pagamento Aceites</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {PAYMENT_OPTIONS.map(method => {
                    const active = editSettings.payment_methods?.includes(method);
                    return (
                      <button
                        key={method}
                        data-testid={`pay-method-${method.replace(/\s/g, '-').toLowerCase()}`}
                        onClick={() => togglePayMethod(method)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all ${
                          active
                            ? 'bg-yellow-400/20 border border-yellow-400/50 text-yellow-400'
                            : 'bg-zinc-900 border border-zinc-800 text-zinc-500 hover:border-zinc-700'
                        }`}
                      >
                        {active ? <Check size={14} /> : <X size={14} className="opacity-30" />}
                        {method}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Payment Split */}
              <div>
                <Label className="text-zinc-300 text-sm font-semibold">Condições de Pagamento</Label>
                <div className="space-y-2 mt-2">
                  {SPLIT_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      onClick={() => setEditSettings({ ...editSettings, payment_split: opt })}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                        editSettings.payment_split === opt
                          ? 'bg-yellow-400/20 border border-yellow-400/50 text-yellow-400'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Validity & Warranty */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-zinc-300 text-sm font-semibold">Validade (dias)</Label>
                  <Input
                    data-testid="validity-days"
                    type="number"
                    min="1"
                    value={editSettings.validity_days || 30}
                    onChange={e => setEditSettings({ ...editSettings, validity_days: parseInt(e.target.value) || 30 })}
                    className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-zinc-300 text-sm font-semibold">Garantia</Label>
                  <Input
                    data-testid="warranty-text"
                    value={editSettings.warranty_text || ''}
                    onChange={e => setEditSettings({ ...editSettings, warranty_text: e.target.value })}
                    className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl"
                    placeholder="Ex: Garantia de 2 anos"
                  />
                </div>
              </div>

              {/* Conditions Checklist */}
              <div>
                <Label className="text-zinc-300 text-sm font-semibold">Condições Gerais</Label>
                <div className="space-y-2 mt-2">
                  {DEFAULT_CONDITIONS.map(cond => {
                    const active = editSettings.conditions?.includes(cond);
                    return (
                      <button
                        key={cond}
                        onClick={() => toggleCondition(cond)}
                        className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ${
                          active
                            ? 'bg-yellow-400/10 border border-yellow-400/30 text-zinc-200'
                            : 'bg-zinc-900 border border-zinc-800 text-zinc-500 hover:border-zinc-700'
                        }`}
                      >
                        {active ? <Check size={14} className="text-yellow-400 shrink-0" /> : <X size={14} className="opacity-30 shrink-0" />}
                        {cond}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label className="text-zinc-300 text-sm font-semibold">Nota adicional</Label>
                <Input
                  data-testid="proposal-notes"
                  value={editSettings.notes || ''}
                  onChange={e => setEditSettings({ ...editSettings, notes: e.target.value })}
                  className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl"
                  placeholder="Ex: Orçamento sujeito a visita tecnica"
                />
              </div>

              <Button data-testid="save-settings-btn" onClick={saveSettings} className="w-full bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold h-12">
                Guardar Definições
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Signature Link Dialog */}
      <Dialog open={signLinkDialog.open} onOpenChange={(open) => setSignLinkDialog({ ...signLinkDialog, open })}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white">Link de Assinatura</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">Partilhe este link com o cliente. Ele poderá ver e assinar digitalmente a proposta no telemóvel ou computador.</DialogDescription>
          </DialogHeader>
          {signLinkDialog.token && (
            <div className="space-y-4 mt-2">
              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 break-all font-mono text-xs text-yellow-400" data-testid="sign-link-url">
                {buildSignUrl(signLinkDialog.token)}
              </div>
              <div className="flex gap-2">
                <Button data-testid="copy-sign-link-btn" onClick={() => copySignLink(signLinkDialog.token)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full">
                  <Copy size={14} className="mr-2" /> Copiar Link
                </Button>
                <Button data-testid="whatsapp-sign-btn" onClick={() => shareWhatsAppSign(signLinkDialog.proposal, signLinkDialog.token)} className="flex-1 bg-green-500 hover:bg-green-600 text-white rounded-full">
                  <MessageCircle size={14} className="mr-2" /> Enviar WhatsApp
                </Button>
              </div>
              {signLinkDialog.proposal?.sign_status === 'signed' ? (
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
                  <strong>Já assinada</strong> por {signLinkDialog.proposal.signed_by_name}
                  {signLinkDialog.proposal.signed_at && <span className="text-zinc-500"> em {new Date(signLinkDialog.proposal.signed_at).toLocaleString('pt-PT')}</span>}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 text-center">O link é único desta proposta e permanece válido até ser assinada.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
