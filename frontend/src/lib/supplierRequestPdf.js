// Gerador de PEDIDO DE ORÇAMENTO A FORNECEDOR — Obelisco Radical
// PDF neutro (sem preços) para enviar a fornecedores de material.
// Layout inspirado no checklist. A4 portrait.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const YELLOW = [250, 204, 21];
const BLACK = [10, 10, 12];
const WHITE = [255, 255, 255];
const GREY_LIGHT = [230, 230, 230];
const GREY_DARK = [60, 60, 60];

/**
 * @param {Object} budget — orçamento origem (para código/título)
 * @param {Array}  items  — itens escolhidos pelo utilizador (subset de budget.items)
 * @param {Object} extras — { supplier_name, delivery_date, notes }
 * @param {Object} settings — Definições da empresa
 * @param {String} logoBase64
 * @param {Object} opts — { autoPrint }
 */
export async function generateSupplierRequestPDF(budget, items, extras, settings, logoBase64, opts = {}) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;

  // ============ FAIXA SUPERIOR PRETA COM RISCAS ============
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, pageW, 38, 'F');
  doc.setFillColor(...YELLOW);
  for (let x = 8; x < pageW - 8; x += 12) doc.rect(x, 36.4, 6, 1.6, 'F');

  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', 10, 6, 26, 26); } catch { /* ignore */ }
  }

  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('PEDIDO DE ORÇAMENTO', pageW / 2, 16, { align: 'center' });
  doc.setTextColor(...YELLOW);
  doc.setFontSize(11);
  doc.text('OBELISCO RADICAL · CONSULTA A FORNECEDOR', pageW / 2, 24, { align: 'center' });

  const today = new Date();
  const dateStr = today.toLocaleDateString('pt-PT');
  const refCode = (budget.code || budget.id || '').toString().slice(-6).toUpperCase();
  const requestNumber = `PO-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-${refCode || 'XXXX'}`;

  // Mini badge canto superior direito
  doc.setFillColor(...YELLOW);
  doc.roundedRect(pageW - 62, 6, 54, 12, 1.5, 1.5, 'F');
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Nº PEDIDO', pageW - 35, 10.5, { align: 'center' });
  doc.setFontSize(9);
  doc.text(requestNumber, pageW - 35, 15.5, { align: 'center' });

  // ============ INFO BOX ============
  let y = 44;
  doc.setDrawColor(...YELLOW);
  doc.setLineWidth(0.6);
  doc.line(8, y, pageW - 8, y);
  y += 5;

  const supplierName = (extras.supplier_name || '').trim();

  // FORNECEDOR (linha topo destacada)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...GREY_DARK);
  doc.text('PARA (FORNECEDOR)', 10, y + 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...BLACK);
  doc.text(supplierName || '________________________________', 10, y + 8);

  // DATA / DATA DE ENTREGA (à direita)
  const rightX = pageW - 90;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...GREY_DARK);
  doc.text('DATA DO PEDIDO', rightX, y + 2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...BLACK);
  doc.text(dateStr, rightX, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...GREY_DARK);
  doc.text('ENTREGA PRETENDIDA', rightX + 40, y + 2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...BLACK);
  doc.text(extras.delivery_date || 'a combinar', rightX + 40, y + 7);

  y += 14;

  // OBRA (referência interna)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...GREY_DARK);
  doc.text('REFERÊNCIA DA OBRA', 10, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...BLACK);
  const obraLabel = budget.title || 'Sem título';
  doc.text(doc.splitTextToSize(obraLabel, pageW - 20).slice(0, 1), 10, y + 5);

  y += 9;

  // Linha divisória amarela
  doc.setFillColor(...YELLOW);
  for (let x = 8; x < pageW - 8; x += 8) doc.rect(x, y, 4, 1.2, 'F');
  y += 5;

  // Título da tabela
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...BLACK);
  doc.text(`MATERIAL A ORÇAMENTAR (${items.length} item${items.length === 1 ? '' : 's'})`, 10, y);
  y += 3;

  // ============ TABELA ============
  const tableHead = [['REF.', 'DESCRIÇÃO DO MATERIAL', 'UN', 'QTD']];
  const tableBody = items.map((it, idx) => [
    it.reference || it.code || String(idx + 1).padStart(3, '0'),
    it.name || '',
    (it.unit || 'un').toUpperCase(),
    String(it.quantity || ''),
  ]);
  if (tableBody.length === 0) tableBody.push(['', 'Sem itens seleccionados', '', '']);

  autoTable(doc, {
    head: tableHead,
    body: tableBody,
    startY: y + 2,
    margin: { left: 8, right: 8 },
    styles: { fontSize: 9, cellPadding: 2.6, lineColor: GREY_LIGHT, lineWidth: 0.2, textColor: BLACK, valign: 'middle' },
    headStyles: { fillColor: BLACK, textColor: YELLOW, fontStyle: 'bold', fontSize: 9, halign: 'left', cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: [248, 248, 248] },
  });

  let finalY = doc.lastAutoTable.finalY + 6;

  // OBSERVAÇÕES
  if ((extras.notes || '').trim()) {
    if (finalY > pageH - 70) { doc.addPage(); finalY = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...GREY_DARK);
    doc.text('OBSERVAÇÕES / PEDIDO DE PROPOSTA', 10, finalY);
    finalY += 4;
    doc.setDrawColor(...GREY_LIGHT);
    doc.setLineWidth(0.3);
    const notesLines = doc.splitTextToSize(extras.notes.trim(), pageW - 20);
    const notesH = notesLines.length * 4.5 + 6;
    doc.rect(8, finalY - 2, pageW - 16, notesH);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    doc.text(notesLines, 10, finalY + 3);
    finalY += notesH + 3;
  }

  // Bloco pedido (o que queremos que o fornecedor devolva)
  if (finalY > pageH - 65) { doc.addPage(); finalY = 20; }
  doc.setFillColor(...BLACK);
  doc.roundedRect(8, finalY, pageW - 16, 22, 2, 2, 'F');
  doc.setTextColor(...YELLOW);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('SOLICITAMOS AO FORNECEDOR:', 12, finalY + 6);
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text([
    '• Preço unitário e total por item · Disponibilidade em stock',
    '• Prazo de entrega e condições de pagamento · Validade da proposta',
  ], 12, finalY + 11);
  finalY += 26;

  // Assinatura / contacto Obelisco
  if (finalY > pageH - 40) { doc.addPage(); finalY = 20; }
  doc.setDrawColor(...GREY_LIGHT);
  doc.setLineWidth(0.4);
  doc.line(10, finalY + 8, 80, finalY + 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...GREY_DARK);
  doc.text('RESPONSÁVEL PELO PEDIDO (OBELISCO)', 10, finalY + 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...BLACK);
  doc.text(settings?.company_responsible || 'Obelisco Radical', 10, finalY + 5);

  // ============ FOOTER PRETO ============
  const footerY = pageH - 18;
  doc.setFillColor(...BLACK);
  doc.rect(0, footerY, pageW, 18, 'F');
  doc.setFillColor(...YELLOW);
  for (let x = 8; x < pageW - 8; x += 12) doc.rect(x, footerY + 0.6, 6, 1.4, 'F');

  doc.setTextColor(...YELLOW);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('AGRADECEMOS A VOSSA MELHOR PROPOSTA', pageW / 2, footerY + 7, { align: 'center' });

  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const phone = settings?.phone || '911 132 401';
  const email = settings?.email || 'geral@obeliscoradical.pt';
  const site = settings?.website || 'obeliscoradical.pt';
  doc.text(
    `${phone}    •    ${email}    •    ${site}`,
    pageW / 2, footerY + 13, { align: 'center' }
  );

  // ============ SAVE / PRINT ============
  const safe = (s) => (s || '').toString().replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40);
  const filename = `PedidoOrcamento_${safe(supplierName || 'fornecedor')}_${safe(budget.title || refCode)}.pdf`;

  if (opts.autoPrint) {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (w) w.addEventListener('load', () => { try { w.focus(); w.print(); } catch (e) { console.debug(e?.message); } });
    return;
  }
  doc.save(filename);
}
