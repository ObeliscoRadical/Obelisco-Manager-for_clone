import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, MessageCircle, HardHat, Trash2, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const LOGO_URL = "https://customer-assets.emergentagent.com/job_5fce1f4d-80cf-4626-b6e9-65e04d47c472/artifacts/h167wiyk_Captura%20de%20Tela%202026-03-12%20a%CC%80s%2021.48.12.png";

const tierColors = {
  basico: 'bg-zinc-700 text-zinc-200',
  profissional: 'bg-yellow-400/20 text-yellow-400',
  premium: 'bg-green-500/20 text-green-400',
};

async function fetchLogoBase64() {
  try {
    const resp = await fetch(LOGO_URL);
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('Logo fetch CORS error:', err.message);
    return null;
  }
}

async function generatePDF(proposal) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.width;
  const pageH = doc.internal.pageSize.height;
  const logoBase64 = await fetchLogoBase64();

  // ===== DARK HEADER BAND =====
  doc.setFillColor(9, 9, 11); // zinc-950
  doc.rect(0, 0, pageW, 52, 'F');

  // Yellow accent line
  doc.setFillColor(250, 204, 21); // yellow-400
  doc.rect(0, 52, pageW, 2, 'F');

  // Logo in header
  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', 15, 8, 45, 22); } catch (e) {
      console.error('Logo embed error:', e.message);
    }
  }

  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('OBELISCO RADICAL', 65, 18);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(161, 161, 170); // zinc-400
  doc.text('ELETRICIDADE & TELECOMUNICACOES', 65, 24);

  // Proposal label right
  doc.setTextColor(250, 204, 21);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('PROPOSTA', pageW - 15, 22, { align: 'right' });
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(proposal.label.toUpperCase(), pageW - 15, 30, { align: 'right' });

  // Date badge
  doc.setFillColor(39, 39, 42); // zinc-800
  doc.roundedRect(pageW - 60, 36, 45, 10, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setTextColor(200, 200, 200);
  doc.text(new Date().toLocaleDateString('pt-PT'), pageW - 38, 42.5, { align: 'center' });

  // ===== CLIENT INFO BOX =====
  let y = 62;
  doc.setFillColor(24, 24, 27); // zinc-900
  doc.roundedRect(15, y, pageW - 30, 28, 3, 3, 'F');
  doc.setDrawColor(39, 39, 42);
  doc.roundedRect(15, y, pageW - 30, 28, 3, 3, 'S');

  doc.setTextColor(161, 161, 170);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('CLIENTE', 22, y + 8);
  doc.text('TELEFONE', 120, y + 8);
  doc.text('REFERENCIA', 120, y + 18);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(proposal.client_name || '-', 22, y + 15);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(proposal.client_phone || '-', 120, y + 15);
  doc.setFontSize(8);
  doc.setTextColor(250, 204, 21);
  doc.text(proposal.id ? proposal.id.substring(0, 8).toUpperCase() : '-', 120, y + 24);

  // ===== PROPOSAL TITLE =====
  y = 98;
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(proposal.title || 'Proposta', 15, y);

  // Description
  y += 7;
  doc.setTextColor(161, 161, 170);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const descLines = doc.splitTextToSize(proposal.description || '', pageW - 30);
  doc.text(descLines, 15, y);
  y += descLines.length * 4 + 6;

  // ===== ITEMS TABLE (PVP ONLY - no margins/costs shown) =====
  const tableData = (proposal.items || []).map(item => {
    const pvpUnit = item.unit_cost * (1 + (item.margin || 0));
    const pvpTotal = pvpUnit * (item.quantity || 0);
    return [
      item.name || '-',
      (item.quantity || 0).toString(),
      formatEuro(pvpUnit),
      formatEuro(pvpTotal),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Descricao', 'Qtd', 'Preco Unit.', 'Total']],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: [250, 204, 21],
      textColor: [9, 9, 11],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [60, 60, 60],
      cellPadding: 3.5,
    },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 32, halign: 'right' },
      3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 15, right: 15 },
  });

  let finalY = doc.lastAutoTable.finalY + 8;

  // ===== TOTALS BOX =====
  doc.setFillColor(9, 9, 11);
  doc.roundedRect(pageW - 95, finalY, 80, 30, 3, 3, 'F');

  // Subtotal
  doc.setTextColor(161, 161, 170);
  doc.setFontSize(7);
  doc.text('SUBTOTAL', pageW - 88, finalY + 8);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text(formatEuro(proposal.base_value * proposal.multiplier), pageW - 22, finalY + 8, { align: 'right' });

  // Yellow line
  doc.setFillColor(250, 204, 21);
  doc.rect(pageW - 88, finalY + 12, 66, 0.5, 'F');

  // VALOR FINAL
  doc.setTextColor(250, 204, 21);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('VALOR TOTAL', pageW - 88, finalY + 19);
  doc.setFontSize(14);
  doc.text(formatEuro(proposal.final_value), pageW - 22, finalY + 26, { align: 'right' });

  finalY += 40;

  // ===== CONDITIONS =====
  if (finalY < pageH - 60) {
    doc.setFillColor(24, 24, 27);
    doc.roundedRect(15, finalY, pageW - 30, 22, 3, 3, 'F');
    doc.setTextColor(161, 161, 170);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text('CONDICOES', 22, finalY + 6);
    doc.setFontSize(6);
    doc.text('Proposta valida por 30 dias. Valores em EUR com IVA incluido. Pagamento: 50% no inicio, 50% na conclusao.', 22, finalY + 11);
    doc.text('Garantia conforme proposta selecionada. Deslocacao incluida na zona da Grande Lisboa.', 22, finalY + 15);
    doc.text(`Proposta ${proposal.label}: ${proposal.description || ''}`, 22, finalY + 19);
  }

  // ===== DARK FOOTER =====
  doc.setFillColor(9, 9, 11);
  doc.rect(0, pageH - 20, pageW, 20, 'F');
  doc.setFillColor(250, 204, 21);
  doc.rect(0, pageH - 20, pageW, 1, 'F');

  doc.setTextColor(161, 161, 170);
  doc.setFontSize(7);
  doc.text('Obelisco Radical - Eletricidade & Telecomunicacoes', 15, pageH - 12);
  doc.text('Tel: +351 911 132 401  |  obeliscoradical@gmail.com  |  www.obeliscoradical.pt', 15, pageH - 7);

  doc.setTextColor(250, 204, 21);
  doc.text('Grande Lisboa', pageW - 15, pageH - 10, { align: 'right' });

  // Subtle watermark logo
  if (logoBase64) {
    try {
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({ opacity: 0.03 }));
      doc.addImage(logoBase64, 'PNG', pageW / 2 - 40, pageH / 2 - 20, 80, 40);
      doc.restoreGraphicsState();
    } catch (e) { /* ignore watermark errors */ }
  }

  doc.save(`Proposta_${proposal.label}_${proposal.client_name.replace(/\s/g, '_')}.pdf`);
  toast.success('Proposta PDF gerada!');
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

  useEffect(() => { fetchProposals(); }, [fetchProposals]);

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

  const filtered = activeTab === 'all' ? proposals : proposals.filter(p => p.tier === activeTab);

  // Group by budget
  const grouped = filtered.reduce((acc, p) => {
    const key = p.budget_id || 'sem-orcamento';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  return (
    <div data-testid="propostas-page" className="space-y-6">
      <div>
        <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Propostas</h1>
        <p className="text-zinc-400 mt-1 font-medium">Visualize, exporte e envie propostas</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800 rounded-full p-1">
          <TabsTrigger value="all" className="rounded-full data-[state=active]:bg-yellow-400 data-[state=active]:text-zinc-950 text-zinc-400 text-sm font-medium">Todas</TabsTrigger>
          <TabsTrigger value="basico" className="rounded-full data-[state=active]:bg-yellow-400 data-[state=active]:text-zinc-950 text-zinc-400 text-sm font-medium">Basico</TabsTrigger>
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
              <p className="text-sm mt-1">Gere propostas a partir de um orcamento</p>
            </div>
          )}
          {!loading && Object.keys(grouped).length > 0 && (
            <div className="space-y-8">
              {Object.entries(grouped).map(([budgetId, props]) => (
                <div key={budgetId}>
                  <p className="text-xs uppercase tracking-wider text-zinc-500 mb-3 font-medium">Orcamento: {budgetId.substring(0, 8)}...</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {props.map(p => (
                      <Card key={p.id} className="bg-zinc-900 border-zinc-800 rounded-3xl hover:shadow-[0_0_15px_rgba(250,204,21,0.15)] transition-all duration-300">
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between mb-4">
                            <Badge className={tierColors[p.tier]}>{p.label}</Badge>
                            <button data-testid={`delete-proposal-${p.id}`} onClick={() => handleDelete(p.id)} className="text-zinc-600 hover:text-red-400 transition"><Trash2 size={16} /></button>
                          </div>
                          <h3 className="text-lg font-bold text-white mb-1 truncate">{p.title}</h3>
                          <p className="text-sm text-zinc-400 mb-4">{p.client_name}</p>
                          <p className="text-xs text-zinc-500 mb-1">{p.description}</p>
                          <div className="mt-4 pt-4 border-t border-zinc-800">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-zinc-500">Base</span>
                              <span className="text-sm text-zinc-400">{formatEuro(p.base_value)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-500 font-semibold">VALOR FINAL</span>
                              <span className="text-2xl font-black text-yellow-400">{formatEuro(p.final_value)}</span>
                            </div>
                          </div>
                          <div className="mt-5 flex gap-2">
                            <Button data-testid={`export-pdf-${p.id}`} onClick={() => generatePDF(p)} size="sm" className="flex-1 bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full text-xs font-semibold">
                              <Download size={14} className="mr-1" /> PDF
                            </Button>
                            <Button data-testid={`send-whatsapp-${p.id}`} onClick={() => sendWhatsApp(p)} size="sm" className="flex-1 bg-green-500 text-white hover:bg-green-600 rounded-full text-xs font-semibold">
                              <MessageCircle size={14} className="mr-1" /> WhatsApp
                            </Button>
                          </div>
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
    </div>
  );
}
