import { useState, useEffect } from 'react';
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
  } catch { return null; }
}

async function generatePDF(proposal) {
  const doc = new jsPDF();
  const logoBase64 = await fetchLogoBase64();

  // Header
  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', 15, 10, 40, 20); } catch {}
  }
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('PROPOSTA', 140, 22);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(proposal.label.toUpperCase(), 140, 30);

  // Line
  doc.setDrawColor(250, 204, 21);
  doc.setLineWidth(1);
  doc.line(15, 38, 195, 38);

  // Client info
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente:', 15, 48);
  doc.setFont('helvetica', 'normal');
  doc.text(proposal.client_name, 50, 48);
  if (proposal.client_phone) {
    doc.setFont('helvetica', 'bold');
    doc.text('Telefone:', 15, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(proposal.client_phone, 50, 55);
  }
  doc.setFont('helvetica', 'bold');
  doc.text('Data:', 130, 48);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString('pt-PT'), 150, 48);

  // Description
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.text(proposal.description || '', 15, 68, { maxWidth: 180 });

  // Items table
  const tableData = (proposal.items || []).map(item => [
    item.category || '-',
    item.name || '-',
    item.quantity?.toString() || '0',
    formatEuro(item.unit_cost),
    `${((item.margin || 0) * 100).toFixed(0)}%`,
    formatEuro(item.unit_cost * (1 + (item.margin || 0)) * (item.quantity || 0)),
  ]);

  autoTable(doc, {
    startY: 78,
    head: [['Categoria', 'Item', 'Qtd', 'Custo', 'Margem', 'Total']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [250, 204, 21], textColor: [9, 9, 11], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  const finalY = doc.lastAutoTable.finalY + 15;

  // Totals
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`Valor Base: ${formatEuro(proposal.base_value)}`, 15, finalY);
  doc.text(`Multiplicador: x${proposal.multiplier}`, 15, finalY + 8);
  doc.setFontSize(16);
  doc.setDrawColor(250, 204, 21);
  doc.setLineWidth(0.5);
  doc.line(15, finalY + 14, 195, finalY + 14);
  doc.text(`VALOR FINAL: ${formatEuro(proposal.final_value)}`, 15, finalY + 24);

  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text('Obelisco Radical - Eletricidade | Tel: +351 911 132 401 | obeliscoradical@gmail.com', 15, pageHeight - 15);
  doc.text('Grande Lisboa | www.obeliscoradical.pt', 15, pageHeight - 10);

  doc.save(`proposta-${proposal.tier}-${proposal.client_name.replace(/\s/g, '_')}.pdf`);
  toast.success('PDF gerado!');
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

  const fetchProposals = async () => {
    try {
      const { data } = await api.get('/proposals');
      setProposals(data);
    } catch { toast.error('Erro ao carregar propostas'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchProposals(); }, []);

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
          {loading ? (
            <div className="flex justify-center py-16"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              <ClipboardList size={48} className="mx-auto mb-4 text-zinc-700" />
              <p>Nenhuma proposta encontrada</p>
              <p className="text-sm mt-1">Gere propostas a partir de um orcamento</p>
            </div>
          ) : (
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
