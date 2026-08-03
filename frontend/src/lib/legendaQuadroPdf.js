// Legenda de Quadro — Obelisco Radical
// Landscape A4. Cabeçalho SÓ na 1ª página, rodapé SÓ na última.
// Colunas com larguras fixas e idênticas em todas as folhas -> ao colar lado-a-lado forma um painel contínuo.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const YELLOW = [250, 204, 21];
const BLACK = [10, 10, 12];
const WHITE = [255, 255, 255];
const GREY_LIGHT = [230, 230, 230];
const GREY = [110, 110, 110];

const PW = 297;   // landscape
const PH = 210;
const MARGIN = 6;

const HEADER_H = 42;   // 1ª página
const FOOTER_H = 18;   // última página
const ROW_H = 8.5;
const HEAD_ROW_H = 8;

// Nº de módulos por página — 1ª limitada (tem header), últimas maiores (só linhas), média entre
function capacityFirst() { return Math.floor((PH - HEADER_H - HEAD_ROW_H - 6) / ROW_H); }
function capacityMiddle() { return Math.floor((PH - HEAD_ROW_H - 6) / ROW_H); }
function capacityLast() { return Math.floor((PH - FOOTER_H - HEAD_ROW_H - 6) / ROW_H); }

function splitModules(modules) {
  const pages = [];
  let idx = 0;
  if (modules.length <= capacityFirst() + FOOTER_H && modules.length <= capacityFirst()) {
    // cabe tudo numa página (com header + footer)
    return [{ items: modules, showHeader: true, showFooter: true, page: 1, total: 1 }];
  }
  // Múltiplas páginas
  // 1ª: header, sem footer
  pages.push({ items: modules.slice(idx, idx + capacityFirst()), showHeader: true, showFooter: false });
  idx += capacityFirst();
  // meio (todas as intermédias): sem header, sem footer
  while (modules.length - idx > capacityLast()) {
    pages.push({ items: modules.slice(idx, idx + capacityMiddle()), showHeader: false, showFooter: false });
    idx += capacityMiddle();
  }
  // última: sem header, com footer
  pages.push({ items: modules.slice(idx), showHeader: false, showFooter: true });
  return pages.map((p, i) => ({ ...p, page: i + 1, total: pages.length }));
}

export function generateLegendaQuadroPDF(header, modules, logoBase64) {
  const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
  const pages = splitModules(modules);

  pages.forEach((p, i) => {
    if (i > 0) doc.addPage();
    drawPage(doc, header, p, logoBase64);
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const safe = (s) => (s || '').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40);
  doc.save(`LegendaQuadro_${safe(header.panel_name || 'quadro')}_${stamp}.pdf`);
}

function drawPage(doc, header, pageData, logoBase64) {
  const { items, showHeader, showFooter, page, total } = pageData;
  const isMulti = total > 1;

  // fundo branco padrão (jsPDF já é branco)
  let contentTop = MARGIN;

  // ====== HEADER (só na 1ª página) ======
  if (showHeader) {
    doc.setFillColor(...BLACK);
    doc.rect(0, 0, PW, HEADER_H, 'F');
    doc.setFillColor(...YELLOW);
    for (let x = 8; x < PW - 8; x += 12) doc.rect(x, HEADER_H - 1.6, 6, 1.6, 'F');

    if (logoBase64) {
      try { doc.addImage(logoBase64, 'PNG', 8, 6, 28, 28); } catch { /* ignore */ }
    }

    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('LEGENDA DE QUADRO', 42, 18);
    doc.setTextColor(...YELLOW);
    doc.setFontSize(9);
    doc.text('IDENTIFICAÇÃO DE CIRCUITOS ELÉCTRICOS', 42, 24);

    // Info cabeçalho (lado direito)
    const infoX = 165;
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(200, 200, 200);
    doc.text('CLIENTE / OBRA', infoX, 10);
    doc.text('QUADRO', infoX, 20);
    doc.text('TÉCNICO', infoX + 60, 20);
    doc.text('DATA', infoX + 60, 10);

    doc.setTextColor(...WHITE);
    doc.setFontSize(10);
    doc.text((header.client_name || '—').slice(0, 45), infoX, 15);
    doc.text((header.panel_name || '—').slice(0, 25), infoX, 25);
    doc.text((header.technician || '—').slice(0, 25), infoX + 60, 25);
    doc.text(header.work_date || '—', infoX + 60, 15);

    contentTop = HEADER_H + 3;
  } else {
    // faixa fina preta no topo para continuidade visual
    doc.setFillColor(...BLACK);
    doc.rect(0, 0, PW, 4, 'F');
    doc.setFillColor(...YELLOW);
    doc.rect(0, 3, PW, 1, 'F');
    contentTop = 6;
  }

  // ====== TABELA ======
  const bottomLimit = PH - (showFooter ? FOOTER_H + 2 : 4);
  const tableBody = items.map(m => [
    String(m.number || ''),
    (m.type || '').toUpperCase(),
    m.description || '',
    m.amperage || '',
  ]);

  autoTable(doc, {
    head: [['Nº', 'TIPO', 'CIRCUITO / IDENTIFICAÇÃO', 'A / mA']],
    body: tableBody,
    startY: contentTop,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: PW - MARGIN * 2,
    styles: { fontSize: 9, cellPadding: 2, lineColor: GREY_LIGHT, lineWidth: 0.3, textColor: BLACK, valign: 'middle', minCellHeight: ROW_H },
    headStyles: { fillColor: BLACK, textColor: YELLOW, fontStyle: 'bold', fontSize: 8.5, halign: 'left', cellPadding: 2.4, minCellHeight: HEAD_ROW_H },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold', fillColor: [248, 248, 248] },
      1: { cellWidth: 60, fontStyle: 'bold', fontSize: 8 },
      2: { cellWidth: 175 },       // ← preenche o resto da landscape
      3: { cellWidth: 36, halign: 'center', fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    didDrawPage: () => {},
    pageBreak: 'avoid',
  });

  // ====== FOOTER (só na última) ======
  if (showFooter) {
    doc.setFillColor(...BLACK);
    doc.rect(0, PH - FOOTER_H, PW, FOOTER_H, 'F');
    doc.setFillColor(...YELLOW);
    for (let x = 8; x < PW - 8; x += 12) doc.rect(x, PH - FOOTER_H + 0.6, 6, 1.4, 'F');

    doc.setTextColor(...YELLOW);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('OBELISCO RADICAL', PW / 2, PH - 11, { align: 'center' });
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('911 324 011    •    obeliscoradical@gmail.com    •    obeliscoradical.pt', PW / 2, PH - 5, { align: 'center' });
  } else {
    // faixa fina preta no fundo para continuidade
    doc.setFillColor(...YELLOW);
    doc.rect(0, PH - 4, PW, 1, 'F');
    doc.setFillColor(...BLACK);
    doc.rect(0, PH - 3, PW, 3, 'F');
  }

  // ====== MARCAS DE COLAGEM (só quando multipágina) ======
  if (isMulti) {
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.4);
    // Direita: colar com página seguinte (se não for a última)
    if (page < total) {
      // marca em cima e em baixo — na margem direita
      const rx = PW - 1.5;
      doc.line(rx - 4, 2, rx, 2);
      doc.line(rx, 0, rx, 4);
      doc.line(rx - 4, PH - 2, rx, PH - 2);
      doc.line(rx, PH - 4, rx, PH);
      doc.setFontSize(6);
      doc.setTextColor(...GREY);
      doc.setFont('helvetica', 'bold');
      doc.text(`↦ COLAR COM PARTE ${page + 1}`, PW - 3, PH / 2, { angle: 270 });
    }
    // Esquerda: colar com página anterior (se não for a primeira)
    if (page > 1) {
      const lx = 1.5;
      doc.line(lx, 2, lx + 4, 2);
      doc.line(lx, 0, lx, 4);
      doc.line(lx, PH - 2, lx + 4, PH - 2);
      doc.line(lx, PH - 4, lx, PH);
      doc.setFontSize(6);
      doc.setTextColor(...GREY);
      doc.setFont('helvetica', 'bold');
      doc.text(`PARTE ${page - 1} ↤`, 3, PH / 2, { angle: 90 });
    }
    // Etiqueta discreta no topo indicando parte X/Y
    doc.setFontSize(6);
    doc.setTextColor(...GREY);
    doc.setFont('helvetica', 'normal');
    doc.text(`PARTE ${page} / ${total}`, PW - 8, PH - (showFooter ? FOOTER_H + 1 : 6), { align: 'right' });
  }
}
