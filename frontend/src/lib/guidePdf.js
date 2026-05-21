// Gerador de Guia de Transporte — Obelisco Radical
// A4 retrato. Identidade preto/amarelo/branco.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

const YELLOW = [250, 204, 21];
const BLACK = [10, 10, 12];
const WHITE = [255, 255, 255];
const GREY_LIGHT = [235, 235, 235];
const GREY_DARK = [70, 70, 70];

const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-PT'); } catch { return iso; }
};

export async function generateGuidePDF(guide, settings = {}, logoBase64 = null) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;

  // HEADER preto
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, pageW, 38, 'F');
  doc.setFillColor(...YELLOW);
  for (let x = 8; x < pageW - 8; x += 12) doc.rect(x, 36.4, 6, 1.6, 'F');

  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', 10, 5, 26, 26); } catch { /* ignore */ }
  }
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('GUIA DE TRANSPORTE', pageW / 2, 16, { align: 'center' });
  doc.setTextColor(...YELLOW);
  doc.setFontSize(10);
  doc.text('OBELISCO RADICAL · MATERIAL DE OBRA', pageW / 2, 22, { align: 'center' });
  doc.setTextColor(...WHITE);
  doc.setFontSize(11);
  doc.text(guide.number || '—', pageW - 12, 30, { align: 'right' });

  let y = 46;

  // Bloco INFO
  doc.setDrawColor(...GREY_LIGHT);
  doc.setLineWidth(0.3);
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(10, y, pageW - 20, 38, 2, 2, 'FD');

  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const col1X = 14, col2X = pageW / 2 + 2;
  const labels = [
    ['Obra', guide.obra_name || '—', 'Cliente', guide.client_name || '—'],
    ['Origem', guide.origin || '—', 'Destino', guide.destination || '—'],
    ['Técnico', guide.assigned_employee_name || '—', 'Entrega Prevista', guide.expected_delivery_date || '—'],
    ['Emitida em', fmtDate(guide.emitted_at), 'Estado', (guide.status || '—').replaceAll('_', ' ')],
  ];
  let ly = y + 6;
  labels.forEach((row) => {
    doc.setTextColor(...GREY_DARK);
    doc.setFontSize(6.5);
    doc.text(row[0].toUpperCase(), col1X, ly);
    doc.text(row[2].toUpperCase(), col2X, ly);
    doc.setTextColor(...BLACK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(row[1]).slice(0, 60), col1X, ly + 4);
    doc.text(String(row[3]).slice(0, 60), col2X, ly + 4);
    doc.setFont('helvetica', 'normal');
    ly += 8.5;
  });

  y += 44;

  if (guide.notes) {
    doc.setFontSize(8);
    doc.setTextColor(...GREY_DARK);
    doc.text(`Obs: ${guide.notes}`, 10, y);
    y += 6;
  }

  // TABELA de items
  const rows = (guide.items || []).map((it, i) => [
    String(i + 1),
    it.name + (it.category ? ` · ${it.category}` : ''),
    it.unit || 'un',
    String(it.qty_planned ?? 0),
    it.qty_received == null ? '___' : String(it.qty_received),
    it.damaged_qty > 0 ? String(it.damaged_qty) : '',
    it.notes || '',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Material', 'Un.', 'Qtd Prevista', 'Qtd Recebida', 'Danificado', 'Nota']],
    body: rows.length ? rows : [['—', 'Sem items', '', '', '', '', '']],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, textColor: BLACK },
    headStyles: { fillColor: BLACK, textColor: YELLOW, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 75 },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 20, halign: 'right' },
      6: { cellWidth: 31 },
    },
    margin: { left: 10, right: 10 },
  });

  y = doc.lastAutoTable.finalY + 6;

  // ASSINATURA + QR
  if (y > pageH - 70) { doc.addPage(); y = 20; }

  // QR code com link para a guia (interno)
  try {
    const url = `${window.location.origin}/guias?id=${guide.id}`;
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 200 });
    doc.addImage(qr, 'PNG', pageW - 42, y, 32, 32);
    doc.setFontSize(6.5);
    doc.setTextColor(...GREY_DARK);
    doc.text('Scan para abrir', pageW - 26, y + 36, { align: 'center' });
  } catch { /* ignore */ }

  // Assinatura preview
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('RECEÇÃO PELO TÉCNICO', 10, y + 6);
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.3);
  doc.rect(10, y + 8, pageW - 60, 28);

  if (guide.reception?.signature_data) {
    try {
      doc.addImage(guide.reception.signature_data, 'PNG', 12, y + 10, pageW - 64, 24);
    } catch { /* ignore */ }
  }

  doc.setFontSize(7);
  doc.setTextColor(...GREY_DARK);
  doc.text(`Nome: ${guide.reception?.signed_by_name || guide.reception?.received_by_name || '___________________________'}`, 10, y + 44);
  doc.text(`Data: ${guide.reception?.received_at ? fmtDate(guide.reception.received_at) : '____ / ____ / ______'}`, 10, y + 49);
  if (guide.reception?.notes) {
    doc.text(`Obs.: ${guide.reception.notes}`, 10, y + 54);
  }

  // FOOTER
  doc.setFillColor(...BLACK);
  doc.rect(0, pageH - 10, pageW, 10, 'F');
  doc.setTextColor(...YELLOW);
  doc.setFontSize(7);
  doc.text('OBELISCO RADICAL · Documento interno · Confidencial', 10, pageH - 4);
  doc.setTextColor(...WHITE);
  doc.text(guide.number || '', pageW - 10, pageH - 4, { align: 'right' });

  const safe = (guide.number || 'guia').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`${safe}.pdf`);
}
