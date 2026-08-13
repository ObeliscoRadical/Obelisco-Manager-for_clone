import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getVisitServiceMeta } from './visitReportCatalog';

const BLACK = [17, 17, 17];
const MUSTARD = [197, 159, 37];
const WHITE = [255, 255, 255];
const SOFT = [244, 241, 232];
const SOFT_ALT = [250, 248, 241];
const TEXT = [68, 68, 68];

const fmtDate = (value) => {
  if (!value) return '—';
  try { return new Date(value).toLocaleDateString('pt-PT'); } catch { return value; }
};

export const generateVisitReportPDF = async (report, settings = {}, technicianName = 'Técnico') => {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;
  const companyName = settings?.company_info?.name || settings?.company_name || 'Obelisco Radical';
  const board = report?.distribution_board || {};

  doc.setFillColor(...BLACK);
  doc.rect(0, 0, pageW, 36, 'F');
  doc.setFillColor(...MUSTARD);
  doc.rect(0, 33, pageW, 3, 'F');
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('RELAÇÃO DE VISITA EM OBRA', 12, 15);
  doc.setFontSize(9);
  doc.text(companyName.toUpperCase(), 12, 22);
  doc.setFontSize(8);
  doc.text(`Técnico: ${technicianName}`, 12, 28);
  doc.text(`Emitido: ${fmtDate(report?.header?.visit_date)}`, pageW - 12, 28, { align: 'right' });

  let y = 44;
  const infoRows = [
    ['Cliente / Obra', report?.header?.client_name || '—', 'Referência', report?.header?.work_reference || '—'],
    ['Telefone', report?.header?.client_phone || '—', 'Escopo', report?.scope?.title || '—'],
  ];
  doc.setFillColor(250, 249, 244);
  doc.roundedRect(12, y, pageW - 24, 24, 3, 3, 'F');
  let rowY = y + 5;
  infoRows.forEach((row) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT);
    doc.setFontSize(7);
    doc.text(row[0].toUpperCase(), 16, rowY);
    doc.text(row[2].toUpperCase(), 108, rowY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...BLACK);
    doc.text(String(row[1]).slice(0, 42), 16, rowY + 4);
    doc.text(String(row[3]).slice(0, 42), 108, rowY + 4);
    rowY += 10;
  });
  y += 31;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  doc.setFontSize(12);
  doc.text('Escopo da visita', 12, y);
  y += 4;
  doc.setFillColor(...SOFT);
  doc.roundedRect(12, y, pageW - 24, 18, 3, 3, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT);
  const scopeLines = doc.splitTextToSize(report?.scope?.description || 'Sem descrição geral.', pageW - 32);
  doc.text(scopeLines, 16, y + 6);
  y += Math.max(24, 8 + scopeLines.length * 5);

  autoTable(doc, {
    startY: y,
    head: [['Serviço', 'Qtd', 'Tipo de circuito', 'Ponto de uso']],
    body: (report?.circuits || []).length
      ? report.circuits.map((item) => {
          const meta = getVisitServiceMeta(item.service_key);
          return [`${meta.emoji}  ${item.description || meta.label}`, String(item.quantity || 1), item.circuit_type || '—', item.usage_point || '—'];
        })
      : [['Sem circuitos registados', '—', '—', '—']],
    theme: 'grid',
    margin: { left: 12, right: 12 },
    styles: { fontSize: 8.5, cellPadding: 2, textColor: BLACK, lineColor: [229, 223, 208] },
    headStyles: { fillColor: MUSTARD, textColor: BLACK, halign: 'center', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: SOFT_ALT },
    columnStyles: {
      0: { cellWidth: 88 },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 42 },
      3: { cellWidth: 38 },
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  if (y > pageH - 78) {
    doc.addPage();
    y = 18;
  }

  doc.setFillColor(232, 229, 220);
  doc.roundedRect(12, y, pageW - 24, 58, 4, 4, 'F');
  if (board.photo_data_url) {
    try {
      doc.addImage(board.photo_data_url, 'JPEG', 16, y + 5, 76, 48);
    } catch {
      try { doc.addImage(board.photo_data_url, 'PNG', 16, y + 5, 76, 48); } catch { /* ignore */ }
    }
  } else {
    doc.setDrawColor(...TEXT);
    doc.rect(16, y + 5, 76, 48);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT);
    doc.text('Foto do quadro', 54, y + 30, { align: 'center' });
  }
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Quadro de Distribuição', 100, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  [
    ['✓', 'Módulos', board.modules],
    ['✓', 'Dimensões', board.dimensions],
    ['✓', 'Tipo de instalação', board.installation_type],
    ['✓', 'Finalidade', board.purpose],
  ].forEach((line, index) => {
    const itemY = y + 20 + index * 9;
    doc.setTextColor(...MUSTARD);
    doc.text(line[0], 100, itemY);
    doc.setTextColor(...TEXT);
    doc.text(`${line[1]}:`, 106, itemY);
    doc.setTextColor(...BLACK);
    doc.setFont('helvetica', 'bold');
    doc.text(line[2] || '—', 135, itemY);
    doc.setFont('helvetica', 'normal');
  });

  doc.setFillColor(...BLACK);
  doc.rect(0, pageH - 10, pageW, 10, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(7);
  doc.text(`${companyName.toUpperCase()} · Portal Técnico`, 12, pageH - 4);
  doc.text(report?.header?.work_reference || 'RV', pageW - 12, pageH - 4, { align: 'right' });
  const safeRef = (report?.header?.work_reference || 'relacao-visita').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`${safeRef}.pdf`);
};