// Gerador de LEGENDA DE QUADRO ELÉCTRICO — Obelisco Radical
// A4 portrait; auto-detecta se cabe em 1 página ou divide em N páginas
// desenhadas para colagem lado-a-lado (marcas de corte/alinhamento nas margens internas).

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const YELLOW = [250, 204, 21];
const BLACK = [10, 10, 12];
const WHITE = [255, 255, 255];
const GREY_LIGHT = [230, 230, 230];
const GREY = [110, 110, 110];

const A4_W = 210;
const A4_H = 297;

// Nº máximo de módulos por página (com header + footer + linhas ~9mm)
// altura útil ≈ 297 - 55 (header) - 24 (footer) = 218 mm → ~22 linhas @ 9mm cada
const MODULES_PER_PAGE = 22;

/**
 * @param {Object}   header  { client_name, work_date, panel_name, technician }
 * @param {Array}    modules [{ number, type, description, amperage }]
 * @param {String}   logoBase64 (opcional)
 */
export function generateLegendaQuadroPDF(header, modules, logoBase64) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const totalPages = Math.max(1, Math.ceil(modules.length / MODULES_PER_PAGE));

  for (let p = 0; p < totalPages; p++) {
    if (p > 0) doc.addPage();
    const slice = modules.slice(p * MODULES_PER_PAGE, (p + 1) * MODULES_PER_PAGE);
    drawPage(doc, header, slice, logoBase64, p + 1, totalPages);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const safe = (s) => (s || '').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40);
  doc.save(`LegendaQuadro_${safe(header.panel_name || 'quadro')}_${stamp}.pdf`);
}

function drawPage(doc, header, modules, logoBase64, pageNum, totalPages) {
  // ============ FAIXA SUPERIOR PRETA ============
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, A4_W, 40, 'F');
  doc.setFillColor(...YELLOW);
  for (let x = 8; x < A4_W - 8; x += 12) doc.rect(x, 38.4, 6, 1.6, 'F');

  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', 10, 6, 28, 28); } catch { /* ignore */ }
  }

  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('LEGENDA DE QUADRO', A4_W / 2, 17, { align: 'center' });
  doc.setTextColor(...YELLOW);
  doc.setFontSize(10);
  doc.text('IDENTIFICAÇÃO DE CIRCUITOS ELÉCTRICOS', A4_W / 2, 24, { align: 'center' });

  if (totalPages > 1) {
    doc.setFillColor(...YELLOW);
    doc.roundedRect(A4_W - 42, 6, 34, 12, 1.5, 1.5, 'F');
    doc.setTextColor(...BLACK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('PARTE', A4_W - 25, 10.5, { align: 'center' });
    doc.setFontSize(11);
    doc.text(`${pageNum} / ${totalPages}`, A4_W - 25, 15.5, { align: 'center' });
  }

  // ============ INFO CABEÇALHO ============
  let y = 46;
  const drawField = (label, value, x, w) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...GREY);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...BLACK);
    doc.text(String(value || '________________').slice(0, 40), x, y + 5);
    doc.setDrawColor(...GREY_LIGHT);
    doc.setLineWidth(0.3);
    doc.line(x, y + 6.5, x + w, y + 6.5);
  };
  drawField('CLIENTE / OBRA', header.client_name, 10, 90);
  drawField('QUADRO', header.panel_name, 105, 45);
  drawField('DATA', header.work_date, 155, 45);
  y += 10;
  drawField('TÉCNICO RESPONSÁVEL', header.technician, 10, 90);
  y += 8;

  // Linha divisória amarela
  doc.setFillColor(...YELLOW);
  for (let x = 8; x < A4_W - 8; x += 8) doc.rect(x, y, 4, 1.2, 'F');
  y += 6;

  // ============ TABELA DE MÓDULOS ============
  const tableHead = [['Nº', 'TIPO', 'CIRCUITO / IDENTIFICAÇÃO', 'A / mA']];
  const tableBody = modules.map(m => [
    String(m.number || ''),
    (m.type || '').toUpperCase(),
    m.description || '',
    m.amperage || '',
  ]);
  if (tableBody.length === 0) tableBody.push(['—', '—', '(sem módulos)', '—']);

  autoTable(doc, {
    head: tableHead,
    body: tableBody,
    startY: y,
    margin: { left: 8, right: 8 },
    styles: { fontSize: 9, cellPadding: 2.2, lineColor: GREY_LIGHT, lineWidth: 0.3, textColor: BLACK, valign: 'middle', minCellHeight: 8.5 },
    headStyles: { fillColor: BLACK, textColor: YELLOW, fontStyle: 'bold', fontSize: 8.5, halign: 'left', cellPadding: 2.6 },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center', fontStyle: 'bold', fillColor: [248, 248, 248] },
      1: { cellWidth: 48, fontStyle: 'bold', fontSize: 8 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
  });

  // ============ MARCAS DE ALINHAMENTO (só se multipágina) ============
  if (totalPages > 1) {
    // Página ímpar (1, 3, 5...) → marcas na margem DIREITA (para junção com página seguinte)
    // Página par (2, 4, 6...) → marcas na margem ESQUERDA (para junção com página anterior)
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.4);
    const isOdd = pageNum % 2 === 1;
    const markX = isOdd ? A4_W - 3 : 3;
    const drawMark = (yy) => {
      // pequeno triângulo apontando para o interior
      if (isOdd) {
        doc.line(markX, yy, A4_W - 6, yy);
        doc.line(markX, yy - 2, markX, yy + 2);
      } else {
        doc.line(0 + 6, yy, markX, yy);
        doc.line(markX, yy - 2, markX, yy + 2);
      }
    };
    drawMark(45);
    drawMark(A4_H / 2);
    drawMark(A4_H - 45);

    // Etiqueta discreta de junção
    doc.setFontSize(6);
    doc.setTextColor(...GREY);
    doc.setFont('helvetica', 'normal');
    const joinLabel = isOdd ? `↦ colar com PARTE ${pageNum + 1}` : `PARTE ${pageNum - 1} ↤`;
    const rotate = isOdd ? 270 : 90;
    doc.text(joinLabel, isOdd ? A4_W - 2 : 2, A4_H / 2 + 30, { angle: rotate });
  }

  // ============ RODAPÉ PRETO ============
  const fy = A4_H - 20;
  doc.setFillColor(...BLACK);
  doc.rect(0, fy, A4_W, 20, 'F');
  doc.setFillColor(...YELLOW);
  for (let x = 8; x < A4_W - 8; x += 12) doc.rect(x, fy + 0.6, 6, 1.4, 'F');

  doc.setTextColor(...YELLOW);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('OBELISCO RADICAL', A4_W / 2, fy + 8, { align: 'center' });

  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    '911 324 011    •    obeliscoradical@gmail.com    •    obeliscoradical.pt',
    A4_W / 2, fy + 14, { align: 'center' }
  );
}
