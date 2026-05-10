// Gerador de Checklist de Separação de Material — Obelisco Radical
// Layout A4 portrait pronto para impressão. Estilo: preto + amarelo eléctrico + branco.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

const YELLOW = [250, 204, 21];      // amarelo eléctrico Obelisco
const BLACK = [10, 10, 12];
const WHITE = [255, 255, 255];
const GREY_LIGHT = [230, 230, 230];
const GREY_DARK = [60, 60, 60];

/**
 * Gera o PDF da checklist de material.
 * @param {Object} budget — Orçamento com items {category, name, brand, model, quantity, unit, observations}
 * @param {Object} settings — Definições da empresa (logo, contactos)
 * @param {String} logoBase64 — PNG base64 do logo
 * @param {Object} opts — { autoPrint: bool }
 */
export async function generateChecklistPDF(budget, settings, logoBase64, opts = {}) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;

  // ============ FAIXA SUPERIOR PRETA COM RISCAS DE ESTRADA ============
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, pageW, 38, 'F');

  // Riscas amarelas tipo estrada (3 dashes)
  doc.setFillColor(...YELLOW);
  for (let x = 8; x < pageW - 8; x += 12) {
    doc.rect(x, 36.4, 6, 1.6, 'F');
  }

  // Logo à esquerda (se disponível)
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 10, 6, 26, 26);
    } catch { /* ignore */ }
  }

  // Título centro
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('CHECKLIST DE SEPARAÇÃO', pageW / 2, 16, { align: 'center' });
  doc.setTextColor(...YELLOW);
  doc.setFontSize(11);
  doc.text('OBELISCO RADICAL · MATERIAL DE OBRA', pageW / 2, 24, { align: 'center' });

  // Mini badge canto superior direito (código curto)
  const code = (budget.code || budget.id || '').toString().slice(-6).toUpperCase();
  doc.setFillColor(...YELLOW);
  doc.roundedRect(pageW - 38, 6, 30, 12, 1.5, 1.5, 'F');
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('CÓD INTERNO', pageW - 23, 10.5, { align: 'center' });
  doc.setFontSize(11);
  doc.text(code || 'N/D', pageW - 23, 15.5, { align: 'center' });

  // ============ INFO BOX (cliente / obra / morada) + QR ============
  let y = 44;
  doc.setDrawColor(...YELLOW);
  doc.setLineWidth(0.6);
  doc.line(8, y, pageW - 8, y);

  y += 5;
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);

  // 2 colunas: info à esquerda, QR à direita
  const qrX = pageW - 38;
  const qrY = y;
  const qrSize = 30;

  try {
    const qrPayload = JSON.stringify({
      code,
      title: budget.title || '',
      client: budget.client_name || '',
      url: `${(settings?.website || 'https://obeliscoradical.pt')}/p/${budget.id || ''}`,
    });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 200, margin: 1, color: { dark: '#000000', light: '#FFFFFF' } });
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
  } catch (e) { console.debug('[checklist] qr failed', e?.message); }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GREY_DARK);
  doc.text('Scan QR p/ ver obra', qrX + qrSize / 2, qrY + qrSize + 3.5, { align: 'center' });

  // Info: cliente / obra / morada (col esquerda)
  const infoX = 10;
  const infoMaxW = qrX - infoX - 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...GREY_DARK);
  doc.text('OBRA', infoX, y + 2);
  doc.setFontSize(13);
  doc.setTextColor(...BLACK);
  const titleLines = doc.splitTextToSize(budget.title || 'Sem título', infoMaxW);
  doc.text(titleLines.slice(0, 2), infoX, y + 7);

  let yBlock = y + 7 + titleLines.slice(0, 2).length * 4.8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...GREY_DARK);
  doc.text('CLIENTE', infoX, yBlock + 2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...BLACK);
  doc.text(budget.client_name || '—', infoX, yBlock + 6);

  yBlock += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...GREY_DARK);
  doc.text('MORADA / LOCAL', infoX, yBlock + 2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...BLACK);
  const addr = budget.address || budget.client_address || '—';
  const addrLines = doc.splitTextToSize(addr, infoMaxW);
  doc.text(addrLines.slice(0, 2), infoX, yBlock + 6);

  // Linha divisória amarela tipo estrada
  y = Math.max(qrY + qrSize, yBlock + 6 + addrLines.slice(0, 2).length * 4) + 3;
  doc.setFillColor(...YELLOW);
  for (let x = 8; x < pageW - 8; x += 8) {
    doc.rect(x, y, 4, 1.2, 'F');
  }
  y += 5;

  // ============ TABELA DE ITENS ============
  const items = (budget.items || []).filter(it => (it.name || '').trim());

  const tableHead = [['✓', 'QTD', 'UN', 'DESCRIÇÃO DO MATERIAL', 'MARCA / MODELO', 'OBSERVAÇÕES']];
  const tableBody = items.map(it => [
    '',                                              // checkbox draw later
    String(it.quantity || ''),
    (it.unit || 'un').toUpperCase(),
    it.name || '',
    it.brand || it.model || it.category || '',
    it.observations || it.notes || '',
  ]);

  if (tableBody.length === 0) {
    tableBody.push(['', '', '', 'Sem itens neste orçamento', '', '']);
  }

  autoTable(doc, {
    head: tableHead,
    body: tableBody,
    startY: y,
    margin: { left: 8, right: 8 },
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      lineColor: GREY_LIGHT,
      lineWidth: 0.2,
      textColor: BLACK,
      valign: 'middle',
    },
    headStyles: {
      fillColor: BLACK,
      textColor: YELLOW,
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
      cellPadding: 3,
    },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 38 },
      5: { cellWidth: 38 },
    },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    didDrawCell: (data) => {
      // Desenhar checkbox manual na 1ª coluna do body
      if (data.section === 'body' && data.column.index === 0) {
        const x = data.cell.x + (data.cell.width / 2) - 2.2;
        const yy = data.cell.y + (data.cell.height / 2) - 2.2;
        doc.setDrawColor(...BLACK);
        doc.setLineWidth(0.4);
        doc.rect(x, yy, 4.4, 4.4);
      }
    },
  });

  let finalY = doc.lastAutoTable.finalY + 4;

  // ============ ÁREA INFERIOR: SEPARAÇÃO + ESTADO ============
  const footerSpace = 60;     // espaço reservado para área inferior + footer
  if (finalY > pageH - footerSpace) {
    doc.addPage();
    finalY = 20;
  }

  // Linha divisória amarela
  doc.setFillColor(...YELLOW);
  for (let x = 8; x < pageW - 8; x += 8) {
    doc.rect(x, finalY, 4, 1.2, 'F');
  }
  finalY += 6;

  // BLOCO RESPONSÁVEL / DATA / ASSINATURA
  doc.setFillColor(...BLACK);
  doc.roundedRect(8, finalY, pageW - 16, 26, 2, 2, 'F');

  doc.setTextColor(...YELLOW);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('RESPONSÁVEL PELA SEPARAÇÃO', 12, finalY + 5);
  doc.text('DATA', 92, finalY + 5);
  doc.text('ASSINATURA', 132, finalY + 5);

  doc.setDrawColor(...WHITE);
  doc.setLineWidth(0.4);
  // 3 linhas para preencher
  doc.line(12, finalY + 22, 86, finalY + 22);
  doc.line(92, finalY + 22, 126, finalY + 22);
  doc.line(132, finalY + 22, pageW - 12, finalY + 22);

  finalY += 32;

  // STATUS DA SEPARAÇÃO (3 caixas)
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('ESTADO DA SEPARAÇÃO:', 10, finalY);

  const statuses = [
    { label: 'SEPARADO COMPLETO', color: [34, 197, 94] },
    { label: 'SEPARADO PARCIAL', color: [250, 204, 21] },
    { label: 'EM FALTA', color: [239, 68, 68] },
  ];
  let sx = 60;
  statuses.forEach((s) => {
    // checkbox
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.5);
    doc.rect(sx, finalY - 3.5, 4.5, 4.5);
    // pip cor
    doc.setFillColor(...s.color);
    doc.rect(sx + 5.5, finalY - 3, 2, 4, 'F');
    // texto
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...BLACK);
    doc.text(s.label, sx + 9, finalY);
    sx += 47;
  });

  finalY += 8;

  // ============ FOOTER PRETO ============
  const footerY = pageH - 18;
  doc.setFillColor(...BLACK);
  doc.rect(0, footerY, pageW, 18, 'F');

  // Riscas amarelas tipo estrada (no footer)
  doc.setFillColor(...YELLOW);
  for (let x = 8; x < pageW - 8; x += 12) {
    doc.rect(x, footerY + 0.6, 6, 1.4, 'F');
  }

  doc.setTextColor(...YELLOW);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('MATERIAL RESERVADO PARA ESTA OBRA', pageW / 2, footerY + 7, { align: 'center' });

  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const phone = settings?.phone || '911 132 401';
  const insta = settings?.instagram || '@obeliscoradical';
  const site = settings?.website || 'obeliscoradical.pt';
  doc.text(
    `WhatsApp ${phone}    •    Instagram ${insta}    •    ${site}`,
    pageW / 2, footerY + 13, { align: 'center' }
  );

  // ============ NOME FICHEIRO + ABRIR ============
  const safe = (s) => (s || '').toString().replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40);
  const filename = `Checklist_${safe(budget.client_name)}_${safe(budget.title || code)}.pdf`;

  if (opts.autoPrint) {
    // Abrir nova aba com o PDF e disparar impressão automática
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (w) {
      w.addEventListener('load', () => {
        try { w.focus(); w.print(); } catch (e) { console.debug(e?.message); }
      });
    }
    return;
  }
  doc.save(filename);
}
